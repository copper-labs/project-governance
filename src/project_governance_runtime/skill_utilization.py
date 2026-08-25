"""Bind provider-neutral skill selection to one bounded utilization closeout."""

from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from . import __version__


SAFE_SKILL_ID = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?")
SAFE_DIGEST = re.compile(r"[0-9a-f]{64}")
SAFE_PACKET_ROOT = re.compile(
    r"\.governance/runtime/context/(?P<packet_id>context-[0-9a-f]{16})"
)
SAFE_PACKET_ID = re.compile(r"context-[0-9a-f]{16}")
SAFE_MATERIALIZED_SKILL = re.compile(
    r"skills/[0-9]{3}-(?P<skill_id>[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?)/SKILL\.md"
)
SAFE_USAGE_ID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)

UTILIZATION_STATUSES = {
    "applied",
    "consulted-no-change",
    "declined",
    "unavailable",
    "not-read",
}
INFLUENCE_TYPES = {"decision", "edit", "validation", "restraint"}
TASK_OUTCOMES = {"completed", "partial", "blocked", "failed", "cancelled"}
SELECTION_KINDS = ("route", "task", "path", "fact")
MAX_TELEMETRY_SKILLS = 64


class SkillUtilizationError(ValueError):
    """Report an invalid context-bound skill utilization receipt."""


def sanitize_telemetry_scalar(key: str, value: Any) -> Any:
    """Project one utilization identity or outcome onto its closed enum."""
    if key == "usage_id":
        return value if isinstance(value, str) and SAFE_USAGE_ID.fullmatch(value) else None
    if key == "packet_id":
        return value if isinstance(value, str) and SAFE_PACKET_ID.fullmatch(value) else None
    if key == "task_outcome":
        return value if value in TASK_OUTCOMES else None
    return None


def _telemetry_skill_identity(value: Any) -> dict[str, str] | None:
    """Return one safe skill identity or reject the whole telemetry entry."""
    if not isinstance(value, dict):
        return None
    skill_id = value.get("id")
    digest = value.get("sha256")
    if (
        not isinstance(skill_id, str)
        or SAFE_SKILL_ID.fullmatch(skill_id) is None
        or not isinstance(digest, str)
        or SAFE_DIGEST.fullmatch(digest) is None
    ):
        return None
    return {"id": skill_id, "sha256": digest}


def _sanitize_terminal_entry(
    identity: dict[str, str], value: dict[str, Any]
) -> dict[str, Any] | None:
    """Attach only a coherent fixed utilization status and influence set."""
    status = value.get("status")
    influences = value.get("influences", [])
    if status not in UTILIZATION_STATUSES or not isinstance(influences, list):
        return None
    if any(item not in INFLUENCE_TYPES for item in influences):
        return None
    if (status == "applied") != bool(influences):
        return None
    return {
        **identity,
        "status": status,
        "influences": list(dict.fromkeys(influences)),
    }


def _sanitize_selection_entry(
    identity: dict[str, str], value: dict[str, Any]
) -> dict[str, Any]:
    """Attach only closed selection classes, never their content-bearing values."""
    result: dict[str, Any] = dict(identity)
    selected_by = value.get("selected_by")
    if selected_by in {"route-declaration", "automatic-applicability"}:
        result["selected_by"] = selected_by
    kinds = value.get("selection_kinds", [])
    if isinstance(kinds, list):
        result["selection_kinds"] = list(
            dict.fromkeys(item for item in kinds if item in SELECTION_KINDS)
        )
    return result


def sanitize_telemetry_entry(value: Any, *, terminal: bool) -> dict[str, Any] | None:
    """Retain only package-safe skill identity and bounded utilization enums."""
    identity = _telemetry_skill_identity(value)
    if identity is None or not isinstance(value, dict):
        return None
    if terminal:
        return _sanitize_terminal_entry(identity, value)
    return _sanitize_selection_entry(identity, value)


