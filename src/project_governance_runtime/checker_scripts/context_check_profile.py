"""Validate the direct, target-owned inputs used by the context resolver.

This module deliberately shares path, budget, and skill rules with ``context.py``.  It checks a
configured router without producing a packet, generating documentation, or contacting a provider.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from project_governance_runtime.configuration import ConfigurationError, load_packs
from project_governance_runtime.context import (
    ContextError,
    SAFE_SKILL_ID,
    _budget,
    _file_bytes,
    _relative_path,
)


SKILL_CONTEXT_FIELDS = {
    "ecosystems",
    "target_families",
    "runtime_profiles",
    "support_tiers",
    "artifact_profiles",
    "consumers",
    "ui_posture",
    "device_topology",
    "boundary_pressure",
}


def router_is_configured(profile: dict[str, Any]) -> bool:
    """Return whether the target elected to configure context routing at all."""
    return "context_router" in profile


def validate_skill_context(facts_document: dict[str, Any], errors: list[str]) -> None:
    """Validate optional list-valued selection facts without requiring a router."""
    facts = facts_document.get("facts", {})
    if facts is None:
        return
    if not isinstance(facts, dict):
        errors.append("facts.lock.yaml facts: expected a mapping")
        return
    skill_context = facts.get("skill_context")
    if skill_context is None:
        return
    if not isinstance(skill_context, dict):
        errors.append("facts.skill_context: expected a mapping")
        return
    for field in skill_context:
        if field not in SKILL_CONTEXT_FIELDS:
            errors.append(f"facts.skill_context.{field}: unsupported field")
    for field in sorted(SKILL_CONTEXT_FIELDS & set(skill_context)):
        values = skill_context[field]
        if not isinstance(values, list):
            errors.append(f"facts.skill_context.{field}: expected a list")
            continue
        seen: set[str] = set()
        for index, value in enumerate(values):
            if not isinstance(value, str) or not value.strip():
                errors.append(
                    f"facts.skill_context.{field}[{index}]: non-empty string required"
                )
                continue
            normalized = value.strip()
            if normalized != value:
                errors.append(
                    f"facts.skill_context.{field}[{index}]: surrounding whitespace is not allowed"
                )
            if normalized in seen:
                errors.append(f"facts.skill_context.{field}: duplicate value {normalized}")
            seen.add(normalized)


def _report_context_error(owner: str, action: Any, errors: list[str]) -> None:
    """Run one resolver rule and retain its actionable error in checker output."""
    try:
        action()
    except ContextError as error:
        errors.append(f"{owner}: {error}")


def _existing_file(root: Path, value: Any, owner: str, errors: list[str]) -> None:
    """Require one resolver-safe ordinary context file below the target root."""
    relative: str | None = None

    def resolve_reference() -> None:
        nonlocal relative
        relative = _relative_path(value, label=owner)

    _report_context_error(owner, resolve_reference, errors)
    if relative is not None and _file_bytes(root, relative) is None:
        errors.append(f"{owner}: path does not name an ordinary repository file: {relative}")


def _path_list(root: Path, values: Any, owner: str, errors: list[str]) -> None:
    """Validate one optional list of direct local context file references."""
    if values is None:
        return
    if not isinstance(values, list):
        errors.append(f"{owner}: expected a list")
        return
    for index, value in enumerate(values):
        _existing_file(root, value, f"{owner}[{index}]", errors)


def _skills(values: Any, owner: str, errors: list[str]) -> None:
    """Accept only safe installed-skill identifiers, leaving availability to the resolver."""
    if values is None:
        return
    if not isinstance(values, list):
        errors.append(f"{owner}: expected a list")
        return
    for index, skill_id in enumerate(values):
        if not isinstance(skill_id, str) or SAFE_SKILL_ID.fullmatch(skill_id) is None:
            errors.append(f"{owner}[{index}]: unsafe skill id")


def _budget_is_bounded(route_id: str, route: dict[str, Any], errors: list[str]) -> None:
    """Apply the resolver's defaults and require useful positive group limits."""
    budget: dict[str, int] | None = None

    def resolve_budget() -> None:
        nonlocal budget
        budget = _budget(route)

    _report_context_error(f"context_router.routes.{route_id}.token_budget", resolve_budget, errors)
    if budget is None:
        return
    for key, value in budget.items():
        if value <= 0:
            errors.append(f"context_router.routes.{route_id}.token_budget.{key}: must be positive")
    total = budget["total_context_tokens"]
    for key in ("primary_context_tokens", "active_plan_context_tokens", "expansion_context_tokens"):
        if budget[key] > total:
            errors.append(
                f"context_router.routes.{route_id}.token_budget.{key}: must not exceed total_context_tokens"
            )


def _validation_ids(root: Path, errors: list[str]) -> set[str]:
    """Read actual built-in and target pack identifiers without duplicating their registry."""
    try:
        return set(load_packs(root))
    except ConfigurationError as error:
        errors.append(f"validation packs: {error}")
        return set()


def _validate_route(root: Path, route: Any, index: int, pack_ids: set[str], seen: set[str], errors: list[str]) -> None:
    """Validate one route exactly as the direct resolver consumes it."""
    if not isinstance(route, dict):
        errors.append(f"context_router.routes[{index}]: expected a mapping")
        return
    raw_id = route.get("id")
    route_id = raw_id.strip() if isinstance(raw_id, str) else ""
    if not route_id:
        errors.append(f"context_router.routes[{index}].id: non-empty string required")
        return
    if route_id in seen:
        errors.append(f"context_router.routes.{route_id}: duplicate route id")
    seen.add(route_id)
    for key in ("primary_context", "active_plan_context", "expansion_context"):
        _path_list(root, route.get(key), f"context_router.routes.{route_id}.{key}", errors)
    _skills(route.get("skills"), f"context_router.routes.{route_id}.skills", errors)
    _budget_is_bounded(route_id, route, errors)
    validations = route.get("validations")
    if validations is not None and not isinstance(validations, list):
        errors.append(f"context_router.routes.{route_id}.validations: expected a list")
    elif isinstance(validations, list):
        for pack_id in validations:
            if not isinstance(pack_id, str) or pack_id not in pack_ids:
                errors.append(f"context_router.routes.{route_id}.validations: unknown pack {pack_id}")


def validate_router(root: Path, profile: dict[str, Any], facts: dict[str, Any], errors: list[str]) -> None:
    """Validate a configured router; a child without one deliberately passes unchanged."""
    if not router_is_configured(profile):
        return
    router = profile.get("context_router")
    if not isinstance(router, dict):
        errors.append("context_router: expected a mapping")
        return
    profile_id = profile.get("profile_id")
    facts_id = facts.get("profile_id")
    if profile_id and facts_id and profile_id != facts_id:
        errors.append("profile.yaml and facts.lock.yaml identify different repositories")
    _path_list(root, router.get("default_context"), "context_router.default_context", errors)
    _skills(router.get("default_skills"), "context_router.default_skills", errors)
    routes = router.get("routes", [])
    if not isinstance(routes, list):
        errors.append("context_router.routes: expected a list")
        return
    pack_ids = _validation_ids(root, errors)
    route_ids: set[str] = set()
    for index, route in enumerate(routes):
        _validate_route(root, route, index, pack_ids, route_ids, errors)
