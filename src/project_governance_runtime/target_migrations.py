"""Own target registry migration inventory and completion validation for runtime updates."""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from importlib.resources import files
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker


QUALITY_DISPOSITIONS_PATH = Path("config/policies/code-quality-dispositions.yaml")
DEPENDENCY_EVIDENCE_PATH = Path("config/policies/dependency-freshness-evidence.yaml")
DEPENDENCY_OVERRIDES_PATH = Path("config/policies/dependency-freshness-overrides.yaml")
COORDINATE_FIELDS = ("ecosystem", "name", "version", "artifact_type")
EVIDENCE_FIELDS = frozenset({
    *COORDINATE_FIELDS, "evaluated_at", "published_at", "source_url",
})
OVERRIDE_FIELDS = frozenset({
    *COORDINATE_FIELDS, "published_at", "source_url", "reason", "risk_owner",
    "approved_by", "approver_role", "approved_at", "expires_at", "follow_up", "evidence",
})
MIGRATION_TARGETS = {
    "quality-dispositions-v2": QUALITY_DISPOSITIONS_PATH,
    "dependency-freshness-evidence": DEPENDENCY_EVIDENCE_PATH,
    "dependency-freshness-overrides": DEPENDENCY_OVERRIDES_PATH,
}


def _load_optional_mapping(path: Path) -> dict[str, Any] | None:
    """Load one optional YAML mapping without treating an absent file as an error."""
    if not path.is_file() or path.is_symlink():
        return None
    value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return value if isinstance(value, dict) else None


def _root_candidate(root: Path, relative: str) -> tuple[Path | None, str | None]:
    """Resolve one registry beneath root while rejecting every symlink component."""
    root_resolved = root.resolve()
    candidate = root
    for component in Path(relative).parts:
        candidate /= component
        if candidate.is_symlink():
            return None, f"path component is a symlink: {candidate.relative_to(root).as_posix()}"
    try:
        candidate.resolve(strict=False).relative_to(root_resolved)
    except ValueError:
        return None, "resolved path escapes the repository root"
    return candidate, None


def _disposition_conversion(item: dict[str, Any]) -> str:
    """Describe the exact fail-closed conversion required for one v1 decision."""
    disposition = str(item.get("disposition", "unknown"))
    if disposition == "cohesion-accepted":
        return (
            "convert to v2 cohesion-accepted; retain the decision identity, review, "
            "and rationale, add or preserve responsibility, and remove current_lines, "
            "source_fingerprint, and re_review_at_lines"
        )
    if disposition == "temporary-waiver":
        return (
            "convert to v2 temporary-waiver without weakening it; rename current_lines "
            "to current_value, retain the exact source_fingerprint, expires, and "
            "remediation_plan, add responsibility, and do not convert to cohesion-accepted"
        )
    if disposition == "refactor-required":
        return (
            "convert to v2 refactor-required without weakening it; retain the blocking "
            "decision identity and review, add responsibility, remove byte- and line-bound "
            "fields, and do not convert to cohesion-accepted"
        )
    return "review the unknown v1 disposition manually; it cannot authorize a pass"


def _v1_disposition_migrations(root: Path) -> list[dict[str, Any]]:
    """Return deterministic exact-key conversion instructions for local v1 decisions."""
    config = _load_optional_mapping(root / QUALITY_DISPOSITIONS_PATH)
    if not config or config.get("version") != 1:
        return []
    migrations: list[dict[str, Any]] = []
    for item in config.get("dispositions", []):
        if not isinstance(item, dict):
            continue
        finding = str(item.get("finding", "?"))
        path = str(item.get("path", "?"))
        symbol = str(item.get("symbol", "?"))
        disposition = str(item.get("disposition", "?"))
        migrations.append({
            "record_key": {"finding": finding, "path": path, "symbol": symbol},
            "key": f"{finding}|{path}|{symbol}",
            "disposition": disposition,
            "required_conversion": _disposition_conversion(item),
        })
    return sorted(migrations, key=lambda value: (value["key"], value["disposition"]))


