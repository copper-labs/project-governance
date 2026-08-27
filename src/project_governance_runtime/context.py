"""Route and materialize a small, repository-local context packet.

The runtime reads only child-owned profile and facts files. It keeps route selection,
skill discovery, and local file materialization deterministic without a generated profile or
provider client. Ignored materializations are bounded by count.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

import yaml

from .skill_catalog import (
    SkillCatalogError,
    build_skill_index,
    canonical_skill_bytes,
)
from .skill_selection import select_attached_skills
from .state_io import path_lock


TOKEN_BYTES = 4
DEFAULT_BUDGET = {
    "primary_context_tokens": 6000,
    "active_plan_context_tokens": 1500,
    "expansion_context_tokens": 3000,
    "total_context_tokens": 10000,
}
SAFE_SKILL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
MAX_SKILL_BYTES = 16_000
MAX_CONTEXT_PACKETS = 8
MAX_CONTEXT_PACKET_BYTES = 256 * 1024
MAX_CONTEXT_BYTES = MAX_CONTEXT_PACKET_BYTES - MAX_SKILL_BYTES
MAX_CONTEXT_TOKENS = MAX_CONTEXT_BYTES // TOKEN_BYTES


class ContextError(ValueError):
    """Report invalid child context configuration or an unsafe local reference."""


class _SourceOutsideBudget(ValueError):
    """Stop reading one declared source when it cannot fit in the remaining packet budget."""


def _load_mapping(path: Path) -> dict[str, Any]:
    """Load one child-owned YAML mapping with an actionable error."""
    if not path.is_file() or path.is_symlink():
        raise ContextError(f"{path}: required ordinary YAML file is missing")
    value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(value, dict):
        raise ContextError(f"{path}: expected a YAML mapping")
    return value


def _relative_path(value: Any, *, label: str) -> str:
    """Reject absolute, parent-traversing, and empty target-owned references."""
    if not isinstance(value, str) or not value.strip():
        raise ContextError(f"{label}: expected a non-empty repository-relative path")
    relative = Path(value.strip().removeprefix("./"))
    if relative.is_absolute() or ".." in relative.parts:
        raise ContextError(f"{label}: path must stay inside the repository")
    return relative.as_posix()


def _file_bytes(
    root: Path, relative: str, *, max_bytes: int | None = None
) -> bytes | None:
    """Read one ordinary in-repository file without crossing an optional byte bound."""
    source = root / relative
    if not source.is_file() or source.is_symlink():
        return None
    try:
        source.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise ContextError(f"{relative}: resolved outside the repository") from error
    if max_bytes is None:
        return source.read_bytes()
    try:
        if source.stat().st_size > max_bytes:
            raise _SourceOutsideBudget(relative)
        with source.open("rb") as handle:
            content = handle.read(max_bytes + 1)
    except OSError:
        return None
    if len(content) > max_bytes:
        raise _SourceOutsideBudget(relative)
    return content


def _unique(values: list[str]) -> list[str]:
    """Preserve declaration order while dropping repeated route values."""
    return list(dict.fromkeys(values))


def _term_matches(task: str, term: str) -> bool:
    """Match a configured term without treating a substring as a route hit."""
    if not term:
        return False
    pattern = r"(?<![A-Za-z0-9_-])" + re.escape(term.lower()) + r"(?![A-Za-z0-9_-])"
    return re.search(pattern, task.lower()) is not None


def _route_score(route: dict[str, Any], task: str, changed_paths: list[str], weights: dict[str, Any]) -> tuple[int, list[str]]:
    """Score one route from its child-declared prompt and path signals."""
    match = route.get("match", {}) if isinstance(route.get("match"), dict) else {}
    path_weight = int(weights.get("changed_path", 100))
    term_weight = int(weights.get("prompt_term", 20))
    product_weight = int(weights.get("product_term", 80))
    reasons: list[str] = []
    path_globs = [str(value) for value in match.get("path_globs", []) or []]
    for path in changed_paths:
        matching = next((pattern for pattern in path_globs if fnmatch.fnmatch(path, pattern)), None)
        if matching:
            reasons.append(f"path:{path}->{matching}")
    product_terms = [str(value) for value in [*(match.get("product_terms", []) or []), *(route.get("aliases", []) or [])]]
    prompt_terms = [
        str(value)
        for key in ("prompt_terms", "workflow_terms", "task_terms")
        for value in match.get(key, []) or []
    ]
    product_matches = [term for term in _unique(product_terms) if _term_matches(task, term)]
    prompt_matches = [term for term in _unique(prompt_terms) if _term_matches(task, term)]
    reasons.extend(f"product:{term}" for term in product_matches)
    reasons.extend(f"term:{term}" for term in prompt_matches)
    return (
        len([reason for reason in reasons if reason.startswith("path:")]) * path_weight
        + len(product_matches) * product_weight
        + len(prompt_matches) * term_weight,
        reasons,
    )


def _select_route(router: dict[str, Any], task: str, changed_paths: list[str]) -> dict[str, Any]:
    """Choose one deterministic route and retain close alternatives as diagnostics."""
    scoring = router.get("scoring", {}) if isinstance(router.get("scoring"), dict) else {}
    weights = scoring.get("weights", {}) if isinstance(scoring.get("weights"), dict) else {}
    scores: list[dict[str, Any]] = []
    for route in router.get("routes", []) or []:
        if not isinstance(route, dict) or not isinstance(route.get("id"), str):
            continue
        score, reasons = _route_score(route, task, changed_paths, weights)
        scores.append({"route": route, "score": score, "reasons": reasons})
    scores.sort(key=lambda entry: (-int(entry["score"]), str(entry["route"]["id"])))
    if not scores or int(scores[0]["score"]) <= 0:
        return {"outcome": "fallback", "selected": None, "secondary": [], "scores": scores}
    selected = scores[0]
    secondary_limit = int(scoring.get("max_secondary_routes", 2))
    threshold = int(scoring.get("tie_threshold", 20))
    secondary = [
        entry
        for entry in scores[1:]
        if int(entry["score"]) > 0 and int(selected["score"]) - int(entry["score"]) <= threshold
    ][:secondary_limit]
    tied = bool(secondary and int(secondary[0]["score"]) == int(selected["score"]))
    return {"outcome": "ambiguous" if tied else "matched", "selected": selected, "secondary": secondary, "scores": scores}


def _budget(route: dict[str, Any] | None) -> dict[str, int]:
    """Return validated route limits without requiring a generated profile."""
    configured = route.get("token_budget", {}) if route and isinstance(route.get("token_budget"), dict) else {}
    result: dict[str, int] = {}
    for key, default in DEFAULT_BUDGET.items():
        value = configured.get(key, default)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ContextError(f"context_router token_budget.{key}: expected a nonnegative integer")
        result[key] = value
    if result["total_context_tokens"] > MAX_CONTEXT_TOKENS:
        raise ContextError(
            "context_router token_budget.total_context_tokens exceeds the runtime-owned "
            f"packet ceiling of {MAX_CONTEXT_TOKENS} tokens"
        )
    return result


def _groups(router: dict[str, Any], decision: dict[str, Any], include_expansion: bool) -> tuple[str, dict[str, list[str]], dict[str, Any] | None]:
    """Project declared context into disjoint required and optional groups."""
    route_entry = decision["selected"]
    route = route_entry["route"] if route_entry else None
    primary_values = list(router.get("default_context", []) or [])
    if route:
        primary_values.extend(route.get("primary_context", []) or [])
    primary = _unique([_relative_path(value, label="context_router primary_context") for value in primary_values])
    active = _unique([_relative_path(value, label="context_router active_plan_context") for value in (route or {}).get("active_plan_context", []) or []])
    active = [value for value in active if value not in set(primary)]
    expansion_values = (route or {}).get("expansion_context", []) if include_expansion else []
    expansion = _unique([_relative_path(value, label="context_router expansion_context") for value in expansion_values or []])
    expansion = [value for value in expansion if value not in set(primary) and value not in set(active)]
    return (str(route.get("id")) if route else "fallback", {"primary": primary, "active-plan": active, "expansion": expansion}, route)


def _context_items(root: Path, groups: dict[str, list[str]], budget: dict[str, int]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Read declared files once and enforce exact per-group and total byte limits."""
    selected: list[dict[str, Any]] = []
    omissions: list[dict[str, Any]] = []
    used = {"primary": 0, "active-plan": 0, "expansion": 0, "total": 0}
    limits = {
        "primary": budget["primary_context_tokens"] * TOKEN_BYTES,
        "active-plan": budget["active_plan_context_tokens"] * TOKEN_BYTES,
        "expansion": budget["expansion_context_tokens"] * TOKEN_BYTES,
        "total": budget["total_context_tokens"] * TOKEN_BYTES,
    }
    for group in ("primary", "active-plan", "expansion"):
        for relative in groups[group]:
            required = group != "expansion"
            remaining = min(
                limits[group] - used[group], limits["total"] - used["total"]
            )
            try:
                content = _file_bytes(root, relative, max_bytes=max(0, remaining))
            except _SourceOutsideBudget:
                omissions.append(
                    {
                        "path": relative,
                        "group": group,
                        "reason": "outside-byte-budget",
                        "required": required,
                    }
                )
                continue
            if content is None:
                omissions.append({"path": relative, "group": group, "reason": "source-unavailable", "required": required})
                continue
            size = len(content)
            if used[group] + size > limits[group] or used["total"] + size > limits["total"]:
                omissions.append({"path": relative, "group": group, "reason": "outside-byte-budget", "required": required})
                continue
            item_id = hashlib.sha256(f"{group}\0{relative}".encode("utf-8")).hexdigest()[:16]
            selected.append({
                "id": f"context-{item_id}", "group": group, "source_path": relative,
                "content": content, "sha256": hashlib.sha256(content).hexdigest(), "exact_bytes": size,
            })
            used[group] += size
            used["total"] += size
    return selected, omissions, limits


