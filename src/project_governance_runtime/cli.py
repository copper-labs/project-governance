"""Expose one stable command line for planning, checking, setup, and inspection."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from . import __version__
from .agent_orchestration import (
    AgentOrchestrationError,
    finish_dispatch,
    load_control_state,
    start_dispatch,
)
from .agent_routing import catalog_digest, route_task, solo_route
from .changed_paths import ChangedPathError, resolve_change_scope
from .configuration import ConfigurationError, load_packs
from .context import ContextError, resolve_context
from .documentation import (
    DocumentationError,
    documentation_selection_paths,
    initialize_documentation,
    route_documentation,
)
from .installation import InstallationError, initialize, load_lock, update
from .planning import build_plan, public_plan
from .runner import execute
from .telemetry import append as telemetry_append
from .telemetry import status as telemetry_status


def _root() -> Path:
    """Use the caller's repository as the only project authority."""
    return Path.cwd().resolve()


def _selection_arguments(parser: argparse.ArgumentParser, *, allow_pack: bool) -> None:
    """Add the shared unambiguous selection arguments."""
    parser.add_argument("--stage")
    parser.add_argument("--mode", choices=["impacted", "all"], default="impacted")
    parser.add_argument("--staged", action="store_true")
    parser.add_argument("--changed-path", action="append", default=[])
    parser.add_argument("--base-ref")
    if allow_pack:
        parser.add_argument("--pack", action="append", default=[])


def _parser() -> argparse.ArgumentParser:
    """Build the lean public CLI without legacy aliases."""
    parser = argparse.ArgumentParser(prog="project-governance")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check")
    _selection_arguments(check, allow_pack=True)
    check.add_argument("--timeout-seconds", type=float, default=540.0)
    check.add_argument("--json-output", type=Path)
    check.add_argument("--commit-message-file", type=Path)
    check.add_argument("--pr-body-file", type=Path)
    plan = commands.add_parser("plan")
    _selection_arguments(plan, allow_pack=False)
    plan.add_argument("--json", action="store_true")
    context = commands.add_parser("context")
    context.add_argument("--task", required=True)
    context.add_argument("--changed-path", action="append", default=[])
    context.add_argument("--include-expansion", action="store_true")
    context.add_argument("--json", action="store_true")
    agent_route = commands.add_parser("agent-route")
    agent_route.add_argument("--task", type=Path, required=True)
    agent_route.add_argument("--session", type=Path, required=True)
    agent_route.add_argument("--catalog", type=Path, required=True)
    agent_route.add_argument("--json", action="store_true")
    dispatch = commands.add_parser("agent-dispatch")
    dispatch_commands = dispatch.add_subparsers(dest="dispatch_command", required=True)
    dispatch_start = dispatch_commands.add_parser("start")
    dispatch_start.add_argument("--request", type=Path, required=True)
    dispatch_start.add_argument("--json", action="store_true")
    dispatch_finish = dispatch_commands.add_parser("finish")
    dispatch_finish.add_argument("--authorization", required=True)
    dispatch_finish.add_argument("--results", type=Path, required=True)
    dispatch_finish.add_argument("--json", action="store_true")
    commands.add_parser("doctor")
    telemetry = commands.add_parser("telemetry")
    telemetry.add_argument("telemetry_command", choices=["status"])
    commands.add_parser("init")
    docs = commands.add_parser("docs")
    docs_commands = docs.add_subparsers(dest="docs_command", required=True)
    docs_init = docs_commands.add_parser("init")
    docs_init.add_argument("--dry-run", action="store_true")
    docs_route = docs_commands.add_parser("route")
    docs_route_query = docs_route.add_mutually_exclusive_group(required=True)
    docs_route_query.add_argument("--capability")
    docs_route_query.add_argument("--symbol")
    docs_route.add_argument("--json", action="store_true")
    upgrade = commands.add_parser("update")
    upgrade.add_argument("--to", required=True)
    action = upgrade.add_mutually_exclusive_group(required=True)
    action.add_argument("--dry-run", action="store_true")
    action.add_argument("--apply", action="store_true")
    return parser


def _validate_selection_arguments(
    args: argparse.Namespace,
    *,
    explicit: list[str],
    mode: str,
    base_ref: str | None,
) -> None:
    """Reject combinations that would give one run competing scope authorities."""
    pack_scope_conflict = any(
        (bool(args.stage), args.staged, bool(args.changed_path), args.mode != "impacted")
    )
    if explicit and pack_scope_conflict:
        raise ConfigurationError("--pack cannot be combined with stage or impact selectors")
    if args.staged and args.changed_path:
        raise ConfigurationError("--staged cannot be combined with --changed-path")
    if args.staged and base_ref:
        raise ConfigurationError("--staged cannot be combined with --base-ref")
    if mode == "all" and base_ref:
        raise ConfigurationError("--mode all cannot be combined with --base-ref")
    if not args.stage and mode != "explicit" and not args.changed_path and mode != "all":
        raise ConfigurationError("impacted mode requires --stage")


