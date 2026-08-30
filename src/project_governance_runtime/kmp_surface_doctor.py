"""Diagnose the optional KMP graph, pack wiring, and agent discoverability.

The module preserves doctor's string finding envelope while reusing the surface validator for graph
structure and reference checks.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .configuration import ConfigurationError, load_yaml
from .kmp_surface_validation import (
    GRAPH_PATH,
    REFERENCE_RULE,
    STANDARD_PACK_ID,
    STRUCTURE_RULE,
    validate_kmp_surface,
)
from .planning import _matches
from .structured_documents import (
    DOCUMENT_MAX_BYTES,
    StructuredDocumentError,
    load_structured_document,
)
from .validation_subject import ValidationSubject, ValidationSubjectError


def _active_invocations(packs: dict[str, dict[str, Any]]) -> list[str]:
    """Return one pack ID per active built-in invocation."""
    return [
        pack_id
        for pack_id, pack in sorted(packs.items())
        if str(pack.get("implementation_status", "active")) == "active"
        for command in pack.get("commands", [])
        if isinstance(command, dict)
        and command.get("builtin") == "kmp-surface-validation"
    ]


def _catalog_path(subject: ValidationSubject) -> str | None:
    """Read the graph's catalog reference only after bounded decoding."""
    try:
        data = subject.read_bytes(GRAPH_PATH, limit=DOCUMENT_MAX_BYTES)
        graph = load_structured_document(data, format_name="yaml")
    except (ValidationSubjectError, StructuredDocumentError):
        return None
    value = graph.get("target_catalog") if isinstance(graph, dict) else None
    return value if isinstance(value, str) else None


def _route_selects_kmp(root: Path) -> bool:
    """Require route-local KMP enablement because defaults cannot compose leaves."""
    try:
        profile = load_yaml(root / "config/governance/profile.yaml")
    except (ConfigurationError, OSError):
        return False
    router = profile.get("context_router")
    routes = router.get("routes", []) if isinstance(router, dict) else []
    return isinstance(routes, list) and any(
        isinstance(route, dict)
        and isinstance(route.get("skills"), list)
        and "kmp-implementation" in route["skills"]
        for route in routes
    )


def _render_finding(finding: dict[str, Any]) -> str:
    """Project a pack finding into doctor's existing string envelope."""
    coordinates = [
        str(finding[key])
        for key in ("area_id", "target_id", "path")
        if finding.get(key)
    ]
    location = f" ({', '.join(coordinates)})" if coordinates else ""
    return f"{finding['rule_id']}{location}: {finding['message']}"


def kmp_surface_doctor_findings(
    root: Path, packs: dict[str, dict[str, Any]]
) -> list[str]:
    """Return feature findings only when one active pack invokes the built-in."""
    invocations = _active_invocations(packs)
    if not invocations:
        return []
    findings: list[str] = []
    if invocations != [STANDARD_PACK_ID]:
        findings.append(
            "kmp surface validation must have exactly one active invocation in pack "
            f"{STANDARD_PACK_ID}; found {', '.join(invocations)}"
        )
    if STANDARD_PACK_ID not in invocations:
        return findings

    subject = ValidationSubject.live_checkout(root)
    result = validate_kmp_surface(root, subject=subject, include_gaps=False)
    findings.extend(
        _render_finding(item)
        for item in result["findings"]
        if item.get("rule_id") in {STRUCTURE_RULE, REFERENCE_RULE}
    )
    catalog_path = _catalog_path(subject)
    pack = packs[STANDARD_PACK_ID]
    patterns = list(pack.get("path_globs", []))
    for path in [GRAPH_PATH, catalog_path]:
        if path and not _matches(path, patterns):
            findings.append(
                f"pack {STANDARD_PACK_ID} path_globs do not select {path}"
            )
    if not _route_selects_kmp(root):
        findings.append(
            "an adopter context route must select kmp-implementation in route.skills"
        )
    return findings
