#!/usr/bin/env python3
"""Validate selected live Markdown without generated-file ownership state.

The packaged runtime receives its documentation selection from the validation runner, so this
checker evaluates only live Markdown in that packet or the explicit exhaustive Git selection.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from governance_changed_paths import changed_path_views


ROOT = Path.cwd()
REQUIRED_KEYS = {"id", "title", "status", "owner", "created", "updated", "summary"}
VALID_STATUSES = {"active", "approved", "archived", "completed", "current", "deferred", "draft", "superseded"}
LESSON_STATUSES = {"archived", "current", "draft"}
LESSON_STAGES = {"Frame", "Plan", "Work", "Review", "Capture"}
LESSON_PROMOTION_STATES = {"note", "pattern", "policy", "check", "skill", "route", "retired"}
LESSON_CONFIDENCE = {"low", "medium", "high"}
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
ACTIVE_PLAN_PREFIX = "docs/exec-plans/active/"
ACTIVE_PLAN_INDEX = "docs/exec-plans/README.md"


def load_yaml_text(text: str, label: str, errors: list[str]) -> Any:
    """Parse YAML text and retain a user-actionable failure."""
    try:
        return yaml.safe_load(text) or {}
    except yaml.YAMLError as exc:
        errors.append(f"{label}: invalid YAML: {exc}")
        return {}


def frontmatter(path: Path, rel: str, errors: list[str]) -> dict[str, Any]:
    """Parse one Markdown document's leading YAML frontmatter."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        errors.append(f"{rel}: missing YAML frontmatter")
        return {}
    end = text.find("\n---\n", 4)
    if end == -1:
        errors.append(f"{rel}: frontmatter is not closed")
        return {}
    data = load_yaml_text(text[4:end], rel, errors)
    if not isinstance(data, dict):
        errors.append(f"{rel}: frontmatter must be a mapping")
        return {}
    return data


