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
) -> dict[str, Any]:
    """Execute packs and time only materialization plus local orchestration."""
    started = monotonic()
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
        "selected_packs": plan["selected_packs"],
        "scope_fingerprint": retained_fingerprint,
        "subject_digest": retained_digest,
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
        "changed_path_count": changed_path_count,
        "selected_pack_count": selected_pack_count,
        "packs": [
            {
                "id": item["pack_id"],
                "status": item["status"],
                "duration_ms": item["duration_ms"],
                "finding_count": item["finding_count"],
                "command_count": len(item["commands"]),
                "blocking_finding_count": item["finding_counts"]["blocking"],
                "advisory_finding_count": item["finding_counts"]["advisory"],
                "accepted_finding_count": item["finding_counts"]["accepted"],
                "waived_finding_count": item["finding_counts"]["waived"],
                "suppressed_finding_count": item["finding_counts"]["suppressed"],
                "process_failure_count": item["process_failure_count"],
                "integrity_failure_count": item["integrity_failure_count"],
                "evidence_manifest_count": item["evidence_manifest_count"],
                "valid_evidence_manifest_count": item[
                    "valid_evidence_manifest_count"
                ],
                "invalid_evidence_manifest_count": item[
                    "invalid_evidence_manifest_count"
                ],
                "evidence_claim_count": item["evidence_claim_count"],
                "evidence_artifact_digest_count": item[
                    "evidence_artifact_digest_count"
                ],
            }
            for item in evidence
        ],
    })


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
