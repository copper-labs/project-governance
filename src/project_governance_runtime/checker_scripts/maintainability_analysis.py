#!/usr/bin/env python3
"""Normalize optional facts from language-maintained source analyzers.

The 500-line review trigger applies to architectural source units. Native analyzers identify those
units when their language toolchain is available; physical file size remains the parser-free
fallback, and this module does not invent parsers for other languages.
"""

from __future__ import annotations

import ast
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


ADAPTER_CAPABILITIES = {
    "python-ast": frozenset({
        "type-extents",
        "function-extents",
        "cyclomatic-complexity",
        "cognitive-complexity",
        "nesting-depth",
    }),
    "typescript-compiler": frozenset({"type-extents", "function-extents"}),
    "swift-compiler": frozenset(),
    "kotlin-compiler": frozenset(),
    "shellcheck": frozenset(),
}
KNOWN_CAPABILITIES = frozenset().union(*ADAPTER_CAPABILITIES.values())
CONTROL_NODES = (
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.Try,
    ast.With,
    ast.AsyncWith,
    getattr(ast, "Match", ast.If),
)


class EngineAnalysisFailure(RuntimeError):
    """Separate analyzer infrastructure failure from a source finding."""


def _python_metric(node: ast.FunctionDef | ast.AsyncFunctionDef) -> tuple[int, int, int]:
    """Return readable Python control-flow metrics from its canonical AST."""
    cyclomatic = 1
    cognitive = 0
    max_depth = 0

    def visit(current: ast.AST, depth: int) -> None:
        """Accumulate decisions without entering nested function responsibilities."""
        nonlocal cyclomatic, cognitive, max_depth
        next_depth = depth
        if isinstance(current, CONTROL_NODES):
            cyclomatic += 1
            cognitive += 1 + depth
            next_depth = depth + 1
            max_depth = max(max_depth, next_depth)
        elif isinstance(current, ast.BoolOp):
            increment = max(1, len(current.values) - 1)
            cyclomatic += increment
            cognitive += increment
        for child in ast.iter_child_nodes(current):
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                visit(child, next_depth)

    for statement in node.body:
        visit(statement, 0)
    return cyclomatic, cognitive, max_depth


def _python_analysis(text: str) -> tuple[list[tuple[str, str, int, int]], dict[tuple[str, int], tuple[int, int, int]]]:
    """Return qualified Python declaration extents and function metrics."""
    tree = ast.parse(text)
    extents: list[tuple[str, str, int, int]] = []
    metrics: dict[tuple[str, int], tuple[int, int, int]] = {}

    def visit(node: ast.AST, scope: tuple[str, ...]) -> None:
        """Walk declarations while retaining their stable qualified owner path."""
        next_scope = scope
        if isinstance(node, ast.ClassDef):
            qualified = ".".join((*scope, node.name))
            extents.append(("type", qualified, node.lineno, getattr(node, "end_lineno", node.lineno)))
            next_scope = (*scope, node.name)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            qualified = ".".join((*scope, node.name))
            extents.append(("function", qualified, node.lineno, getattr(node, "end_lineno", node.lineno)))
            metrics[(qualified, node.lineno)] = _python_metric(node)
            next_scope = (*scope, node.name)
        for child in ast.iter_child_nodes(node):
            visit(child, next_scope)

    visit(tree, ())
    return extents, metrics


def _typescript_analysis(path: Path) -> tuple[list[tuple[str, str, int, int]], dict[tuple[str, int], tuple[int, int, int]]] | None:
    """Ask the official TypeScript compiler API for declaration extents."""
    node = shutil.which("node")
    if node is None:
        return None
    helper = Path(__file__).with_name("typescript-maintainability.cjs")
    result = subprocess.run([node, str(helper), str(path)], text=True, capture_output=True, check=False)
    if result.returncode == 2:
        return None
    if result.returncode != 0:
        raise SyntaxError(result.stderr.strip() or "TypeScript compiler rejected the source")
    try:
        facts = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise EngineAnalysisFailure("TypeScript compiler helper returned invalid JSON") from error
    extents = [
        (str(item["kind"]), str(item["name"]), int(item["start"]), int(item["end"]))
        for item in facts.get("extents", [])
    ]
    return extents, {}


