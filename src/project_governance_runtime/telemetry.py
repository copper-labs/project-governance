"""Record bounded advisory governance run telemetry as local JSONL."""

from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .state_io import atomic_write_text, path_lock


MAX_RECORDS = 1000
SCHEMA_VERSION = 1
MAX_PACKS_PER_RECORD = 1000
MAX_ID_LENGTH = 256

_COMMON_FIELDS = {
    "event",
    "run_id",
    "runtime_version",
    "stage",
    "mode",
    "scope_fingerprint",
}
_EVENT_FIELDS = {
    "run-started": {
        "changed_path_count",
        "selected_pack_count",
        "selected_packs",
    },
    "run-terminal": {
        "changed_path_count",
        "selected_pack_count",
        "status",
        "termination_reason",
        "duration_ms",
        "packs",
    },
    "orchestration-terminal": {
        "terminal_outcome",
        "duration_ms",
        "entries",
    },
}
_PACK_FIELDS = {
    "id",
    "command_count",
    "status",
    "finding_count",
    "duration_ms",
    "blocking_finding_count",
    "advisory_finding_count",
    "accepted_finding_count",
    "waived_finding_count",
    "suppressed_finding_count",
    "process_failure_count",
    "integrity_failure_count",
    "evidence_manifest_count",
    "valid_evidence_manifest_count",
    "invalid_evidence_manifest_count",
    "evidence_claim_count",
    "evidence_artifact_digest_count",
}
_PACK_TEXT_FIELDS = {"id", "status"}
_PACK_NUMBER_FIELDS = {"duration_ms"}
_ORCHESTRATION_TEXT_FIELDS = {"role", "profile_id", "model"}
_ORCHESTRATION_NUMBER_FIELDS = {"duration_ms"}
_ORCHESTRATION_INTEGER_FIELDS = {"input_tokens", "output_tokens"}
_ORCHESTRATION_BOOLEAN_FIELDS = {"fallback", "repair"}
_ORCHESTRATION_OUTCOMES = {
    "completed",
    "failed",
    "cancelled",
    "timed-out",
    "budget-exhausted",
    "needs-primary-decision",
}
_PROOF_RESULTS = {"passed", "failed", "not-run", "unavailable"}


def _now() -> str:
    """Return one stable UTC timestamp for a lifecycle event."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def scope_fingerprint(stage: str | None, mode: str, paths: list[str], packs: list[str]) -> str:
    """Identify equivalent scopes without hashing results or repository contents."""
    body = json.dumps(
        {"stage": stage, "mode": mode, "paths": sorted(paths), "packs": sorted(packs)},
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()


def _bounded_text(value: Any) -> str | None:
    """Return one bounded identifier without serializing arbitrary objects."""
    if not isinstance(value, str):
        return None
    return value[:MAX_ID_LENGTH]


def _non_negative_number(value: Any) -> int | float | None:
    """Accept only finite, non-negative telemetry measurements."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return None
    if isinstance(value, float) and (value != value or value in {float("inf"), float("-inf")}):
        return None
    return value


