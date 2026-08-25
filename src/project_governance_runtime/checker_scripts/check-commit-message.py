#!/usr/bin/env python3
"""Validate one commit change narrative and emit normalized evidence."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from change_narrative import (
    finding,
    git_config_value,
    git_metadata_path,
    is_placeholder,
    is_unhelpful_outcome,
    result_payload,
)


REQUIRED_FIELDS = (
    ("product-impact", "Product impact"),
    ("nature-of-change", "Nature of change"),
    ("code-areas-impacted", "Code areas impacted"),
    ("why", "Why"),
)
DISALLOWED_FIELDS = (
    ("outcome", "Outcome"),
    ("validation", "Validation"),
    ("risks-or-required-action", "Risks or required action"),
)
LABELS = {label: field_id for field_id, label in REQUIRED_FIELDS}
LABEL_PATTERN = re.compile(
    rf"^({'|'.join(re.escape(label) for label in LABELS)}):[ \t]*(.*)$"
)
DISALLOWED_PATTERN = re.compile(
    rf"^[ \t]*(?:(?:[-*+]|#{{1,6}})[ \t]+)?(?:[*_]{{1,2}})?"
    rf"({'|'.join(re.escape(label) for _, label in DISALLOWED_FIELDS)})"
    rf"(?:[*_]{{1,2}})?[ \t]*:",
    re.IGNORECASE,
)
QUOTED_REF = r"'[^'\n]+'"
GENERATED_SUBJECTS = (
    re.compile(rf"^Merge branch {QUOTED_REF}(?: (?:into|of) .+)?$"),
    re.compile(
        rf"^Merge branches {QUOTED_REF}(?:, {QUOTED_REF})*"
        rf"(?: and {QUOTED_REF})?(?: into .+)?$"
    ),
    re.compile(rf"^Merge remote-tracking branch {QUOTED_REF}(?: into .+)?$"),
    re.compile(rf"^Merge tag {QUOTED_REF}(?: into .+)?$"),
    re.compile(r"^Merge commit '[0-9a-fA-F]{7,64}'(?: into .+)?$"),
    re.compile(r"^Merge pull request #[0-9]+ from .+$"),
    re.compile(r'^(?:Revert|Reapply) ".+"$'),
    re.compile(r"^(?:fixup|squash|amend)![ \t]+.+$"),
)
SCISSORS = re.compile(r"^-+[ \t]*>8[ \t]*-+$")


def _message_path() -> Path:
    """Prefer the hook-supplied path and otherwise use this worktree's Git metadata."""
    return Path(sys.argv[1]) if len(sys.argv) > 1 else git_metadata_path("COMMIT_EDITMSG")


def _generated(subject: str) -> bool:
    """Return whether Git owns the message shape rather than an ordinary author."""
    return any(pattern.fullmatch(subject) for pattern in GENERATED_SUBJECTS)


def _comment_marker(text: str) -> str:
    """Resolve Git's comment marker, preferring the marker present on a scissors line."""
    for line in text.splitlines():
        match = re.match(r"^([^A-Za-z0-9\s][^\s]*)[ \t]+(.+)$", line)
        if match and SCISSORS.fullmatch(match.group(2).strip()):
            return match.group(1)
    configured = (
        git_config_value("core.commentString")
        or git_config_value("core.commentChar")
    )
    return "#" if not configured or configured == "auto" else configured


def _clean_records(text: str) -> list[tuple[int, str]]:
    """Project the raw hook file to content Git can retain after comments and scissors."""
    marker = _comment_marker(text)
    records: list[tuple[int, str]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        if line.startswith(marker):
            remainder = line.removeprefix(marker).strip()
            if SCISSORS.fullmatch(remainder):
                break
            continue
        records.append((line_number, line))
    while records and not records[0][1].strip():
        records.pop(0)
    while records and not records[-1][1].strip():
        records.pop()
    return records


def _field_occurrences(
    records: list[tuple[int, str]],
) -> list[dict[str, object]]:
    """Return recognized labels, their source lines, and their inline values."""
    matches: list[dict[str, object]] = []
    for index, (line_number, line) in enumerate(records):
        match = LABEL_PATTERN.match(line)
        if match:
            matches.append({
                "field_id": LABELS[match.group(1)],
                "label": match.group(1),
                "index": index,
                "line": line_number,
                "value": match.group(2),
            })
    return matches


def _disallowed_findings(
    path: Path,
    records: list[tuple[int, str]],
) -> list[dict[str, object]]:
    """Reject common body-field variants that would recreate reader boilerplate."""
    findings: list[dict[str, object]] = []
    for line_number, line in records:
        match = DISALLOWED_PATTERN.match(line)
        if not match:
            continue
        label = match.group(1)
        message = (
            "put the outcome in the commit subject; remove Outcome: from the body"
            if label.casefold() == "outcome"
            else f"remove {label}: from the reader narrative; use checks or Product impact as appropriate"
        )
        findings.append(finding(
            "commit-message.field-not-allowed",
            path,
            message,
            line=line_number,
        ))
    return findings


def _field_findings(
    path: Path,
    records: list[tuple[int, str]],
) -> list[dict[str, object]]:
    """Validate required field presence, order, uniqueness, and authored values."""
    findings: list[dict[str, object]] = []
    occurrences = _field_occurrences(records)
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
                f"put authored content on the same line as {label}:",
                line=int(found[0]["line"]),
            ))

    findings.extend(_disallowed_findings(path, records))

    if (
        len(required_positions) == len(REQUIRED_FIELDS)
        and required_positions != sorted(required_positions)
    ):
        findings.append(finding(
            "commit-message.field-order",
            path,
            "commit fields must follow Product impact, Nature of change, Code areas impacted, then Why",
            line=min(int(by_id[field_id][0]["line"]) for field_id, _ in REQUIRED_FIELDS),
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
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            findings.append(finding(
                "commit-message.file-unreadable",
                path,
                f"commit message file could not be read as UTF-8: {error}",
            ))
            text = ""
        records = _clean_records(text) if not findings else []
        subject = records[0][1].lstrip("\ufeff").strip() if records else ""
        subject_line = records[0][0] if records else 1
        if not findings and len(subject) < 8:
            findings.append(finding(
                "commit-message.short-subject",
                path,
                "commit subject must contain at least eight characters",
                line=subject_line,
            ))
        elif not findings and is_unhelpful_outcome(subject):
            findings.append(finding(
                "commit-message.unhelpful-subject",
                path,
                "commit subject must state a useful outcome, not a placeholder, generic label, or ticket alone",
                line=subject_line,
            ))
        if not findings and subject and not _generated(subject):
            findings.extend(_field_findings(path, records[1:]))
    payload = result_payload("commit-message", findings)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