def _canonical_skill(
    root: Path,
    record: dict[str, Any],
    *,
    selected_by: str,
    reasons: list[str],
    required: bool,
) -> tuple[dict[str, Any] | None, str | None]:
    """Load one installed package-owned skill and compare it with canonical bytes."""
    relative = str(record["path"])
    try:
        content = _file_bytes(root, relative, max_bytes=MAX_SKILL_BYTES)
    except _SourceOutsideBudget:
        return (
            {
                "id": str(record["id"]),
                "path": relative,
                "activation_mode": str(record["activation_mode"]),
                "activation_level": str(record["default_level"]),
                "selected_by": selected_by,
                "selection_reasons": reasons,
                "_outside_budget": True,
                "_required": required,
            },
            None,
        )
    if content is None:
        return None, "unavailable"
    if content != canonical_skill_bytes(record):
        return None, "stale-materialization"
    return (
        {
            "id": str(record["id"]),
            "path": relative,
            "sha256": hashlib.sha256(content).hexdigest(),
            "activation_mode": str(record["activation_mode"]),
            "activation_level": str(record["default_level"]),
            "selected_by": selected_by,
            "selection_reasons": reasons,
            "_content": content,
            "_required": required,
        },
        None,
    )


def _route_declared_skill(
    root: Path,
    skill_id: str,
    record: dict[str, Any] | None,
    *,
    include_evaluation: bool,
) -> tuple[dict[str, Any] | None, str | None]:
    """Resolve one direct route declaration through its canonical or target-owned boundary."""
    if SAFE_SKILL_ID.fullmatch(skill_id) is None:
        raise ContextError(f"context_router skill id is unsafe: {skill_id}")
    if (
        record is not None
        and record.get("activation_mode") == "evaluation-only"
        and not include_evaluation
    ):
        return None, "evaluation-only"
    if record is not None:
        return _canonical_skill(
            root,
            record,
            selected_by="route-declaration",
            reasons=["declared-by-route"],
            required=True,
        )
    relative = f".governance/runtime/skills/{skill_id}/SKILL.md"
    try:
        content = _file_bytes(root, relative, max_bytes=MAX_SKILL_BYTES)
    except _SourceOutsideBudget:
        return (
            {
                "id": skill_id,
                "path": relative,
                "selected_by": "route-declaration",
                "selection_reasons": ["declared-by-route"],
                "_outside_budget": True,
                "_required": True,
            },
            None,
        )
    if content is None:
        return None, "unavailable"
    return (
        {
            "id": skill_id,
            "path": relative,
            "sha256": hashlib.sha256(content).hexdigest(),
            "selected_by": "route-declaration",
            "selection_reasons": ["declared-by-route"],
            "_content": content,
            "_required": True,
        },
        None,
    )


