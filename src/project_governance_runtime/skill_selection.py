"""Select the smallest manifest-declared skill set from explicit target facts and task signals."""

from __future__ import annotations

import fnmatch
import re
from typing import Any

from .skill_catalog import SkillCatalogError


def _strings(value: Any, *, owner: str) -> list[str]:
    """Normalize one manifest list without accepting executable selector shapes."""
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise SkillCatalogError(f"{owner}: expected a list of strings")
    return list(dict.fromkeys(value))


def _fact_rules(value: Any, *, owner: str) -> dict[str, list[str]]:
    """Normalize one shallow fact-to-allowed-values selector mapping."""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise SkillCatalogError(f"{owner}: expected a mapping")
    return {
        str(field): _strings(allowed, owner=f"{owner}.{field}")
        for field, allowed in value.items()
    }


def _fact_values(facts: dict[str, Any], field: str) -> list[str]:
    """Read only explicit list-valued fact data; malformed values behave as unresolved."""
    value = facts.get(field)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _term_matches(task: str, term: str) -> bool:
    """Match a declared task term at a stable token boundary."""
    pattern = r"(?<![A-Za-z0-9_-])" + re.escape(term.lower()) + r"(?![A-Za-z0-9_-])"
    return re.search(pattern, task.lower()) is not None


def _trigger_reasons(
    applicability: dict[str, Any],
    task: str,
    changed_paths: list[str],
    facts: dict[str, Any],
    owner: str,
) -> tuple[list[str], bool]:
    """Collect shallow task, path, and fact overlap signals for one skill."""
    reasons: list[str] = []
    task_terms = _strings(applicability.get("task_terms"), owner=f"{owner}.task_terms")
    path_globs = _strings(applicability.get("path_globs"), owner=f"{owner}.path_globs")
    fact_terms = _fact_rules(applicability.get("fact_terms"), owner=f"{owner}.fact_terms")
    reasons.extend(f"task:{term}" for term in task_terms if _term_matches(task, term))
    for path in changed_paths:
        matching = next((pattern for pattern in path_globs if fnmatch.fnmatch(path, pattern)), None)
        if matching:
            reasons.append(f"path:{path}->{matching}")
    for field, allowed in fact_terms.items():
        overlap = [value for value in _fact_values(facts, field) if value in allowed]
        reasons.extend(f"fact:{field}={value}" for value in overlap)
    return reasons, bool(task_terms or path_globs or fact_terms)


def _required_facts(
    applicability: dict[str, Any], facts: dict[str, Any], owner: str
) -> tuple[list[str], list[str], list[str]]:
    """Return required-fact reasons, missing fields, and explicit mismatches."""
    reasons: list[str] = []
    missing: list[str] = []
    mismatched: list[str] = []
    rules = _fact_rules(applicability.get("require_facts"), owner=f"{owner}.require_facts")
    for field, allowed in rules.items():
        actual = _fact_values(facts, field)
        if not actual:
            missing.append(field)
            continue
        overlap = [value for value in actual if value in allowed]
        if not overlap:
            mismatched.append(field)
            continue
        reasons.extend(f"required-fact:{field}={value}" for value in overlap)
    return reasons, missing, mismatched


def _excluded_fact_reason(
    applicability: dict[str, Any], facts: dict[str, Any], owner: str
) -> str | None:
    """Return the first deterministic exclusion overlap, if any."""
    rules = _fact_rules(applicability.get("exclude_facts"), owner=f"{owner}.exclude_facts")
    for field, excluded in rules.items():
        match = next((value for value in _fact_values(facts, field) if value in excluded), None)
        if match is not None:
            return f"excluded-fact:{field}={match}"
    return None


def _evaluate_skill(
    record: dict[str, Any],
    task: str,
    changed_paths: list[str],
    facts: dict[str, Any],
    include_evaluation: bool,
) -> tuple[list[str] | None, str | None, list[str]]:
    """Evaluate one flat applicability declaration without nested policy expressions."""
    skill_id = str(record["id"])
    owner = f"skill {skill_id}.applicability"
    applicability = record.get("applicability", {})
    if not applicability:
        return None, "no-applicability", []
    exclusion = _excluded_fact_reason(applicability, facts, owner)
    if exclusion:
        return None, exclusion, []
    trigger_reasons, has_triggers = _trigger_reasons(
        applicability, task, changed_paths, facts, owner
    )
    if has_triggers and not trigger_reasons:
        return None, "no-trigger", []
    if record.get("activation_mode") == "evaluation-only" and not include_evaluation:
        return None, "activation-mode:evaluation-only", []
    required_reasons, missing, mismatched = _required_facts(applicability, facts, owner)
    if missing:
        return None, "missing-required-fact", missing
    if mismatched:
        return None, f"required-fact-mismatch:{','.join(mismatched)}", []
    level = record.get("default_level")
    if level not in {"required", "recommended"}:
        return None, f"activation-level:{level}", []
    return [*required_reasons, *trigger_reasons], None, []


def select_attached_skills(
    index: dict[str, dict[str, Any]],
    router_ids: list[str],
    task: str,
    changed_paths: list[str],
    facts: dict[str, Any],
    *,
    include_evaluation: bool = False,
) -> dict[str, Any]:
    """Select applicable leaves from packs attached to route-local router skills."""
    pack_ids: list[str] = []
    for router_id in router_ids:
        router = index.get(router_id)
        if router:
            pack_ids.extend(str(value) for value in router.get("router_for", []))
    pack_ids = list(dict.fromkeys(pack_ids))
    selected: list[dict[str, Any]] = []
    exclusions: list[dict[str, str]] = []
    unresolved: list[str] = []
    for record in index.values():
        if record.get("pack_id") not in pack_ids:
            continue
        reasons, exclusion, missing = _evaluate_skill(
            record, task, changed_paths, facts, include_evaluation
        )
        unresolved.extend(missing)
        if exclusion:
            exclusions.append({"id": str(record["id"]), "reason": exclusion})
        elif reasons is not None:
            selected.append({**record, "selection_reasons": reasons})
    selected_ids = {str(record["id"]) for record in selected}
    conflicts = [
        f"{record['id']}:{conflict}"
        for record in selected
        for conflict in record.get("conflicts", [])
        if conflict in selected_ids
    ]
    return {
        "selected": selected,
        "exclusions": exclusions,
        "unresolved_facts": list(dict.fromkeys(unresolved)),
        "conflicts": list(dict.fromkeys(conflicts)),
    }
