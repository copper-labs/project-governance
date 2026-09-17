"""Keep startup bookkeeping bounded, repository-local, and separate from durable policy."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Iterator

from .installation import InstallationError, LOCK_PATH, load_lock
from .state_io import atomic_write_text


MAX_STATE_BYTES = 1048576
TASK_ID = re.compile(r"^[a-f0-9]{64}$")


class StartupError(InstallationError):
    """Report a safe deferral or a transaction requiring deliberate recovery."""

    def __init__(self, reason: str, status: str = "deferred"):
        super().__init__(reason)
        self.status = status


def git(root: Path, *args: str, env: dict | None = None, input: bytes | None = None) -> bytes:
    """Run one bounded Git read or explicitly scoped transaction operation."""
    result = subprocess.run(["git", *args], cwd=root, env=env, input=input,
                            capture_output=True, timeout=30, check=False)
    if result.returncode:
        raise StartupError("Git operation failed: " + args[0])
    return result.stdout


def repository(path: Path) -> Path:
    """Resolve one existing worktree without treating its siblings as update targets."""
    root = Path(os.fsdecode(git(path, "rev-parse", "--show-toplevel")).strip()).resolve()
    if (root / "src/project_governance_runtime/cli.py").is_file():
        raise StartupError("Governance source checkouts use their source workflow")
    if not (root / LOCK_PATH).is_file():
        raise StartupError("Initialize and bootstrap the locked runtime before enabling startup updates")
    return root


def digest(data: bytes) -> str:
    """Bind a receipt to exact bytes rather than a mutable version label."""
    return hashlib.sha256(data).hexdigest()


def lock_digest(root: Path) -> str:
    """Identify the exact tracked lock used by this task."""
    return digest((root / LOCK_PATH).read_bytes())


def state_root(root: Path) -> Path:
    """Refuse external or symlinked bookkeeping destinations before creating state."""
    current = root
    for name in (".governance", "startup"):
        current = current / name
        if current.is_symlink() or (current.exists() and not current.is_dir()):
            raise StartupError("Startup state must use ordinary repository-local directories")
        current.mkdir(mode=0o700, exist_ok=True)
    return current


def read_json(path: Path, default=None):
    """Read a bounded ordinary JSON file without following a replaced state pointer."""
    if path.is_symlink():
        raise StartupError("Startup state contains an unsafe symbolic link", "recovery-required")
    if not path.exists():
        return default
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as handle:
        raw = handle.read(MAX_STATE_BYTES + 1)
    if len(raw) > MAX_STATE_BYTES:
        raise StartupError("Startup state exceeds its size limit", "recovery-required")
    try:
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("State must be a JSON object")
        return value
    except (ValueError, UnicodeError) as error:
        raise StartupError("Startup state is malformed; preserve it for recovery", "recovery-required") from error


def write_json(path: Path, value) -> None:
    """Publish bounded ignored state with private file permissions."""
    raw = json.dumps(value, sort_keys=True, indent=2) + "\n"
    if len(raw.encode()) > MAX_STATE_BYTES or path.is_symlink():
        raise StartupError("Startup state cannot be written safely", "recovery-required")
    atomic_write_text(path, raw)


@contextmanager
def exclusive(path: Path) -> Iterator[None]:
    """Take one nonblocking local ownership lock without deleting another owner's lock."""
    if os.name != "posix":
        raise StartupError("Automatic startup updates currently require macOS or Linux")
    import fcntl

    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise StartupError("Another operation is using this runtime or worktree") from error
        yield
    finally:
        os.close(fd)


def task_path(root: Path, task_id: str) -> Path:
    """Restrict caller-supplied task identifiers to opaque local receipt names."""
    if not TASK_ID.fullmatch(task_id):
        raise StartupError("A valid startup receipt is required")
    return state_root(root) / (task_id + ".json")


def delegated() -> bool:
    """Treat any enclosing harness marker as delegation, including malformed ancestry."""
    return bool(os.environ.get("HARNESS_AGENT_ANCESTRY") or os.environ.get("GOVERNANCE_PARENT_TASK"))


def policy(root: Path) -> dict:
    """Load explicit repository update authority and bounded startup budgets."""
    from .configuration import load_yaml

    value = load_yaml(root / "config/governance/profile.yaml").get("runtime_updates", {})
    if not isinstance(value, dict) or set(value) - {"policy", "cache_seconds", "discovery_seconds", "install_seconds"}:
        raise StartupError("runtime_updates contains unsupported policy fields")
    selected = value.get("policy", "manual")
    if selected not in {"manual", "compatible"}:
        raise StartupError("runtime_updates.policy must be manual or compatible")
    result = {"policy": selected}
    for key, default, maximum in (("cache_seconds", 43200, 604800), ("discovery_seconds", 5, 60),
                                  ("install_seconds", 180, 3600)):
        number = value.get(key, default)
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not 0 < number <= maximum:
            raise StartupError("runtime_updates." + key + " is outside its supported range")
        result[key] = number
    return result


def result(status: str, reason: str, **extra) -> dict:
    """Return one compact outcome for either the parent or a native hook."""
    return {"status": status, "reason": reason, **extra}
