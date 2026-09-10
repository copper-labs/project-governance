"""One shell interface usable by any parent agent with local command access."""

import argparse
import json
from pathlib import Path
import subprocess
import sys

from . import jobs
from .config import AgentError, PROVIDERS, TERMINAL
from .storage import Store


def dump(value):
    """Write one complete JSON record for a shell-capable parent."""
    print(json.dumps(value, ensure_ascii=False), flush=True)


def doctor(provider):
    """Check the native executable without spending tokens or certifying authentication."""
    import shutil

    command = shutil.which(PROVIDERS[provider])
    value = {"provider": provider, "executable": command, "available": bool(command),
             "authentication": "not checked", "capability_parity": "not certified"}
    if command:
        result = subprocess.run([command, "--version"], capture_output=True, text=True, timeout=10)
        value.update(available=result.returncode == 0, version=result.stdout.strip()[:1000],
                     error=result.stderr[:2000] if result.returncode else None)
    return value


def parser():
    """Expose one consistent command contract for every supported parent agent."""
    root = argparse.ArgumentParser(prog="harness-agent", description="Optional native provider jobs with full authorized tools.")
    sub = root.add_subparsers(dest="command", required=True)
    for name in ("start", "run"):
        p = sub.add_parser(name)
        p.add_argument("--provider", choices=PROVIDERS, required=True)
        p.add_argument("--workspace", required=True)
        task = p.add_mutually_exclusive_group(required=True)
        task.add_argument("--task-file", type=Path)
        task.add_argument("--task")
        p.add_argument("--model")
        p.add_argument("--effort")
        p.add_argument("--config", type=Path)
        p.add_argument("--executable")
        p.add_argument("--context-file", type=Path)
        p.add_argument("--constraints", default="")
        p.add_argument("--role", default="general")
        p.add_argument("--add-dir", action="append", default=[])
        p.add_argument("--require-tool", action="append", default=[])
        access = p.add_mutually_exclusive_group()
        access.add_argument("--shared", action="store_true", help="Read-only assignment; may overlap a cooperating writer.")
        access.add_argument("--writer", action="store_true", help="One writer that permits shared readers; default is exclusive.")
        p.add_argument("--timeout", default="0")
        p.add_argument("--idle-timeout", default="0")
        p.add_argument("--idempotency-key")
    for name in ("status", "result", "cancel", "events", "wait", "follow-up"):
        p = sub.add_parser(name)
        p.add_argument("job_id")
        if name in {"events", "wait"}:
            p.add_argument("--after", type=int, default=0)
        if name == "events":
            p.add_argument("--limit", type=int, default=100)
        if name == "wait":
            p.add_argument("--seconds", type=float, default=30)
            p.add_argument("--until-terminal", action="store_true", help="Observe within this process; no intermediate output or model polling.")
        if name == "result":
            p.add_argument("--summary", action="store_true")
        if name == "follow-up":
            p.add_argument("--task-file", type=Path, required=True)
            p.add_argument("--timeout")
            p.add_argument("--idempotency-key")
    p = sub.add_parser("batch", help="Start a deterministic test batch using the existing job lifecycle.")
    p.add_argument("--request-file", type=Path, required=True)
    p.add_argument("--notify-codex", action="store_true", help="Queue completion to the initiating CODEX_THREAD_ID.")
    p.add_argument("--codex-executable", help="Installed CLI with queue support; requires --notify-codex.")
    p = sub.add_parser("deliver", help="Inspect or explicitly retry delivery without rerunning tests.")
    p.add_argument("job_id")
    p.add_argument("--retry", action="store_true")
    p = sub.add_parser("record-use", help="Report one advisory Test Execution decision.")
    p.add_argument("--workspace", type=Path, required=True)
    p.add_argument("--decision-id", required=True)
    from ..skill_telemetry import CHOICES, HOSTS, REASONS

    p.add_argument("--choice", choices=sorted(CHOICES), required=True)
    p.add_argument("--host", choices=sorted(HOSTS), default="unknown")
    p.add_argument("--reason", choices=sorted(REASONS), required=True)
    p = sub.add_parser("doctor")
    p.add_argument("--provider", choices=PROVIDERS, required=True)
    p = sub.add_parser("list")
    p.add_argument("--limit", type=int, default=20)
    return root