def _parse_with_compiler(path: Path, command: list[str], adapter: str) -> tuple[list[tuple[str, str, int, int]], dict[tuple[str, int], tuple[int, int, int]]] | None:
    """Use a language compiler only for syntax validity when no extent API is portable."""
    executable = shutil.which(command[0])
    if executable is None:
        return None
    result = subprocess.run([executable, *command[1:]], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        diagnostic = result.stderr.strip() or result.stdout.strip()
        if adapter == "kotlin-compiler" and not any(
            marker in diagnostic.lower()
            for marker in ("expecting", "unexpected tokens", "syntax error")
        ):
            return [], {}
        raise SyntaxError(diagnostic or f"{adapter} rejected the source")
    return [], {}


def _shellcheck_analysis(path: Path) -> tuple[list[tuple[str, str, int, int]], dict[tuple[str, int], tuple[int, int, int]]] | None:
    """Use ShellCheck's maintained parser and distinguish syntax diagnostics from lint."""
    executable = shutil.which("shellcheck")
    if executable is None:
        return None
    result = subprocess.run([executable, "-f", "json", str(path)], text=True, capture_output=True, check=False)
    try:
        diagnostics = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as error:
        raise EngineAnalysisFailure("ShellCheck returned invalid JSON") from error
    syntax = [item for item in diagnostics if int(item.get("code", 0)) in {1072, 1073, 1074}]
    if syntax:
        raise SyntaxError(str(syntax[0].get("message", "ShellCheck rejected the source")))
    return [], {}


def parsed_source(
    path: Path,
    text: str,
    required_capabilities: frozenset[str] | None = None,
) -> tuple[
    list[tuple[str, str, int, int]],
    dict[tuple[str, int], tuple[int, int, int]],
    str,
    frozenset[str],
] | None:
    """Dispatch through a language-maintained analyzer or leave enrichment optional."""
    suffix = path.suffix.lower()
    if suffix == ".py":
        facts = _python_analysis(text)
        adapter = "python-ast"
    elif suffix in {".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}:
        facts = _typescript_analysis(path)
        adapter = "typescript-compiler"
    elif suffix == ".swift":
        facts = _parse_with_compiler(path, ["swiftc", "-frontend", "-parse", str(path)], "swift-compiler")
        adapter = "swift-compiler"
    elif suffix in {".kt", ".kts"}:
        with tempfile.TemporaryDirectory(prefix="governance-kotlin-") as directory:
            facts = _parse_with_compiler(path, ["kotlinc", str(path), "-d", directory], "kotlin-compiler")
        adapter = "kotlin-compiler"
    elif suffix == ".sh":
        facts = _shellcheck_analysis(path)
        adapter = "shellcheck"
    else:
        return None
    if facts is None:
        return None
    extents, metrics = facts
    capabilities = ADAPTER_CAPABILITIES[adapter]
    if required_capabilities and not required_capabilities.issubset(capabilities):
        return extents, metrics, adapter, capabilities
    return extents, metrics, adapter, capabilities


def function_metric_violations(
    metrics: tuple[int, int, int],
    capabilities: frozenset[str],
    limits: tuple[int, int, int],
) -> list[tuple[str, int, int, str]]:
    """Return only metrics the selected native adapter actually supports."""
    cyclomatic, cognitive, nesting = metrics
    cyclomatic_limit, cognitive_limit, nesting_limit = limits
    candidates = (
        ("cyclomatic-complexity", "quality.high-cyclomatic", cyclomatic, cyclomatic_limit, "Function has too many independent decision paths; simplify or split by responsibility."),
        ("cognitive-complexity", "quality.high-cognitive", cognitive, cognitive_limit, "Function control flow is difficult to follow in one reading."),
        ("nesting-depth", "quality.deep-nesting", nesting, nesting_limit, "Function nesting exceeds the readable control-flow limit."),
    )
    return [
        (rule_id, actual, threshold, message)
        for capability, rule_id, actual, threshold, message in candidates
        if capability in capabilities and actual > threshold
    ]