def telemetry_status(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize retained self-reported selection and utilization without quality claims."""
    selections = [record for record in records if record.get("event") == "skill-selection"]
    terminals = [
        record for record in records if record.get("event") == "skill-utilization-terminal"
    ]
    selection_ids = {
        str(record["usage_id"])
        for record in selections
        if isinstance(record.get("usage_id"), str)
    }
    terminal_ids = {
        str(record["usage_id"])
        for record in terminals
        if isinstance(record.get("usage_id"), str)
    }
    utilization_counts: dict[str, int] = {}
    influence_counts: dict[str, int] = {}
    task_outcome_counts: dict[str, int] = {}
    per_skill: dict[str, dict[str, Any]] = {}
    for record in selections:
        for skill in record.get("skills", []):
            if not isinstance(skill, dict) or not isinstance(skill.get("id"), str):
                continue
            summary = per_skill.setdefault(
                skill["id"], {"selected_count": 0, "reported_count": 0, "status_counts": {}}
            )
            summary["selected_count"] += 1
    for record in terminals:
        task_outcome = str(record.get("task_outcome", "unknown"))
        task_outcome_counts[task_outcome] = task_outcome_counts.get(task_outcome, 0) + 1
        for skill in record.get("skills", []):
            if not isinstance(skill, dict) or not isinstance(skill.get("id"), str):
                continue
            status_value = str(skill.get("status", "unknown"))
            utilization_counts[status_value] = utilization_counts.get(status_value, 0) + 1
            summary = per_skill.setdefault(
                skill["id"], {"selected_count": 0, "reported_count": 0, "status_counts": {}}
            )
            summary["reported_count"] += 1
            summary["status_counts"][status_value] = (
                summary["status_counts"].get(status_value, 0) + 1
            )
            for influence in skill.get("influences", []):
                if isinstance(influence, str):
                    influence_counts[influence] = influence_counts.get(influence, 0) + 1
    receipt_times = [
        str(record["recorded_at"])
        for record in [*selections, *terminals]
        if isinstance(record.get("recorded_at"), str)
    ]
    return {
        "retained_selection_count": len(selections),
        "retained_closeout_count": len(terminals),
        "closed_selection_count": len(selection_ids & terminal_ids),
        "unclosed_selection_count": len(selection_ids - terminal_ids),
        "closeout_without_selection_count": len(terminal_ids - selection_ids),
        "utilization_counts": dict(sorted(utilization_counts.items())),
        "influence_counts": dict(sorted(influence_counts.items())),
        "task_outcome_counts": dict(sorted(task_outcome_counts.items())),
        "per_skill": [
            {
                "id": skill_id,
                "selected_count": summary["selected_count"],
                "reported_count": summary["reported_count"],
                "status_counts": dict(sorted(summary["status_counts"].items())),
            }
            for skill_id, summary in sorted(per_skill.items())
        ],
        "oldest_receipt_at": min(receipt_times) if receipt_times else None,
        "newest_receipt_at": max(receipt_times) if receipt_times else None,
        "excludes": [
            "tasks that bypass project-governance context",
            "provider-native skill discovery and tasks without closeout",
            "prompts, paths, source content, skill bodies, and private reasoning",
            "instruction compliance, decision quality, and evicted receipts",
        ],
        "interpretation": (
            "best-effort retained self-reported skill utilization, not proof that guidance was "
            "followed or that the resulting work is correct"
        ),
    }


def _write_telemetry(
    root: Path,
    event: dict[str, Any],
    terminal_hook: Callable[[Path, dict[str, Any]], bool] | None,
) -> bool:
    """Resolve the generic writer lazily so telemetry can import this event family."""
    if terminal_hook is None:
        from .telemetry import append

        terminal_hook = append
    return terminal_hook(root, event)


def _packet_id(context_result: dict[str, Any]) -> str:
    """Extract the content-addressed packet identifier without retaining its path."""
    materialization = context_result.get("materialization")
    root = materialization.get("root") if isinstance(materialization, dict) else None
    match = SAFE_PACKET_ROOT.fullmatch(root) if isinstance(root, str) else None
    if match is None:
        raise SkillUtilizationError("context result has no safe materialization packet")
    return str(match.group("packet_id"))


def _selection_kinds(skill: dict[str, Any]) -> list[str]:
    """Reduce task-bearing selection reasons to four content-free classes."""
    kinds: list[str] = []
    if skill.get("selected_by") == "route-declaration":
        kinds.append("route")
    reasons = skill.get("selection_reasons", [])
    if not isinstance(reasons, list):
        reasons = []
    for reason in reasons:
        if not isinstance(reason, str):
            continue
        if reason == "declared-by-route":
            kind = "route"
        elif reason.startswith("task:"):
            kind = "task"
        elif reason.startswith("path:"):
            kind = "path"
        elif reason.startswith(("fact:", "required-fact:")):
            kind = "fact"
        else:
            continue
        if kind not in kinds:
            kinds.append(kind)
    return [kind for kind in SELECTION_KINDS if kind in kinds]


def _materialized_skills(root: Path, context_result: dict[str, Any]) -> list[dict[str, Any]]:
    """Verify every delivered skill against the supplied context result and packet bytes."""
    packet_id = _packet_id(context_result)
    skills = context_result.get("skills")
    if not isinstance(skills, list):
        raise SkillUtilizationError("context result skills must be a list")
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in skills:
        if not isinstance(value, dict) or "materialized_path" not in value:
            continue
        skill_id = value.get("id")
        digest = value.get("sha256")
        relative = value.get("materialized_path")
        if not isinstance(skill_id, str) or SAFE_SKILL_ID.fullmatch(skill_id) is None:
            raise SkillUtilizationError("context result contains an unsafe skill id")
        if skill_id in seen:
            raise SkillUtilizationError(f"context result repeats skill id: {skill_id}")
        if not isinstance(digest, str) or SAFE_DIGEST.fullmatch(digest) is None:
            raise SkillUtilizationError(f"context result has an invalid digest for skill: {skill_id}")
        match = SAFE_MATERIALIZED_SKILL.fullmatch(relative) if isinstance(relative, str) else None
        if match is None or match.group("skill_id") != skill_id:
            raise SkillUtilizationError(f"context result has an invalid packet path for skill: {skill_id}")
        packet = root / ".governance/runtime/context" / packet_id
        skill_path = packet / str(relative)
        try:
            skill_path.resolve().relative_to(packet.resolve())
            content = skill_path.read_bytes()
        except (OSError, ValueError) as error:
            raise SkillUtilizationError(f"materialized skill is unavailable: {skill_id}") from error
        if hashlib.sha256(content).hexdigest() != digest:
            raise SkillUtilizationError(f"materialized skill digest mismatch: {skill_id}")
        selected.append(
            {
                "id": skill_id,
                "sha256": digest,
                "selected_by": (
                    value.get("selected_by")
                    if value.get("selected_by") in {"route-declaration", "automatic-applicability"}
                    else "route-declaration"
                ),
                "selection_kinds": _selection_kinds(value),
            }
        )
        seen.add(skill_id)
    return selected


def begin(
    root: Path,
    context_result: dict[str, Any],
    *,
    terminal_hook: Callable[[Path, dict[str, Any]], bool] | None = None,
) -> dict[str, Any] | None:
    """Record one privacy-safe selection event and return its closeout identity."""
    skills = _materialized_skills(root, context_result)
    if not skills:
        return None
    if len(skills) > MAX_TELEMETRY_SKILLS:
        raise SkillUtilizationError("context result exceeds the skill telemetry limit")
    usage_id = str(uuid.uuid4())
    packet_id = _packet_id(context_result)
    written = _write_telemetry(
        root,
        {
            "event": "skill-selection",
            "runtime_version": __version__,
            "usage_id": usage_id,
            "packet_id": packet_id,
            "skills": skills,
        },
        terminal_hook,
    )
    return {
        "usage_id": usage_id,
        "packet_id": packet_id,
        "selected_skill_count": len(skills),
        "selection_recorded": written,
    }


def _normalize_outcome(value: Any) -> tuple[str, dict[str, Any]]:
    """Validate one caller-supplied utilization outcome without retaining extra fields."""
    if not isinstance(value, dict):
        raise SkillUtilizationError("each skill outcome must be an object")
    skill_id = value.get("id")
    status = value.get("status")
    influences = value.get("influences", [])
    if not isinstance(skill_id, str) or SAFE_SKILL_ID.fullmatch(skill_id) is None:
        raise SkillUtilizationError("skill outcome contains an unsafe id")
    if status not in UTILIZATION_STATUSES:
        raise SkillUtilizationError(f"skill outcome has an invalid status: {skill_id}")
    if (
        not isinstance(influences, list)
        or any(item not in INFLUENCE_TYPES for item in influences)
        or len(set(influences)) != len(influences)
    ):
        raise SkillUtilizationError(f"skill outcome has invalid influences: {skill_id}")
    if status == "applied" and not influences:
        raise SkillUtilizationError(f"applied skill must name an influence: {skill_id}")
    if status != "applied" and influences:
        raise SkillUtilizationError(f"non-applied skill cannot name influences: {skill_id}")
    return skill_id, {"status": status, "influences": influences}


def _require_exact_coverage(selected_ids: list[str], reported_ids: set[str]) -> None:
    """Reject a closeout that omits a delivered skill or invents another one."""
    if reported_ids == set(selected_ids):
        return
    missing = sorted(set(selected_ids) - reported_ids)
    extra = sorted(reported_ids - set(selected_ids))
    parts = []
    if missing:
        parts.append("missing=" + ",".join(missing))
    if extra:
        parts.append("extra=" + ",".join(extra))
    raise SkillUtilizationError("skill outcomes do not match selected skills: " + " ".join(parts))


def _outcome_entries(
    selected: list[dict[str, Any]], outcomes: dict[str, Any]
) -> list[dict[str, Any]]:
    """Require one bounded utilization status for every materialized skill and no extras."""
    values = outcomes.get("skills")
    if not isinstance(values, list):
        raise SkillUtilizationError("skill outcomes must be a list")
    by_id: dict[str, dict[str, Any]] = {}
    for value in values:
        skill_id, normalized = _normalize_outcome(value)
        if skill_id in by_id:
            raise SkillUtilizationError(f"skill outcome repeats id: {skill_id}")
        by_id[skill_id] = normalized
    selected_ids = [str(value["id"]) for value in selected]
    _require_exact_coverage(selected_ids, set(by_id))
    return [
        {
            "id": value["id"],
            "sha256": value["sha256"],
            "status": by_id[str(value["id"])]["status"],
            "influences": by_id[str(value["id"])]["influences"],
        }
        for value in selected
    ]


def finish(
    root: Path,
    context_result: dict[str, Any],
    outcomes: dict[str, Any],
    *,
    terminal_hook: Callable[[Path, dict[str, Any]], bool] | None = None,
) -> dict[str, Any]:
    """Validate and append one terminal receipt bound to the exact context selection."""
    identity = context_result.get("skill_utilization")
    if not isinstance(identity, dict):
        raise SkillUtilizationError("context result has no skill utilization identity")
    usage_id = identity.get("usage_id")
    packet_id = _packet_id(context_result)
    if not isinstance(usage_id, str) or SAFE_USAGE_ID.fullmatch(usage_id) is None:
        raise SkillUtilizationError("context result has an invalid skill utilization id")
    if identity.get("packet_id") != packet_id:
        raise SkillUtilizationError("context result skill utilization packet does not match")
    task_outcome = outcomes.get("task_outcome")
    if task_outcome not in TASK_OUTCOMES:
        raise SkillUtilizationError("skill closeout has an invalid task outcome")
    selected = _materialized_skills(root, context_result)
    if len(selected) > MAX_TELEMETRY_SKILLS:
        raise SkillUtilizationError("context result exceeds the skill telemetry limit")
    if identity.get("selected_skill_count") != len(selected):
        raise SkillUtilizationError("context result selected skill count does not match")
    entries = _outcome_entries(selected, outcomes)
    written = _write_telemetry(
        root,
        {
            "event": "skill-utilization-terminal",
            "runtime_version": __version__,
            "usage_id": usage_id,
            "packet_id": packet_id,
            "task_outcome": task_outcome,
            "skills": entries,
        },
        terminal_hook,
    )
    counts: dict[str, int] = {}
    for entry in entries:
        status = str(entry["status"])
        counts[status] = counts.get(status, 0) + 1
    return {
        "status": "recorded" if written else "telemetry-unavailable",
        "usage_id": usage_id,
        "packet_id": packet_id,
        "selected_skill_count": len(entries),
        "utilization_counts": dict(sorted(counts.items())),
        "telemetry_written": written,
    }
