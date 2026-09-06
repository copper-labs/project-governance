"""Apply or recover one exact local governance upgrade without discarding project work."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import time
import uuid

from .installation import LOCK_PATH, load_lock
from .startup_git import assert_unchanged, authority_digest, commit_lock, snapshot
from .startup_installation import _run, activate, active_environment, environment_parent, prepare
from .startup_releases import eligible
from .startup_state import StartupError, delegated, digest, exclusive, git, lock_digest, policy, read_json, result, state_root, task_path, write_json
from .state_io import atomic_write_text


def _receipt(root: Path, task_id: str, *, check_lock: bool = True) -> dict:
    if delegated():
        raise StartupError("Subagents never initiate runtime updates")
    value = read_json(task_path(root, task_id))
    if not value or value.get("task_id") != task_id or value.get("root") != str(root) or value.get("state") != "open":
        raise StartupError("An open native top-level startup receipt is required")
    native_id = os.environ.get("CODEX_THREAD_ID") if value["provider"] == "codex" else None
    if not native_id or native_id != value["session_id"]:
        raise StartupError("Startup receipt belongs to another native task")
    if check_lock and value["lock_digest"] != lock_digest(root):
        raise StartupError("The runtime changed after this task started; refresh its context", "approval-required")
    return value


def _committed(root: Path, journal: dict) -> str | None:
    head = git(root, "rev-parse", "HEAD").decode().strip()
    if head == journal["before"]["head"]:
        return None
    if (git(root, "rev-parse", "HEAD^").decode().strip() != journal["before"]["head"]
            or git(root, "show", "HEAD:" + LOCK_PATH.as_posix()) != journal["candidate_lock"].encode()
            or git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD") != os.fsencode(LOCK_PATH.as_posix()) + b"\0"):
        raise StartupError("HEAD changed independently; preserve the update journal for recovery", "recovery-required")
    return head


def _restore(root: Path, journal: dict) -> dict:
    """Resolve a stopped transaction against Git authority without rewriting history."""
    parent = environment_parent(root)
    previous, candidate = Path(journal["previous"]), Path(journal["candidate"])
    if previous.parent != parent or candidate.parent != parent or previous.is_symlink() or candidate.is_symlink():
        raise StartupError("Journal environment identity is unsafe", "recovery-required")
    before = journal["before"]
    if git(root, "show", before["head"] + ":" + LOCK_PATH.as_posix()) != journal["old_lock"].encode():
        raise StartupError("Journal does not match the original committed lock", "recovery-required")
    if git(root, "symbolic-ref", "--quiet", "HEAD").decode().strip() != before["branch"]:
        raise StartupError("Branch changed; preserve the update journal for recovery", "recovery-required")
    current = (root / LOCK_PATH).read_bytes()
    if current not in {journal["old_lock"].encode(), journal["candidate_lock"].encode()}:
        raise StartupError("Runtime lock changed independently; preserve it for recovery", "recovery-required")
    active = active_environment(root)
    if active not in {previous, candidate}:
        raise StartupError("Runtime pointer changed independently; preserve it for recovery", "recovery-required")
    commit = _committed(root, journal)
    if commit:
        atomic_write_text(root / LOCK_PATH, journal["candidate_lock"])
        activate(root, candidate)
        answer = result("updated", "Recovered the committed runtime update", commit=commit,
                        version=json.loads(journal["candidate_lock"])["version"])
    else:
        atomic_write_text(root / LOCK_PATH, journal["old_lock"])
        activate(root, previous)
        answer = result("deferred", "Restored the previous runtime after an incomplete upgrade")
    assert_unchanged(root, before, committed=bool(commit))
    return answer


def _complete_receipt(root: Path, journal: dict, answer: dict) -> None:
    path = task_path(root, journal["task_id"])
    value = read_json(path)
    if value:
        value["lock_digest"] = lock_digest(root)
        value["version"] = load_lock(root / LOCK_PATH)["version"]
        value["result"] = {**answer, "task_id": journal["task_id"]}
        write_json(path, value)


def recover(root: Path) -> dict:
    """Recover an interrupted local transaction only after acquiring its runtime ownership."""
    state = state_root(root)
    with exclusive(state / "update.lock"), exclusive(root / ".governance/runtime-use.lock"):
        if (state / "enable.json").exists():
            from .startup_integration import recover_enable

            return recover_enable(root)
        path = state / "transaction.json"
        journal = read_json(path)
        if not journal:
            return result("current", "No interrupted runtime update exists")
        from .process_identity import record

        journal["owner"] = record(os.getpid())
        journal["phase"] = "committed" if _committed(root, journal) else "activated"
        write_json(path, journal)
        answer = _restore(root, journal)
        if answer["status"] == "updated":
            env = dict(os.environ, GOVERNANCE_UPDATE_TOKEN=journal["token"])
            doctor = json.loads(_run([str(root / ".governance/runtime/bin/project-governance"), "doctor"], root, time.monotonic() + policy(root)["install_seconds"], env=env))
            if doctor.get("status") != "passed" or doctor.get("runtime_version") != answer["version"]:
                raise StartupError("Committed runtime still fails validation", "recovery-required")
        _complete_receipt(root, journal, answer)
        path.unlink()
        return answer


def apply(root: Path, task_id: str, work_state: str, reason: str) -> dict:
    """Apply an eligible candidate after the parent assesses actual work and Git isolation."""
    if not reason.strip() or len(reason) > 1000:
        raise StartupError("Provide a short explanation of the current work assessment")
    if work_state not in {"not-started", "minor"}:
        return result("deferred", "Current task scope or substantial execution retains its runtime")
    if os.environ.get("GIT_INDEX_FILE") or os.environ.get("GOVERNANCE_UPDATE_TOKEN"):
        raise StartupError("Automatic adoption cannot run inside another Git or update transaction")
    settings = policy(root)
    if settings["policy"] != "compatible":
        return result("deferred", "Repository policy requires deliberate runtime adoption")
    state = state_root(root)
    with exclusive(state / "update.lock"):
        if (state / "transaction.json").exists() or (state / "enable.json").exists():
            raise StartupError("Recover the interrupted update before applying another", "recovery-required")
        receipt = _receipt(root, task_id)
        answer = receipt["result"]
        if answer["status"] != "available":
            return answer
        from .startup import other_tasks

        other_tasks(root, task_id)
        snapshot(root)
        authority = authority_digest(root)
        current = load_lock(root / LOCK_PATH)
        eligible(current, answer["lock_text"].encode(), answer["metadata"])
        previous = active_environment(root)
        candidate = prepare(root, answer, settings)
        with exclusive(root / ".governance/runtime-use.lock"):
            _receipt(root, task_id)
            other_tasks(root, task_id)
            before = snapshot(root)
            if policy(root) != settings or authority_digest(root) != authority or active_environment(root) != previous:
                raise StartupError("Governance authority changed during preparation; reassess before updating")
            from .process_identity import record

            journal = {"schema_version": 1, "task_id": task_id, "pid": os.getpid(), "owner": record(os.getpid()),
                       "token": uuid.uuid4().hex, "phase": "prepared", "before": before,
                       "old_lock": (root / LOCK_PATH).read_text(), "candidate_lock": answer["lock_text"],
                       "previous": str(previous), "candidate": str(candidate)}
            return _activate_and_commit(root, journal, settings)


def _activate_and_commit(root: Path, journal: dict, settings: dict) -> dict:
    state = state_root(root)
    path = state / "transaction.json"
    write_json(path, journal)
    deadline = time.monotonic() + settings["install_seconds"]
    env = dict(os.environ, GOVERNANCE_UPDATE_TOKEN=journal["token"])
    try:
        activate(root, Path(journal["candidate"]))
        atomic_write_text(root / LOCK_PATH, journal["candidate_lock"])
        journal["phase"] = "activated"
        write_json(path, journal)
        runtime = str(root / ".governance/runtime/bin/project-governance")
        doctor = json.loads(_run([runtime, "doctor"], root, deadline, env=env))
        if doctor.get("status") != "passed" or doctor.get("runtime_version") != json.loads(journal["candidate_lock"])["version"]:
            raise StartupError("Updated runtime did not pass target installation validation")
        version = json.loads(journal["candidate_lock"])["version"]
        commit = commit_lock(root, journal["before"], version, state / "commit-message.txt", env, journal["candidate_lock"].encode(), settings["install_seconds"])
        journal["phase"] = "committed"
        journal["commit"] = commit
        write_json(path, journal)
        if active_environment(root) != Path(journal["candidate"]):
            raise StartupError("Installed runtime pointer changed after commit", "recovery-required")
        answer = result("updated", "Verified compatible runtime and committed its isolated lock change", version=version, commit=commit)
        _complete_receipt(root, journal, answer)
        path.unlink()
        return answer
    except Exception as error:
        try:
            restored = _restore(root, journal)
            if restored["status"] == "updated":
                raise StartupError("Upgrade commit exists but final verification failed; run startup recover", "recovery-required")
            _complete_receipt(root, journal, restored)
            path.unlink()
        except Exception as recovery_error:
            raise StartupError("Update requires recovery; project changes and journal were preserved", "recovery-required") from recovery_error
        if isinstance(error, StartupError):
            raise error
        raise StartupError("Upgrade failed and the previous runtime was restored") from error
