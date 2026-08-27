"""Resolve validation-pack commands and normalize their process evidence."""

from __future__ import annotations

import json
import shlex
import sys
from typing import Any

from .checker_scripts.finding_lifecycle import FINDING_STATES, finding_summary
from .processes import CommandResult


ENVELOPE_STATUSES = {"passed", "warning", "failed", "not-applicable"}


def command_applies_to_stage(entry: Any, stage: str) -> bool:
    """Return whether one command's optional stage filter admits the stage."""
    if not isinstance(entry, dict):
        return True
    stages = [str(value) for value in entry.get("stages", [])]
    return not stages or stage in stages


def pack_stage_command_gaps(pack: dict[str, Any]) -> list[str]:
    """Return declared stages that have no applicable command in one active pack."""
    if str(pack.get("implementation_status", "active")) != "active":
        return []
    commands = list(pack.get("commands", []))
    return [
        stage
        for stage in sorted(set(str(value) for value in pack.get("stages", [])))
        if not any(command_applies_to_stage(entry, stage) for entry in commands)
    ]


def command_argv(
    entry: Any,
    *,
    stage: str | None,
    mode: str,
    command_arguments: dict[str, str],
) -> list[str] | None:
    """Resolve one manifest command without invoking a shell."""
    values = {"stage": stage or "explicit", **command_arguments}
    if isinstance(entry, list) and all(isinstance(value, str) for value in entry):
        return formatted_argv(entry, values)
    if isinstance(entry, str):
        return formatted_argv(shlex.split(entry), values)
    if not isinstance(entry, dict):
        raise ValueError("pack command must be a string or mapping")
    if stage and not command_applies_to_stage(entry, stage):
        return None
    if "builtin" in entry:
        return builtin_argv(entry, stage=stage, mode=mode, command_arguments=command_arguments)
    command = entry.get("run", "")
    if isinstance(command, list) and all(isinstance(value, str) for value in command):
        return formatted_argv(command, values)
    return formatted_argv(shlex.split(str(command)), values)


def formatted_argv(tokens: list[str], values: dict[str, str]) -> list[str] | None:
    """Substitute only allowlisted whole-token values without passing through a shell."""
    placeholders = {
        "{stage}": values.get("stage", "explicit"),
        "{commit_message_file}": values.get("commit_message_file", ""),
        "{pr_body_file}": values.get("pr_body_file", ""),
        "{pr_title}": values.get("pr_title", ""),
    }
    result: list[str] = []
    for token in tokens:
        if token in placeholders:
            replacement = placeholders[token]
            if not replacement:
                return None
            result.append(replacement)
            continue
        if token.startswith("{") and token.endswith("}"):
            raise ValueError(f"unsupported command placeholder token: {token}")
        result.append(token)
    return result


def builtin_argv(
    entry: dict[str, Any],
    *,
    stage: str | None,
    mode: str,
    command_arguments: dict[str, str],
) -> list[str]:
    """Build a checker invocation; omitted overrides leave fail-closed defaults to the checker."""
    checker = str(entry["builtin"])
    argv = [sys.executable, "-m", "project_governance_runtime.checkers", checker]
    argv.extend(checker_selection_arguments(checker, stage, mode))
    for argument in entry.get("arguments", []):
        value = command_arguments.get(str(argument), "")
        if value:
            argv.append(value)
    return argv


def checker_selection_arguments(checker: str, stage: str | None, mode: str) -> list[str]:
    """Add path-selection flags only to checkers that implement path scope."""
    scoped = {
        "format",
        "naming",
        "maintainability",
        "comments",
        "documentation",
        "secrets",
        "dependencies",
        "test-quality",
        "apple-dependencies",
        "prose",
    }
    if checker not in scoped:
        return []
    if checker == "secrets" and stage in {"pre-push", "pre-pr", "ci-pr", "release"}:
        return ["--all"]
    return [selection_flag(stage, mode)]


def selection_flag(stage: str | None, mode: str) -> str:
    """Translate governance selection to the checker command-line convention."""
    if mode == "all":
        return "--all"
    if stage == "pre-commit":
        return "--staged"
    return "--changed"


def normalized_command(result: CommandResult, argv: list[str]) -> tuple[dict[str, Any], str]:
    """Project one process result into runtime evidence and normalized status."""
    structured = structured_output(result.stdout)
    declared_status = str(structured.get("status")) if structured else "failed"
    declared_status_valid = declared_status in ENVELOPE_STATUSES
    process_failed = result.exit_code != 0 or result.termination_reason != "completed"
    invalid_finding_state = bool(structured) and any(
        isinstance(item, dict) and item.get("severity") not in FINDING_STATES
        for item in structured.get("findings", [])
    )
    integrity_failure = not process_failed and (
        structured is None or not declared_status_valid or invalid_finding_state
    )
    findings = normalized_findings(
        structured,
        "failed" if process_failed or declared_status == "failed" else declared_status,
    )
    if structured is None:
        findings.append({
            "rule_id": "checker.output-invalid",
            "severity": "blocking",
            "message": (
                "checker must emit one JSON object with a string status and findings array"
            ),
        })
    if not declared_status_valid:
        findings.append({
            "rule_id": "checker.status-invalid",
            "severity": "blocking",
            "message": f"checker declared unknown envelope status {declared_status!r}",
        })
    summary = finding_summary(findings)
    if process_failed or declared_status == "failed" or not declared_status_valid:
        status = "failed"
    elif summary["status"] == "failed":
        status = "failed"
    elif summary["status"] == "warning":
        status = "warning"
    elif declared_status == "not-applicable":
        status = "not-applicable"
    else:
        # A warning without an active advisory finding is stale envelope state.
        status = "passed"
    if status == "failed" and summary["finding_counts"]["blocking"] == 0:
        if not process_failed:
            integrity_failure = True
        message = result.stderr.strip() or result.stdout.strip() or "checker command failed"
        findings.append({
            "rule_id": "checker.command-failed",
            "severity": "blocking",
            "message": message,
        })
        summary = finding_summary(findings)
    return {
        "argv": argv,
        "status": status,
        "exit_code": result.exit_code,
        "termination_reason": result.termination_reason,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "finding_count": summary["finding_count"],
        "finding_counts": summary["finding_counts"],
        "process_failure": process_failed,
        "integrity_failure": integrity_failure,
        "findings": findings,
    }, status


def structured_output(stdout: str) -> dict[str, Any] | None:
    """Accept only the small checker envelope required by normalization."""
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    return value if (
        isinstance(value, dict)
        and isinstance(value.get("status"), str)
        and isinstance(value.get("findings"), list)
    ) else None


def normalized_findings(
    structured: dict[str, Any] | None,
    status: str,
) -> list[dict[str, Any]]:
    """Normalize structured strings and unstructured failures at one runner boundary."""
    severity = "blocking" if status == "failed" else "advisory"
    raw = structured.get("findings", []) if structured else []
    if not isinstance(raw, list):
        raw = [str(raw)]
    findings: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            reported_severity = item.get("severity")
            if reported_severity not in FINDING_STATES:
                findings.append({
                    **item,
                    "rule_id": "checker.finding-severity-invalid",
                    "severity": "blocking",
                    "reported_severity": reported_severity,
                    "message": (
                        "structured finding must declare one of: "
                        + ", ".join(FINDING_STATES)
                    ),
                })
            else:
                findings.append({"rule_id": "checker.finding", **item})
        else:
            findings.append({
                "rule_id": "checker.finding",
                "severity": severity,
                "message": str(item),
            })
    return findings
