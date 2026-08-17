#!/usr/bin/env python3
"""Move an execution plan to the directory matching its lifecycle status."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
PLAN_ROOT = ROOT / "docs/exec-plans"
STATUS_DIRS = {
    "draft": "active",
    "approved": "active",
    "active": "active",
    "completed": "completed",
    "deferred": "deferred",
    "superseded": "superseded",
    "archived": "archived",
}


def rel(path: Path) -> str:
    """Return a repository-relative POSIX path."""
    return path.relative_to(ROOT).as_posix()


def split_frontmatter(path: Path) -> tuple[str, str]:
    """Return raw YAML frontmatter and body for a Markdown file."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter is not closed")
    return text[4:end], text[end + len("\n---\n") :]


def load_frontmatter(raw: str) -> dict[str, Any]:
    """Parse frontmatter YAML as a mapping."""
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a mapping")
    return data


def set_frontmatter_value(raw: str, key: str, value: str) -> str:
    """Set one simple scalar frontmatter value while preserving key order."""
    prefix = f"{key}:"
    lines = raw.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            lines[index] = f"{key}: {value}"
            break
    else:
        lines.append(f"{key}: {value}")
    return "\n".join(lines).rstrip() + "\n"


def resolve_plan_path(value: str) -> Path:
    """Resolve a plan path and ensure it stays inside docs/exec-plans."""
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (ROOT / path).resolve()
    try:
        resolved.relative_to(PLAN_ROOT)
    except ValueError as exc:
        raise ValueError("plan path must live under docs/exec-plans") from exc
    if not resolved.exists():
        raise ValueError(f"plan path does not exist: {value}")
    if resolved.suffix != ".md":
        raise ValueError("plan path must be a Markdown file")
    return resolved


def move_plan(path: Path, status: str, *, dry_run: bool) -> Path:
    """Update frontmatter and move the plan into its status directory."""
    raw_frontmatter, body = split_frontmatter(path)
    data = load_frontmatter(raw_frontmatter)
    if data.get("type") != "plan":
        raise ValueError("frontmatter type must be plan")
    if status not in STATUS_DIRS:
        raise ValueError(f"unknown lifecycle status: {status}")

    destination_dir = PLAN_ROOT / STATUS_DIRS[status]
    destination = destination_dir / path.name
    if destination != path and destination.exists():
        raise ValueError(f"destination already exists: {rel(destination)}")

    updated_frontmatter = set_frontmatter_value(raw_frontmatter, "status", status)
    updated_frontmatter = set_frontmatter_value(updated_frontmatter, "updated", date.today().isoformat())
    updated_text = f"---\n{updated_frontmatter}---\n{body}"

    if dry_run:
        return destination

    destination_dir.mkdir(parents=True, exist_ok=True)
    if destination == path:
        path.write_text(updated_text, encoding="utf-8")
    else:
        path.rename(destination)
        destination.write_text(updated_text, encoding="utf-8")
    return destination


def main() -> int:
    """Run the CLI."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", help="Execution plan path under docs/exec-plans.")
    parser.add_argument(
        "--status",
        default="completed",
        choices=sorted(STATUS_DIRS),
        help="Lifecycle status to write before moving the plan. Defaults to completed.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print the destination without writing.")
    args = parser.parse_args()

    try:
        source = resolve_plan_path(args.plan)
        destination = move_plan(source, args.status, dry_run=args.dry_run)
    except ValueError as exc:
        print(f"move-exec-plan failed: {exc}", file=sys.stderr)
        return 1

    action = "would move" if args.dry_run else "moved"
    print(f"{action}: {rel(source)} -> {rel(destination)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
