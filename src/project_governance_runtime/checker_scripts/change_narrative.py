"""Shared deterministic helpers for commit and pull request narratives."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
PLACEHOLDER_VALUES = frozenset({
    "-",
    "n/a",
    "na",
    "none",
    "not applicable",
    "placeholder",
    "same as above",
    "see diff",
    "to be added",
    "to be determined",
    "todo",
    "tbd",
    "unknown",
    "various",
})


def without_html_comments(value: str) -> str:
    """Remove hidden template guidance while preserving approximate source lines."""
    return HTML_COMMENT.sub(lambda match: "\n" * match.group(0).count("\n"), value)


def authored_text(value: str) -> str:
    """Return visible nonblank content from one narrative field or section."""
    visible = without_html_comments(value)
    return "\n".join(line.strip() for line in visible.splitlines() if line.strip())


def is_placeholder(value: str) -> bool:
    """Recognize only explicit placeholder-only values chosen by the contract."""
    normalized = authored_text(value).lower()
    normalized = re.sub(r"[`*_]", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .:;,-—–")
    if not normalized or normalized in PLACEHOLDER_VALUES:
        return True
    return bool(
        re.fullmatch(r"<[^<>]+>", normalized)
        or re.fullmatch(r"\[[^\[\]]+\]", normalized)
    )


def git_metadata_path(name: str, *, cwd: Path | None = None) -> Path:
    """Resolve a file inside this checkout's Git metadata, including linked worktrees."""
    root = (cwd or Path.cwd()).resolve()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--git-path", name],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError:
        return (root / ".git" / name).resolve(strict=False)
    if result.returncode == 0 and result.stdout.strip():
        candidate = Path(result.stdout.strip())
        if not candidate.is_absolute():
            candidate = root / candidate
        return candidate.resolve(strict=False)
    return (root / ".git" / name).resolve(strict=False)


def finding(
    rule_id: str,
    path: Path,
    message: str,
    *,
    line: int = 1,
) -> dict[str, object]:
    """Build one normalized blocking narrative finding."""
    return {
        "rule_id": rule_id,
        "severity": "blocking",
        "path": path.as_posix(),
        "line": line,
        "message": message,
    }


def result_payload(check: str, findings: list[dict[str, object]]) -> dict[str, object]:
    """Build the standard checker result envelope."""
    return {
        "version": 1,
        "check": check,
        "status": "failed" if findings else "passed",
        "finding_count": len(findings),
        "findings": findings,
    }
