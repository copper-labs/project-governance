"""Project host-side task envelopes into compact delegated-worker packets."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


WORKER_BRIEF_FIELDS = (
    "task_id",
    "role",
    "required_capability_tier",
    "objective",
    "governing_refs",
    "base_snapshot",
    "read_scope",
    "write_scope",
    "exclusions",
    "fixed_decisions",
    "acceptance",
    "focused_proof",
    "output_token_ceiling",
    "escalate_or_stop_when",
)


class AgentContractError(ValueError):
    """Report an incomplete host envelope or context projection."""


@lru_cache(maxsize=3)
def _validator(name: str) -> Draft202012Validator:
    """Load one shipped contract once from the installed package payload."""
    path = Path(__file__).parent / "assets/skills/resources" / name
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _validate(instance: Any, schema_name: str, *, label: str) -> None:
    """Raise one bounded contract error for the first deterministic schema finding."""
    errors = sorted(
        _validator(schema_name).iter_errors(instance),
        key=lambda item: [str(part) for part in item.path],
    )
    if errors:
        location = ".".join(str(item) for item in errors[0].path) or "root"
        raise AgentContractError(f"{label} is invalid at {location}: {errors[0].message}")


def validate_routing_input(
    task: dict[str, Any],
    session: dict[str, Any],
    catalog: dict[str, Any],
    control_state: dict[str, Any],
) -> None:
    """Validate the host identity and every native profile against the shipped schema."""
    _validate(
        {
            "kind": "agent-route-input",
            "task": task,
            "session": session,
            "catalog": catalog,
            "control_state": control_state,
        },
        "agent-routing.schema.json",
        label="routing input",
    )


def validate_worker_brief(brief: dict[str, Any]) -> None:
    """Validate one exact model-visible brief before it leaves the host boundary."""
    _validate(brief, "agent-worker-brief.schema.json", label="worker brief")


def validate_control_state(state: dict[str, Any]) -> None:
    """Validate ignored authorization state against the shipped control schema."""
    _validate(state, "agent-control-state.schema.json", label="agent control state")


def project_worker_packet(
    task_envelope: dict[str, Any], context_result: dict[str, Any]
) -> dict[str, Any]:
    """Return only the approved worker brief and selected materialized context."""
    missing = [field for field in WORKER_BRIEF_FIELDS if field not in task_envelope]
    if missing:
        raise AgentContractError(
            "task envelope is missing worker brief fields: " + ", ".join(missing)
        )
    ceiling = task_envelope["output_token_ceiling"]
    if isinstance(ceiling, bool) or not isinstance(ceiling, int) or ceiling <= 0:
        raise AgentContractError("output_token_ceiling must be a positive integer")
    materialization = context_result.get("materialization")
    if not isinstance(materialization, dict) or not isinstance(
        materialization.get("items"), list
    ):
        raise AgentContractError("context result has no materialized item list")
    items: list[dict[str, Any]] = []
    allowed = {"id", "group", "materialized_path", "sha256", "exact_bytes"}
    for index, item in enumerate(materialization["items"]):
        if not isinstance(item, dict) or not {
            "id",
            "materialized_path",
            "sha256",
        }.issubset(item):
            raise AgentContractError(f"materialized context item {index} is incomplete")
        items.append({key: item[key] for key in allowed if key in item})
    brief = {field: task_envelope[field] for field in WORKER_BRIEF_FIELDS}
    validate_worker_brief(brief)
    return {
        "brief": brief,
        "materialized_context": items,
    }
