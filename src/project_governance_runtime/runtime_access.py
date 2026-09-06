"""Serialize installed runtime readers with deliberate and startup replacement."""

from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys


def installation_root(prefix: Path | None = None) -> Path | None:
    """Recognize ordinary and digest-specific repository installations."""
    current = (prefix or Path(sys.prefix)).resolve()
    if current.name == "runtime" and current.parent.name == ".governance":
        return current.parent.parent
    if current.parent.name == "runtimes" and current.parent.parent.name == ".governance":
        return current.parent.parent.parent
    return None


def transaction_child(root: Path) -> bool:
    """Permit only updater-owned validation descendants to join the active transaction."""
    token = os.environ.get("GOVERNANCE_UPDATE_TOKEN")
    path = root / ".governance/startup/transaction.json"
    if not token or path.is_symlink() or not path.is_file() or path.stat().st_size > 1048576:
        return False
    try:
        value = json.loads(path.read_text())
        from .process_identity import same_process

        if not same_process(value.get("owner")):
            return False
        return value.get("token") == token and value.get("phase") in {"activated", "committed"}
    except (OSError, ValueError, KeyError, TypeError):
        return False


@contextmanager
def runtime_reader(root: Path | None = None, *, join: bool = True):
    """Hold installed code stable; source and externally managed environments remain separate."""
    root = root or installation_root()
    if root is None or os.name != "posix":
        yield None
        return
    if join and transaction_child(root):
        yield None
        return
    import fcntl

    path = root / ".governance/runtime-use.lock"
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("Governance is being updated; retry when its transaction finishes") from error
        if installation_root() == root and Path(sys.prefix).resolve() != (root / ".governance/runtime").resolve():
            raise RuntimeError("This process loaded a previous runtime; restart it against the active installation")
        if (root / ".governance/startup/transaction.json").exists():
            raise RuntimeError("Governance update requires recovery before ordinary runtime commands")
        yield fd
    finally:
        os.close(fd)
