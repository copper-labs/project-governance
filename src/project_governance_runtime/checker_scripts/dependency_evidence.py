"""Validate dependency freshness evidence, policy, and operator overrides."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from dependency_primitives import (
    AUTHORITATIVE_HOSTS,
    DEPENDENCY_KEYS,
    EVIDENCE_KEYS,
    OVERRIDE_KEYS,
    POLICY_KEYS,
    normalized_coordinate,
    parse_moment,
)

COORDINATE_REGISTRY_VERSION = 2
COORDINATE_FIELDS = ("ecosystem", "name", "version", "artifact_type")

def validate_registry(document: dict[str, Any], key: str, label: str) -> list[str]:
    """Validate one strict v2 coordinate-registry envelope as a grouped error."""
    root_keys = {"version", "owner", key}
    if document.get("version") == 1:
        return [
            f"{label}: legacy schema version 1 is incompatible with coordinate registry "
            f"version {COORDINATE_REGISTRY_VERSION}; migrate this registry before checking"
        ]
    errors = field_errors(document, root_keys, root_keys, label)
    if document.get("version") != COORDINATE_REGISTRY_VERSION:
        errors.append(
            f"{label}: version must be {COORDINATE_REGISTRY_VERSION}"
        )
    if not isinstance(document.get("owner"), str) or not document["owner"].strip():
        errors.append(f"{label}: owner must be a non-empty string")
    if not isinstance(document.get(key), list):
        errors.append(f"{label}: {key} must be a list")
    if not errors:
        return []
    return [f"{label}: invalid registry envelope: {'; '.join(errors)}"]
def field_errors(record: dict[str, Any], allowed: set[str], required: set[str], label: str) -> list[str]:
    """Report unknown and missing fields for one strict mapping."""
    errors: list[str] = []
    unknown = set(record) - allowed
    missing = required - set(record)
    if unknown:
        errors.append(f"{label}: unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        errors.append(f"{label}: missing fields: {', '.join(sorted(missing))}")
    return errors
def canonical_python_name(value: str) -> str:
    """Normalize a Python project name using registry comparison rules."""
    return re.sub(r"[-_.]+", "-", value).lower()
def pypi_source_matches(name: str, version: str, path: str, _host: str) -> bool:
    """Confirm a PyPI URL path identifies the exact project release."""
    parts = path.strip("/").split("/")
    project = len(parts) == 3 and parts[0] == "project"
    api = len(parts) == 4 and parts[0] == "pypi" and parts[3] == "json"
    return (project or api) and canonical_python_name(parts[1]) == canonical_python_name(name) and parts[2] == version
def npm_source_matches(name: str, version: str, path: str, _host: str) -> bool:
    """Confirm an npm URL path identifies the exact package release."""
    suffix = f"/{version}"
    return path.endswith(suffix) and path[: -len(suffix)].lstrip("/") == name
def github_source_matches(name: str, version: str, path: str, host: str) -> bool:
    """Confirm a GitHub URL path identifies the exact action commit."""
    repository = "/".join(name.split("/")[:2])
    expected = f"/{repository}/commit/{version}" if host == "github.com" else f"/repos/{repository}/commits/{version}"
    return path.lower() == expected.lower()
def maven_source_matches(name: str, version: str, path: str, host: str) -> bool:
    """Confirm a Maven URL path identifies the exact artifact release."""
    parts = name.split(":")
    if len(parts) < 2:
        return False
    group, artifact = parts[:2]
    if host == "central.sonatype.com":
        return path == f"/artifact/{group}/{artifact}/{version}"
    expected = f"/maven2/{group.replace('.', '/')}/{artifact}/{version}"
    return path == expected or path.startswith(expected + "/")
def authoritative_source_matches(coordinate: tuple[str, str, str, str], raw_url: Any) -> bool:
    """Validate that evidence links to an authoritative exact-coordinate URL."""
    ecosystem, name, version, _artifact_type = coordinate
    parsed = urlparse(str(raw_url or ""))
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.hostname not in AUTHORITATIVE_HOSTS.get(ecosystem, ())
    ):
        return False
    path = unquote(parsed.path).rstrip("/")
    matcher = {
        "pypi": pypi_source_matches,
        "npm": npm_source_matches,
        "github-actions": github_source_matches,
        "maven": maven_source_matches,
    }.get(ecosystem)
    return matcher is not None and matcher(name, version, path, str(parsed.hostname))
def evidence_dependency_errors(item: Any, label: str, evaluated: datetime, minimum_age: int) -> tuple[tuple[str, str, str, str] | None, list[str]]:
    """Validate one evidence dependency and return its coordinate."""
    if not isinstance(item, dict):
        return None, [f"{label}: expected a mapping"]
    errors = field_errors(item, DEPENDENCY_KEYS, DEPENDENCY_KEYS, label)
    if DEPENDENCY_KEYS - set(item):
        return None, errors
    coordinate = normalized_coordinate(
        item["ecosystem"], item["name"], item["version"], item["artifact_type"]
    )
    if not all(coordinate):
        errors.append(f"{label}: dependency coordinate fields must be non-empty strings")
    try:
        published = parse_moment(item["published_at"], f"{label}.published_at")
        if evaluated - published < timedelta(days=minimum_age):
            errors.append(f"{label}: release was younger than {minimum_age} full days at evaluated_at")
    except ValueError as exc:
        errors.append(str(exc))
    if not authoritative_source_matches(coordinate, item["source_url"]):
        errors.append(
            f"{label}.source_url: expected an authoritative HTTPS URL bound to the exact dependency coordinate"
        )
    return coordinate, errors
def evidence_record_result(record: Any, label: str, minimum_age: int, as_of: datetime) -> tuple[tuple[str, str, str, str] | None, dict[str, Any] | None, list[str]]:
    """Validate one coordinate evidence record without indexing invalid data."""
    if not isinstance(record, dict):
        return None, None, [f"{label}: expected a mapping"]
    errors = field_errors(record, EVIDENCE_KEYS, EVIDENCE_KEYS, label)
    if EVIDENCE_KEYS - set(record):
        return None, None, errors
    try:
        evaluated = parse_moment(record["evaluated_at"], f"{label}.evaluated_at")
    except ValueError as exc:
        return None, None, [*errors, str(exc)]
    dependency_record = {key: record[key] for key in DEPENDENCY_KEYS}
    coordinate, coordinate_errors = evidence_dependency_errors(
        dependency_record, label, evaluated, minimum_age
    )
    errors.extend(coordinate_errors)
    if evaluated > as_of:
        errors.append(f"{label}.evaluated_at: cannot be later than the checker evaluation time")
    return coordinate, record, errors


def record_coordinate(record: Any) -> tuple[str, str, str, str] | None:
    """Read only the coordinate identity needed to select a relevant record."""
    if not isinstance(record, dict) or any(field not in record for field in COORDINATE_FIELDS):
        return None
    coordinate = normalized_coordinate(*(record[field] for field in COORDINATE_FIELDS))
    return coordinate if all(coordinate) else None


def index_evidence(
    document: dict[str, Any],
    minimum_age: int,
    as_of: datetime,
    relevant_coordinates: set[tuple[str, str, str, str]],
) -> tuple[
    dict[tuple[str, str, str, str], dict[str, Any]],
    set[tuple[str, str, str, str]],
    list[str],
]:
    """Validate and index only evidence records matching changed coordinates."""
    indexed: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    matched: set[tuple[str, str, str, str]] = set()
    errors = validate_registry(document, "records", "evidence")
    if errors:
        return indexed, set(relevant_coordinates), errors
    for number, raw_record in enumerate(document["records"], start=1):
        selected_coordinate = record_coordinate(raw_record)
        if selected_coordinate not in relevant_coordinates:
            continue
        matched.add(selected_coordinate)
        label = f"evidence.records[{number}]"
        coordinate, record, record_errors = evidence_record_result(raw_record, label, minimum_age, as_of)
        errors.extend(record_errors)
        if coordinate and record and not record_errors:
            if coordinate in indexed:
                errors.append(f"{label}: duplicate dependency coordinate")
            else:
                indexed[coordinate] = record
    return indexed, matched, errors
def override_timing_errors(record: dict[str, Any], label: str, override_max_days: int, as_of: datetime) -> list[str]:
    """Check approval and expiry bounds for one operator override."""
    try:
        approved = parse_moment(record["approved_at"], f"{label}.approved_at")
        expires = parse_moment(record["expires_at"], f"{label}.expires_at", end_of_date=True)
    except ValueError as exc:
        return [str(exc)]
    if expires <= approved:
        return [f"{label}: expires_at must be after approved_at"]
    if approved > as_of:
        return [f"{label}: approved_at cannot be later than the checker evaluation time"]
    if expires.date() - approved.date() > timedelta(days=override_max_days):
        return [f"{label}: override exceeds policy maximum of {override_max_days} days"]
    if expires < as_of:
        return [f"{label}: override has expired"]
    return []
def override_record_result(record: Any, label: str, override_max_days: int, as_of: datetime) -> tuple[tuple[str, str, str, str] | None, dict[str, Any] | None, list[str]]:
    """Validate one override before making it eligible for reconciliation."""
    if not isinstance(record, dict):
        return None, None, [f"{label}: expected a mapping"]
    errors = field_errors(record, OVERRIDE_KEYS, OVERRIDE_KEYS, label)
    if OVERRIDE_KEYS - set(record):
        return None, None, errors
    errors.extend(override_timing_errors(record, label, override_max_days, as_of))
    coordinate = normalized_coordinate(
        record["ecosystem"], record["name"], record["version"], record["artifact_type"]
    )
    if not all(coordinate):
        errors.append(f"{label}: dependency coordinate fields must be non-empty strings")
    try:
        published = parse_moment(record["published_at"], f"{label}.published_at")
        approved = parse_moment(record["approved_at"], f"{label}.approved_at")
        if published > approved:
            errors.append(f"{label}.published_at: cannot be later than approved_at")
    except ValueError as exc:
        errors.append(str(exc))
    if not authoritative_source_matches(coordinate, record["source_url"]):
        errors.append(
            f"{label}.source_url: expected an authoritative HTTPS URL bound to the exact dependency coordinate"
        )
    for field in ("reason", "risk_owner", "approved_by", "follow_up", "evidence"):
        if not isinstance(record[field], str) or not record[field].strip():
            errors.append(f"{label}.{field}: must be a non-empty string")
    if record["approver_role"] != "operator":
        errors.append(f"{label}.approver_role: must be operator")
    return coordinate, record, errors
def index_overrides(
    document: dict[str, Any],
    override_max_days: int,
    as_of: datetime,
    relevant_coordinates: set[tuple[str, str, str, str]],
) -> tuple[
    dict[tuple[str, str, str, str], dict[str, Any]],
    set[tuple[str, str, str, str]],
    list[str],
]:
    """Validate and index only overrides matching changed coordinates."""
    indexed: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    matched: set[tuple[str, str, str, str]] = set()
    errors = validate_registry(document, "overrides", "overrides")
    if errors:
        return indexed, set(relevant_coordinates), errors
    for number, raw_record in enumerate(document["overrides"], start=1):
        selected_coordinate = record_coordinate(raw_record)
        if selected_coordinate not in relevant_coordinates:
            continue
        matched.add(selected_coordinate)
        label = f"overrides.overrides[{number}]"
        coordinate, record, record_errors = override_record_result(raw_record, label, override_max_days, as_of)
        errors.extend(record_errors)
        if coordinate and record and not record_errors:
            if coordinate in indexed:
                errors.append(f"{label}: duplicate dependency coordinate")
            else:
                indexed[coordinate] = record
    return indexed, matched, errors
def coordinate_set(items: list[dict[str, Any]]) -> set[tuple[str, str, str, str]]:
    """Project dependency mappings into comparable coordinate tuples."""
    return {
        normalized_coordinate(
            item.get("ecosystem"), item.get("name"), item.get("version"), item.get("artifact_type")
        )
        for item in items
        if isinstance(item, dict)
    }
def finding(rule_id: str, path: str, message: str) -> dict[str, str]:
    """Create one normalized blocking dependency finding."""
    return {"rule_id": rule_id, "path": path, "severity": "blocking", "message": message}
def validate_policy(document: dict[str, Any], path: Path, evidence_path: Path) -> tuple[int, int, list[dict[str, str]]]:
    """Validate policy fields and return safe evaluation limits."""
    findings: list[dict[str, str]] = []
    for error in field_errors(document, POLICY_KEYS, POLICY_KEYS, "policy"):
        findings.append(finding("dependency.policy-invalid", path.as_posix(), error))
    if document.get("version") != 1:
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "version must be 1"))
    if not isinstance(document.get("owner"), str) or not document.get("owner", "").strip():
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "owner must be a non-empty string"))
    minimum = document.get("minimum_age_days")
    if not isinstance(minimum, int) or isinstance(minimum, bool) or minimum < 14:
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "minimum_age_days must be an integer of at least 14"))
        minimum = 14
    maximum = document.get("override_max_days")
    if not isinstance(maximum, int) or isinstance(maximum, bool) or maximum <= 0:
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "override_max_days must be a positive integer"))
        maximum = 1
    if document.get("fail_closed_when_unknown") is not True:
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "fail_closed_when_unknown must be true"))
    configured_evidence = str(document.get("evidence_path", ""))
    if configured_evidence != evidence_path.as_posix():
        findings.append(finding("dependency.policy-invalid", path.as_posix(), "evidence_path must match the checker --evidence path exactly"))
    return minimum, maximum, findings
