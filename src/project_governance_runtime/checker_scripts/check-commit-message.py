#!/usr/bin/env python3
"""Validate one useful commit subject and authored body."""

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
TRAILER = re.compile(
    r"^(?:"
    r"(?:signed-off|co-authored|reviewed|acked|tested|reported|suggested|helped|mentored)-by"
    r"|change-id|depends-on|fixes|closes|refs|see-also"
    r"):[ \t]+\S",
    re.IGNORECASE,
)


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


def _body_finding(
    path: Path,
    records: list[tuple[int, str]],
) -> dict[str, object] | None:
    """Require authored body text without imposing labels, order, or prose scoring."""
    authored_records = [
        (line_number, line)
        for line_number, line in records
        if line.strip() and TRAILER.match(line.strip()) is None
    ]
    body = "\n".join(line for _, line in authored_records).strip()
    if not body:
        return finding(
            "commit-message.body-missing",
            path,
            "commit body needs a short authored explanation beyond Git trailers",
        )
    if is_placeholder(body):
        return finding(
            "commit-message.body-placeholder",
            path,
            "replace the placeholder commit body with an authored explanation",
            line=authored_records[0][0],
        )
    return None


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
            body_finding = _body_finding(path, records[1:])
            if body_finding is not None:
                findings.append(body_finding)
    payload = result_payload("commit-message", findings)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
