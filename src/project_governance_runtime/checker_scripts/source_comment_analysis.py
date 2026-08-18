#!/usr/bin/env python3
"""Responsibility: Analyze source-comment structure through proven language adapters.

Context: The comment-quality entrypoint supplies governed policy and file selections while this
module owns normalized findings, Python AST parsing, advisory fallback, and fixture proof.
"""

from __future__ import annotations

import ast
import fnmatch
import os
import re
import sys
from pathlib import Path
from typing import Any

from kotlin_source_parser import PARSER_VERSION as KOTLIN_PARSER_VERSION

SOURCE_FAMILIES = {
    ".py": "python",
    ".kt": "kotlin", ".kts": "kotlin", ".java": "java",
    ".swift": "swift",
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".cs": "csharp", ".dart": "dart", ".go": "go", ".rs": "rust",
    ".c": "c-family", ".h": "c-family", ".cpp": "c-family", ".hpp": "c-family",
}
SUPPORTED_ANALYZER_VERSIONS = {
    ("python", "python-ast"): "stdlib-3.9+",
    ("kotlin", "kotlin-token-parser"): {
        "governance-v3",
        "governance-v5",
        KOTLIN_PARSER_VERSION,
    },
}


def analyzer_version_supported(family: str, analyzer: str, declared: Any) -> bool:
    """Return whether an active adapter declares the analyzer version this checker proves."""
    supported = SUPPORTED_ANALYZER_VERSIONS.get((family, analyzer))
    if isinstance(supported, set):
        matches = declared in supported
    else:
        matches = declared == supported
    if not matches:
        return False
    return family != "python" or sys.version_info >= (3, 9)


def matches_any(path: str, patterns: list[Any]) -> bool:
    """Return whether a path matches one of the configured repository globs."""
    return any(fnmatch.fnmatch(path, str(pattern)) for pattern in patterns)


def range_touched(selection: dict[str, Any], start: int, end: int) -> bool:
    """Return whether a declaration intersects an enforced changed range."""
    if selection.get("enforce_all"):
        return True
    return any(start <= range_end and end >= range_start for range_start, range_end in selection.get("ranges", []))


def normalized_comment(raw: str) -> str:
    """Remove common documentation delimiters while preserving paragraphs."""
    lines = []
    for line in raw.splitlines():
        line = re.sub(r"^\s*(?:/\*\*?|\*/|///?|//!|#)\s?", "", line)
        line = re.sub(r"^\s*\*\s?", "", line)
        lines.append(line.rstrip())
    return "\n".join(lines).strip()


def comment_before(lines: list[str], line_number: int) -> str:
    """Return the contiguous comment immediately before a one-based line number."""
    index = line_number - 2
    while index >= 0 and not lines[index].strip():
        index -= 1
    if index < 0:
        return ""
    collected: list[str] = []
    if lines[index].lstrip().startswith(("//", "#")):
        while index >= 0 and lines[index].lstrip().startswith(("//", "#")):
            collected.append(lines[index])
            index -= 1
        return normalized_comment("\n".join(reversed(collected)))
    if "*/" in lines[index]:
        while index >= 0:
            collected.append(lines[index])
            if "/**" in lines[index] or "/*" in lines[index]:
                break
            index -= 1
        return normalized_comment("\n".join(reversed(collected)))
    return ""


def paragraphs(comment: str) -> list[str]:
    """Split documentation into nonempty prose blocks for deterministic type-shape checks."""
    return [part.strip() for part in re.split(r"\n\s*\n", comment) if part.strip()]


def useful_words(comment: str) -> int:
    """Count prose words for advisory minimum-shape checks."""
    return len(re.findall(r"[A-Za-z][A-Za-z'-]+", comment))


def add(
    findings: list[dict[str, Any]],
    rule_id: str,
    path: Path,
    line: int,
    message: str,
    severity: str = "blocking",
    *,
    adapter_id: str = "",
    declaration: str = "",
) -> None:
    """Append one normalized source-comment finding."""
    item = {"rule_id": rule_id, "path": path.as_posix(), "line": line, "severity": severity, "message": message}
    if adapter_id:
        item["adapter_id"] = adapter_id
    if declaration:
        item["declaration"] = declaration
    findings.append(item)


