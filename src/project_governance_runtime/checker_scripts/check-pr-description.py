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
    result_payload,
    without_html_comments,
)


REQUIRED_SECTIONS = (
    ("outcome", "Outcome"),
    ("product-impact", "Product impact"),
    ("nature-of-change", "Nature of the change"),
    ("code-areas-impacted", "Code areas impacted"),
    ("why", "Why"),
    ("validation", "Validation"),
)
OPTIONAL_SECTION = ("risks-or-required-action", "Risks or required action")
SECTION_IDS = {
    title: section_id for section_id, title in (*REQUIRED_SECTIONS, OPTIONAL_SECTION)
}
HEADING = re.compile(r"^##[ \t]+(.+?)[ \t]*$")
BULLET = re.compile(r"^[ \t]*[-*+][ \t]+(.+?)[ \t]*$")


def _body_path() -> Path:
    """Resolve explicit, environment-provided, or worktree-local PR body input."""
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    environment_path = os.environ.get("PROJECT_GOVERNANCE_PR_BODY_FILE", "").strip()
    if environment_path:
        return Path(environment_path)
    return git_metadata_path("PR_DESCRIPTION.md")


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


def _bullet_values(content: str) -> list[str]:
    """Return visible Markdown bullet values from one section."""
    values: list[str] = []
    for line in without_html_comments(content).splitlines():
        match = BULLET.match(line)
        if match:
            values.append(match.group(1))
    return values


def _list_findings(
    path: Path,
    section_id: str,
    title: str,
    item: dict[str, object],
) -> list[dict[str, object]]:
    """Validate the scan-friendly product, code-area, and validation lists."""
    values = _bullet_values(str(item["content"]))
    if not values:
        return [finding(
            "pr-description.bullets-missing",
            path,
            f"pull request section needs at least one bullet: ## {title}",
            line=int(item["line"]),
        )]
    findings: list[dict[str, object]] = []
    for value in values:
        if is_placeholder(value):
            findings.append(finding(
                "pr-description.field-placeholder",
                path,
                f"pull request bullet needs authored content: ## {title}",
                line=int(item["line"]),
            ))
    if section_id == "product-impact":
        for value in values:
            area, separator, impact = value.partition(":")
            if not separator or is_placeholder(area) or is_placeholder(impact):
                findings.append(finding(
                    "pr-description.product-impact-shape",
                    path,
                    "each Product impact bullet must use "
                    "'<top-level area>: <how the change surfaces>'",
                    line=int(item["line"]),
                ))
    return findings


def _section_findings(path: Path, text: str) -> list[dict[str, object]]:
    """Validate PR section presence, order, uniqueness, shape, and authored content."""
    findings: list[dict[str, object]] = []
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
        content = str(found[0]["content"])
        if is_placeholder(content):
            findings.append(finding(
                "pr-description.field-placeholder",
                path,
                f"pull request section needs authored content: ## {title}",
                line=int(found[0]["line"]),
            ))
        elif section_id in {"product-impact", "code-areas-impacted", "validation"}:
            findings.extend(_list_findings(path, section_id, title, found[0]))

    if (
        len(required_positions) == len(REQUIRED_SECTIONS)
        and required_positions != sorted(required_positions)
    ):
        findings.append(finding(
            "pr-description.section-order",
            path,
            "pull request sections must follow Outcome, Product impact, Nature of the change, Code areas impacted, Why, then Validation",
            line=min(required_positions) + 1,
        ))

    optional_id, optional_title = OPTIONAL_SECTION
    optional = by_id.get(optional_id, [])
    if len(optional) > 1:
        findings.append(finding(
            "pr-description.section-duplicate",
            path,
            f"pull request section must appear at most once: ## {optional_title}",
            line=int(optional[1]["line"]),
        ))
    if optional:
        if is_placeholder(str(optional[0]["content"])):
            findings.append(finding(
                "pr-description.field-placeholder",
                path,
                f"omit the optional section or provide authored content: ## {optional_title}",
                line=int(optional[0]["line"]),
            ))
        validation = by_id.get("validation", [])
        if validation and int(optional[0]["index"]) < int(validation[0]["index"]):
            findings.append(finding(
                "pr-description.section-order",
                path,
                f"## {optional_title} must follow ## Validation",
                line=int(optional[0]["line"]),
            ))
    return findings


def main() -> int:
    """Validate the body that will orient a pull request reader."""
    path = _body_path()
    findings: list[dict[str, object]] = []
    if not path.is_file():
        findings.append(finding(
            "pr-description.file-missing",
            path,
            "pull request body is missing; pass --pr-body-file or create this worktree's Git metadata draft",
        ))
    else:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            findings.append(finding(
                "pr-description.file-unreadable",
                path,
                f"pull request body could not be read as UTF-8: {error}",
            ))
            text = ""
        if not findings:
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
