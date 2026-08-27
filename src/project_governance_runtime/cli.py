"""Expose one stable command line for planning, checking, setup, and inspection."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .changed_paths import ChangedPathError, resolve_change_scope
from .configuration import ConfigurationError, load_packs
from .context import ContextError, resolve_context
from .documentation import (
    DocumentationError,
    documentation_selection_paths,
    initialize_documentation,
    route_documentation,
)
from .execution_commands import pack_stage_command_gaps
from .installation import InstallationError, initialize, load_lock, update
from .planning import build_plan, public_plan
from .runner import execute
from .telemetry import status as telemetry_status


MAX_SUMMARY_MESSAGE_LENGTH = 1000


def _root() -> Path:
    """Use the caller's repository as the only project authority."""
    return Path.cwd().resolve()


def _selection_arguments(parser: argparse.ArgumentParser) -> None:
    """Add the shared pack, lifecycle, and subject selection arguments."""
    parser.add_argument("--stage")
    parser.add_argument("--mode", choices=["impacted", "all"], default="impacted")
    parser.add_argument("--staged", action="store_true")
    parser.add_argument("--changed-path", action="append", default=[])
    parser.add_argument("--base-ref")
    parser.add_argument("--pack", action="append", default=[])


def _parser() -> argparse.ArgumentParser:
    """Build the lean public CLI without legacy aliases."""
    parser = argparse.ArgumentParser(prog="project-governance")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check")
    _selection_arguments(check)
    check.add_argument("--timeout-seconds", type=float)
    check.add_argument("--json-output", type=Path)
    check.add_argument("--summary", action="store_true")
    check.add_argument("--commit-message-file", type=Path)
    check.add_argument("--pr-body-file", type=Path)
    check.add_argument("--pr-title")
    plan = commands.add_parser("plan")
    _selection_arguments(plan)
    plan.add_argument("--json", action="store_true")
    plan.add_argument("--summary", action="store_true")
    context = commands.add_parser("context")
    context.add_argument("--task", required=True)
    context.add_argument("--changed-path", action="append", default=[])
    context.add_argument("--include-expansion", action="store_true")
    context.add_argument("--json", action="store_true")
    context.add_argument("--json-output", type=Path)
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

    timeout_seconds = getattr(args, "timeout_seconds", None)
    if timeout_seconds is not None and (
        not math.isfinite(timeout_seconds) or timeout_seconds <= 0
    ):
        raise ConfigurationError("--timeout-seconds must be a finite positive number")
    _validate_staged_scope(args, base_ref)
    if mode == "all":
        if args.staged or args.changed_path:
            raise ConfigurationError(
                "--mode all cannot be combined with staged or changed-path scope"
            )
        if base_ref:
            raise ConfigurationError("--mode all cannot be combined with --base-ref")
        if not args.stage:
            raise ConfigurationError("--mode all requires --stage")
    pr_body_file = getattr(args, "pr_body_file", None)
    pr_title = getattr(args, "pr_title", None)
    if bool(pr_body_file) != bool(pr_title):
        raise ConfigurationError("--pr-body-file and --pr-title must be supplied together")
    if not args.stage and not explicit and mode != "all":
        raise ConfigurationError("impacted mode requires --stage")


def _validate_staged_scope(args: argparse.Namespace, base_ref: str | None) -> None:
    """Keep staged selection bound to the pre-commit index subject."""
    if args.staged and args.changed_path:
        raise ConfigurationError("--staged cannot be combined with --changed-path")
    if args.staged and base_ref:
        raise ConfigurationError("--staged cannot be combined with --base-ref")
    if args.staged and args.stage != "pre-commit":
        raise ConfigurationError("--staged requires --stage pre-commit")


def _empty_change_scope(args: argparse.Namespace, mode: str) -> dict[str, Any]:
    """Retain a stable packet envelope when comparison resolution blocks planning."""
    if args.staged or args.stage == "pre-commit":
        packet_mode = "staged"
    elif args.changed_path:
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
            packet_mode="explicit" if args.changed_path else None,
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
    mode = args.mode
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
    source_checkout = (root / "src/project_governance_runtime/cli.py").is_file()
    if not source_checkout:
        lock_path = root / "config/governance/runtime.lock.yaml"
        if not lock_path.exists():
            findings.append("config/governance/runtime.lock.yaml is missing")
        else:
            try:
                load_lock(lock_path)
            except (InstallationError, OSError, json.JSONDecodeError) as error:
                findings.append(str(error))
    required = ["config/governance/profile.yaml"]
    if not source_checkout:
        required.append("config/governance/facts.lock.yaml")
    for relative in required:
        if not (root / relative).exists():
            findings.append(f"{relative} is missing")
    try:
        packs = load_packs(root)
    except (ConfigurationError, OSError) as error:
        findings.append(str(error))
    else:
        for pack_id, pack in sorted(packs.items()):
            gaps = pack_stage_command_gaps(pack)
            if gaps:
                findings.append(
                    f"pack {pack_id} has no command for declared stage(s): "
                    + ", ".join(gaps)
                )
    return {
        "status": "failed" if findings else "passed",
        "mode": "source" if source_checkout else "installed",
        "findings": findings,
    }


def _emit(
    value: dict[str, Any],
    path: Path | None = None,
    *,
    stdout_value: dict[str, Any] | None = None,
) -> None:
    """Render one deterministic JSON result and optional evidence file."""
    rendered = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    if stdout_value is None:
        sys.stdout.write(rendered)
    else:
        sys.stdout.write(json.dumps(stdout_value, indent=2, sort_keys=True) + "\n")


