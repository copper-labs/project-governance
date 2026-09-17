"""Supervise recorded local descendants without signalling reused process identities."""

import os
import fcntl
from pathlib import Path
import signal
import subprocess
import sys
import time

from .storage import atomic_json, read_json


from ..process_identity import identity, record, same_process


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
        except PermissionError:
            # Keep the identity owned; inability to signal is not proof of exit.
            return False
    return True


def cleanup_stage(path):
    """Explain cleanup blockers without exposing process arguments or credentials."""
    if read_json(path / "cleanup.json", {}).get("signal_denied"):
        return "Cleanup pending; permission denied signaling owned processes"
    return "Cleanup pending; owned processes remain"


def terminate_owned(path, provider, grace=1):
    """Stop recorded provider descendants and verify that none remain alive."""
    if not provider:
        return True
    children = collect(path, provider)
    denied = {}
    for sig, wait in ((signal.SIGTERM, grace), (signal.SIGKILL, 2)):
        for child in [*reversed(children), provider]:
            if not signal_record(child, sig):
                denied[child["pid"]] = child
        atomic_json(path / "cleanup.json", {"signal_denied": list(denied.values())})
        end = time.monotonic() + wait
        while time.monotonic() < end:
            if not any(same_process(r) for r in [provider, *children]):
                return True
            children = collect(path, provider)
            time.sleep(.05)
    return not any(same_process(r) for r in [provider, *children])
