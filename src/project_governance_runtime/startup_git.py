"""Isolate a runtime lock commit while preserving unrelated staged and unstaged work."""

from __future__ import annotations

import os
from pathlib import Path
import stat

from .installation import LOCK_PATH
from .startup_state import StartupError, digest, git


AUTHORITY = ("config/governance/", "config/validation/", ".githooks/", ".codex/", ".claude/", ".agents/")
ENTRY_FILES = {"AGENTS.md", "AGENTS.override.md", "CLAUDE.md", "GEMINI.md", "tools/governance-bootstrap.py", "tools/governance-startup.py"}


def _names(raw: bytes) -> list[str]:
    """Decode Git's literal NUL-delimited filenames without losing unusual bytes."""
    return [os.fsdecode(value) for value in raw.split(b"\0") if value]


def _git_path(root: Path, name: str) -> Path:
    """Resolve operation markers in the current linked worktree's Git directory."""
    return Path(os.fsdecode(git(root, "rev-parse", "--path-format=absolute", "--git-path", name)).strip())


def _file(root: Path, name: str) -> dict:
    """Fingerprint changed files without following user-owned symlinks."""
    path = root / name
    if not path.exists() and not path.is_symlink():
        return {"absent": True}
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        return {"link": os.readlink(path)}
    if not stat.S_ISREG(info.st_mode):
        raise StartupError("An unrelated changed path is not an ordinary file")
    if info.st_size > 67108864:
        raise StartupError("A changed file exceeds the bounded startup fingerprint budget")
    return {"mode": stat.S_IMODE(info.st_mode), "sha256": digest(path.read_bytes())}


def _index_digest(raw: bytes) -> str:
    """Exclude only the updater's exact lock entry from pending-index preservation proof."""
    suffix = b"\t" + os.fsencode(LOCK_PATH.as_posix())
    return digest(b"\0".join(line for line in raw.split(b"\0") if line and not line.endswith(suffix)))


def authority_digest(root: Path) -> str:
    """Pin policy and actual hook content while unrelated implementation can continue."""
    names = _names(git(root, "ls-files", "-z"))
    selected = {name: _file(root, name) for name in names
                if name in ENTRY_FILES or any(name.startswith(prefix) for prefix in AUTHORITY)}
    selected.pop(LOCK_PATH.as_posix(), None)
    hooks = _git_path(root, "hooks")
    if hooks.exists():
        for path in hooks.iterdir():
            if path.is_file() or path.is_symlink():
                selected[str(path)] = _file(root, str(path))
    import json

    return digest(json.dumps(selected, sort_keys=True).encode())


def snapshot(root: Path) -> dict:
    """Judge actual overlap while retaining unrelated work for exact post-commit comparison."""
    for name in ("MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "index.lock"):
        if _git_path(root, name).exists():
            raise StartupError("Git has an active operation: " + name)
    branch = git(root, "symbolic-ref", "--quiet", "HEAD").decode().strip()
    head = git(root, "rev-parse", "HEAD").decode().strip()
    if git(root, "ls-files", "--unmerged", "-z"):
        raise StartupError("Resolve Git conflicts before updating governance")
    changed = set(_names(git(root, "diff", "--name-only", "-z", "HEAD")))
    changed.update(_names(git(root, "diff", "--cached", "--name-only", "-z")))
    changed.update(_names(git(root, "ls-files", "--others", "--exclude-standard", "-z")))
    if len(changed) > 2048:
        raise StartupError("Changed-file inventory exceeds the bounded startup assessment")
    for name in changed:
        if name in ENTRY_FILES or any(name.startswith(prefix) for prefix in AUTHORITY):
            raise StartupError("Existing changes overlap governance authority: " + name)
    tracked_lock = git(root, "show", "HEAD:" + LOCK_PATH.as_posix())
    if (root / LOCK_PATH).is_symlink() or (root / LOCK_PATH).read_bytes() != tracked_lock:
        raise StartupError("Runtime lock must match its committed content before automatic adoption")
    index = git(root, "ls-files", "--stage", "-z")
    if len(index) > 16777216:
        raise StartupError("Git index exceeds the bounded startup assessment")
    return {"authority": authority_digest(root), "branch": branch, "head": head, "index_digest": _index_digest(index),
            "files": {name: _file(root, name) for name in sorted(changed)}}


def assert_unchanged(root: Path, before: dict, *, committed: bool = False) -> None:
    """Detect another writer without reverting their work or absorbing it into the commit."""
    if git(root, "symbolic-ref", "--quiet", "HEAD").decode().strip() != before["branch"]:
        raise StartupError("Branch changed during the update", "recovery-required")
    if not committed and git(root, "rev-parse", "HEAD").decode().strip() != before["head"]:
        raise StartupError("HEAD changed during the update", "recovery-required")
    for name, expected in before["files"].items():
        if _file(root, name) != expected:
            raise StartupError("Existing work changed during the update: " + name, "recovery-required")
    if before["authority"] != authority_digest(root):
        raise StartupError("Governance authority changed during the update", "recovery-required")
    actual = git(root, "ls-files", "--stage", "-z")
    if before["index_digest"] != _index_digest(actual):
        raise StartupError("Unrelated staged content changed during the update", "recovery-required")
    known = set(before["files"]) | {LOCK_PATH.as_posix()}
    current = set(_names(git(root, "diff", "--name-only", "-z", "HEAD")))
    current.update(_names(git(root, "ls-files", "--others", "--exclude-standard", "-z")))
    if current - known:
        raise StartupError("Another writer introduced changes during the update", "recovery-required")


def commit_lock(root: Path, before: dict, version: str, message_path: Path, env: dict, expected_lock: bytes, timeout: float = 180) -> str:
    """Let ordinary Git hooks validate a path-specific commit, then verify its actual tree."""
    assert_unchanged(root, before)
    if (root / LOCK_PATH).read_bytes() != expected_lock:
        raise StartupError("Prepared runtime lock changed before commit", "recovery-required")
    message_path.write_text("Adopt governance " + version + " for new work\n\n"
                            "Use the compatible verified runtime before substantial implementation begins. "
                            "The isolated lock update preserves existing project work and policy.\n")
    import time
    from .startup_installation import _run

    _run(["git", "commit", "--only", "--file", str(message_path), "--", ":(literal)" + LOCK_PATH.as_posix()],
         root, time.monotonic() + timeout, env=env)
    head = git(root, "rev-parse", "HEAD").decode().strip()
    if git(root, "rev-parse", "HEAD^").decode().strip() != before["head"]:
        raise StartupError("Upgrade commit has an unexpected parent", "recovery-required")
    paths = _names(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"))
    if paths != [LOCK_PATH.as_posix()] or git(root, "show", "HEAD:" + LOCK_PATH.as_posix()) != expected_lock or (root / LOCK_PATH).read_bytes() != expected_lock:
        raise StartupError("Upgrade commit contains an unexpected change", "recovery-required")
    assert_unchanged(root, before, committed=True)
    return head