def _normalized_coordinate(item: dict[str, Any]) -> tuple[str, str, str, str]:
    """Normalize one dependency identity exactly as the v2 checker indexes it."""
    ecosystem = str(item.get("ecosystem", "")).strip().lower()
    name = str(item.get("name", "")).strip()
    if ecosystem == "pypi":
        name = re.sub(r"[-_.]+", "-", name).lower()
    elif ecosystem == "github-actions":
        name = name.lower()
    return (
        ecosystem,
        name,
        str(item.get("version", "")).strip(),
        str(item.get("artifact_type", "")).strip().lower(),
    )


def _coordinate_value(coordinate: tuple[str, str, str, str]) -> dict[str, str]:
    """Render one normalized coordinate using stable public field names."""
    return dict(zip(COORDINATE_FIELDS, coordinate))


def _dependency_registry_document(root: Path, path: Path) -> tuple[dict[str, Any] | None, str | None]:
    """Load one fixed target registry without following a symlink or escaping root."""
    target, path_error = _root_candidate(root, path.as_posix())
    if target is None:
        return None, str(path_error)
    if not target.exists():
        return None, None
    if not target.is_file():
        return None, "registry is not a regular file"
    try:
        value = _load_optional_mapping(target)
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        return None, f"registry cannot be loaded: {error.__class__.__name__}"
    return value, None if value is not None else "registry must be a mapping"


def _malformed_registry(kind: str, path: Path, action: str) -> dict[str, Any]:
    """Build one malformed-registry migration obligation."""
    return {
        "kind": kind,
        "path": path.as_posix(),
        "status": "malformed",
        "required_conversion": action,
        "records": [],
    }


def _legacy_registry_records(
    root: Path, kind: str, path: Path, list_key: str
) -> tuple[list[Any] | None, dict[str, Any] | None]:
    """Admit one exact v1 envelope or return its complete malformed obligation."""
    document, load_error = _dependency_registry_document(root, path)
    if load_error:
        return None, _malformed_registry(kind, path, load_error)
    if document is None or document.get("version") == 2:
        return None, None
    if document.get("version") != 1:
        return None, _malformed_registry(
            kind, path, "set a supported envelope version and validate all records"
        )
    raw_records = document.get(list_key)
    if set(document) != {"version", "owner", list_key} or not isinstance(raw_records, list):
        return None, _malformed_registry(
            kind, path, "repair the exact v1 envelope before coordinate migration"
        )
    return raw_records, None


def _converted_records(
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]],
    malformed: list[dict[str, Any]],
    action: str,
) -> list[dict[str, Any]]:
    """Render normalized coordinate groups plus exact malformed legacy records."""
    converted = [
        {
            "key": "|".join(coordinate),
            "coordinate": _coordinate_value(coordinate),
            "legacy_records": grouped[coordinate],
            "required_conversion": action,
        }
        for coordinate in sorted(grouped)
    ]
    converted.extend({
        "key": item["record_key"],
        "legacy_records": [item],
        "required_conversion": "repair this malformed v1 record before conversion",
    } for item in malformed)
    return converted


def _evidence_migration(root: Path) -> dict[str, Any] | None:
    """Flatten legacy path-bound evidence into normalized coordinate groups."""
    kind = "dependency-freshness-evidence"
    records, obligation = _legacy_registry_records(root, kind, DEPENDENCY_EVIDENCE_PATH, "records")
    if records is None:
        return obligation
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    malformed: list[dict[str, Any]] = []
    for record_index, record in enumerate(records):
        if not isinstance(record, dict) or not isinstance(record.get("dependencies"), list):
            malformed.append({"record_key": f"records[{record_index}]", "record": record})
            continue
        for dependency_index, dependency in enumerate(record["dependencies"]):
            key = f"records[{record_index}].dependencies[{dependency_index}]"
            if not isinstance(dependency, dict):
                malformed.append({"record_key": key, "record": dependency})
                continue
            grouped.setdefault(_normalized_coordinate(dependency), []).append({
                "record_key": key,
                "path": record.get("path"),
                "sha256": record.get("sha256"),
                "evaluated_at": record.get("evaluated_at"),
                "dependency": dependency,
            })
    action = (
        "flatten dependencies[] into one v2 records[] item per normalized coordinate; "
        "retain coordinate and evidence fields, deduplicate the coordinate, and drop path and sha256"
    )
    return {
        "kind": kind,
        "path": DEPENDENCY_EVIDENCE_PATH.as_posix(),
        "status": "migration-required",
        "source_version": 1,
        "target_version": 2,
        "records": _converted_records(grouped, malformed, action),
    }


