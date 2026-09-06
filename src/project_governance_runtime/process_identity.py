"""Match process identifiers with their recorded creation times."""

import ctypes
import os
from pathlib import Path
import subprocess
import sys


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