def _non_negative_integer(value: Any) -> int | None:
    """Accept only integer telemetry counts."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _sanitize_pack(value: Any) -> dict[str, Any] | None:
    """Keep the bounded per-pack performance fields and discard command evidence."""
    if not isinstance(value, dict):
        return None
    result: dict[str, Any] = {}
    for key in _PACK_FIELDS:
        item = value.get(key)
        if key in _PACK_TEXT_FIELDS:
            item = _bounded_text(item)
        elif key in _PACK_NUMBER_FIELDS:
            item = _non_negative_number(item)
        else:
            item = _non_negative_integer(item)
        if item is not None:
            result[key] = item
    return result if "id" in result else None


def _sanitize_orchestration_entry(value: Any) -> dict[str, Any] | None:
    """Retain only bounded model-mix and terminal evaluation fields."""
    if not isinstance(value, dict):
        return None
    result: dict[str, Any] = {}
    for key in _ORCHESTRATION_TEXT_FIELDS:
        item = _bounded_text(value.get(key))
        if item is not None:
            result[key] = item
    for key in _ORCHESTRATION_NUMBER_FIELDS:
        item = _non_negative_number(value.get(key))
        if item is not None:
            result[key] = item
    for key in _ORCHESTRATION_INTEGER_FIELDS:
        item = _non_negative_integer(value.get(key))
        if item is not None:
            result[key] = item
    for key in _ORCHESTRATION_BOOLEAN_FIELDS:
        item = value.get(key)
        if isinstance(item, bool):
            result[key] = item
    if value.get("outcome") in _ORCHESTRATION_OUTCOMES:
        result["outcome"] = value["outcome"]
    if value.get("proof_result") in _PROOF_RESULTS:
        result["proof_result"] = value["proof_result"]
    return result if {"role", "profile_id", "model", "outcome"}.issubset(result) else None


def _sanitize(event: Any) -> dict[str, Any] | None:
    """Project an event onto the privacy-safe advisory telemetry schema."""
    if not isinstance(event, dict) or event.get("event") not in _EVENT_FIELDS:
        return None
    event_name = event["event"]
    allowed = _COMMON_FIELDS | _EVENT_FIELDS[event_name]
    result: dict[str, Any] = {"schema_version": SCHEMA_VERSION, "event": event_name}
    for key in allowed - {"event", "selected_packs", "packs", "entries"}:
        value = event.get(key)
        if key in {"changed_path_count", "selected_pack_count"}:
            value = _non_negative_integer(value)
        elif key == "duration_ms":
            value = _non_negative_number(value)
        elif key == "terminal_outcome":
            value = value if value in _ORCHESTRATION_OUTCOMES else None
        else:
            value = _bounded_text(value)
        if value is not None:
            result[key] = value
    selected_packs = event.get("selected_packs")
    if isinstance(selected_packs, list):
        pack_ids = [item for item in (_bounded_text(item) for item in selected_packs) if item]
        result["selected_pack_count"] = len(pack_ids)
        result["selected_packs"] = pack_ids[:MAX_PACKS_PER_RECORD]
    packs = event.get("packs")
    if isinstance(packs, list):
        summaries = [item for item in (_sanitize_pack(item) for item in packs) if item]
        result["packs"] = summaries[:MAX_PACKS_PER_RECORD]
    entries = event.get("entries")
    if isinstance(entries, list):
        summaries = [
            item for item in (_sanitize_orchestration_entry(item) for item in entries) if item
        ]
        result["entries"] = summaries[:3]
    if event_name == "orchestration-terminal" and (
        result.get("terminal_outcome") not in _ORCHESTRATION_OUTCOMES
        or not result.get("entries")
    ):
        return None
    return result


@contextmanager
def _telemetry_lock(path: Path) -> Iterator[None]:
    """Preserve the telemetry test seam while using shared state I/O."""
    with path_lock(path):
        yield


def _existing_records(path: Path) -> list[str]:
    """Read and re-sanitize the valid retained records under the writer lock."""
    existing: list[str] = []
    if not path.exists():
        return existing
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            previous = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        previous_sanitized = _sanitize(previous)
        if previous_sanitized is None:
            continue
        recorded_at = _bounded_text(previous.get("recorded_at"))
        if recorded_at is not None:
            previous_sanitized["recorded_at"] = recorded_at
        existing.append(json.dumps(previous_sanitized, sort_keys=True))
    return existing


def _atomic_write(path: Path, text: str) -> None:
    """Preserve the telemetry helper seam while using shared atomic writes."""
    atomic_write_text(path, text)


def append(root: Path, event: dict[str, Any]) -> bool:
    """Append one bounded advisory event; telemetry failures never affect checks."""
    try:
        sanitized = _sanitize(event)
        if sanitized is None:
            return False
        path = root / ".governance/telemetry/runs.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with _telemetry_lock(path):
            existing = _existing_records(path)
            rendered = json.dumps({"recorded_at": _now(), **sanitized}, sort_keys=True)
            records = [*existing[-(MAX_RECORDS - 1):], rendered]
            _atomic_write(path, "\n".join(records) + "\n")
        return True
    except (OSError, TypeError, ValueError):
        return False


def _retained_records(path: Path) -> list[dict[str, Any]]:
    """Read and sanitize the currently retained advisory records fail-open."""
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    except (OSError, UnicodeError):
        lines = []
    for line in lines:
        try:
            value = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        sanitized = _sanitize(value)
        if sanitized is None:
            continue
        recorded_at = _bounded_text(value.get("recorded_at"))
        if recorded_at is not None:
            sanitized["recorded_at"] = recorded_at
        records.append(sanitized)
    return records


def _run_outcomes(records: list[dict[str, Any]]) -> tuple[int, dict[str, int]]:
    """Count retained validation terminal outcomes."""
    terminal = [record for record in records if record.get("event") == "run-terminal"]
    counts: dict[str, int] = {}
    for record in terminal:
        outcome = str(record.get("status", "unknown"))
        counts[outcome] = counts.get(outcome, 0) + 1
    return len(terminal), counts


def _model_summaries(
    entries: list[dict[str, Any]],
) -> tuple[dict[str, int], dict[str, dict[str, int]]]:
    """Aggregate retained entry outcomes and optional reported tokens by model."""
    outcomes: dict[str, int] = {}
    models: dict[str, dict[str, int]] = {}
    for entry in entries:
        outcome = str(entry.get("outcome", "unknown"))
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
        model = str(entry.get("model", "unknown"))
        summary = models.setdefault(
            model,
            {"count": 0, "input_tokens": 0, "output_tokens": 0,
             "input_reports": 0, "output_reports": 0},
        )
        summary["count"] += 1
        for field in ("input_tokens", "output_tokens"):
            if isinstance(entry.get(field), int):
                summary[field] += entry[field]
                summary[field.replace("tokens", "reports")] += 1
    return outcomes, models


def _model_mix(models: dict[str, dict[str, int]], total: int) -> list[dict[str, Any]]:
    """Render deterministic per-model percentages and only reported token totals."""
    result: list[dict[str, Any]] = []
    for model, summary in sorted(models.items()):
        item: dict[str, Any] = {
            "model": model,
            "count": summary["count"],
            "percentage": round(summary["count"] * 100 / total, 2) if total else 0,
        }
        if summary["input_reports"]:
            item["reported_input_tokens"] = summary["input_tokens"]
        if summary["output_reports"]:
            item["reported_output_tokens"] = summary["output_tokens"]
        result.append(item)
    return result


def _orchestration_status(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize the bounded retained model mix without cost or coverage claims."""
    orchestration = [
        record for record in records if record.get("event") == "orchestration-terminal"
    ]
    orchestration_entries = [
        entry
        for record in orchestration
        for entry in record.get("entries", [])
        if isinstance(entry, dict)
    ]
    orchestration_outcomes, models = _model_summaries(orchestration_entries)
    total_entries = len(orchestration_entries)
    receipt_times = [
        str(record["recorded_at"])
        for record in orchestration
        if isinstance(record.get("recorded_at"), str)
    ]
    orchestration_summary: dict[str, Any] = {
        "retained_wave_count": len(orchestration),
        "delegated_entry_count": total_entries,
        "terminal_outcomes": orchestration_outcomes,
        "model_mix": _model_mix(models, total_entries),
        "oldest_receipt_at": min(receipt_times) if receipt_times else None,
        "newest_receipt_at": max(receipt_times) if receipt_times else None,
        "excludes": ["control-state-only timeouts", "evicted receipts"],
        "interpretation": "best-effort retained delegated model mix, not project usage or invoice accounting",
    }
    if any(item["input_reports"] for item in models.values()):
        orchestration_summary["reported_input_tokens"] = sum(
            item["input_tokens"] for item in models.values()
        )
    if any(item["output_reports"] for item in models.values()):
        orchestration_summary["reported_output_tokens"] = sum(
            item["output_tokens"] for item in models.values()
        )
    return orchestration_summary


def status(root: Path) -> dict[str, Any]:
    """Summarize local run outcomes without validating or approving repository state."""
    path = root / ".governance/telemetry/runs.jsonl"
    records = _retained_records(path)
    terminal_run_count, counts = _run_outcomes(records)
    return {
        "status": "available" if records else "empty",
        "record_count": len(records),
        "terminal_run_count": terminal_run_count,
        "outcomes": counts,
        "orchestration": _orchestration_status(records),
        "path": path.relative_to(root).as_posix(),
    }
