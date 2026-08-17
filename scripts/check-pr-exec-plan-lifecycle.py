#!/usr/bin/env python3
"""Responsibility: Validate pull-request lifecycle fields and explicit active-plan indexes.

Context: PR evidence and Markdown plan indexes are separate inputs, so supported link forms must be
normalized before lifecycle completeness is compared with the authoritative plan directories.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml


STATE_DIRS = {
    "active": "active",
    "approved": "active",
    "draft": "active",
    "completed": "completed",
    "deferred": "deferred",
    "superseded": "superseded",
    "archived": "archived",
}
NO_PLAN_VALUES = {"n/a", "na", "none", "not applicable", "no durable execution plan"}
BLANK_VALUES = {"", "todo", "tbd", "required", "<plan>", "<state>", "<command>"}
REQUIRED_FIELDS = ("Plan", "Final state", "Lifecycle command or N/A")


def is_no_plan(value: str) -> bool:
    """Return whether a field explicitly says no durable plan applies."""
    return value.strip().lower() in NO_PLAN_VALUES


def is_safe_repo_path(value: str) -> bool:
    """Return whether a path is a safe repo-relative path."""
    normalized = value.replace("\\", "/")
    return (
        bool(normalized)
        and not normalized.startswith(("/", "~", "../"))
        and normalized != ".."
        and "/../" not in normalized
        and "\0" not in normalized
    )


def extract_lifecycle_section(text: str) -> str:
    """Extract the Execution Plan Lifecycle section from Markdown text."""
    match = re.search(r"^##\s+Execution Plan Lifecycle\s*$", text, flags=re.MULTILINE)
    if not match:
        raise ValueError("missing ## Execution Plan Lifecycle section")
    start = match.end()
    next_heading = re.search(r"^##\s+", text[start:], flags=re.MULTILINE)
    end = start + next_heading.start() if next_heading else len(text)
    return text[start:end]


def parse_fields(section: str) -> dict[str, str]:
    """Parse lifecycle bullet fields from the PR body section."""
    fields: dict[str, str] = {}
    labels = "|".join(re.escape(label) for label in REQUIRED_FIELDS)
    pattern = re.compile(rf"^\s*-\s*({labels}):\s*(.*?)\s*$")
    for line in section.splitlines():
        match = pattern.match(line)
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def plan_frontmatter(path: Path) -> dict[str, object]:
    """Load plan frontmatter, returning an empty mapping when malformed."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        return {}
    data = yaml.safe_load(text[4:].split("\n---\n", 1)[0]) or {}
    return data if isinstance(data, dict) else {}


def normalized_active_plan_link(raw: str) -> str:
    """Normalize supported index-relative and repository-relative active-plan links."""
    normalized = raw.replace("\\", "/")
    index_relative = normalized.startswith("./")
    if index_relative:
        normalized = normalized[2:]
    if index_relative and normalized.startswith("docs/"):
        return ""
    if normalized.startswith("active/"):
        normalized = f"docs/exec-plans/{normalized}"
    return normalized if normalized.startswith("docs/exec-plans/active/") else ""


def validate_plan_artifact(root: Path, plan: str, final_state: str) -> list[str]:
    """Validate actual plan existence, type, status, and directory alignment."""
    errors: list[str] = []
    path = root / plan
    if not path.is_file() or path.is_symlink():
        return [f"Plan: referenced plan does not exist as a regular file: {plan}"]
    data = plan_frontmatter(path)
    if data.get("type") != "plan" or not str(data.get("id", "")).strip():
        errors.append("Plan: referenced artifact requires plan frontmatter with a stable id")
    recorded = str(data.get("status", "")).strip().lower()
    if recorded != final_state:
        errors.append(f"Plan: frontmatter status {recorded!r} does not match Final state {final_state!r}")
    expected_dir = STATE_DIRS.get(recorded)
    if expected_dir and not plan.startswith(f"docs/exec-plans/{expected_dir}/"):
        errors.append(f"Plan: frontmatter status {recorded!r} requires docs/exec-plans/{expected_dir}/")
    return errors


