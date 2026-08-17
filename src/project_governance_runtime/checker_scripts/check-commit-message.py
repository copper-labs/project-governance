#!/usr/bin/env python3
"""Validate one commit subject and emit normalized evidence."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    """Report a short subject while treating an absent message as a valid no-op."""
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".git/COMMIT_EDITMSG")
    findings: list[dict[str, object]] = []
    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
        subject = lines[0].strip() if lines else ""
        if len(subject) < 8:
            findings.append({
                "rule_id": "commit-message.short-subject",
                "severity": "blocking",
                "path": path.as_posix(),
                "line": 1,
                "message": "commit subject must contain at least eight characters",
            })
    payload = {
        "version": 1,
        "check": "commit-message",
        "status": "failed" if findings else "passed",
        "finding_count": len(findings),
        "findings": findings,
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
