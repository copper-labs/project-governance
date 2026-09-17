"""Hold the installed environment stable before importing optional executable support."""

import os
from pathlib import Path
import sys


def main():
    """Keep bootstrap from replacing this environment while its workers run."""
    if sys.platform not in {"darwin", "linux"}:
        print("Provider agents require macOS or Linux; ordinary governance remains available.", file=sys.stderr)
        return 1
    import fcntl

    # Repository bootstrap clears this venv, but never its parent directory.
    from ..runtime_access import installation_root

    root = installation_root()
    if root is not None:
        lock_path = root / ".governance/runtime-use.lock"
    else:
        # External Python installations are managed by their operator, not bootstrap.
        lock_path = Path.home() / ".local/share/harness-agents/runtime-use.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Governance environment is being replaced; retry after bootstrap finishes.", file=sys.stderr)
            return 1
        if root is not None and Path(sys.prefix).resolve() != (root / ".governance/runtime").resolve():
            print("Provider process loaded a previous runtime; restart it.", file=sys.stderr)
            return 1
        if root is not None and (root / ".governance/startup/transaction.json").exists():
            print("Governance update requires recovery before provider work.", file=sys.stderr)
            return 1
        from .cli import main as run

        return run(environment_fd=fd)
    finally:
        os.close(fd)


if __name__ == "__main__":
    raise SystemExit(main())
