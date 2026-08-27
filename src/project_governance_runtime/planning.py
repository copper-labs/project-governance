"""Select the smallest validation pack set for one repository change."""

from __future__ import annotations

import fnmatch
from collections import deque
from typing import Any

from .execution_commands import pack_stage_command_gaps


def _matches(path: str, patterns: list[Any]) -> bool:
    """Match repository globs, treating a leading recursive segment as zero-or-more directories."""
    for value in patterns:
        pattern = str(value)
        if fnmatch.fnmatch(path, pattern):
            return True
        if pattern.startswith("**/") and fnmatch.fnmatch(path, pattern[3:]):
            return True
    return False


def _stage_candidates(
    packs: dict[str, dict[str, Any]], stage: str | None, mode: str
) -> list[str]:
    """Return active packs eligible for a stage or explicit selection."""
    result = []
    for pack_id, pack in packs.items():
        if str(pack.get("implementation_status", "active")) != "active":
            continue
        stages = [str(value) for value in pack.get("stages", [])]
        if mode == "explicit" or stage in stages:
            result.append(pack_id)
    return sorted(result)


def _selected_stage_command_blockers(
    packs: dict[str, dict[str, Any]], selected: set[str], stage: str | None
) -> list[dict[str, Any]]:
    """Block only selected packs that cannot execute at the requested lifecycle stage."""
    if stage is None:
        return []
    return [
        {
            "code": "pack-stage-without-command",
            "pack_id": pack_id,
            "uncovered_stages": [stage],
        }
        for pack_id in sorted(selected)
        if packs[pack_id].get("enforcement") == "blocking"
        if stage in pack_stage_command_gaps(packs[pack_id])
    ]