def _override_migration(root: Path) -> dict[str, Any] | None:
    """Project legacy path-bound overrides into normalized coordinate groups."""
    kind = "dependency-freshness-overrides"
    records, obligation = _legacy_registry_records(root, kind, DEPENDENCY_OVERRIDES_PATH, "overrides")
    if records is None:
        return obligation
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    malformed: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        key = f"overrides[{index}]"
        if not isinstance(record, dict):
            malformed.append({"record_key": key, "record": record})
            continue
        grouped.setdefault(_normalized_coordinate(record), []).append({
            "record_key": key, "record": record,
        })
    action = (
        "change the envelope to v2, retain one override per normalized coordinate, "
        "deduplicate the coordinate, and drop legacy path and sha256"
    )
    return {
        "kind": kind,
        "path": DEPENDENCY_OVERRIDES_PATH.as_posix(),
        "status": "migration-required",
        "source_version": 1,
        "target_version": 2,
        "records": _converted_records(grouped, malformed, action),
    }


def _dependency_registry_migrations(root: Path) -> list[dict[str, Any]]:
    """Inventory evidence and override migration obligations independently."""
    migrations = [value for value in (_evidence_migration(root), _override_migration(root)) if value]
    return sorted(migrations, key=lambda value: (value["path"], value["status"]))


