"""Bind optional workers to the parent's installed startup-managed runtime."""

from __future__ import annotations

from pathlib import Path
import os
import re

from .config import AgentError
from ..installation import LOCK_PATH, load_lock
from ..runtime_access import installation_root
from ..startup_state import StartupError, lock_digest, policy, repository


def binding(workspace: str) -> dict | None:
    """Require a startup-managed worker to run through the destination's own installation."""
    installed = installation_root()
    target = _target(Path(workspace))
    managed = [root for root in (installed, target) if root and (root / LOCK_PATH).is_file()
               and policy(root)["policy"] == "compatible"]
    inherited = os.environ.get("GOVERNANCE_PARENT_LOCK_DIGEST")
    parent = os.environ.get("GOVERNANCE_PARENT_TASK")
    if inherited or parent:
        if not parent or not re.fullmatch(r"[a-f0-9]{64}", inherited or ""):
            raise AgentError("Inherited worker runtime identity is missing or malformed; return to the parent")
        if target is None or lock_digest(target) != inherited:
            raise AgentError("Destination runtime differs from the inherited parent lock; return to the parent")
    if not managed and not inherited:
        return None
    if installed is None or target != installed:
        raise AgentError("Worker runtime does not match its destination. Return to the parent and use that worktree's exact installed runtime; workers never bootstrap or update it.")
    if not (target / ".governance/runtime/bin/python").is_file():
        raise AgentError("Worker runtime is missing; return to the parent without bootstrapping")
    return {"root": str(target), "lock_digest": lock_digest(target),
            "version": load_lock(target / LOCK_PATH)["version"]}


def validate(request: dict) -> dict | None:
    """Reject a changed runtime before launching or resuming a delegated provider."""
    current = binding(request["workspace"])
    if request.get("runtime_binding") != current:
        raise AgentError("Worker runtime changed since its assignment; return the mismatch to the parent")
    return current


def _target(workspace: Path) -> Path | None:
    """Avoid a Git subprocess for standalone work with no governed ancestor."""
    path = workspace.resolve()
    if not any((candidate / LOCK_PATH).is_file() for candidate in (path, *path.parents)):
        return None
    try:
        return repository(path)
    except StartupError:
        return None