def advisory_prose(comment: str, path: Path, line: int, findings: list[dict[str, Any]], adapter_id: str, declaration: str = "") -> None:
    """Report narrow plain-language heuristics without turning prose judgment into a gate."""
    lowered = comment.lower().strip()
    framing = ("this class ", "this method ", "this function ", "this file ", "this module ")
    vague = re.search(r"\b(?:handles|manages|processes)\b", lowered)
    long_sentence = any(useful_words(sentence) > 35 for sentence in re.split(r"[.!?]+", comment))
    if lowered.startswith(framing) or vague or long_sentence:
        add(
            findings,
            "SC011",
            path,
            line,
            "Use direct, concrete language and explain the owned decision or outcome.",
            "advisory",
            adapter_id=adapter_id,
            declaration=declaration,
        )


def validate_overview(
    comment: str,
    path: Path,
    findings: list[dict[str, Any]],
    policy: dict[str, Any],
    adapter_id: str,
    *,
    blocking: bool,
) -> None:
    """Validate file orientation fields and optional boundary insight."""
    severity = "blocking" if blocking else "advisory"
    if not comment:
        add(findings, "SC002", path, 1, "Add a file overview that states this file's responsibility.", severity, adapter_id=adapter_id, declaration="<file>")
        add(findings, "SC003", path, 1, "Add the workflow or relationship context a new reader needs.", severity, adapter_id=adapter_id, declaration="<file>")
        if matches_any(path.as_posix(), policy.get("boundary_globs", [])):
            add(findings, "SC004", path, 1, "Add the boundary, invariant, or tradeoff this file must preserve.", severity, adapter_id=adapter_id, declaration="<file>")
        return
    lowered = comment.lower()
    if policy.get("require_overview_labels", True) and "responsibility:" not in lowered:
        add(findings, "SC002", path, 1, "The file overview must include a plain-language 'Responsibility:' statement.", severity, adapter_id=adapter_id, declaration="<file>")
    if policy.get("require_overview_labels", True) and "context:" not in lowered:
        add(findings, "SC003", path, 1, "The file overview must include 'Context:' with the insight a new reader needs.", severity, adapter_id=adapter_id, declaration="<file>")
    if matches_any(path.as_posix(), policy.get("boundary_globs", [])):
        match = re.search(r"\bboundary:\s*([^\n]+)", comment, re.IGNORECASE)
        value = match.group(1).strip().lower() if match else ""
        if not value or value in {"none", "n/a", "na", "not applicable"}:
            add(findings, "SC004", path, 1, "State the boundary, invariant, or tradeoff instead of using a placeholder.", severity, adapter_id=adapter_id, declaration="<file>")
    if useful_words(comment) < int(policy.get("minimum_overview_words", 16)):
        add(findings, "SC011", path, 1, "The file overview may be too brief to explain responsibility and context.", "advisory", adapter_id=adapter_id, declaration="<file>")
    advisory_prose(comment, path, 1, findings, adapter_id, "<file>")


def validate_declaration(
    comment: str,
    path: Path,
    line: int,
    kind: str,
    name: str,
    findings: list[dict[str, Any]],
    type_detail: bool,
    adapter_id: str,
    declaration_id: str,
    blocking: bool,
    require_type_context: bool,
) -> None:
    """Emit structural and advisory findings for one public API comment."""
    severity = "blocking" if blocking else "advisory"
    if not comment:
        add(findings, "SC005", path, line, f"Document public {kind} '{name}' in simple language.", severity, adapter_id=adapter_id, declaration=declaration_id)
        return
    minimum = 5
    if useful_words(comment) < minimum:
        add(findings, "SC011", path, line, f"The comment for '{name}' may be too brief to explain its responsibility.", "advisory", adapter_id=adapter_id, declaration=declaration_id)
    if type_detail and require_type_context and len(paragraphs(comment)) < 2:
        add(findings, "SC006", path, line, f"Give '{name}' a summary paragraph and a context/relationship paragraph.", severity, adapter_id=adapter_id, declaration=declaration_id)
    normalized_name = re.sub(r"(?<!^)(?=[A-Z])|_", " ", name).lower().split()
    comment_words = set(re.findall(r"[a-z]+", comment.lower()))
    if normalized_name and set(normalized_name).issubset(comment_words) and useful_words(comment) <= len(normalized_name) + 3:
        add(findings, "SC007", path, line, f"The comment for '{name}' mainly restates its name.", severity, adapter_id=adapter_id, declaration=declaration_id)
    advisory_prose(comment, path, line, findings, adapter_id, declaration_id)


