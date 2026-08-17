#!/usr/bin/env python3
"""Check selected repository text for deterministic whitespace drift."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from governance_changed_paths import changed_path_views


TEXT_SUFFIXES = {".cfg", ".json", ".md", ".py", ".sh", ".toml", ".txt", ".yaml", ".yml"}
TEXT_FILENAMES = {
    ".gitignore",
    "LICENSE",
    "MANIFEST.in",
    "commit-msg",
    "pre-commit",
    "pre-pr",
    "pre-push",
}


def selected_paths(selection_file: Path | None, mode: str) -> list[tuple[Path, Path]]:
    """Return exact replay inputs or the runtime's immutable path selection."""
    if selection_file:
        value = json.loads(selection_file.read_text(encoding="utf-8"))
        records = (
            value.get("selectedInputs", [])
            if isinstance(value, dict)
            else []
        )
        if not isinstance(records, list):
            raise ValueError("governance selection file is invalid")
        return [
            (Path(record["path"]), Path(record["path"]))
            for record in records
            if isinstance(record, dict)
            and isinstance(record.get("path"), str)
        ]
    return sorted(
        {
            (Path(repository_path), content_path)
            for repository_path, content_path, _ in changed_path_views(mode)
            if content_path.is_file()
            and (
                Path(repository_path).suffix in TEXT_SUFFIXES
                or Path(repository_path).name in TEXT_FILENAMES
            )
        },
        key=lambda item: item[0].as_posix(),
    )


def main() -> int:
    """Check text files for trailing whitespace."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--governance-selection-only", action="store_true")
    parser.add_argument("--governance-selection-file", type=Path)
    args = parser.parse_args()
    try:
        mode = "all" if args.all else "changed" if args.changed else "staged"
        selected = selected_paths(args.governance_selection_file, mode)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        selected = []
        selection_error = str(error)
    else:
        selection_error = ""
    if args.governance_selection_only:
        payload = {
            "version": 1,
            "check": "format-selection",
            "status": "failed" if selection_error else "passed",
            "finding_count": 1 if selection_error else 0,
            "findings": (
                [{
                    "rule_id": "format.selection-failed",
                    "severity": "blocking",
                    "message": selection_error,
                }]
                if selection_error
                else []
            ),
            "selected_inputs": [
                {"path": repository_path.as_posix()}
                for repository_path, _ in selected
            ],
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1 if selection_error else 0
    errors: list[dict[str, object]] = []
    for repository_path, content_path in selected:
        for index, line in enumerate(
            content_path.read_text(encoding="utf-8").splitlines(),
            1,
        ):
            if line.rstrip() != line:
                errors.append({
                    "rule_id": "format.drift",
                    "severity": "blocking",
                    "path": repository_path.as_posix(),
                    "line": index,
                    "message": "trailing whitespace",
                })
    if selection_error:
        errors.append({
            "rule_id": "format.selection-failed",
            "severity": "blocking",
            "message": selection_error,
        })
    payload = {
        "version": 1,
        "check": "format",
        "status": "failed" if errors else "passed",
        "finding_count": len(errors),
        "findings": errors,
    }
    if args.json or args.governance_selection_file:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1 if errors else 0
    if errors:
        print("Format check failed:", file=sys.stderr)
        for error in errors[:50]:
            print(
                f"- {error.get('path', '.')}:"
                f"{error.get('line', 1)}: {error['message']}",
                file=sys.stderr,
            )
        return 1
    print("Format check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
