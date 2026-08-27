"""Record the minimum bounded data needed to spot validation inefficiency."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .state_io import atomic_write_text, path_lock


MAX_RECORDS = 1000
MAX_TELEMETRY_BYTES = 1024 * 1024
MAX_PACK_SUMMARIES = 10
MAX_ID_LENGTH = 256
SCHEMA_VERSION = 2
_SHA256_DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
_EVENTS = {"run-started", "run-terminal"}


def _now() -> str:
    """Return one stable UTC timestamp for a lifecycle event."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def scope_fingerprint(
    stage: str | None, mode: str, paths: list[str], packs: list[str]
) -> str:
    """Identify equivalent scopes without retaining repository paths."""
    body = json.dumps(
        {"stage": stage, "mode": mode, "paths": sorted(paths), "packs": sorted(packs)},
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()


def _text(value: Any) -> str | None:
    return value[:MAX_ID_LENGTH] if isinstance(value, str) else None


def _digest(value: Any) -> str | None:
    return value if isinstance(value, str) and _SHA256_DIGEST.fullmatch(value) else None


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return None
    if isinstance(value, float) and (value != value or value in {float("inf"), float("-inf")}):
        return None
    return value


def _integer(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _pack_summaries(value: Any) -> list[dict[str, Any]]:
    """Retain only the slowest few pack identities and durations."""
    if not isinstance(value, list):
        return []
    summaries: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        pack_id = _text(item.get("id"))
        duration = _number(item.get("duration_ms"))
        if pack_id is not None and duration is not None:
            summaries.append({"id": pack_id, "duration_ms": duration})
    return sorted(
        summaries, key=lambda item: (-item["duration_ms"], item["id"])
    )[:MAX_PACK_SUMMARIES]


def _sanitize(event: Any) -> dict[str, Any] | None:
    """Project one event onto the content-free efficiency schema."""
    if not isinstance(event, dict) or event.get("event") not in _EVENTS:
        return None
    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "event": event["event"],
    }
    for key in ("run_id", "runtime_version", "stage", "mode", "status", "termination_reason"):
        value = _text(event.get(key))
        if value is not None:
            result[key] = value
    for key in ("scope_fingerprint", "subject_digest"):
        value = _digest(event.get(key))
        if value is not None:
            result[key] = value
    for key in ("changed_path_count", "selected_pack_count"):
        value = _integer(event.get(key))
        if value is not None:
            result[key] = value
    for key in ("duration_ms", "pack_duration_ms"):
        value = _number(event.get(key))
        if value is not None:
            result[key] = value
    if event["event"] == "run-terminal":
        summaries = _pack_summaries(event.get("packs"))
        if summaries:
            result["packs"] = summaries
    return result


def _existing_records(path: Path) -> list[str]:
    """Re-sanitize only the bounded tail so removed fields disappear on the next write."""
    try:
        if not path.exists():
            return []
        with path.open("rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            start = max(0, size - MAX_TELEMETRY_BYTES)
            handle.seek(start)
            payload = handle.read(MAX_TELEMETRY_BYTES)
    except (OSError, UnicodeError):
        return []
    if start:
        _, separator, payload = payload.partition(b"\n")
        if not separator:
            return []
    try:
        lines = payload.decode("utf-8").splitlines()
    except UnicodeError:
        return []
    records: list[str] = []
    for line in lines[-MAX_RECORDS:]:
        try:
            previous = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        sanitized = _sanitize(previous)
        if sanitized is None:
            continue
        recorded_at = _text(previous.get("recorded_at")) if isinstance(previous, dict) else None
        if recorded_at is not None:
            sanitized["recorded_at"] = recorded_at
        records.append(json.dumps(sanitized, sort_keys=True, separators=(",", ":")))
    return records


def _bounded_records(records: list[str]) -> list[str]:
    """Keep the newest complete records within both count and byte ceilings."""
    retained: list[str] = []
    retained_bytes = 0
    for line in reversed(records[-MAX_RECORDS:]):
        line_bytes = len(line.encode("utf-8")) + 1
        if line_bytes > MAX_TELEMETRY_BYTES:
            continue
        if retained_bytes + line_bytes > MAX_TELEMETRY_BYTES:
            break
        retained.append(line)
        retained_bytes += line_bytes
    return list(reversed(retained))


def _atomic_write(path: Path, text: str) -> None:
    """Preserve the telemetry helper seam while using shared atomic writes."""
    atomic_write_text(path, text)


def append(root: Path, event: dict[str, Any]) -> bool:
    """Append one advisory event without allowing telemetry to affect validation."""
    try:
        sanitized = _sanitize(event)
        if sanitized is None:
            return False
        path = root / ".governance/telemetry/runs.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path_lock(path):
            existing = _existing_records(path)
            rendered = json.dumps(
                {"recorded_at": _now(), **sanitized},
                sort_keys=True,
                separators=(",", ":"),
            )
            records = _bounded_records([*existing, rendered])
            if not records or records[-1] != rendered:
                return False
            _atomic_write(path, "\n".join(records) + "\n")
        return True
    except (OSError, TimeoutError, TypeError, ValueError):
        return False


def _retained_records(path: Path) -> list[dict[str, Any]]:
    """Read the currently retained advisory records fail-open."""
    records: list[dict[str, Any]] = []
    for line in _existing_records(path):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def _validation_status(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize only repetition, duration, incomplete runs, and slow packs."""
    terminal = [record for record in records if record.get("event") == "run-terminal"]
    outcome_counts: dict[str, int] = {}
    mode_counts: dict[str, int] = {}
    scope_counts: dict[str, int] = {}
    subject_stages: dict[str, list[str]] = {}
    pack_totals: dict[str, dict[str, int | float]] = {}
    total_duration: int | float = 0
    total_pack_duration: int | float = 0
    for record in terminal:
        outcome = str(record.get("status", "unknown"))
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        mode = str(record.get("mode", "unknown"))
        mode_counts[mode] = mode_counts.get(mode, 0) + 1
        fingerprint = record.get("scope_fingerprint")
        if isinstance(fingerprint, str):
            scope_counts[fingerprint] = scope_counts.get(fingerprint, 0) + 1
        subject = record.get("subject_digest")
        if isinstance(subject, str) and mode != "explicit":
            subject_stages.setdefault(subject, []).append(str(record.get("stage", "unknown")))
        duration = _number(record.get("duration_ms"))
        if duration is not None:
            total_duration += duration
        pack_duration = _number(record.get("pack_duration_ms"))
        if pack_duration is None:
            pack_duration = sum(
                _number(item.get("duration_ms")) or 0
                for item in record.get("packs", [])
                if isinstance(item, dict)
            )
        total_pack_duration += pack_duration
        for pack in record.get("packs", []):
            if not isinstance(pack, dict) or not isinstance(pack.get("id"), str):
                continue
            summary = pack_totals.setdefault(
                pack["id"], {"observed_run_count": 0, "total_duration_ms": 0, "max_duration_ms": 0}
            )
            summary["observed_run_count"] += 1
            value = _number(pack.get("duration_ms")) or 0
            summary["total_duration_ms"] += value
            summary["max_duration_ms"] = max(summary["max_duration_ms"], value)
    repeated_scopes = [count for count in scope_counts.values() if count > 1]
    repeated_subjects = [stages for stages in subject_stages.values() if len(stages) > 1]
    terminal_ids = {
        record.get("run_id") for record in terminal if isinstance(record.get("run_id"), str)
    }
    nonterminal_ids = {
        record.get("run_id")
        for record in records
        if record.get("event") == "run-started"
        and isinstance(record.get("run_id"), str)
        and record.get("run_id") not in terminal_ids
    }
    slowest = [
        {"id": pack_id, **summary}
        for pack_id, summary in sorted(
            pack_totals.items(), key=lambda item: (-item[1]["total_duration_ms"], item[0])
        )[:5]
    ]
    return {
        "retained_run_count": len(terminal),
        "outcome_counts": dict(sorted(outcome_counts.items())),
        "total_duration_ms": round(total_duration, 3),
        "runner_overhead_ms": round(max(0, total_duration - total_pack_duration), 3),
        "mode_counts": dict(sorted(mode_counts.items())),
        "broad_run_count": mode_counts.get("all", 0),
        "repeated_scope_run_count": sum(count - 1 for count in repeated_scopes),
        "same_subject_repeat_run_count": sum(len(stages) - 1 for stages in repeated_subjects),
        "cross_stage_same_subject_run_count": sum(
            len(stages) - 1 for stages in repeated_subjects if len(set(stages)) > 1
        ),
        "nonterminal_run_count": len(nonterminal_ids),
        "slowest_packs": slowest,
    }


def status(root: Path) -> dict[str, Any]:
    """Return the one compact, local efficiency view."""
    path = root / ".governance/telemetry/runs.jsonl"
    records = _retained_records(path)
    try:
        retained_bytes = path.stat().st_size
    except OSError:
        retained_bytes = 0
    return {
        "status": "available" if records else "empty",
        "record_count": len(records),
        "retained_bytes": retained_bytes,
        "path": path.relative_to(root).as_posix(),
        "validation": _validation_status(records),
    }
