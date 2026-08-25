#!/usr/bin/env python3
"""Validate one commit change narrative and emit normalized evidence."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from change_narrative import (
    finding,
    git_metadata_path,
    is_placeholder,
    result_payload,
)


REQUIRED_FIELDS = (
    ("product-impact", "Product impact"),
    ("nature-of-change", "Nature of change"),
    ("code-areas-impacted", "Code areas impacted"),
    ("why", "Why"),
    ("validation", "Validation"),
)
OPTIONAL_FIELD = ("risks-or-required-action", "Risks or required action")
LABELS = {label: field_id for field_id, label in (*REQUIRED_FIELDS, OPTIONAL_FIELD)}
LABEL_PATTERN = re.compile(
    rf"^({'|'.join(re.escape(label) for label in LABELS)}):[ \t]*(.*)$"
)
GENERATED_SUBJECTS = (
    re.compile(r"^Merge (?:branch|branches|commit|pull request|remote-tracking branch|tag)\b"),
    re.compile(r'^Revert(?:[ \t]+\"|$)'),
    re.compile(r"^(?:fixup|squash|amend)![ \t]+"),
)


def _message_path() -> Path:
    """Prefer the hook-supplied path and otherwise use this worktree's Git metadata."""
    return Path(sys.argv[1]) if len(sys.argv) > 1 else git_metadata_path("COMMIT_EDITMSG")


def _generated(subject: str) -> bool:
    """Return whether Git owns the message shape rather than an ordinary author."""
    return any(pattern.search(subject) for pattern in GENERATED_SUBJECTS)


def _field_occurrences(
    lines: list[str],
) -> list[dict[str, object]]:
    """Return recognized labels, their source lines, and their inline values."""
    matches: list[dict[str, object]] = []
    for index, line in enumerate(lines):
        match = LABEL_PATTERN.match(line)
        if match:
            matches.append({
                "field_id": LABELS[match.group(1)],
                "label": match.group(1),
                "index": index,
                "line": index + 2,
                "value": match.group(2),
            })
    return matches


def _field_findings(path: Path, lines: list[str]) -> list[dict[str, object]]:
    """Validate required field presence, order, uniqueness, and authored values."""
    findings: list[dict[str, object]] = []
    occurrences = _field_occurrences(lines)
    by_id: dict[str, list[dict[str, object]]] = {}
    for item in occurrences:
        by_id.setdefault(str(item["field_id"]), []).append(item)

    required_positions: list[int] = []
    for field_id, label in REQUIRED_FIELDS:
        found = by_id.get(field_id, [])
        if not found:
            findings.append(finding(
                "commit-message.field-missing",
                path,
                f"required commit field is missing: {label}:",
            ))
            continue
        required_positions.append(int(found[0]["index"]))
        if len(found) > 1:
            findings.append(finding(
                "commit-message.field-duplicate",
                path,
                f"commit field must appear once: {label}:",
                line=int(found[1]["line"]),
            ))
        if is_placeholder(str(found[0]["value"])):
            findings.append(finding(
                "commit-message.field-placeholder",
                path,
                f"commit field needs authored content: {label}:",
                line=int(found[0]["line"]),
            ))

    if (
        len(required_positions) == len(REQUIRED_FIELDS)
        and required_positions != sorted(required_positions)
    ):
        findings.append(finding(
            "commit-message.field-order",
            path,
            "commit fields must follow Product impact, Nature of change, Code areas impacted, Why, then Validation",
            line=min(required_positions) + 2,
        ))

    optional_id, optional_label = OPTIONAL_FIELD
    optional = by_id.get(optional_id, [])
    if len(optional) > 1:
        findings.append(finding(
            "commit-message.field-duplicate",
            path,
            f"commit field must appear at most once: {optional_label}:",
            line=int(optional[1]["line"]),
        ))
    if optional:
        if is_placeholder(str(optional[0]["value"])):
            findings.append(finding(
                "commit-message.field-placeholder",
                path,
                f"omit the optional field or provide authored content: {optional_label}:",
                line=int(optional[0]["line"]),
            ))
        validation = by_id.get("validation", [])
        if validation and int(optional[0]["index"]) < int(validation[0]["index"]):
            findings.append(finding(
                "commit-message.field-order",
                path,
                f"{optional_label}: must follow Validation:",
                line=int(optional[0]["line"]),
            ))
    return findings


def main() -> int:
    """Validate an ordinary narrative while preserving Git-generated message flows."""
    path = _message_path()
    findings: list[dict[str, object]] = []
    if not path.is_file():
        findings.append(finding(
            "commit-message.file-missing",
            path,
            "commit message file is missing; pass the hook-provided message path",
        ))
    else:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError) as error:
            findings.append(finding(
                "commit-message.file-unreadable",
                path,
                f"commit message file could not be read as UTF-8: {error}",
            ))
            lines = []
        subject = lines[0].lstrip("\ufeff").strip() if lines else ""
        if not findings and len(subject) < 8:
            findings.append(finding(
                "commit-message.short-subject",
                path,
                "commit subject must contain at least eight characters",
            ))
        if not findings and subject and not _generated(subject):
            findings.extend(_field_findings(path, lines[1:]))
    payload = result_payload("commit-message", findings)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