def validate_explicit_active_index(root: Path) -> list[str]:
    """Validate an opt-in explicit active-plan list while allowing directory-only indexes."""
    index = root / "docs/exec-plans/README.md"
    if not index.is_file():
        return []
    text = index.read_text(encoding="utf-8")
    if "<!-- governance:explicit-active-plans -->" not in text:
        return []
    raw_links = re.findall(r"\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)", text)
    listed = list(filter(None, map(normalized_active_plan_link, raw_links)))
    errors: list[str] = []
    duplicates = sorted({value for value in listed if listed.count(value) > 1})
    if duplicates:
        errors.append("Active plan index contains duplicate link(s): " + ", ".join(duplicates))
    actual = {
        path.relative_to(root).as_posix()
        for path in (root / "docs/exec-plans/active").glob("*.md")
        if path.is_file() and not path.is_symlink()
    }
    for relative in sorted(set(listed)):
        path = root / relative
        if not path.is_file():
            errors.append(f"Active plan index contains a broken link: {relative}")
            continue
        data = plan_frontmatter(path)
        if data.get("status") not in {"active", "approved", "draft"}:
            errors.append(f"Active plan index lists a terminal plan: {relative}")
    missing = sorted(actual - set(listed))
    extra = sorted(set(listed) - actual)
    if missing:
        errors.append("Active plan index omits active plan(s): " + ", ".join(missing))
    if extra:
        errors.append("Active plan index lists non-active path(s): " + ", ".join(extra))
    return errors


def validate_fields(fields: dict[str, str], root: Path | None = None) -> list[str]:
    """Return validation errors for parsed lifecycle fields."""
    errors: list[str] = []
    for label in REQUIRED_FIELDS:
        value = fields.get(label, "").strip()
        if value.lower() in BLANK_VALUES:
            errors.append(f"{label}: value is required; use N/A only when no durable execution plan exists")

    plan = fields.get("Plan", "").strip()
    final_state = fields.get("Final state", "").strip().lower()
    command = fields.get("Lifecycle command or N/A", "").strip()
    if errors:
        return errors

    if is_no_plan(plan):
        if not is_no_plan(final_state):
            errors.append("Final state: must be N/A when Plan is N/A")
        if not is_no_plan(command):
            errors.append("Lifecycle command or N/A: must be N/A when Plan is N/A")
        return errors

    normalized_plan = plan.replace("\\", "/")
    if not is_safe_repo_path(normalized_plan) or not normalized_plan.startswith("docs/exec-plans/"):
        errors.append("Plan: must be a safe repo-relative path under docs/exec-plans/")
        return errors

    if final_state not in STATE_DIRS:
        allowed = ", ".join(sorted(STATE_DIRS))
        errors.append(f"Final state: must be one of {allowed}, or N/A when no plan exists")
        return errors

    expected_prefix = f"docs/exec-plans/{STATE_DIRS[final_state]}/"
    if not normalized_plan.startswith(expected_prefix):
        errors.append(f"Plan: final state {final_state!r} requires path under {expected_prefix}")

    if STATE_DIRS[final_state] != "active" and is_no_plan(command):
        errors.append("Lifecycle command or N/A: terminal plan states must include the lifecycle command or equivalent evidence")

    if root is not None and not errors:
        errors.extend(validate_plan_artifact(root, normalized_plan, final_state))

    return errors


def read_body(path: str | None) -> str:
    """Read PR body text from a file or stdin."""
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def main() -> int:
    """Run the PR body lifecycle validator."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--body-file", help="Path to a Markdown PR body. Reads stdin when omitted.")
    args = parser.parse_args()

    try:
        fields = parse_fields(extract_lifecycle_section(read_body(args.body_file)))
    except ValueError as exc:
        print(f"PR execution-plan lifecycle check failed: {exc}", file=sys.stderr)
        return 1

    errors = validate_fields(fields, Path.cwd())
    errors.extend(validate_explicit_active_index(Path.cwd()))
    if errors:
        print("PR execution-plan lifecycle check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("PR execution-plan lifecycle check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