def _replacement_map(packs: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Return the validated repository-wide built-in ownership transfers."""
    return {
        built_in_id: pack_id
        for pack_id, pack in packs.items()
        for built_in_id in pack.get("replaces_builtin_packs", [])
    }


def _dependency_closure(
    selected: set[str], packs: dict[str, dict[str, Any]], candidates: set[str]
) -> tuple[set[str], dict[str, list[str]]]:
    """Add declared prerequisites and reject unavailable dependencies."""
    prerequisites: dict[str, list[str]] = {}
    pending = deque(sorted(selected))
    while pending:
        pack_id = pending.popleft()
        dependencies = sorted(str(value) for value in packs[pack_id].get("depends_on", []))
        prerequisites[pack_id] = dependencies
        for dependency in dependencies:
            if dependency not in packs:
                raise ValueError(f"pack {pack_id} depends on unknown pack {dependency}")
            if dependency not in candidates:
                raise ValueError(f"pack {pack_id} depends on unavailable pack {dependency}")
            if dependency not in selected:
                selected.add(dependency)
                pending.append(dependency)
    for pack_id in selected:
        prerequisites.setdefault(pack_id, [])
    return selected, prerequisites


def _execution_order(prerequisites: dict[str, list[str]]) -> list[str]:
    """Return a deterministic topological order or reject a dependency cycle."""
    remaining = {key: set(value) for key, value in prerequisites.items()}
    order: list[str] = []
    while remaining:
        ready = sorted(key for key, dependencies in remaining.items() if not dependencies)
        if not ready:
            cycle = ", ".join(sorted(remaining))
            raise ValueError(f"validation pack dependency cycle: {cycle}")
        order.extend(ready)
        for pack_id in ready:
            remaining.pop(pack_id)
        for dependencies in remaining.values():
            dependencies.difference_update(ready)
    return order


def _explicit_selection(
    packs: dict[str, dict[str, Any]], explicit: list[str]
) -> tuple[set[str], dict[str, list[str]], list[dict[str, Any]], dict[str, list[str]]]:
    """Select named packs and report unknown identifiers once."""
    missing = sorted(set(explicit) - set(packs))
    blockers = (
        [{
            "code": "unknown-explicit-pack",
            "message": f"Unknown pack(s): {', '.join(missing)}",
        }]
        if missing
        else []
    )
    selected = set(explicit) - set(missing)
    reasons = {pack_id: ["explicit"] for pack_id in selected}
    return selected, reasons, blockers, {}


def _all_selection(
    candidates: list[str], stage: str | None, replacements: dict[str, str]
) -> tuple[set[str], dict[str, list[str]], list[dict[str, Any]], dict[str, list[str]]]:
    """Select every effective owner and transfer replaced concerns wholesale."""
    blockers = (
        [{"code": "stage-required", "message": "All mode requires a stage."}]
        if stage is None
        else []
    )
    selected = set(candidates) - set(replacements)
    reasons = {pack_id: ["mode:all"] for pack_id in selected}
    for built_in_id, target_id in sorted(replacements.items()):
        if target_id in selected:
            reasons[target_id].append(f"replaces:{built_in_id}")
    return selected, reasons, blockers, {}


def _coverage_blockers(
    gaps: dict[tuple[str, str], list[str]]
) -> list[dict[str, Any]]:
    """Group uncovered replacement paths once per ownership pair."""
    return [
        {
            "code": "replacement-coverage-gap",
            "built_in_pack_id": built_in_id,
            "replacement_pack_id": target_id,
            "paths": sorted(set(paths)),
        }
        for (built_in_id, target_id), paths in sorted(gaps.items())
    ]


def _impacted_selection(
    packs: dict[str, dict[str, Any]],
    candidates: list[str],
    changed_paths: list[str],
    replacements: dict[str, str],
) -> tuple[set[str], dict[str, list[str]], list[dict[str, Any]], dict[str, list[str]]]:
    """Select path owners and supplemental packs, failing once for each unmapped path."""
    selected = {
        pack_id
        for pack_id in candidates
        if pack_id not in replacements
        if str(packs[pack_id].get("run_when", "matched")) == "always"
    }
    reasons = {pack_id: ["run_when:always"] for pack_id in selected}
    path_matches: dict[str, list[str]] = {}
    unknown: list[str] = []
    gaps: dict[tuple[str, str], list[str]] = {}
    for path in sorted(set(changed_paths)):
        raw_matches = sorted(
            pack_id
            for pack_id in candidates
            if _matches(path, packs[pack_id].get("path_globs", []))
        )
        matched = [pack_id for pack_id in raw_matches if pack_id not in replacements]
        path_matches[path] = matched
        path_has_gap = False
        for built_in_id, target_id in replacements.items():
            if built_in_id in raw_matches and target_id not in raw_matches:
                gaps.setdefault((built_in_id, target_id), []).append(path)
                path_has_gap = True
        owners = [
            pack_id
            for pack_id in matched
            if str(packs[pack_id].get("impact_role", "owner")) == "owner"
        ]
        if not owners and not path_has_gap:
            unknown.append(path)
        for pack_id in matched:
            selected.add(pack_id)
            reasons.setdefault(pack_id, []).append(f"path:{path}")
    for built_in_id, target_id in replacements.items():
        if target_id in selected:
            reasons.setdefault(target_id, []).append(f"replaces:{built_in_id}")
    blockers = _coverage_blockers(gaps)
    if unknown:
        blockers.append({
            "code": "unknown-impact",
            "message": "Changed paths have no validation owner.",
            "paths": unknown,
        })
    return selected, reasons, blockers, path_matches


def build_plan(
    packs: dict[str, dict[str, Any]],
    *,
    stage: str | None,
    mode: str,
    changed_paths: list[str],
    explicit_pack_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Build one explainable plan without executing repository commands."""
    explicit = sorted(set(explicit_pack_ids or []))
    candidates = _stage_candidates(packs, stage, mode)
    candidate_set = set(candidates)
    replacements = _replacement_map(packs)
    if mode == "explicit":
        selected, reasons, blockers, path_matches = _explicit_selection(packs, explicit)
    elif mode == "all":
        selected, reasons, blockers, path_matches = _all_selection(
            candidates, stage, replacements
        )
    else:
        selected, reasons, blockers, path_matches = _impacted_selection(
            packs, candidates, changed_paths, replacements
        )
    prerequisites: dict[str, list[str]] = {}
    order: list[str] = []
    if not blockers:
        try:
            selected, prerequisites = _dependency_closure(selected, packs, candidate_set)
            blockers.extend(_selected_stage_command_blockers(packs, selected, stage))
            if not blockers:
                order = _execution_order(prerequisites)
        except ValueError as error:
            blockers.append({"code": "invalid-dependency-graph", "message": str(error)})

    selected_ids = sorted(selected)
    omitted = {}
    for pack_id in candidates:
        if pack_id in selected:
            continue
        omitted[pack_id] = (
            f"replaced by target pack {replacements[pack_id]}"
            if mode != "explicit" and pack_id in replacements
            else "not selected by the requested scope"
        )
    return {
        "status": "blocked" if blockers else "ready",
        "stage": stage,
        "mode": mode,
        "changed_paths": sorted(set(changed_paths)),
        "selected_packs": selected_ids,
        "execution_order": order,
        "selection_reasons": {key: sorted(set(value)) for key, value in sorted(reasons.items())},
        "omitted_packs": omitted,
        "path_matches": path_matches,
        "blockers": blockers,
        "replaced_packs": [
            {
                "built_in_pack_id": built_in_id,
                "replacement_pack_id": target_id,
                "reason": "explicit repository-wide target ownership",
            }
            for built_in_id, target_id in sorted(replacements.items())
        ],
    }


def public_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Hide internal content locators and ranges while retaining useful scope evidence."""
    result = {key: value for key, value in plan.items() if key != "change_scope"}
    scope = plan.get("change_scope")
    if isinstance(scope, dict):
        result["change_scope"] = {
            "kind": scope.get("kind"),
            "version": scope.get("version"),
            "scope": scope.get("scope"),
            "mode": scope.get("mode"),
            "base_ref": scope.get("base_ref"),
            "record_count": len(scope.get("records", [])),
        }
    return result
