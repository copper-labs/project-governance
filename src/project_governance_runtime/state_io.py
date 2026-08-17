"""Share bounded atomic state writes and cross-process file locking."""

from __future__ import annotations

import json
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from time import monotonic, sleep
from typing import Any, Iterator

if os.name == "nt":
    import msvcrt
else:
    import fcntl


LOCK_TIMEOUT_SECONDS = 2.0
LOCK_RETRY_SECONDS = 0.01


@contextmanager
def path_lock(path: Path, *, timeout_seconds: float = LOCK_TIMEOUT_SECONDS) -> Iterator[None]:
    """Serialize state access using one adjacent non-content lock file."""
    lock_path = path.with_suffix(path.suffix + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        if os.name == "nt":
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
        deadline = monotonic() + timeout_seconds
        while True:
            try:
                if os.name == "nt":
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if monotonic() >= deadline:
                    raise TimeoutError(f"state writer lock unavailable: {path}")
                sleep(LOCK_RETRY_SECONDS)
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def atomic_write_text(path: Path, text: str) -> None:
    """Replace one state file atomically after a same-directory durable write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            dir=path.parent,
            encoding="utf-8",
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)


def read_json_mapping(path: Path, *, default: dict[str, Any]) -> dict[str, Any]:
    """Read one JSON object or return a fresh default when it is absent."""
    if not path.exists():
        return json.loads(json.dumps(default))
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def write_json_mapping(path: Path, value: dict[str, Any]) -> None:
    """Write one deterministic JSON object through the shared atomic boundary."""
    atomic_write_text(path, json.dumps(value, indent=2, sort_keys=True) + "\n")