def _discover_skills(
    root: Path,
    router: dict[str, Any],
    route: dict[str, Any] | None,
    index: dict[str, dict[str, Any]],
    *,
    include_evaluation: bool,
) -> tuple[list[dict[str, Any]], list[str], list[str], list[str]]:
    """Resolve target-declared top-level or manifest-owned skill identifiers."""
    declared = [str(value) for value in router.get("default_skills", []) or []]
    declared.extend(str(value) for value in (route or {}).get("skills", []) or [])
    found: list[dict[str, Any]] = []
    missing: list[str] = []
    evaluation_only: list[str] = []
    stale: list[str] = []
    for skill_id in _unique(declared):
        skill, error = _route_declared_skill(
            root, skill_id, index.get(skill_id), include_evaluation=include_evaluation
        )
        if skill is not None:
            found.append(skill)
        elif error == "unavailable":
            missing.append(skill_id)
        elif error == "evaluation-only":
            evaluation_only.append(skill_id)
        elif error == "stale-materialization":
            stale.append(skill_id)
    return found, missing, evaluation_only, stale


def _compose_skills(
    root: Path,
    selection: dict[str, Any],
    existing: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Load canonical bytes for automatically selected leaves without duplicates."""
    existing_ids = {str(skill["id"]) for skill in existing}
    composed: list[dict[str, Any]] = []
    missing: list[str] = []
    stale: list[str] = []
    for record in selection["selected"]:
        skill_id = str(record["id"])
        if skill_id in existing_ids:
            continue
        skill, error = _canonical_skill(
            root,
            record,
            selected_by="automatic-applicability",
            reasons=list(record["selection_reasons"]),
            required=record.get("default_level") == "required",
        )
        if error == "unavailable":
            missing.append(skill_id)
        elif error == "stale-materialization":
            stale.append(skill_id)
        elif skill is not None:
            composed.append(skill)
            existing_ids.add(skill_id)
    return composed, missing, stale


def _skill_context(facts: dict[str, Any]) -> dict[str, Any] | None:
    """Read the optional validated selector facts from the Version 1 facts document."""
    facts_mapping = facts.get("facts", {})
    if facts_mapping is None:
        facts_mapping = {}
    if not isinstance(facts_mapping, dict):
        raise ContextError("facts.lock.yaml facts: expected a mapping")
    value = facts_mapping.get("skill_context")
    if value is not None and not isinstance(value, dict):
        raise ContextError("facts.skill_context: expected a mapping")
    return value


def _automatic_selection(
    index: dict[str, dict[str, Any]],
    decision: dict[str, Any],
    route: dict[str, Any] | None,
    task: str,
    changed_paths: list[str],
    facts: dict[str, Any] | None,
    *,
    include_evaluation: bool,
) -> dict[str, Any]:
    """Compose leaves only from a matched route's own attached router declarations."""
    empty = {"selected": [], "exclusions": [], "unresolved_facts": [], "conflicts": []}
    if decision["outcome"] != "matched" or route is None or facts is None:
        return empty
    route_skill_ids = [str(value) for value in route.get("skills", []) or []]
    router_ids = [
        skill_id
        for skill_id in route_skill_ids
        if skill_id in index and index[skill_id].get("router_for")
    ]
    return select_attached_skills(
        index,
        router_ids,
        task,
        changed_paths,
        facts,
        include_evaluation=include_evaluation,
    )


def _bounded_skill_items(
    skills: list[dict[str, Any]], budget: dict[str, int]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """Apply the separate selected-skill cap without changing context limits."""
    limit = min(MAX_SKILL_BYTES, budget["total_context_tokens"] * TOKEN_BYTES // 2)
    context_limit = budget["total_context_tokens"] * TOKEN_BYTES
    used = 0
    items: list[dict[str, Any]] = []
    omissions: list[dict[str, Any]] = []
    for skill in skills:
        if skill.get("_outside_budget"):
            omissions.append(
                {
                    "id": skill["id"],
                    "path": skill["path"],
                    "reason": "outside-byte-budget",
                    "required": bool(skill.get("_required")),
                }
            )
            continue
        content = skill.get("_content")
        if not isinstance(content, bytes):
            continue
        size = len(content)
        if used + size > limit:
            omissions.append(
                {
                    "id": skill["id"],
                    "path": skill["path"],
                    "reason": "outside-byte-budget",
                    "required": bool(skill.get("_required")),
                }
            )
            continue
        items.append(
            {
                "id": skill["id"],
                "source_path": skill["path"],
                "content": content,
                "sha256": skill["sha256"],
                "exact_bytes": size,
            }
        )
        used += size
    return items, omissions, {"skill": limit, "combined": context_limit + limit, "skill_used": used}


def _skill_blockers(
    context_omissions: list[dict[str, Any]],
    missing: list[str],
    evaluation_only: list[str],
    stale: list[str],
    budget_omissions: list[dict[str, Any]],
    selection: dict[str, Any],
) -> list[str]:
    """Normalize skill and context failures into stable coordinator blocker codes."""
    blockers = [entry["reason"] for entry in context_omissions if entry["required"]]
    blockers.extend(f"skill-unavailable:{skill_id}" for skill_id in missing)
    blockers.extend(f"skill-evaluation-only:{skill_id}" for skill_id in evaluation_only)
    blockers.extend(f"skill-stale-materialization:{skill_id}" for skill_id in stale)
    blockers.extend(
        f"skill-outside-byte-budget:{entry['id']}"
        for entry in budget_omissions
        if entry["required"]
    )
    blockers.extend(
        f"skill-unresolved-fact:{field}" for field in selection["unresolved_facts"]
    )
    blockers.extend(f"skill-conflict:{conflict}" for conflict in selection["conflicts"])
    return blockers


def _public_skills(
    skills: list[dict[str, Any]], materialized: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Remove in-memory bytes and attach packet paths to included canonical skills."""
    materialized_by_id = {
        str(item["id"]): str(item["materialized_path"]) for item in materialized
    }
    result: list[dict[str, Any]] = []
    for skill in skills:
        public = {key: value for key, value in skill.items() if not key.startswith("_")}
        if str(skill["id"]) in materialized_by_id:
            public["materialized_path"] = materialized_by_id[str(skill["id"])]
        result.append(public)
    return result


def _materialize(
    root: Path,
    items: list[dict[str, Any]],
    skill_items: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Atomically publish selected bytes below ignored runtime state without overwriting content."""
    runtime_root = root / ".governance/runtime/context"
    runtime_root.mkdir(parents=True, exist_ok=True)
    try:
        runtime_root.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise ContextError(".governance/runtime/context resolves outside the repository") from error
    with path_lock(runtime_root / ".materialization-state", timeout_seconds=None):
        _prune_abandoned_temporaries(runtime_root)
        return _materialize_locked(root, runtime_root, items, skill_items)


def _materialize_locked(
    root: Path,
    runtime_root: Path,
    items: list[dict[str, Any]],
    skill_items: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Publish one packet while the runtime-owned context directory is locked."""
    identity = [
        {"id": item["id"], "group": item["group"], "path": item["source_path"], "sha256": item["sha256"]}
        for item in items
    ]
    identity.extend(
        {"id": item["id"], "group": "skill", "path": item["source_path"], "sha256": item["sha256"]}
        for item in skill_items
    )
    packet_id = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()[:16]
    destination = runtime_root / f"context-{packet_id}"
    materialized: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        extension = Path(str(item["source_path"])).suffix
        materialized.append({**item, "materialized_path": f"items/{index:03d}-{item['id']}{extension}"})
    materialized_skills = [
        {
            **item,
            "materialized_path": f"skills/{index:03d}-{item['id']}/SKILL.md",
        }
        for index, item in enumerate(skill_items, start=1)
    ]
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        destination.unlink()
    if destination.exists():
        valid = True
        for item in [*materialized, *materialized_skills]:
            if _file_bytes(destination, str(item["materialized_path"])) != item["content"]:
                valid = False
                break
        if valid:
            destination.touch()
            _prune_materializations(runtime_root, destination)
            return destination.relative_to(root).as_posix(), materialized, materialized_skills
        shutil.rmtree(destination)
    temporary = Path(tempfile.mkdtemp(prefix=".context-", dir=runtime_root))
    try:
        for item in [*materialized, *materialized_skills]:
            output = temporary / str(item["materialized_path"])
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(item["content"])
        temporary.rename(destination)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    _prune_materializations(runtime_root, destination)
    return destination.relative_to(root).as_posix(), materialized, materialized_skills


def _prune_abandoned_temporaries(runtime_root: Path) -> None:
    """Remove only staging directories left by interrupted runtime materializations."""
    for path in runtime_root.glob(".context-*"):
        if path.is_symlink() or not path.is_dir():
            continue
        try:
            path.resolve().relative_to(runtime_root.resolve())
        except (OSError, ValueError):
            continue
        shutil.rmtree(path, ignore_errors=True)


def _prune_materializations(runtime_root: Path, current: Path) -> None:
    """Keep only the current packet and the newest bounded runtime-owned predecessors."""
    candidates: list[tuple[int, Path]] = []
    for path in runtime_root.glob("context-*"):
        if path == current or path.is_symlink() or not path.is_dir():
            continue
        try:
            path.resolve().relative_to(runtime_root.resolve())
            modified = path.stat().st_mtime_ns
        except (OSError, ValueError):
            continue
        candidates.append((modified, path))
    candidates.sort(key=lambda item: item[0], reverse=True)
    for _, path in candidates[MAX_CONTEXT_PACKETS - 1 :]:
        shutil.rmtree(path, ignore_errors=True)


def resolve_context(
    root: Path,
    task: str,
    changed_paths: list[str],
    *,
    include_expansion: bool = False,
    include_evaluation_skills: bool = False,
) -> dict[str, Any]:
    """Resolve one route and materialize its bounded local packet for the coordinator."""
    profile = _load_mapping(root / "config/governance/profile.yaml")
    facts = _load_mapping(root / "config/governance/facts.lock.yaml")
    profile_id = profile.get("profile_id")
    if profile_id and facts.get("profile_id") and profile_id != facts.get("profile_id"):
        raise ContextError("profile.yaml and facts.lock.yaml identify different repositories")
    router = profile.get("context_router", {})
    if not isinstance(router, dict):
        raise ContextError("config/governance/profile.yaml: context_router must be a mapping")
    normalized_paths = _unique([_relative_path(path, label="--changed-path") for path in changed_paths])
    decision = _select_route(router, task, normalized_paths)
    route_id, groups, route = _groups(router, decision, include_expansion)
    route_budget = _budget(route)
    items, omissions, limits = _context_items(root, groups, route_budget)
    try:
        index = build_skill_index()
    except SkillCatalogError as error:
        raise ContextError(f"packaged skill catalog is invalid: {error}") from error
    skills, missing_skills, blocked_evaluation, stale_skills = _discover_skills(
        root,
        router,
        route,
        index,
        include_evaluation=include_evaluation_skills,
    )
    selection = _automatic_selection(
        index,
        decision,
        route,
        task,
        normalized_paths,
        _skill_context(facts),
        include_evaluation=include_evaluation_skills,
    )
    composed, composed_missing, composed_stale = _compose_skills(root, selection, skills)
    skills.extend(composed)
    missing_skills.extend(composed_missing)
    stale_skills.extend(composed_stale)
    skill_items, budget_omissions, skill_limits = _bounded_skill_items(skills, route_budget)
    limits.update(skill_limits)
    runtime_path, materialized, materialized_skills = _materialize(root, items, skill_items)
    blockers = _skill_blockers(
        omissions,
        missing_skills,
        blocked_evaluation,
        stale_skills,
        budget_omissions,
        selection,
    )
    outcome = str(decision["outcome"])
    if outcome in {"fallback", "ambiguous"}:
        blockers.append(f"route-{outcome}")
    public_items = [{key: value for key, value in item.items() if key != "content"} for item in materialized]
    public_skills = _public_skills(skills, materialized_skills)
    return {
        "status": "blocked" if blockers else "passed",
        "route": {
            "id": route_id, "outcome": outcome,
            "score": int(decision["selected"]["score"]) if decision["selected"] else 0,
            "reasons": decision["selected"]["reasons"] if decision["selected"] else [],
            "secondary": [
                {"id": entry["route"]["id"], "score": entry["score"], "reasons": entry["reasons"]}
                for entry in decision["secondary"]
            ],
        },
        "changed_paths": normalized_paths,
        "profile_id": profile_id or facts.get("profile_id"),
        "facts_loaded": True,
        "materialization": {"root": runtime_path, "items": public_items, "byte_limits": limits},
        "omissions": omissions,
        "skills": public_skills,
        "skill_omissions": _unique([*missing_skills, *blocked_evaluation, *stale_skills]),
        "skill_selection": {
            "exclusions": selection["exclusions"],
            "unresolved_facts": selection["unresolved_facts"],
            "conflicts": selection["conflicts"],
            "budget_omissions": budget_omissions,
        },
        "external_content": "target-owned provider boundary" if router.get("external_provider") else None,
        "blockers": _unique(blockers),
    }
