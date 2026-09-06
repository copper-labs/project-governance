"""Coordinate one top-level startup decision without introducing a background control plane."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import time

from .installation import LOCK_PATH, load_lock
from .startup_state import StartupError, delegated, digest, exclusive, git, lock_digest, policy, read_json, repository, result, state_root, task_path, write_json


def host_owner(provider: str) -> dict | None:
    """Record only a positively identified native host ancestor for abandoned-session recovery."""
    from .process_identity import record

    pid = os.getppid()
    for _ in range(8):
        rows = subprocess.run(["ps", "-p", str(pid), "-o", "ppid=", "-o", "comm="],
                              capture_output=True, text=True, timeout=2, check=False).stdout.strip().split(None, 1)
        if len(rows) != 2:
            break
        if Path(rows[1]).name.startswith(provider):
            value = record(pid)
            return value if value["identity"] else None
        pid = int(rows[0])
        if pid <= 1:
            break
    return None


def owner_gone(owner: dict | None) -> bool:
    """Recover only a positively absent or replaced process, never an expired timestamp."""
    if not owner or not owner.get("identity"):
        return False
    from .process_identity import identity

    current = identity(owner["pid"])
    if current:
        return current != owner["identity"]
    try:
        os.kill(owner["pid"], 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        pass
    return False


def other_tasks(root: Path, task_id: str) -> None:
    """Protect other native parents while bounding receipt retention and local scanning."""
    from .startup_state import TASK_ID

    paths = [p for p in state_root(root).glob("*.json") if TASK_ID.fullmatch(p.stem)]
    if len(paths) > 4096:
        raise StartupError("Startup task inventory exceeds its bound; inspect inactive receipts")
    for path in paths:
        if path.stem == task_id:
            continue
        value = read_json(path)
        if value.get("state") == "closed":
            continue
        if owner_gone(value.get("owner")):
            value["state"] = "closed"
            write_json(path, value)
            continue
        raise StartupError("Another top-level task still owns this runtime")


def handle_event(root: Path, provider: str, event: dict) -> dict:
    """Normalize root startup events and exclude continuations before network discovery."""
    from .startup_integration import SUPPORTED

    if not isinstance(event, dict):
        return result("deferred", "Native startup event is malformed")
    if delegated() or event.get("agent_id") or event.get("hook_event_name") == "SubagentStart":
        return result("deferred", "Subagents inherit their parent's runtime")
    if provider not in SUPPORTED:
        return result("deferred", "Host startup adapter is not certified")
    session = event.get("session_id")
    if not isinstance(session, str) or not 1 <= len(session) <= 128:
        return result("deferred", "Native session identity is unavailable")
    kind, source = event.get("hook_event_name"), event.get("source")
    if kind not in {"SessionStart", "SessionEnd", "UserPromptSubmit"}:
        return result("deferred", "Not a supported top-level startup event")
    root = repository(root)
    task_id = digest(json.dumps([provider, session, str(root)]).encode())
    state = state_root(root)
    path = task_path(root, task_id)
    if kind == "SessionEnd":
        prior = read_json(path)
        if prior:
            prior["state"] = "closed"
            write_json(path, prior)
        return result("current", "Session ended")
    from .runtime_access import runtime_reader

    try:
        with runtime_reader(root, join=False):
            return _register_and_discover(root, provider, event, task_id)
    except RuntimeError:
        answer = result("deferred", "Runtime activation is in progress or interrupted. Do not begin governed work until project-governance doctor passes; then read the active guidance and continue without another update", must_wait=True, task_id=task_id)
        receipt = read_json(path) or {"task_id": task_id, "provider": provider, "session_id": session,
                                     "root": str(root), "lock_digest": None, "version": None}
        receipt.update(state="open", owner=host_owner(provider), result=answer)
        write_json(path, receipt)
        return answer


def _register_and_discover(root: Path, provider: str, event: dict, task_id: str) -> dict:
    """Reserve readers before discovery ownership so concurrent task starts remain visible."""
    path = task_path(root, task_id)
    prior = read_json(path)
    current = load_lock(root / LOCK_PATH)
    was_open = prior and prior.get("state") == "open"
    receipt = prior or {"task_id": task_id, "provider": provider, "session_id": event["session_id"],
                       "root": str(root), "lock_digest": lock_digest(root), "version": current["version"],
                       "time": time.time()}
    receipt["state"] = "open"
    receipt["owner"] = host_owner(provider)
    if prior and prior["lock_digest"] != lock_digest(root):
        answer = result("approval-required", "Runtime changed; refresh the parent context before continuing")
    elif event.get("hook_event_name") == "UserPromptSubmit" and was_open:
        answer = prior["result"]
    elif event.get("hook_event_name") == "UserPromptSubmit" or event.get("source") != "startup":
        answer = result("deferred", "Continuation reserved its runtime; refresh current guidance if its previous identity was unavailable", refresh_context=not bool(prior))
    elif prior:
        answer = prior["result"] if was_open else result("deferred", "Completed tasks do not initiate another update")
    else:
        answer = result("deferred", "Startup task reserved its current runtime")
    receipt["result"] = {**answer, "task_id": task_id}
    write_json(path, receipt)
    if prior or event.get("hook_event_name") != "SessionStart" or event.get("source") != "startup":
        return receipt["result"]
    answer = _discover_for_task(root, event, current)
    receipt["result"] = {**answer, "task_id": task_id}
    write_json(path, receipt)
    return receipt["result"]


def _discover_for_task(root: Path, event: dict, current: dict) -> dict:
    """Resolve policy and release metadata only after this task's ownership is visible."""
    try:
        settings = policy(root)
        with exclusive(state_root(root) / "update.lock"):
            profile = "config/governance/profile.yaml"
            if settings["policy"] != "compatible":
                return result("current", "Automatic startup updates are disabled")
            if git(root, "show", "HEAD:" + profile) != (root / profile).read_bytes():
                return result("deferred", "Commit the authorized startup policy before automatic adoption")
            if event.get("permission_mode") == "plan":
                return result("deferred", "Plan-only host mode does not apply runtime updates")
            from .startup_releases import discover

            return discover(root, current, settings)
    except (StartupError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        return result(error.status if isinstance(error, StartupError) else "deferred",
                      str(error) if isinstance(error, StartupError) else "Release discovery unavailable; retain the current runtime")


def hook_output(event: dict, answer: dict) -> dict:
    """Give the parent one compact action without exposing artifact blobs or credentials."""
    if not isinstance(event, dict) or event.get("hook_event_name") not in {"SessionStart", "UserPromptSubmit"}:
        return {}
    task = answer.get("task_id")
    if task and event["hook_event_name"] == "UserPromptSubmit" and answer["status"] in {"current", "available", "deferred"} and not answer.get("must_wait") and not answer.get("refresh_context"):
        message = "Governance task reservation is active. This prompt did not check for releases. "
        message += "At task closeout run project-governance startup finish --task-id " + task + "."
        return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": message}}
    message = "Governance startup: " + answer["status"] + ". " + answer["reason"] + "."
    if answer["status"] == "available":
        message += (" Before substantial implementation, read .governance/runtime/skills/resources/startup-runtime-updates.md. "
                    "Minor work already underway can remain eligible. Startup receipt: " + task + ".")
    if task:
        message += " At task completion run project-governance startup finish --task-id " + task + "."
    if answer["status"] == "current" and not task:
        return {}
    return {"hookSpecificOutput": {"hookEventName": event["hook_event_name"], "additionalContext": message}}


def health(root: Path) -> dict:
    """Describe configuration and interrupted work without performing a startup check."""
    try:
        settings = policy(root)
        state = root / ".governance/startup"
        interrupted = any((state / name).exists() for name in ("transaction.json", "enable.json"))
        from .runtime_access import transaction_child

        return {"policy": settings["policy"], "status": "recovery-required" if interrupted and not transaction_child(root) else "ready",
                "supported_providers": ["codex"]}
    except (StartupError, OSError, ValueError) as error:
        return {"status": "invalid", "reason": str(error)}


def finish(root: Path, task_id: str) -> dict:
    """Release only the calling top-level task reservation at its normal closeout."""
    if delegated():
        raise StartupError("Subagents cannot finish their parent's startup reservation")
    path = task_path(root, task_id)
    with exclusive(state_root(root) / "update.lock"):
        from .startup_transaction import _receipt

        value = _receipt(root, task_id, check_lock=False)
        value["state"] = "closed"
        write_json(path, value)
    return result("current", "Task reservation released")


def add_arguments(parser) -> None:
    """Expose deliberate setup and parent-owned application without worker role switches."""
    commands = parser.add_subparsers(dest="startup_command", required=True)
    for name in ("enable", "event"):
        command = commands.add_parser(name)
        command.add_argument("--provider", required=True, choices=["codex", "claude", "gemini"])
    apply = commands.add_parser("apply")
    apply.add_argument("--task-id", required=True)
    apply.add_argument("--work-state", required=True, choices=["not-started", "minor", "substantial-plan", "review", "read-only"])
    apply.add_argument("--reason", required=True)
    commands.add_parser("recover")
    done = commands.add_parser("finish")
    done.add_argument("--task-id", required=True)


def dispatch(args, root: Path) -> dict:
    """Keep automatic policy separate from ordinary checks and deliberate version selection."""
    if args.startup_command == "event":
        import sys

        raw = sys.stdin.buffer.read(65537)
        event = json.loads(raw) if len(raw) <= 65536 else {}
        return hook_output(event, handle_event(root, args.provider, event))
    if delegated():
        raise StartupError("Delegated workers never initiate runtime updates")
    root = repository(root)
    if args.startup_command == "enable":
        from .startup_integration import enable

        return enable(root, args.provider)
    if args.startup_command == "finish":
        return finish(root, args.task_id)
    from .startup_transaction import apply, recover

    if args.startup_command == "recover":
        return recover(root)
    return apply(root, args.task_id, args.work_state, args.reason)


def main() -> int:
    """Run the thin native hook entry without loading the validation command graph."""
    parser = argparse.ArgumentParser()
    add_arguments(parser)
    args = parser.parse_args()
    try:
        answer = dispatch(args, Path.cwd())
    except (StartupError, OSError, ValueError) as error:
        answer = {"systemMessage": "Governance startup deferred: " + str(error)}
    print(json.dumps(answer))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
