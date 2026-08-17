"""Share dependency-checker constants and deterministic primitive validation rules."""

from __future__ import annotations

import argparse
import base64
import fnmatch
import hashlib
import json
import re
import stat
import sys
import xml.etree.ElementTree as ET
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

import yaml

from governance_changed_paths import changed_paths, git

GOVERNED_GLOBS = (
    "package.json", "**/package.json", "package-lock.json", "**/package-lock.json",
    "pnpm-workspace.yaml", "**/pnpm-workspace.yaml", "requirements*.txt", "**/requirements*.txt",
    "pom.xml", "**/pom.xml", ".npmrc", "**/.npmrc", ".yarnrc.yml", "**/.yarnrc.yml",
    ".github/workflows/*.yml", ".github/workflows/*.yaml",
)
REQUIREMENT = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9._,-]+\])?)==(?P<version>[^\s;]+)(?:\s*;.*)?$")
NPM_EXACT = re.compile(r"^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$")
NPM_NAME = re.compile(r"^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$")
MAVEN_VERSION = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._+-]*$")
MAVEN_ID = re.compile(r"^[0-9A-Za-z][0-9A-Za-z_.-]*$")
ACTION_SHA = re.compile(r"^[0-9a-fA-F]{40}$")
POLICY_KEYS = {"version", "owner", "minimum_age_days", "fail_closed_when_unknown", "evidence_path", "override_max_days"}
EVIDENCE_KEYS = {
    "name", "ecosystem", "version", "artifact_type", "evaluated_at",
    "published_at", "source_url",
}
DEPENDENCY_KEYS = {"name", "ecosystem", "version", "artifact_type", "published_at", "source_url"}
OVERRIDE_KEYS = {"name", "ecosystem", "version", "artifact_type", "published_at", "source_url", "reason", "risk_owner", "approved_by", "approver_role", "approved_at", "expires_at", "follow_up", "evidence"}
AUTHORITATIVE_HOSTS = {"pypi": ("pypi.org",), "npm": ("registry.npmjs.org",), "github-actions": ("github.com", "api.github.com"), "maven": ("repo1.maven.org", "central.sonatype.com")}
CANONICAL_NPM_REGISTRY = "https://registry.npmjs.org"
CANONICAL_MAVEN_REPOSITORIES = {"https://repo1.maven.org/maven2", "https://repo.maven.apache.org/maven2"}
class UnsupportedDependencyFormat(ValueError):
    """Signal that an exact parser cannot prove the changed dependency surface."""
def load_yaml(path: Path) -> dict[str, Any]:
    """Load a required YAML mapping without silently substituting defaults."""
    if not path.is_file():
        raise ValueError(f"required file does not exist: {path}")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError, yaml.YAMLError) as exc:
        raise ValueError(f"cannot read YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("expected a YAML mapping")
    return data
def normalized_path(value: Any) -> str:
    """Return a repository-relative POSIX path or reject ambiguous bindings."""
    text = str(value or "").replace("\\", "/")
    candidate = PurePosixPath(text)
    if not text or candidate.is_absolute() or ".." in candidate.parts or text != candidate.as_posix():
        raise ValueError("path must be a normalized repository-relative POSIX path")
    return text
def is_governed(path: str) -> bool:
    """Match the dependency pack's governed file surface."""
    return any(fnmatch.fnmatch(path, pattern) for pattern in GOVERNED_GLOBS)
def sha256(path: Path) -> str:
    """Return the exact digest used to bind evidence and overrides."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()
def parse_moment(value: Any, field: str, *, end_of_date: bool = False) -> datetime:
    """Parse an ISO date or timezone-aware timestamp as UTC."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.max if end_of_date else time.min, tzinfo=timezone.utc)
    else:
        text = str(value or "").strip()
        if not text:
            raise ValueError(f"{field} is required")
        try:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
                parsed = datetime.combine(date.fromisoformat(text), time.max if end_of_date else time.min, tzinfo=timezone.utc)
            else:
                parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO date or timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)
def dependency(name: str, ecosystem: str, version: str, artifact_type: str) -> dict[str, str]:
    """Build one normalized dependency coordinate."""
    normalized = normalized_coordinate(ecosystem, name, version, artifact_type)
    return {
        "ecosystem": normalized[0],
        "name": normalized[1],
        "version": normalized[2],
        "artifact_type": normalized[3],
    }
def normalized_coordinate(ecosystem: Any, name: Any, version: Any, artifact_type: Any) -> tuple[str, str, str, str]:
    """Normalize registry-equivalent coordinate fields before tuple comparison."""
    normalized_ecosystem = str(ecosystem or "").strip().lower()
    normalized_name = str(name or "").strip()
    if normalized_ecosystem == "pypi":
        normalized_name = re.sub(r"[-_.]+", "-", normalized_name).lower()
    elif normalized_ecosystem == "github-actions":
        normalized_name = normalized_name.lower()
    return (
        normalized_ecosystem,
        normalized_name,
        str(version or "").strip(),
        str(artifact_type or "").strip().lower(),
    )