def python_declaration_identity(
    node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef, owner: str = ""
) -> str:
    """Return a parameter-independent qualified symbol for findings and waivers."""
    return f"{owner}.{node.name}" if owner else node.name


def python_header_range(
    node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef,
) -> tuple[int, int]:
    """Return the parser-backed decorator and declaration-signature extent."""
    decorators = getattr(node, "decorator_list", [])
    start = min([node.lineno, *(item.lineno for item in decorators)])
    first_body_line = node.body[0].lineno if node.body else node.end_lineno or node.lineno
    return start, max(node.lineno, first_body_line - 1)


def python_declaration_identities(tree: ast.Module, *, include_private: bool) -> set[str]:
    """Collect governed declaration keys from one before-image syntax tree."""
    identities: set[str] = set()
    for node in tree.body:
        governed = include_private or not getattr(node, "name", "").startswith("_")
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and governed:
            identities.add(python_declaration_identity(node))
        if isinstance(node, ast.ClassDef) and governed:
            for member in node.body:
                if (
                    isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and (include_private or not member.name.startswith("_"))
                ):
                    identities.add(python_declaration_identity(member, node.name))
    return identities


def validate_python_node(
    node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef,
    path: Path,
    findings: list[dict[str, Any]],
    selection: dict[str, Any],
    policy: dict[str, Any],
    before_identities: set[str] | None,
    owner: str = "",
) -> None:
    """Route one public Python declaration into the normalized comment contract."""
    is_type = isinstance(node, ast.ClassDef)
    identity = python_declaration_identity(node, owner)
    header_start, header_end = python_header_range(node)
    validate_declaration(
        ast.get_docstring(node, clean=False) or "",
        path,
        node.lineno,
        "type" if is_type else "method" if owner else "function",
        node.name,
        findings,
        is_type,
        "python",
        identity,
        (
            before_identities is not None and identity not in before_identities
        ) or range_touched(selection, header_start, header_end),
        bool(policy.get("require_type_context_paragraph", False)),
    )


def python_before_identities(
    selection: dict[str, Any], *, include_private: bool
) -> set[str] | None:
    """Parse the exact before-image solely to distinguish newly introduced symbols."""
    before_path = selection.get("before_path")
    if not isinstance(before_path, Path) or not before_path.is_file():
        return None
    try:
        tree = ast.parse(before_path.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError:
        return None
    return python_declaration_identities(tree, include_private=include_private)


def validate_python_declarations(
    tree: ast.Module,
    path: Path,
    findings: list[dict[str, Any]],
    selection: dict[str, Any],
    policy: dict[str, Any],
    before_identities: set[str] | None,
    *,
    include_private: bool,
) -> None:
    """Validate governed top-level declarations and their directly owned methods."""
    for node in tree.body:
        governed = include_private or not getattr(node, "name", "").startswith("_")
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and governed:
            validate_python_node(node, path, findings, selection, policy, before_identities)
        if not isinstance(node, ast.ClassDef) or not governed:
            continue
        for member in node.body:
            member_governed = include_private or not getattr(member, "name", "").startswith("_")
            if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)) and member_governed:
                validate_python_node(
                    member, path, findings, selection, policy, before_identities, node.name
                )


