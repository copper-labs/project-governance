#!/usr/bin/env python3
"""Validate one pull request change narrative and emit normalized evidence."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from change_narrative import (
    authored_text,
    finding,
    git_metadata_path,
    is_placeholder,
    is_unhelpful_outcome,
    result_payload,
    without_html_comments,
)


REQUIRED_SECTIONS = (
    ("product-impact", "Product impact"),
    ("nature-of-change", "Nature of the change"),
    ("code-areas-impacted", "Code areas impacted"),
    ("why", "Why"),
)
DISALLOWED_SECTIONS = (
    ("outcome", "Outcome"),
    ("validation", "Validation"),
    ("risks-or-required-action", "Risks or required action"),
)
SECTION_IDS = {title: section_id for section_id, title in REQUIRED_SECTIONS}
HEADING = re.compile(r"^##[ \t]+(.+?)[ \t]*$")
DISALLOWED_HEADING = re.compile(
    rf"^[ \t]*#{{1,6}}[ \t]+"
    rf"({'|'.join(re.escape(title) for _, title in DISALLOWED_SECTIONS)})"
    rf"[ \t]*:?(?:[ \t]+#+)?[ \t]*$",
    re.IGNORECASE,
)
BULLET = re.compile(r"^[ \t]*[-*+][ \t]+(.+?)[ \t]*$")


def _body_path() -> Path:
    """Resolve explicit, environment-provided, or worktree-local PR body input."""
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    environment_path = os.environ.get("PROJECT_GOVERNANCE_PR_BODY_FILE", "").strip()
    if environment_path:
        return Path(environment_path)
    return git_metadata_path("PR_DESCRIPTION.md")


def _title_input() -> tuple[Path, str | None, str]:
    """Resolve an explicit, provider-supplied, or worktree-local pull request title."""
    title_path = git_metadata_path("PR_TITLE")
    if len(sys.argv) > 2:
        return Path("pull-request-title"), sys.argv[2], "argument"
    if "PROJECT_GOVERNANCE_PR_TITLE" in os.environ:
        return (
            Path("pull-request-title"),
            os.environ["PROJECT_GOVERNANCE_PR_TITLE"],
            "provider",
        )
    if not title_path.is_file():
        return title_path, None, "metadata"
    try:
        return title_path, title_path.read_text(encoding="utf-8"), "metadata"
    except (OSError, UnicodeError):
        return title_path, None, "metadata"


def _title_findings() -> list[dict[str, object]]:
    """Require one compact outcome and reject only deterministic non-title shapes."""
    path, raw_title, source = _title_input()
    if raw_title is None:
        remedy = (
            "pass --pr-title with --pr-body-file"
            if source != "metadata"
            else f"pass --pr-title or create {path.as_posix()}"
        )
        return [finding(
            "pr-description.title-missing",
            path,
            f"pull request title is missing; {remedy}",
        )]
    title = raw_title.strip()
    if len(title.splitlines()) != 1:
        return [finding(
            "pr-description.title-multiline",
            path,
            "pull request title must be one line",
        )]
    if len(title) < 8:
        return [finding(
            "pr-description.title-short",
            path,
            "pull request title must contain at least eight characters",
        )]
    if is_unhelpful_outcome(title):
        return [finding(
            "pr-description.title-unhelpful",
            path,
            "pull request title must state a useful outcome, not a placeholder, generic label, or ticket alone",
        )]
    return []


def _sections(text: str) -> list[dict[str, object]]:
    """Parse level-two Markdown sections while ignoring comments and fenced examples."""
    lines = without_html_comments(text).splitlines()
    headings: list[dict[str, object]] = []
    fence: str | None = None
    for index, line in enumerate(lines):
        stripped = line.lstrip()
        marker = stripped[:3]
        if marker in {"```", "~~~"}:
            if fence is None:
                fence = marker
            elif marker == fence:
                fence = None
            continue
        if fence is not None:
            continue
        match = HEADING.match(line)
        if match:
            headings.append({
                "title": match.group(1),
                "index": index,
                "line": index + 1,
            })
    for offset, item in enumerate(headings):
        start = int(item["index"]) + 1
        end = (
            int(headings[offset + 1]["index"])
            if offset + 1 < len(headings)
            else len(lines)
        )
        item["content"] = "\n".join(lines[start:end])
    return headings


def _bullet_values(content: str, *, first_line: int) -> list[tuple[int, str]]:
    """Return visible Markdown bullets and source lines outside fenced examples."""
    values: list[tuple[int, str]] = []
    fence: str | None = None
    for offset, line in enumerate(without_html_comments(content).splitlines()):
        marker = line.lstrip()[:3]
        if marker in {"```", "~~~"}:
            if fence is None:
                fence = marker
            elif marker == fence:
                fence = None
            continue
        if fence is not None:
            continue
        match = BULLET.match(line)
        if match:
            values.append((first_line + offset, match.group(1)))
    return values


def _visible_section_text(content: str) -> str:
    """Return authored section prose while excluding hidden and fenced examples."""
    values: list[str] = []
    fence: str | None = None
    for line in without_html_comments(content).splitlines():
        marker = line.lstrip()[:3]
        if marker in {"```", "~~~"}:
            if fence is None:
                fence = marker
            elif marker == fence:
                fence = None
            continue
        if fence is None:
            values.append(line)
    return "\n".join(values)


def _disallowed_section_findings(
    path: Path,
    text: str,
) -> list[dict[str, object]]:
    """Reject common Markdown heading variants of body sections outside the contract."""
    findings: list[dict[str, object]] = []
    fence: str | None = None
    for line_number, line in enumerate(without_html_comments(text).splitlines(), 1):
        marker = line.lstrip()[:3]
        if marker in {"```", "~~~"}:
            if fence is None:
                fence = marker
            elif marker == fence:
                fence = None
            continue
        if fence is not None:
            continue
        match = DISALLOWED_HEADING.match(line)
        if not match:
            continue
        title = match.group(1)
        message = (
            "put the pull request outcome in its title; remove the Outcome body section"
            if title.casefold() == "outcome"
            else f"remove the {title} body section; use checks or Product impact as appropriate"
        )
        findings.append(finding(
            "pr-description.section-not-allowed",
            path,
            message,
            line=line_number,
        ))
    return findings


def _list_findings(
    path: Path,
    section_id: str,
    title: str,
    item: dict[str, object],
) -> list[dict[str, object]]:
    """Validate the scan-friendly product and code-area lists."""
    values = _bullet_values(
        str(item["content"]), first_line=int(item["line"]) + 1
    )
    if not values:
        return [finding(
            "pr-description.bullets-missing",
            path,
            f"pull request section needs at least one bullet: ## {title}",
            line=int(item["line"]),
        )]
    findings: list[dict[str, object]] = []
    for line_number, value in values:
        if is_placeholder(value):
            findings.append(finding(
                "pr-description.field-placeholder",
                path,
                f"pull request bullet needs authored content: ## {title}",
                line=line_number,
            ))
    if section_id == "product-impact":
        for line_number, value in values:
            area, separator, impact = value.partition(":")
            if not separator:
                findings.append(finding(
                    "pr-description.product-impact-shape",
                    path,
                    "each Product impact bullet must use "
                    "'<top-level area>: <how the change surfaces>'",
                    line=line_number,
                ))
            elif is_placeholder(area) or is_placeholder(impact):
                findings.append(finding(
                    "pr-description.field-placeholder",
                    path,
                    "Product impact needs an authored area and surface explanation",
                    line=line_number,
                ))
    return findings


def _section_findings(path: Path, text: str) -> list[dict[str, object]]:
    """Validate PR section presence, order, uniqueness, shape, and authored content."""
    findings = _disallowed_section_findings(path, text)
    sections = _sections(text)
    by_id: dict[str, list[dict[str, object]]] = {}
    for item in sections:
        section_id = SECTION_IDS.get(str(item["title"]))
        if section_id:
            by_id.setdefault(section_id, []).append(item)

    required_positions: list[int] = []
    for section_id, title in REQUIRED_SECTIONS:
        found = by_id.get(section_id, [])
        if not found:
            findings.append(finding(
                "pr-description.section-missing",
                path,
                f"required pull request section is missing: ## {title}",
            ))
            continue
        required_positions.append(int(found[0]["index"]))
        if len(found) > 1:
            findings.append(finding(
                "pr-description.section-duplicate",
                path,
                f"pull request section must appear once: ## {title}",
                line=int(found[1]["line"]),
            ))
        content = _visible_section_text(str(found[0]["content"]))
        if is_placeholder(content):
            findings.append(finding(
                "pr-description.field-placeholder",
                path,
                f"pull request section needs authored content: ## {title}",
                line=int(found[0]["line"]),
            ))
        if section_id in {"product-impact", "code-areas-impacted"}:
            findings.extend(_list_findings(path, section_id, title, found[0]))

    if (
        len(required_positions) == len(REQUIRED_SECTIONS)
        and required_positions != sorted(required_positions)
    ):
        findings.append(finding(
            "pr-description.section-order",
            path,
            "pull request sections must follow Product impact, Nature of the change, Code areas impacted, then Why",
            line=min(required_positions) + 1,
        ))
    return findings


def main() -> int:
    """Validate the body that will orient a pull request reader."""
    path = _body_path()
    findings = _title_findings()
    body_readable = True
    if not path.is_file():
        body_readable = False
        findings.append(finding(
            "pr-description.file-missing",
            path,
            "pull request body is missing; pass --pr-body-file or create this worktree's Git metadata draft",
        ))
    else:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            body_readable = False
            findings.append(finding(
                "pr-description.file-unreadable",
                path,
                f"pull request body could not be read as UTF-8: {error}",
            ))
            text = ""
        if body_readable:
            if not authored_text(text):
                findings.append(finding(
                    "pr-description.empty-body",
                    path,
                    "pull request body needs the required change-narrative sections",
                ))
            else:
                findings.extend(_section_findings(path, text))
    payload = result_payload("pr-description", findings)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