def _empty_change_scope(args: argparse.Namespace, mode: str) -> dict[str, Any]:
    """Retain a stable packet envelope when comparison resolution blocks planning."""
    if args.staged or args.stage == "pre-commit":
        packet_mode = "staged"
    elif mode == "explicit" or args.changed_path:
        packet_mode = "explicit"
    else:
        packet_mode = "changed"
    return {
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "changed",
        "mode": packet_mode,
        "base_ref": None,
        "records": [],
    }


def _resolve_cli_change_scope(
    args: argparse.Namespace,
    root: Path,
    *,
    mode: str,
    base_ref: str | None,
) -> tuple[dict[str, Any], str]:
    """Resolve one comparison or return its single grouped planning error."""
    try:
        if mode == "all" or args.stage == "commit-msg":
            return resolve_change_scope(root, all_scope=True), ""
        return resolve_change_scope(
            root,
            staged=args.staged or args.stage == "pre-commit",
            explicit_paths=list(args.changed_path),
            base_ref=base_ref,
            packet_mode="explicit" if mode == "explicit" or args.changed_path else None,
        ), ""
    except ChangedPathError as error:
        return _empty_change_scope(args, mode), str(error)


def _scope_paths(args: argparse.Namespace, change_scope: dict[str, Any]) -> list[str]:
    """Keep explicit path selection while deriving ordinary paths from the packet."""
    if args.changed_path:
        return sorted(set(args.changed_path))
    return [record["path"] for record in change_scope["records"]]


def _attach_change_scope(
    plan: dict[str, Any],
    change_scope: dict[str, Any],
    paths: list[str],
    resolution_error: str,
) -> None:
    """Attach packet evidence and at most one comparison-subject blocker."""
    plan["change_scope"] = change_scope
    plan["changed_records"] = [
        {
            "path": record["path"],
            "is_new": record["status"] in {"added", "renamed"},
        }
        for record in change_scope["records"]
    ]
    if not resolution_error:
        return
    plan["status"] = "blocked"
    plan["blockers"].append({
        "code": "comparison-subject-unresolved",
        "mode": change_scope["mode"],
        "paths": paths,
        "message": resolution_error,
    })


def _resolve_plan(args: argparse.Namespace, root: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """Load packs and resolve explicit, staged, or branch-aware paths once."""
    packs = load_packs(root)
    if "documentation" in packs:
        documentation_pack = dict(packs["documentation"])
        documentation_pack["path_globs"] = sorted(
            set(documentation_pack.get("path_globs", []))
            | set(documentation_selection_paths(root))
        )
        packs["documentation"] = documentation_pack
    explicit = list(getattr(args, "pack", []))
    base_ref = getattr(args, "base_ref", None)
    mode = "explicit" if explicit else args.mode
    _validate_selection_arguments(args, explicit=explicit, mode=mode, base_ref=base_ref)
    change_scope, resolution_error = _resolve_cli_change_scope(
        args, root, mode=mode, base_ref=base_ref
    )
    paths = _scope_paths(args, change_scope)
    plan = build_plan(
        packs,
        stage=args.stage,
        mode=mode,
        changed_paths=paths,
        explicit_pack_ids=explicit,
    )
    _attach_change_scope(plan, change_scope, paths, resolution_error)
    return plan, packs


def _doctor(root: Path) -> dict[str, Any]:
    """Report actionable installation health without changing repository state."""
    findings: list[str] = []
    lock_path = root / "config/governance/runtime.lock.yaml"
    if not lock_path.exists():
        findings.append("config/governance/runtime.lock.yaml is missing")
    else:
        try:
            load_lock(lock_path)
        except (InstallationError, OSError, json.JSONDecodeError) as error:
            findings.append(str(error))
    for relative in ("config/governance/profile.yaml", "config/governance/facts.lock.yaml"):
        if not (root / relative).exists():
            findings.append(f"{relative} is missing")
    return {"status": "failed" if findings else "passed", "findings": findings}


def _emit(value: dict[str, Any], path: Path | None = None) -> None:
    """Render one deterministic JSON result and optional evidence file."""
    rendered = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)


def _result_exit_code(output: dict[str, Any]) -> int:
    """Map one failed runtime result to its stable process exit code."""
    if output.get("status") not in {"failed", "blocked", "migration-required"}:
        return 0
    return {"timeout": 124, "cancelled": 130}.get(
        str(output.get("termination_reason")), 1
    )


def _run_check_or_plan(args: argparse.Namespace, root: Path) -> int:
    """Plan or execute validation without mixing setup and context commands into the branch."""
    plan, packs = _resolve_plan(args, root)
    output = public_plan(plan)
    if args.command == "check" and plan["status"] != "blocked":
        output = execute(
            root,
            packs,
            plan,
            timeout_seconds=args.timeout_seconds,
            command_arguments={
                "commit_message_file": str(args.commit_message_file or ""),
                "pr_body_file": str(args.pr_body_file or ""),
            },
        )
    _emit(output, getattr(args, "json_output", None))
    return _result_exit_code(output)