def python_findings(path: Path, text: str, policy: dict[str, Any], selection: dict[str, Any]) -> list[dict[str, Any]]:
    """Return AST-backed Python findings for one selected source file."""
    findings: list[dict[str, Any]] = []
    try:
        tree = ast.parse(text)
    except SyntaxError as exc:
        add(findings, "SC010", path, exc.lineno or 1, f"Python adapter could not parse the file: {exc.msg}")
        return findings
    include_private = matches_any(path.as_posix(), policy.get("boundary_globs", []))
    before_identities = python_before_identities(selection, include_private=include_private)
    validate_overview(ast.get_docstring(tree, clean=False) or "", path, findings, policy, "python", blocking=bool(selection.get("overview_blocking")))
    validate_python_declarations(
        tree,
        path,
        findings,
        selection,
        policy,
        before_identities,
        include_private=include_private,
    )
    return findings


def downgrade_to_advisory(findings: list[dict[str, Any]]) -> None:
    """Keep findings visible without allowing an advisory surface to block."""
    for finding in findings:
        if finding.get("severity") == "blocking" and finding.get("rule_id") not in {"SC001", "SC010"}:
            finding["severity"] = "advisory"


def generic_findings(path: Path, text: str, policy: dict[str, Any], family: str) -> list[dict[str, Any]]:
    """Inspect only a file overview when a planned language opts into advisory fallback."""
    lines = text.splitlines()
    first_code = next(
        (index + 1 for index, line in enumerate(lines) if line.strip() and not line.lstrip().startswith(("//", "/*", "*", "#"))),
        len(lines) + 1,
    )
    findings: list[dict[str, Any]] = []
    validate_overview(comment_before(lines, first_code), path, findings, policy, family, blocking=False)
    return findings


def adapter_findings(
    family: str,
    adapter: dict[str, Any],
    path: Path,
    text: str,
    policy: dict[str, Any],
    selection: dict[str, Any],
) -> list[dict[str, Any]]:
    """Dispatch one source file to its registered active adapter."""
    if family == "python" and adapter.get("analyzer") == "python-ast":
        return python_findings(path, text, policy, selection)
    if family == "kotlin" and adapter.get("analyzer") == "kotlin-token-parser":
        from kotlin_comment_analysis import kotlin_findings

        kotlin_policy = dict(policy)
        if adapter.get("analyzer_version") in {"governance-v3", "governance-v5"}:
            kotlin_policy["require_type_context_paragraph"] = True
        return kotlin_findings(path, text, kotlin_policy, selection)
    result: list[dict[str, Any]] = []
    add(result, "SC010", path, 1, f"Active adapter claim for {family} has no matching checker implementation.")
    return result


def resolved_fixture_path(path: Path) -> Path:
    """Resolve active adapter fixtures from the package-owned fixture directory."""
    packaged = os.environ.get("PROJECT_GOVERNANCE_COMMENT_FIXTURES", "").strip()
    if packaged:
        return Path(packaged) / path.name
    return path


def fixture_proof(adapters: dict[str, dict[str, Any]], policy: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Execute every active adapter fixture and compare exact blocking outcomes."""
    findings: list[dict[str, Any]] = []
    coverage: dict[str, int] = {}
    for family, adapter in sorted(adapters.items()):
        if adapter.get("status") != "active":
            continue
        for case in adapter.get("fixture_cases", []):
            if not isinstance(case, dict):
                continue
            path = resolved_fixture_path(Path(str(case.get("path", ""))))
            if not path.is_file():
                add(findings, "SC010", path, 1, f"Adapter fixture '{case.get('id', '')}' is missing.")
                continue
            fixture_policy = dict(policy)
            if case.get("boundary_required") is True:
                fixture_policy["boundary_globs"] = [path.as_posix()]
            selection = {"enforce_all": True, "overview_blocking": True, "ranges": [], "advisory_only": False}
            actual = adapter_findings(family, adapter, path, path.read_text(encoding="utf-8", errors="replace"), fixture_policy, selection)
            actual_ids = sorted(item["rule_id"] for item in actual if item.get("severity") == "blocking")
            expected_ids = sorted(str(value) for value in case.get("expected_blocking_rule_ids", []))
            coverage[family] = coverage.get(family, 0) + 1
            if actual_ids != expected_ids:
                add(
                    findings, "SC010", path, 1,
                    f"Adapter fixture '{case.get('id', '')}' expected blocking rules {expected_ids} but produced {actual_ids}.",
                )
    return findings, coverage