def iso_date_value(value: Any) -> date | None:
    """Parse one YAML date scalar without accepting an arbitrary string."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def selected_markdown_paths(mode: str, errors: list[str]) -> list[tuple[str, Path]]:
    """Resolve existing live Markdown only from the runtime selection authority."""
    paths: list[tuple[str, Path]] = []
    try:
        selections = changed_path_views(mode)
    except (RuntimeError, ValueError, json.JSONDecodeError) as exc:
        errors.append(f"documentation selection unavailable: {exc}")
        return paths
    root = ROOT.resolve()
    for value, content_path, _ in selections:
        repository_path = ROOT / value
        if repository_path.suffix.lower() != ".md" or not content_path.exists():
            continue
        try:
            repository_path.resolve().relative_to(root)
        except (OSError, ValueError):
            errors.append(f"{value}: selected Markdown resolves outside the repository")
            continue
        if repository_path.is_symlink() or not content_path.is_file():
            errors.append(f"{value}: selected Markdown must be a regular file")
            continue
        paths.append((value, content_path))
    return sorted(set(paths), key=lambda item: item[0])


def validate_document_identity(data: dict[str, Any], rel: str, seen: dict[str, str], errors: list[str]) -> None:
    """Validate required document vocabulary and unique identity within this packet."""
    missing = sorted(REQUIRED_KEYS - set(data))
    document_type = data.get("type", data.get("doc_type"))
    if document_type is None:
        missing.append("type or doc_type")
    if missing:
        errors.append(f"{rel}: missing frontmatter keys: {', '.join(missing)}")
    doc_id = str(data.get("id", "")).strip()
    if doc_id and doc_id in seen:
        errors.append(f"{rel}: duplicate frontmatter id {doc_id} also used by {seen[doc_id]}")
    if doc_id:
        seen[doc_id] = rel
    if data.get("type") and data.get("doc_type") and data["type"] != data["doc_type"]:
        errors.append(f"{rel}: type and doc_type must agree when both are present")
    if data.get("status") and data.get("status") not in VALID_STATUSES:
        errors.append(f"{rel}: unknown status {data.get('status')!r}")


def validate_document_dates(data: dict[str, Any], rel: str, errors: list[str]) -> None:
    """Validate the lifecycle dates without mixing them into identity validation."""
    created = iso_date_value(data.get("created"))
    updated = iso_date_value(data.get("updated"))
    if created is None and "created" in data:
        errors.append(f"{rel}: created must be an ISO date in YYYY-MM-DD format")
    if updated is None and "updated" in data:
        errors.append(f"{rel}: updated must be an ISO date in YYYY-MM-DD format")
    if created and updated and updated < created:
        errors.append(f"{rel}: updated must be on or after created")


def validate_lesson_frontmatter(data: dict[str, Any], rel: str, errors: list[str]) -> None:
    """Validate the bounded lifecycle contract for Capture lesson documents."""
    required = {"stage", "context", "evidence_links", "confidence", "refresh_by", "promotion_state", "provenance"}
    missing = sorted(required - set(data))
    if missing:
        errors.append(f"{rel}: missing lesson frontmatter keys: {', '.join(missing)}")
    for field, values in (
        ("status", LESSON_STATUSES),
        ("stage", LESSON_STAGES),
        ("confidence", LESSON_CONFIDENCE),
        ("promotion_state", LESSON_PROMOTION_STATES),
    ):
        if data.get(field) not in values:
            errors.append(f"{rel}: lesson {field} must be one of: {', '.join(sorted(values))}")
    for field in ("context", "provenance"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"{rel}: lesson {field} must be a non-empty string")
    evidence_links = data.get("evidence_links")
    if not isinstance(evidence_links, list) or not evidence_links or any(
        not isinstance(link, str) or not link.strip() for link in evidence_links
    ):
        errors.append(f"{rel}: lesson evidence_links must be a non-empty string list")
    if iso_date_value(data.get("refresh_by")) is None:
        errors.append(f"{rel}: refresh_by must be an ISO date in YYYY-MM-DD format")


def _index_targets(path: Path, errors: list[str]) -> set[str]:
    """Return local link targets from the active-plan index."""
    if not path.is_file() or path.is_symlink():
        errors.append(f"{ACTIVE_PLAN_INDEX}: active-plan index is missing")
        return set()
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"{ACTIVE_PLAN_INDEX}: cannot read active-plan index: {exc}")
        return set()
    return {
        posixpath.normpath(match.group(1).strip().split("#", 1)[0])
        for match in LINK_RE.finditer(text)
        if not match.group(1).strip().startswith(("#", "http://", "https://", "mailto:"))
    }


def validate_exec_plan_lifecycle(
    data: dict[str, Any], rel: str, errors: list[str]
) -> None:
    """Require active execution plans to use one type and one explicit index."""
    if not rel.startswith(ACTIVE_PLAN_PREFIX) or rel == ACTIVE_PLAN_PREFIX:
        return
    if data.get("type", data.get("doc_type")) != "exec-plan":
        errors.append(f"{rel}: active execution plan type must be exec-plan")
    if data.get("status") != "active":
        errors.append(f"{rel}: active execution plan status must be active")
    target = Path(rel).relative_to("docs/exec-plans").as_posix()
    if target not in _index_targets(ROOT / ACTIVE_PLAN_INDEX, errors):
        errors.append(f"{rel}: active execution plan is not linked from {ACTIVE_PLAN_INDEX}")


def validate_active_plan_index(rel: str, errors: list[str]) -> None:
    """Require the selected index to name every current active plan exactly once or more."""
    if rel != ACTIVE_PLAN_INDEX:
        return
    targets = _index_targets(ROOT / ACTIVE_PLAN_INDEX, errors)
    active_root = ROOT / ACTIVE_PLAN_PREFIX
    if not active_root.is_dir():
        return
    for plan in sorted(active_root.glob("*.md")):
        target = f"active/{plan.name}"
        if target not in targets:
            errors.append(f"{ACTIVE_PLAN_INDEX}: active plan is not indexed: {target}")


def validate_markdown(paths: list[tuple[str, Path]], errors: list[str]) -> None:
    """Validate governed docs metadata while allowing conventional root instruction files."""
    seen: dict[str, str] = {}
    for rel, content_path in paths:
        if not rel.startswith("docs/"):
            continue
        try:
            data = frontmatter(content_path, rel, errors)
        except (OSError, UnicodeError) as exc:
            errors.append(f"{rel}: cannot read Markdown: {exc}")
            continue
        validate_document_identity(data, rel, seen, errors)
        validate_document_dates(data, rel, errors)
        validate_exec_plan_lifecycle(data, rel, errors)
        validate_active_plan_index(rel, errors)
        if data.get("type", data.get("doc_type")) == "lesson":
            validate_lesson_frontmatter(data, rel, errors)


def validate_links(paths: list[tuple[str, Path]], errors: list[str]) -> None:
    """Check selected Markdown links for repository containment and existing local targets."""
    root = ROOT.resolve()
    for rel, content_path in paths:
        try:
            text = content_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        for match in LINK_RE.finditer(text):
            target = match.group(1).strip()
            local_target = target.split("#", 1)[0]
            if not local_target or target.startswith(("#", "http://", "https://", "mailto:")) or "://" in target:
                continue
            resolved = ((ROOT / rel).parent / local_target).resolve()
            try:
                resolved.relative_to(root)
            except ValueError:
                errors.append(f"{rel}: link escapes repository: {target}")
            else:
                if not resolved.exists():
                    errors.append(f"{rel}: link target does not exist: {target}")


def result(errors: list[str]) -> dict[str, object]:
    """Project checker errors into the runtime's normalized blocking result shape."""
    findings = [
        {
            "rule_id": "documentation.governance",
            "severity": "blocking",
            "message": error,
        }
        for error in sorted(errors)
    ]
    return {
        "version": 1,
        "kind": "governance-check-result",
        "status": "failed" if findings else "passed",
        "finding_count": len(findings),
        "findings": findings,
    }


def main() -> int:
    """Parse selection input, validate Markdown, and emit one JSON result."""
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--staged", action="store_true")
    selection.add_argument("--changed", action="store_true")
    selection.add_argument("--all", action="store_true")
    args = parser.parse_args()
    mode = "staged" if args.staged else "changed" if args.changed else "all"
    errors: list[str] = []
    paths = selected_markdown_paths(mode, errors)
    validate_markdown(paths, errors)
    validate_links(paths, errors)
    payload = result(errors)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if payload["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
