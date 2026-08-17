#!/usr/bin/env python3
"""Report advisory lexical test-quality signals for selected test files."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

from finding_lifecycle import finding_summary
from governance_changed_paths import changed_path_views


ROOT = Path.cwd()
TEST_SUFFIXES = {
    ".py", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".kt", ".kts",
}
SKIP_PARTS = {".git", ".venv", "node_modules", "build", "dist", "__pycache__"}
TEST_SUPPORT_PARTS = {"fixtures", "helpers", "support"}
ASSERTION_RE = re.compile(
    r"\b(expect|assert(?:[A-Z_][A-Za-z0-9_]*)?|pytest\.raises|raises|toThrow|should|must|XCTAssert[A-Za-z0-9_]*)\b"
)
HOLLOW_TEST_RE = re.compile(
    r"\b(getters?|setters?|constructors?|pass[-_ ]?through|accessors?)\b",
    re.IGNORECASE,
)
BEHAVIOR_RE = re.compile(
    r"\b(behavior|contract|scenario|failure|reject|block|validate|scope|authority|audit|"
    r"observability|idempotent|retry|persist|state|transition|error)\b",
    re.IGNORECASE,
)


def is_test_file(path: Path) -> bool:
    """Return whether a repository-relative path names a source test file."""
    name = path.name
    stem = path.stem
    parts = path.parts
    explicit_test_name = (
        ".test." in name
        or ".spec." in name
        or name.startswith("test_")
        or stem.lower().endswith("_test")
        or stem.endswith(("Test", "Tests", "TestCase"))
    )
    under_test_directory = any(
        part in {"test", "tests", "__tests__"}
        for part in parts[:-1]
    )
    under_support_directory = bool(TEST_SUPPORT_PARTS.intersection(parts[:-1]))
    return (
        path.suffix in TEST_SUFFIXES
        and not SKIP_PARTS.intersection(parts)
        and (explicit_test_name or (under_test_directory and not under_support_directory))
    )


def finding(rule_id: str, severity: str, path: Path | str, message: str) -> dict[str, str]:
    """Build one stable structured test-quality finding."""
    identity = path.as_posix() if isinstance(path, Path) else path
    return {"rule_id": rule_id, "severity": severity, "path": identity, "message": message}


def mode_for(arguments: argparse.Namespace) -> str:
    """Translate the checker command surface to one selection mode."""
    if arguments.staged:
        return "staged"
    if arguments.changed:
        return "changed"
    return "all"


def all_path_views(paths: list[str]) -> list[tuple[Path, Path]]:
    """Scan checkout bytes for explicit all mode without requiring a Git worktree."""
    if paths:
        candidates = [Path(value) for value in paths]
    else:
        try:
            candidates = [
                Path(repository_path)
                for repository_path, _content_path, _is_new in changed_path_views("all")
            ]
        except RuntimeError:
            if git_metadata_present():
                raise
            candidates = [path.relative_to(ROOT) for path in ROOT.rglob("*")]
    root = ROOT.resolve()
    views: set[tuple[Path, Path]] = set()
    for path in candidates:
        if path.is_absolute() or ".." in path.parts:
            if paths:
                raise ValueError(f"unsafe checkout path: {path}")
            continue
        content_path = ROOT / path
        try:
            content_path.resolve().relative_to(root)
        except (OSError, ValueError):
            if paths:
                raise ValueError(f"checkout path escapes repository root: {path}")
            continue
        if content_path.is_symlink() or not content_path.is_file():
            continue
        if is_test_file(path):
            views.add((path, content_path))
    return sorted(
        views,
        key=lambda item: item[0].as_posix(),
    )


def git_metadata_present() -> bool:
    """Distinguish a non-Git all-mode fallback from inaccessible Git metadata."""
    if os.environ.get("GIT_DIR"):
        return True
    for directory in (ROOT, *ROOT.parents):
        try:
            (directory / ".git").lstat()
            return True
        except FileNotFoundError:
            continue
        except OSError:
            return True
    return False


def selected_test_views(arguments: argparse.Namespace) -> list[tuple[Path, Path]]:
    """Select repository identities paired with the exact bytes to analyze."""
    mode = mode_for(arguments)
    if mode == "all":
        return all_path_views(arguments.path)
    requested = {Path(value).as_posix() for value in arguments.path}
    return sorted(
        (
            (Path(repository_path), content_path)
            for repository_path, content_path, _ in changed_path_views(mode)
            if is_test_file(Path(repository_path))
            and (not requested or repository_path in requested)
        ),
        key=lambda item: item[0].as_posix(),
    )


def test_findings(path: Path, text: str) -> list[dict[str, str]]:
    """Return advisory lexical signals for one test after-image."""
    findings: list[dict[str, str]] = []
    if not ASSERTION_RE.search(text):
        findings.append(finding(
            "test-quality.no-assertion",
            "advisory",
            path,
            "changed test file has no recognizable assertion",
        ))
    if HOLLOW_TEST_RE.search(text) and not BEHAVIOR_RE.search(text):
        findings.append(finding(
            "test-quality.hollow-accessor",
            "advisory",
            path,
            "getter, setter, or accessor-oriented test lacks behavior or contract language",
        ))
    return findings


def parse_arguments() -> argparse.Namespace:
    """Parse selection arguments without accepting legacy Git-ref overrides."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--path", action="append", default=[])
    return parser.parse_args()


def main() -> int:
    """Analyze selected tests and emit one normalized result envelope."""
    arguments = parse_arguments()
    findings: list[dict[str, Any]] = []
    try:
        selected = selected_test_views(arguments)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        findings.append(finding(
            "test-quality.selection-failed", "blocking", ".", str(error)
        ))
        selected = []
    for repository_path, content_path in selected:
        try:
            text = content_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            findings.append(finding(
                "test-quality.after-image-unreadable",
                "blocking",
                repository_path,
                f"cannot read selected test after-image: {error}",
            ))
            continue
        findings.extend(test_findings(repository_path, text))
    summary = finding_summary(findings)
    print(json.dumps({
        "version": 1,
        "check": "test-quality",
        **summary,
        "findings": findings,
    }, indent=2, sort_keys=True))
    return 1 if summary["finding_counts"]["blocking"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