def _bounded_summary_finding(finding: dict[str, Any]) -> dict[str, Any]:
    """Keep one actionable finding without carrying unbounded process output."""
    result = {
        key: finding[key]
        for key in ("rule_id", "severity", "path", "line", "column", "pack_id")
        if key in finding
    }
    message = finding.get("message")
    if isinstance(message, str):
        result["message"] = message[:MAX_SUMMARY_MESSAGE_LENGTH]
        if len(message) > MAX_SUMMARY_MESSAGE_LENGTH:
            result["message_truncated"] = True
    return result


def _summary_blocker(blocker: dict[str, Any]) -> dict[str, Any]:
    """Retain blocker identity and a bounded message without path inventories."""
    result = {
        key: blocker[key]
        for key in ("code", "pack_id", "stage", "mode")
        if key in blocker
    }
    message = blocker.get("message")
    if isinstance(message, str):
        result["message"] = message[:MAX_SUMMARY_MESSAGE_LENGTH]
        if len(message) > MAX_SUMMARY_MESSAGE_LENGTH:
            result["message_truncated"] = True
    paths = blocker.get("paths")
    if isinstance(paths, list):
        result["path_count"] = len(paths)
    return result


def _plan_summary(plan: dict[str, Any]) -> dict[str, Any]:
    """Project one plan without changed paths, match maps, or selection prose."""
    summary: dict[str, Any] = {
        "status": plan.get("status"),
        "stage": plan.get("stage"),
        "mode": plan.get("mode"),
        "changed_path_count": len(plan.get("changed_paths", [])),
        "selected_packs": plan.get("selected_packs", []),
    }
    execution_order = plan.get("execution_order", [])
    if execution_order != summary["selected_packs"]:
        summary["execution_order"] = execution_order
    blockers = [
        _summary_blocker(item)
        for item in plan.get("blockers", [])
        if isinstance(item, dict)
    ]
    if blockers:
        summary["blockers"] = blockers
    return summary


def _nonpassing_pack_summary(item: dict[str, Any]) -> dict[str, Any] | None:
    """Return bounded pack detail only when a compact receipt needs attention."""
    active_counts = {
        key: value
        for key, value in item.get("finding_counts", {}).items()
        if key in {"blocking", "advisory"} and value
    }
    failure_counts = {
        key: item.get(key)
        for key in (
            "process_failure_count",
            "integrity_failure_count",
            "invalid_evidence_manifest_count",
        )
        if item.get(key)
    }
    if (
        item.get("status") in {"passed", "not-applicable"}
        and not active_counts
        and not failure_counts
    ):
        return None
    summary = {
        "pack_id": item.get("pack_id"),
        "status": item.get("status"),
        "duration_ms": item.get("duration_ms"),
        **failure_counts,
    }
    if active_counts:
        summary["finding_counts"] = active_counts
    return summary


def _active_summary_findings(item: dict[str, Any]) -> list[dict[str, Any]]:
    """Collect bounded active findings from one pack and its commands."""
    findings = list(item.get("findings", []))
    for command in item.get("commands", []):
        if isinstance(command, dict):
            findings.extend(command.get("findings", []))
    return [
        _bounded_summary_finding({**finding, "pack_id": item.get("pack_id")})
        for finding in findings
        if isinstance(finding, dict)
        and finding.get("severity") in {"blocking", "advisory"}
    ]


def _result_summary(output: dict[str, Any]) -> dict[str, Any]:
    """Project a validation result without command lines, output, or source inventories."""
    if "evidence" not in output:
        return _plan_summary(output)
    summary: dict[str, Any] = {
        key: output.get(key)
        for key in (
            "run_id",
            "status",
            "termination_reason",
            "duration_ms",
            "subject_digest",
        )
    }
    summary["plan"] = _plan_summary(output.get("plan", {}))
    nonpassing_packs: list[dict[str, Any]] = []
    active_findings: list[dict[str, Any]] = []
    for item in output.get("evidence", []):
        if not isinstance(item, dict):
            continue
        pack_summary = _nonpassing_pack_summary(item)
        if pack_summary is not None:
            nonpassing_packs.append(pack_summary)
        active_findings.extend(_active_summary_findings(item))
    if nonpassing_packs:
        summary["nonpassing_packs"] = nonpassing_packs
    if active_findings:
        summary["findings"] = active_findings
    return summary


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
                "pr_title": str(args.pr_title or ""),
            },
        )
    summary = _result_summary(output) if args.summary else None
    _emit(output, getattr(args, "json_output", None), stdout_value=summary)
    return _result_exit_code(output)


def _run_context(args: argparse.Namespace, root: Path) -> int:
    """Resolve and render one bounded context selection."""
    output = resolve_context(
        root,
        args.task,
        args.changed_path,
        include_expansion=args.include_expansion,
    )
    if args.json or args.json_output:
        _emit(output, args.json_output)
    else:
        print(
            f"route={output['route']['id']} "
            f"outcome={output['route']['outcome']} "
            f"status={output['status']}"
        )
        print(f"materialization={output['materialization']['root']}")
    return _result_exit_code(output)


def _run_documentation_command(args: argparse.Namespace, root: Path) -> int:
    """Install or resolve the optional minimal documentation module."""
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
        if args.command == "docs":
            return _run_documentation_command(args, root)
        return _run_administration(args, root)
    except (
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
