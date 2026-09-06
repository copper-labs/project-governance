"""Supervise recorded local descendants without signalling reused process identities."""

import os
import ctypes
import fcntl
from pathlib import Path
import signal
import subprocess
import sys
import time

from .storage import atomic_json, read_json


class _BSDInfo(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint32) for name in (
        "flags", "status", "xstatus", "pid", "ppid", "uid", "gid", "ruid", "rgid", "svuid", "svgid", "reserved"
    )] + [("comm", ctypes.c_char * 16), ("name", ctypes.c_char * 32)] + [
        (name, ctypes.c_uint32) for name in ("nfiles", "pgid", "jobc", "tdev", "tpgid", "nice")
    ] + [("start_sec", ctypes.c_uint64), ("start_usec", ctypes.c_uint64)]


_LIBPROC = ctypes.CDLL("/usr/lib/libproc.dylib") if sys.platform == "darwin" else None
if _LIBPROC is not None:
    _LIBPROC.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int]
    _LIBPROC.proc_pidinfo.restype = ctypes.c_int


def identity(pid):
    """Identify a process across exec so PID reuse cannot redirect cleanup signals."""
    if not isinstance(pid, int) or pid <= 1:
        return None
    try:
        if _LIBPROC is not None:
            info = _BSDInfo()
            size = _LIBPROC.proc_pidinfo(pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
            if size != ctypes.sizeof(info) or info.status == 5:
                return None
            return f"darwin:{info.start_sec}:{info.start_usec}"
        proc_stat = Path(f"/proc/{pid}/stat")
        if proc_stat.exists():
            fields = proc_stat.read_text().rsplit(")", 1)[1].split()
            return None if fields[0] == "Z" else "linux:" + fields[19]
        result = subprocess.run(["ps", "-p", str(pid), "-o", "stat=", "-o", "lstart=", "-o", "command="],
                                text=True, capture_output=True, timeout=2)
        value = result.stdout.strip()
        return " ".join(value.split()[1:6]) if value and not value.startswith("Z") else None
    except (OSError, subprocess.TimeoutExpired, IndexError):
        return None


def same_process(record):
    """Check that a recorded PID still belongs to the originally observed process."""
    return bool(record and record.get("identity") and identity(record.get("pid")) == record["identity"])


def record(pid):
    """Capture the process identity that later cleanup must verify."""
    return {"pid": pid, "identity": identity(pid)}


def collect(path, provider):
    # Worker and guardian both scan. Serialize the read/merge/write so one scan
    # cannot discard a child the other observed before it detached.
    """Merge descendant observations under a lock shared by worker and guardian."""
    fd = os.open(path / "children.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        return _collect(path, provider)
    finally:
        os.close(fd)


def _collect(path, provider):
    previous = read_json(path / "children.json", [])
    try:
        rows = subprocess.run(["ps", "-axo", "pid=,ppid="], capture_output=True, text=True, timeout=2)
    except (OSError, subprocess.TimeoutExpired):
        return previous
    table = {}
    for line in rows.stdout.splitlines():
        fields = line.split()
        if len(fields) == 2 and all(f.isdigit() for f in fields):
            table[int(fields[0])] = int(fields[1])
    known = {r["pid"]: r for r in previous if same_process(r)}
    descendants = set(known)
    if same_process(provider):
        descendants.add(provider["pid"])
    while True:
        new = {pid for pid, parent in table.items() if parent in descendants} - descendants
        if not new:
            break
        descendants.update(new)
    descendants.discard(provider["pid"])
    for pid in descendants:
        if pid not in known:
            value = record(pid)
            if value["identity"]:
                known[pid] = value
    values = list(known.values())
    atomic_json(path / "children.json", values)
    return values


def signal_record(value, sig):
    """Signal only the process whose recorded identity still matches."""
    if same_process(value):
        try:
            os.kill(value["pid"], sig)
        except ProcessLookupError:
            pass


def terminate_owned(path, provider, grace=1):
    """Stop recorded provider descendants and verify that none remain alive."""
    if not provider:
        return True
    children = collect(path, provider)
    for sig, wait in ((signal.SIGTERM, grace), (signal.SIGKILL, 2)):
        for child in reversed(children):
            signal_record(child, sig)
        signal_record(provider, sig)
        end = time.monotonic() + wait
        while time.monotonic() < end:
            if not any(same_process(r) for r in [provider, *children]):
                return True
            children = collect(path, provider)
            time.sleep(.05)
    return not any(same_process(r) for r in [provider, *children])
