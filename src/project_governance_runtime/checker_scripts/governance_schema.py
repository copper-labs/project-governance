#!/usr/bin/env python3
"""Validate governed YAML registries with the pinned Draft 2020-12 engine."""

from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

def normalize_json_value(value: Any) -> Any:
    """Convert YAML date scalars into the JSON strings schemas describe."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: normalize_json_value(child) for key, child in value.items()}
    if isinstance(value, list):
        return [normalize_json_value(child) for child in value]
    return value


def instance_path(label: str, parts: list[Any]) -> str:
    """Render one jsonschema instance path in the repository's stable style."""
    path = label
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def load_validator(schema_path: Path) -> tuple[Any, list[str]]:
    """Load and meta-validate one shipped Draft 2020-12 schema."""
    if not schema_path.is_file():
        return None, [f"{schema_path}: shipped schema is missing"]
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
    except OSError as exc:
        detail = exc.strerror or str(exc)
        return None, [f"{schema_path}: cannot read shipped schema: {detail}"]
    except (json.JSONDecodeError, SchemaError) as exc:
        detail = getattr(exc, "message", str(exc))
        return None, [f"{schema_path}: invalid Draft 2020-12 schema: {detail}"]
    return Draft202012Validator(schema, format_checker=FormatChecker()), []


def validate_schema_document(schema_path: Path) -> list[str]:
    """Return errors when a schema is missing, malformed, or not valid Draft 2020-12."""
    _, errors = load_validator(schema_path)
    return errors


def failure_path_parts(error: Any) -> list[Any]:
    """Include a missing required field in the reported instance path."""
    parts = list(error.absolute_path)
    if error.validator == "required" and isinstance(error.instance, dict):
        missing = next((key for key in error.validator_value if key not in error.instance), None)
        if missing is not None:
            parts.append(missing)
    return parts


def validate_document(value: Any, schema_path: Path, label: str) -> list[str]:
    """Return stable Draft 2020-12 validation errors for a loaded YAML document."""
    validator, errors = load_validator(schema_path)
    if validator is None:
        return errors
    failures = sorted(
        validator.iter_errors(normalize_json_value(value)),
        key=lambda item: tuple(str(part) for part in item.absolute_path),
    )
    return [f"{instance_path(label, failure_path_parts(error))}: {error.message}" for error in failures]
