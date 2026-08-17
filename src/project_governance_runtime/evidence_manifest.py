"""Validate one bounded, pack-local evidence manifest without reading artifacts."""

from __future__ import annotations

import hashlib
import json
import stat
from importlib.resources import files
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

MANIFEST_NAME = "evidence-manifest.json"
# Evidence manifests are summaries, not evidence stores. Bound bytes before parsing.
MAX_MANIFEST_BYTES = 64 * 1024


class _DuplicateKeyError(ValueError):
    """Identify ambiguous JSON objects without retaining their input."""


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    """Build a JSON object while rejecting repeated member names."""
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateKeyError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _finding(message: str) -> dict[str, str]:
    """Return the one normalized blocking finding owned by this boundary."""
    return {
        "rule_id": "evidence.manifest-invalid",
        "path": MANIFEST_NAME,
        "severity": "blocking",
        "message": message,
    }


def _result(
    status: str,
    *,
    manifest_digest: str | None = None,
    claim_count: int = 0,
    artifact_digest_count: int = 0,
    finding: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Keep manifest inspection output small and stable for runner integration."""
    return {
        "status": status,
        "manifest_digest": manifest_digest,
        "claim_count": claim_count,
        "artifact_digest_count": artifact_digest_count,
        "findings": [] if finding is None else [finding],
    }


def _invalid(message: str) -> dict[str, Any]:
    """Collapse every invalid input into at most one blocking finding."""
    return _result("invalid", finding=_finding(message))


def _validator() -> Draft202012Validator:
    """Load and meta-validate the schema shipped in the runtime wheel."""
    resource = files("project_governance_runtime").joinpath(
        "defaults", "schemas", "evidence-manifest.schema.json"
    )
    schema = json.loads(resource.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _schema_failure(document: Any) -> str | None:
    """Return one deterministic schema failure rather than an unbounded error list."""
    failures = sorted(
        _validator().iter_errors(document),
        key=lambda error: (
            tuple(str(part) for part in error.absolute_path),
            str(error.validator),
            error.message,
        ),
    )
    if not failures:
        return None
    error = failures[0]
    location = "$" + "".join(
        f"[{part}]" if isinstance(part, int) else f".{part}"
        for part in error.absolute_path
    )
    return f"manifest schema validation failed at {location}: {error.message}"


def inspect_evidence_manifest(
    evidence_root: Path, subject_digest: str | None
) -> dict[str, Any]:
    """Inspect the optional manifest in one already isolated per-pack evidence root.

    Referenced artifact digests are counted as inert strings. Their paths or contents are never
    resolved, opened, combined with another pack, or interpreted by this boundary.
    """
    manifest_path = evidence_root / MANIFEST_NAME
    try:
        metadata = manifest_path.lstat()
    except FileNotFoundError:
        return _result("absent")
    except OSError:
        return _invalid("evidence manifest cannot be inspected")

    if not stat.S_ISREG(metadata.st_mode):
        return _invalid("evidence manifest must be a regular file")
    if metadata.st_size > MAX_MANIFEST_BYTES:
        return _invalid(
            f"evidence manifest exceeds the {MAX_MANIFEST_BYTES}-byte limit"
        )

    try:
        with manifest_path.open("rb") as handle:
            payload = handle.read(MAX_MANIFEST_BYTES + 1)
    except OSError:
        return _invalid("evidence manifest cannot be read")
    if len(payload) > MAX_MANIFEST_BYTES:
        return _invalid(
            f"evidence manifest exceeds the {MAX_MANIFEST_BYTES}-byte limit"
        )

    try:
        document = json.loads(
            payload.decode("utf-8"), object_pairs_hook=_object_without_duplicate_keys
        )
    except (UnicodeDecodeError, json.JSONDecodeError, _DuplicateKeyError):
        return _invalid("evidence manifest is not unambiguous UTF-8 JSON")

    try:
        schema_failure = _schema_failure(document)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, SchemaError):
        return _invalid("shipped evidence manifest schema is unavailable or invalid")
    if schema_failure is not None:
        return _invalid(schema_failure)

    claims = document["claims"]
    claim_ids = [claim["id"] for claim in claims]
    if len(claim_ids) != len(set(claim_ids)):
        return _invalid("evidence manifest claim ids must be unique")
    if subject_digest is None:
        return _invalid("evidence manifest requires a content-bound run subject digest")
    if document["subject_digest"] != subject_digest:
        return _invalid(
            "evidence manifest subject_digest does not match the run subject digest"
        )

    artifact_digest_count = sum(len(claim["artifact_digests"]) for claim in claims)
    return _result(
        "valid",
        manifest_digest="sha256:" + hashlib.sha256(payload).hexdigest(),
        claim_count=len(claims),
        artifact_digest_count=artifact_digest_count,
    )