def _json_value(value: Any) -> Any:
    """Normalize YAML date values before validating a JSON-schema migration target."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_value(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_json_value(child) for child in value]
    return value


def _validate_quality_registry(root: Path) -> dict[str, Any]:
    """Validate a present target quality registry against the shipped v2 schema."""
    expected_path = QUALITY_DISPOSITIONS_PATH.as_posix()
    target, path_error = _root_candidate(root, expected_path)
    base = {"kind": "quality-dispositions-v2", "path": expected_path}
    if target is None:
        return {**base, "status": "required", "reason": str(path_error)}
    if not target.exists():
        return {**base, "status": "complete", "reason": "optional registry is absent"}
    if not target.is_file():
        return {**base, "status": "required", "reason": "registry is not a regular file"}
    try:
        value = _load_optional_mapping(target)
        schema_resource = files("project_governance_runtime").joinpath(
            "defaults", "schemas", "quality-disposition.schema.json"
        )
        schema = json.loads(schema_resource.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        errors = sorted(error.message for error in validator.iter_errors(_json_value(value)))
    except (OSError, UnicodeError, yaml.YAMLError, json.JSONDecodeError) as error:
        return {**base, "status": "required", "reason": f"migration validation failed to load: {error.__class__.__name__}"}
    if errors:
        return {
            **base, "status": "required",
            "reason": "converted disposition registry does not satisfy the shipped v2 schema",
            "errors": errors,
        }
    return {**base, "status": "complete", "reason": "converted disposition registry satisfies the shipped v2 schema"}


def _validated_v2_records(
    root: Path, kind: str, path: Path, list_key: str
) -> tuple[list[Any] | None, dict[str, Any] | None]:
    """Validate one dependency envelope before record-level interpretation."""
    document, load_error = _dependency_registry_document(root, path)
    base = {"kind": kind, "path": path.as_posix()}
    if load_error:
        return None, {**base, "status": "required", "reason": load_error}
    if document is None:
        return None, {**base, "status": "complete", "reason": "optional registry is absent"}
    if set(document) != {"version", "owner", list_key}:
        return None, {**base, "status": "required", "reason": "registry envelope fields are not exact"}
    if document.get("version") != 2 or not isinstance(document.get("owner"), str) or not document["owner"].strip():
        return None, {**base, "status": "required", "reason": "registry must have version 2 and a non-empty owner"}
    records = document.get(list_key)
    if not isinstance(records, list):
        return None, {**base, "status": "required", "reason": f"{list_key} must be a list"}
    return records, None


def _dependency_record_errors(
    records: list[Any], list_key: str, required_fields: frozenset[str]
) -> list[str]:
    """Validate exact record fields, values, and normalized-coordinate uniqueness."""
    coordinates: set[tuple[str, str, str, str]] = set()
    errors: list[str] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict) or set(record) != required_fields:
            errors.append(f"{list_key}[{index}] fields are not exact")
            continue
        coordinate = _normalized_coordinate(record)
        if not all(coordinate):
            errors.append(f"{list_key}[{index}] coordinate fields must be non-empty")
        elif coordinate in coordinates:
            errors.append(f"{list_key}[{index}] duplicates normalized coordinate {'|'.join(coordinate)}")
        coordinates.add(coordinate)
        for field in required_fields - set(COORDINATE_FIELDS):
            value = record[field]
            if not isinstance(value, (date, datetime)) and (
                not isinstance(value, str) or not value.strip()
            ):
                errors.append(f"{list_key}[{index}].{field} must be non-empty text or a date")
    return errors


def _validate_dependency_registry(root: Path, kind: str, path: Path, list_key: str) -> dict[str, Any]:
    """Combine strict envelope and record validation for one target registry."""
    records, envelope_result = _validated_v2_records(root, kind, path, list_key)
    if records is None:
        return envelope_result or {
            "kind": kind, "path": path.as_posix(), "status": "required",
            "reason": "registry envelope could not be resolved",
        }
    required_fields = EVIDENCE_FIELDS if list_key == "records" else OVERRIDE_FIELDS
    errors = _dependency_record_errors(records, list_key, required_fields)
    base = {"kind": kind, "path": path.as_posix()}
    if errors:
        return {**base, "status": "required", "reason": "registry records are invalid", "errors": errors}
    return {**base, "status": "complete", "reason": "registry satisfies the strict v2 coordinate contract"}


def build_target_migrations(root: Path) -> dict[str, Any]:
    """Build deterministic target-owned registry migration disclosure."""
    quality = _v1_disposition_migrations(root)
    dependency = _dependency_registry_migrations(root)
    return {
        "quality_disposition_migrations": quality,
        "dependency_registry_migrations": dependency,
        "migration_required": bool(quality or dependency),
    }


def validate_target_migrations(root: Path, candidate: dict[str, Any]) -> dict[str, Any]:
    """Validate declared and present target registries before a schema lock advances."""
    descriptors = candidate.get("required_target_migrations")
    if not isinstance(descriptors, list) or not descriptors:
        return {
            "status": "required", "reason": "candidate must declare required_target_migrations",
            "targets": [],
        }
    declared: set[str] = set()
    descriptor_errors: list[str] = []
    for descriptor in descriptors:
        if not isinstance(descriptor, dict) or set(descriptor) != {"kind", "path"}:
            descriptor_errors.append("each migration descriptor must contain exactly kind and path")
            continue
        kind = str(descriptor["kind"])
        expected = MIGRATION_TARGETS.get(kind)
        if expected is None or descriptor["path"] != expected.as_posix() or kind in declared:
            descriptor_errors.append(f"unsupported, mismatched, or duplicate migration descriptor: {kind}")
            continue
        declared.add(kind)
    targets = [
        _validate_quality_registry(root),
        _validate_dependency_registry(root, "dependency-freshness-evidence", DEPENDENCY_EVIDENCE_PATH, "records"),
        _validate_dependency_registry(root, "dependency-freshness-overrides", DEPENDENCY_OVERRIDES_PATH, "overrides"),
    ]
    required = descriptor_errors or any(target["status"] != "complete" for target in targets)
    return {
        "status": "required" if required else "complete",
        "reason": "target registry migration remains incomplete" if required else "all target registries satisfy v2",
        "targets": targets,
        **({"errors": descriptor_errors} if descriptor_errors else {}),
    }
