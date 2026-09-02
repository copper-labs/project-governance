"""Expose the stable public entry point for prepared validation-plan execution."""

from __future__ import annotations

from pathlib import Path
from time import monotonic
from typing import Any
from uuid import uuid4

from .changed_paths import scope_subject_digest
from .execution_flow import execution_environment, execute_packs
from .planning import public_plan
from .telemetry import append, scope_fingerprint


def execute(
    root: Path,
    packs: dict[str, dict[str, Any]],
    plan: dict[str, Any],
    *,
    timeout_seconds: float | None,
    command_arguments: dict[str, str] | None = None,
    telemetry_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute packs and time only materialization plus local orchestration."""
    started = monotonic()
    telemetry_context = telemetry_context or {}
    run_id = str(uuid4())
    changed_path_count = len(plan["changed_paths"])
    selected_pack_count = len(plan["selected_packs"])
    digest = scope_subject_digest(plan.get("change_scope", {}))
    fingerprint = scope_fingerprint(
        plan.get("stage"), plan["mode"], plan["changed_paths"], plan["selected_packs"]
    )
    telemetry_mode, retained_fingerprint = _telemetry_identity(plan, fingerprint)
    retained_digest = (
        digest if telemetry_mode != "explicit" and changed_path_count > 0 else None
    )
    append(root, {
        "event": "run-started",
        "run_id": run_id,
        "runtime_version": _runtime_version(),
        "stage": plan.get("stage"),
        "mode": telemetry_mode,
        "changed_path_count": changed_path_count,
        "selected_pack_count": selected_pack_count,
        "scope_fingerprint": retained_fingerprint,
        "subject_digest": retained_digest,
        **telemetry_context,
    })
    try:
        with execution_environment(root, plan, run_id=run_id) as environment:
            evidence, overall, termination = execute_packs(
                root,
                packs,
                plan,
                timeout_seconds=timeout_seconds,
                environment=environment,
                command_arguments=command_arguments or {},
            )
    except BaseException:
        _record_terminal(
            root,
            plan,
            run_id=run_id,
            fingerprint=retained_fingerprint,
            telemetry_mode=telemetry_mode,
            changed_path_count=changed_path_count,
            selected_pack_count=selected_pack_count,
            status="failed",
            termination="runtime-exception",
            duration_ms=round((monotonic() - started) * 1000, 3),
            evidence=[],
            subject_digest=retained_digest,
            telemetry_context=telemetry_context,
        )
        raise
    output = {
        "run_id": run_id,
        "status": overall,
        "termination_reason": termination,
        "duration_ms": round((monotonic() - started) * 1000, 3),
        "scope_fingerprint": fingerprint,
        "subject_digest": digest,
        "plan": public_plan(plan),
        "evidence": evidence,
    }
    _record_terminal(
        root,
        plan,
        run_id=run_id,
        fingerprint=retained_fingerprint,
        telemetry_mode=telemetry_mode,
        changed_path_count=changed_path_count,
        selected_pack_count=selected_pack_count,
        status=overall,
        termination=termination,
        duration_ms=output["duration_ms"],
        evidence=evidence,
        subject_digest=retained_digest,
        telemetry_context=telemetry_context,
    )
    return output


def _record_terminal(
    root: Path,
    plan: dict[str, Any],
    *,
    run_id: str,
    fingerprint: str | None,
    telemetry_mode: str,
    changed_path_count: int,
    selected_pack_count: int,
    status: str,
    termination: str,
    duration_ms: float,
    evidence: list[dict[str, Any]],
    subject_digest: str | None,
    telemetry_context: dict[str, Any],
) -> None:
    """Attempt one privacy-safe terminal lifecycle receipt."""
    append(root, {
        "event": "run-terminal",
        "run_id": run_id,
        "runtime_version": _runtime_version(),
        "stage": plan.get("stage"),
        "mode": telemetry_mode,
        "status": status,
        "termination_reason": termination,
        "duration_ms": duration_ms,
        "scope_fingerprint": fingerprint,
        "subject_digest": subject_digest,
        **telemetry_context,
        "changed_path_count": changed_path_count,
        "selected_pack_count": selected_pack_count,
        "pack_duration_ms": round(
            sum(item["duration_ms"] for item in evidence), 3
        ),
        "packs": [
            {"id": item["pack_id"], "duration_ms": item["duration_ms"]}
            for item in evidence
        ],
        "failure_counts": _failure_counts(evidence, termination),
        "blocking_finding_count": sum(item["finding_counts"].get("blocking", 0) for item in evidence),
        "failed_pack_ids": [item["pack_id"] for item in evidence if item["status"] == "failed"],
    })


def _failure_counts(evidence: list[dict[str, Any]], termination: str) -> dict[str, int]:
    """Retain bounded observed causes without carrying finding text into telemetry."""
    counts: dict[str, int] = {}
    for item in evidence:
        kinds = [command.get("failure_kind") for command in item.get("commands", [])]
        if item.get("invalid_evidence_manifest_count"):
            kinds.append("integrity")
        if item["status"] == "failed" and not item.get("commands"):
            kinds.append("configuration")
        for kind in kinds:
            if kind:
                counts[kind] = counts.get(kind, 0) + 1
    if termination == "runtime-exception":
        counts["runtime"] = 1
    return counts


def record_selection_failure(
    root: Path, *, stage: str | None, mode: str, telemetry_context: dict[str, Any]
) -> str:
    """Record pre-execution blockers so advisory reliability views include selection failures."""
    run_id = str(uuid4())
    identity = {
        "run_id": run_id, "runtime_version": _runtime_version(),
        "stage": stage, "mode": mode, **telemetry_context,
    }
    append(root, {"event": "run-started", **identity})
    append(root, {
        "event": "run-terminal", **identity, "status": "blocked",
        "termination_reason": "selection-blocked", "duration_ms": 0,
        "pack_duration_ms": 0, "failure_counts": {"selection": 1},
    })
    return run_id


def _telemetry_identity(
    plan: dict[str, Any], fingerprint: str
) -> tuple[str, str | None]:
    """Keep named repair and authoring checks out of broad repetition signals."""
    reasons = plan.get("selection_reasons", {})
    named = plan.get("mode") == "explicit" or any(
        "explicit" in pack_reasons
        for pack_reasons in reasons.values()
        if isinstance(pack_reasons, list)
    )
    return ("explicit", None) if named else (str(plan["mode"]), fingerprint)


def _runtime_version() -> str:
    """Read the installed technical package version without adding release policy."""
    from . import __version__

    return __version__