def read_text(path):
    """Reject oversized input before loading an assignment into memory."""
    if path.stat().st_size > 500000:
        raise AgentError("input file exceeds 500 KB; supply relevant workspace paths instead")
    return path.read_text(encoding="utf-8")


def watch(job_id):
    """Stream reconnectable progress and request cancellation on an operator interrupt."""
    cursor = 0
    try:
        while True:
            value = jobs.wait(job_id, cursor, 30)
            cursor = value["cursor"]
            for event in value["events"]:
                dump(event)
            if value["state"] in TERMINAL and not value["has_more"]:
                break
    except KeyboardInterrupt:
        jobs.cancel(job_id)
        dump({"job_id": job_id, "cancellation_requested": True})
        return 130
    result = jobs.result(job_id)
    dump({"type": "result", "result": result})
    return {"succeeded": 0, "cancelled": 130, "timed_out": 124}.get(result["state"], 1)


def main(argv=None, environment_fd=None):
    """Dispatch explicit provider operations and return actionable local failures."""
    args = parser().parse_args(argv)
    try:
        command = args.command
        if command in {"start", "run"}:
            value = _start(args, environment_fd)
            dump(value)
            return watch(value["job_id"]) if command == "run" else 0
        if command == "doctor":
            value = doctor(args.provider)
            dump(value)
            return 0 if value["available"] else 1
        dump(_dispatch(args, environment_fd))
        return 0
    except (AgentError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        dump({"error": str(error)})
        return 1


def _start(args, environment_fd):
    return jobs.start(read_text(args.task_file) if args.task_file else args.task, args.workspace,
        provider=args.provider, model=args.model, effort=args.effort, config=args.config,
        executable=args.executable, context=read_text(args.context_file) if args.context_file else "",
        constraints=args.constraints, role=args.role, additional_roots=args.add_dir,
        required_tools=args.require_tool, access="shared" if args.shared else "writer" if args.writer else "exclusive",
        timeout_seconds=args.timeout, idle_timeout_seconds=args.idle_timeout,
        idempotency_key=args.idempotency_key, environment_fd=environment_fd)


def _dispatch(args, environment_fd):
    if args.command == "batch":
        from .test_batches import start

        if args.codex_executable and not args.notify_codex:
            raise AgentError("--codex-executable requires --notify-codex")
        from .completion import codex_target

        target = codex_target(args.codex_executable) if args.notify_codex else None
        return start(json.loads(read_text(args.request_file)), completion=target, environment_fd=environment_fd)
    if args.command == "deliver":
        from .completion import deliver

        return deliver(Store().job(args.job_id), retry=args.retry)
    if args.command == "record-use":
        from ..skill_telemetry import record_use

        return {"recorded": record_use(args.workspace, args.decision_id, args.choice, args.host, args.reason)}
    if args.command == "follow-up":
        return jobs.follow_up(args.job_id, read_text(args.task_file), timeout_seconds=args.timeout,
                              environment_fd=environment_fd, idempotency_key=args.idempotency_key)
    if args.command == "events":
        return jobs.events(args.job_id, args.after, args.limit)
    if args.command == "wait":
        if args.until_terminal:
            from .jobs import wait_terminal

            return compact_result(wait_terminal(args.job_id, Store()))
        return jobs.wait(args.job_id, args.after, args.seconds)
    if args.command == "list":
        return _list_jobs(args.limit)
    value = getattr(jobs, args.command)(args.job_id)
    return compact_result(value) if args.command == "result" and args.summary else value


def compact_result(value):
    """Return every case outcome without replaying private logs and provider tool transcripts."""
    fields = ("job_id", "state", "ready", "summary", "input_binding", "input_validity", "cleanup_confirmed", "paths", "error", "completion_delivery")
    result = {k: value[k] for k in fields if k in value}
    if "cases" in value:
        result["cases"] = [{k: c[k] for k in ("id", "outcome", "exit_code", "reason") if k in c} for c in value["cases"]]
    if "answer" in value:
        result["answer"] = value["answer"][:4000]
        result["answer_truncated"] = len(value["answer"]) > 4000
    return result


def _list_jobs(limit):
    if not 1 <= limit <= 100:
        raise AgentError("list limit must be between 1 and 100")
    store = Store()
    with store.lock():
        records = sorted((v for _, v in store.records()), key=lambda v: v["created_at"], reverse=True)
    return {"jobs": [jobs.status(v["job_id"], store=store) for v in records[:limit]]}
