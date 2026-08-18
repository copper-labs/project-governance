"""Analyze Kotlin documentation against effective declaration visibility.

The generic dispatcher owns result normalization while this module owns Kotlin KDoc attachment,
qualified identities, enclosing-type visibility, and changed-signature ratcheting.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from kotlin_source_parser import Declaration, declarations
from source_comment_analysis import (
    comment_before,
    matches_any,
    normalized_comment,
    range_touched,
    validate_declaration,
    validate_overview,
)


DECLARATION_MODIFIERS = frozenset(
    {
        "abstract", "actual", "annotation", "companion", "const", "crossinline", "data", "enum",
        "expect", "external", "final", "fun", "infix", "inline", "inner", "internal", "lateinit",
        "noinline", "open", "operator", "override", "private", "protected", "public", "reified",
        "sealed", "suspend", "tailrec", "value", "vararg",
    }
)


def attached_kdoc(text: str, offset: int) -> str:
    """Return KDoc only when modifiers or annotations alone separate it from a declaration."""
    matches = list(re.finditer(r"/\*\*.*?\*/", text[:offset], re.DOTALL))
    if not matches:
        return ""
    match = matches[-1]
    between = text[match.end():offset]
    between = re.sub(r"@[A-Za-z_]\w*(?:\s*\([^)]*\))?", "", between, flags=re.DOTALL)
    between = re.sub(
        r"\b[A-Za-z_]\w*\b",
        lambda found: "" if found.group(0) in DECLARATION_MODIFIERS else found.group(0),
        between,
    )
    return normalized_comment(match.group(0)) if not between.strip() else ""


def containers(declaration: Declaration, types: list[Declaration]) -> list[Declaration]:
    """Return named types that lexically enclose one declaration."""
    return sorted(
        (
            item
            for item in types
            if item is not declaration and item.line <= declaration.line <= item.end_line
        ),
        key=lambda item: (item.line, -item.end_line),
    )


def identity(declaration: Declaration, owners: list[Declaration]) -> str:
    """Build the qualified declaration key used by ratcheting and waivers."""
    owner = ".".join(item.name for item in owners)
    return f"{owner}.{declaration.signature}" if owner else declaration.signature


def declaration_records(text: str) -> list[tuple[Declaration, str, bool]]:
    """Return declarations with qualified identities and effective external visibility."""
    parsed = declarations(text)
    types = [item for item in parsed if item.kind == "type"]
    records = []
    for declaration in parsed:
        owners = containers(declaration, types)
        effectively_public = declaration.public and all(item.public for item in owners)
        records.append((declaration, identity(declaration, owners), effectively_public))
    return records


def before_identities(
    selection: dict[str, Any], *, include_private: bool
) -> set[str] | None:
    """Read the exact before-image to distinguish new Kotlin declarations."""
    before_path = selection.get("before_path")
    if not isinstance(before_path, Path) or not before_path.is_file():
        return None
    records = declaration_records(before_path.read_text(encoding="utf-8", errors="replace"))
    return {
        declaration_id
        for _, declaration_id, effectively_public in records
        if include_private or effectively_public
    }


def kotlin_findings(
    path: Path,
    text: str,
    policy: dict[str, Any],
    selection: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return token-parser-backed findings for effectively public Kotlin declarations."""
    findings: list[dict[str, Any]] = []
    lines = text.splitlines()
    first_code = next(
        (
            index + 1
            for index, line in enumerate(lines)
            if line.strip() and not line.lstrip().startswith(("//", "/*", "*"))
        ),
        len(lines) + 1,
    )
    validate_overview(
        comment_before(lines, first_code),
        path,
        findings,
        policy,
        "kotlin",
        blocking=bool(selection.get("overview_blocking")),
    )
    include_private = matches_any(path.as_posix(), policy.get("boundary_globs", []))
    previous = before_identities(selection, include_private=include_private)
    for declaration, declaration_id, effectively_public in declaration_records(text):
        if not (include_private or effectively_public):
            continue
        validate_declaration(
            attached_kdoc(text, declaration.offset),
            path,
            declaration.line,
            declaration.kind,
            declaration.name,
            findings,
            declaration.kind == "type",
            "kotlin",
            declaration_id,
            (previous is not None and declaration_id not in previous)
            or range_touched(selection, declaration.line, declaration.header_end_line),
            bool(policy.get("require_type_context_paragraph", False)),
        )
    return findings