def _run_context(args: argparse.Namespace, root: Path) -> int:
    """Resolve and render one bounded context selection."""
    output = resolve_context(
        root,
        args.task,
        args.changed_path,
        include_expansion=args.include_expansion,
    )
    if args.json:
        _emit(output)
    else:
        print(
            f"route={output['route']['id']} "
            f"outcome={output['route']['outcome']} "
            f"status={output['status']}"
        )
        print(f"materialization={output['materialization']['root']}")
    return _result_exit_code(output)


def _load_json_object(path: Path, *, label: str) -> dict[str, Any]:
    """Load one explicit CLI JSON object without scanning the repository."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AgentOrchestrationError(f"{label} must contain one JSON object")
    return value


def _run_agent_command(args: argparse.Namespace, root: Path) -> int:
    """Route or authorize one native-host wave without launching a provider."""
    if args.command == "agent-route":
        task = _load_json_object(args.task, label="--task")
        session = _load_json_object(args.session, label="--session")
        catalog = _load_json_object(args.catalog, label="--catalog")
        expected_digest = catalog_digest(catalog)
        if "digest" in catalog and catalog["digest"] != expected_digest:
            raise AgentOrchestrationError("catalog-digest-mismatch")
        catalog["digest"] = expected_digest
        try:
            state = load_control_state(root)
        except (AgentOrchestrationError, OSError, ValueError, json.JSONDecodeError):
            output = solo_route("control-state-unavailable")
        else:
            output = route_task(task, session, catalog, state)
    elif args.dispatch_command == "start":
        output = start_dispatch(
            root, _load_json_object(args.request, label="--request")
        )
    else:
        output = finish_dispatch(
            root,
            args.authorization,
            _load_json_object(args.results, label="--results"),
            terminal_hook=telemetry_append,
        )
    _emit(output)
    return _result_exit_code(output)


def _documentation_terminal_event(
    args: argparse.Namespace, output: dict[str, Any], started: float
) -> dict[str, Any]:
    """Build one bounded terminal event without retaining a route query or local path."""
    event = {
        "event": "documentation-terminal",
        "runtime_version": __version__,
        "operation": args.docs_command,
        "outcome": output["status"],
        "duration_ms": (time.monotonic() - started) * 1000,
    }
    if args.docs_command == "init":
        event.update(
            {
            "dry_run": bool(args.dry_run),
            "created_count": len(output.get("created", [])),
            "updated_count": len(output.get("updated", [])),
            "unchanged_count": len(output.get("unchanged", [])),
            "conflict_count": len(output.get("conflicts", [])),
            }
        )
    else:
        event.update(
            {
                "query_kind": output.get(
                    "query_kind", "capability" if args.capability is not None else "symbol"
                ),
                "match_count": output.get("match_count", 0),
            }
        )
    return event


def _run_documentation_command(args: argparse.Namespace, root: Path) -> int:
    """Install or resolve the minimal documentation module and record bounded telemetry."""
    started = time.monotonic()
    try:
        if args.docs_command == "init":
            output = initialize_documentation(root, dry_run=args.dry_run)
        else:
            output = route_documentation(
                root,
                capability=args.capability,
                symbol=args.symbol,
            )
    except (DocumentationError, OSError, ValueError) as error:
        output = {"status": "failed", "error": str(error)}
        if args.docs_command == "init":
            output.update(
                {
                    "kind": "project-governance-documentation-init",
                    "version": 1,
                    "dry_run": bool(args.dry_run),
                    "created": [],
                    "updated": [],
                    "unchanged": [],
                    "conflicts": [],
                    "agent_pointer": None,
                }
            )
        else:
            output.update(
                {
                    "kind": "project-governance-documentation-route",
                    "version": 1,
                    "query_kind": (
                        "capability" if args.capability is not None else "symbol"
                    ),
                    "match_count": 0,
                }
            )
    event = _documentation_terminal_event(args, output, started)
    telemetry_append(root, event)
    if args.docs_command == "route" and not args.json:
        print(
            f"status={output['status']} "
            f"query_kind={output['query_kind']} "
            f"match_count={output['match_count']}"
        )
    else:
        _emit(output)
    return 1 if output.get("status") in {"failed", "invalid"} else 0


def _run_administration(args: argparse.Namespace, root: Path) -> int:
    """Run one non-validation command and emit its normalized result."""
    if args.command == "doctor":
        output = _doctor(root)
    elif args.command == "telemetry":
        output = telemetry_status(root)
    elif args.command == "init":
        output = initialize(root)
    else:
        output = update(root, args.to, apply=args.apply)
    _emit(output)
    return _result_exit_code(output)


def main() -> int:
    """Dispatch one public runtime command and return its stable exit code."""
    args = _parser().parse_args()
    root = _root()
    try:
        if args.command in {"check", "plan"}:
            return _run_check_or_plan(args, root)
        if args.command == "context":
            return _run_context(args, root)
        if args.command in {"agent-route", "agent-dispatch"}:
            return _run_agent_command(args, root)
        if args.command == "docs":
            return _run_documentation_command(args, root)
        return _run_administration(args, root)
    except (
        AgentOrchestrationError,
        ChangedPathError,
        ConfigurationError,
        ContextError,
        DocumentationError,
        InstallationError,
        OSError,
        ValueError,
    ) as error:
        _emit({"status": "failed", "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
