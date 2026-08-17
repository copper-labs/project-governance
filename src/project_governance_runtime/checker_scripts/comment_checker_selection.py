"""Select comment-policy inputs and serialize their governed replay records.

This module keeps path-selection semantics separate from the comment checker CLI so the command
entrypoint can focus on policy execution and normalized result emission.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from governance_changed_paths import analysis_path, changed_line_ranges, changed_paths, packet_records, template_managed_paths
from source_comment_analysis import SOURCE_FAMILIES, matches_any


def validated_source_roots(policy: dict[str, Any]) -> list[str]:
    """Return configured source roots after rejecting missing directories."""
    roots = [str(value) for value in policy.get("source_roots", ["."])]
    missing = [value for value in roots if value != "." and not Path(value).is_dir()]
    if missing:
        raise RuntimeError(f"configured source root(s) do not exist: {', '.join(missing)}")
    return roots


def selection_mode(args: argparse.Namespace, enforce_all: bool) -> str:
    """Resolve the requested selection mode without inspecting repository state."""
    if args.path:
        return "explicit"
    if args.all or enforce_all:
        return "all"
    return "changed" if args.changed else "staged"


def path_in_roots(path: str, roots: list[Any]) -> bool:
    """Return whether a repository-relative path belongs to a configured source root."""
    for raw_root in roots:
        root = str(raw_root).strip().strip("/")
        if root in {"", "."} or path == root or path.startswith(root + "/"):
            return True
    return False


def governed_selection(
    value: str,
    policy: dict[str, Any],
    roots: list[str],
    records: dict[str, dict[str, Any]],
    ranges: dict[str, list[tuple[int, int]]],
    force_all: bool,
    mode: str,
) -> dict[str, Any] | None:
    """Describe one governed source file or return none when policy excludes it."""
    path = Path(value)
    posix = path.as_posix()
    source_path = path if mode in {"explicit", "all"} else analysis_path(posix, mode)
    if not source_path.is_file() or path.suffix.lower() not in SOURCE_FAMILIES:
        return None
    if not path_in_roots(posix, roots) or matches_any(posix, policy.get("ignore_paths", [])):
        return None
    is_test = matches_any(posix, policy.get("test_globs", []))
    test_scope = str(policy.get("test_scope", "excluded"))
    if is_test and test_scope == "excluded":
        return None
    path_ranges = ranges.get(posix, [])
    record = records.get(posix, {})
    is_new = record.get("status") == "added"
    enforce_all = force_all or is_new
    return {
        "path": path,
        "source_path": source_path,
        "before_path": Path(record["before_path"]) if record.get("before_path") else None,
        "ranges": path_ranges,
        "enforce_all": enforce_all,
        "overview_blocking": enforce_all,
        "advisory_only": is_test and test_scope == "advisory",
    }


def selected_paths(args: argparse.Namespace, policy: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    """Select governed files and bind each one to its changed-declaration evidence."""
    roots = validated_source_roots(policy)
    enforce_all = policy.get("mode") in {"enforce-all", "enforce_all"}
    mode = selection_mode(args, enforce_all)
    explicit = mode == "explicit"
    raw = list(args.path) if explicit else changed_paths(mode)
    managed = set() if explicit else template_managed_paths()
    records = {} if explicit or mode == "all" else {
        record["path"]: record for record in packet_records(mode) if record["status"] != "deleted"
    }
    ranges = {} if explicit or enforce_all else changed_line_ranges(mode)
    force_all = explicit or enforce_all
    result = [
        selection
        for value in raw
        if value not in managed
        and (selection := governed_selection(value, policy, roots, records, ranges, force_all, mode)) is not None
    ]
    return sorted(result, key=lambda item: item["path"].as_posix()), mode


def selection_records(selections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Serialize exact selection semantics for a governed replay."""
    return [
        {
            "path": item["path"].as_posix(),
            "ranges": [list(value) for value in item["ranges"]],
            "enforceAll": bool(item["enforce_all"]),
            "overviewBlocking": bool(item["overview_blocking"]),
            "advisoryOnly": bool(item["advisory_only"]),
            "inputRole": "source",
        }
        for item in selections
    ]


def selection_file(path: Path) -> tuple[list[dict[str, Any]], str]:
    """Restore exact selection semantics emitted by this engine."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("selectedInputs"), list):
        raise ValueError("governance selection file is invalid")
    mode = str(value.get("mode", "explicit"))
    records = {} if mode in {"explicit", "all"} else {
        record["path"]: record for record in packet_records(mode) if record["status"] != "deleted"
    }
    selections = [
        {
            "path": Path(record["path"]),
            "source_path": (
                Path(record["path"])
                if mode in {"explicit", "all"}
                else analysis_path(record["path"], mode)
            ),
            "before_path": (
                Path(records[record["path"]]["before_path"])
                if records.get(record["path"], {}).get("before_path")
                else None
            ),
            "ranges": [(int(item[0]), int(item[1])) for item in record.get("ranges", [])],
            "enforce_all": bool(record.get("enforceAll")),
            "overview_blocking": bool(record.get("overviewBlocking")),
            "advisory_only": bool(record.get("advisoryOnly")),
        }
        for record in value["selectedInputs"]
        if isinstance(record, dict)
        and isinstance(record.get("path"), str)
        and record.get("inputRole", "source") == "source"
    ]
    return selections, mode


def self_test_selection() -> list[dict[str, Any]]:
    """Return every source fixture read by the comment conformance proof."""
    base = Path("config/validation/fixtures/comment-quality")
    return [
        {"path": path.as_posix(), "inputRole": "conformance-fixture"}
        for path in sorted(base.rglob("*"))
        if path.is_file()
    ]
