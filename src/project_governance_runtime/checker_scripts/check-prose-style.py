#!/usr/bin/env python3
"""Report unfinished markers in the selected live repository prose."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from governance_changed_paths import changed_path_views


WATCH_WORDS = ("TODO", "TBD")
ROOT_DOCUMENTS = {"AGENTS.md", "CHARTER.md", "README.md"}


def selected_markdown(mode: str) -> list[tuple[Path, Path]]:
    """Return only selected live documentation files that exist in the worktree."""
    return sorted(
        {
            (Path(repository_path), content_path)
            for repository_path, content_path, _ in changed_path_views(mode)
            if content_path.is_file()
            and Path(repository_path).suffix.lower() == ".md"
            and (
                Path(repository_path).parts[:1] == ("docs",)
                or repository_path in ROOT_DOCUMENTS
            )
        },
        key=lambda item: item[0].as_posix(),
    )


def main() -> int:
    """Emit normalized advisory findings for selected unfinished prose."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    arguments = parser.parse_args()
    mode = "all" if arguments.all else "changed" if arguments.changed else "staged"
    findings: list[dict[str, object]] = []
    try:
        selected = selected_markdown(mode)
        for repository_path, content_path in selected:
            for line_number, line in enumerate(
                content_path.read_text(encoding="utf-8").splitlines(), 1
            ):
                for marker in WATCH_WORDS:
                    if marker in line:
                        findings.append({
                            "rule_id": "prose.unfinished-marker",
                            "severity": "advisory",
                            "path": repository_path.as_posix(),
                            "line": line_number,
                            "message": f"contains unfinished prose marker {marker}",
                        })
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        findings.append({
            "rule_id": "prose.selection-failed",
            "severity": "blocking",
            "message": str(error),
        })
    payload = {
        "version": 1,
        "check": "prose",
        "status": "warning" if findings else "passed",
        "finding_count": len(findings),
        "findings": findings,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
