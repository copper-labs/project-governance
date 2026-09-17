"""Verify exact upstream notice bytes before granting a formatting exemption."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

from .validation_subject import ValidationSubject, safe_subject_path


REGISTRY_PATH = "config/policies/format-preserved-notices.json"
MAX_BYTES = 1024 * 1024
NOTICE_NAME = re.compile(r"^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[._-][A-Za-z0-9._-]+)?$")


def _read(subject: ValidationSubject, path: str) -> bytes:
    """Bound registry and notice reads without accepting truncated digests."""
    content = subject.read_bytes(path, limit=MAX_BYTES)
    if len(content) > MAX_BYTES:
        raise ValueError(f"preserved notice input exceeds {MAX_BYTES} bytes: {path}")
    return content


def _records(content: bytes) -> dict[str, str]:
    """Require exact notice paths, provenance, and canonical SHA256 identities."""
    value = json.loads(content)
    if not isinstance(value, dict) or set(value) != {"version", "notices"}:
        raise ValueError("preserved notices registry requires version and notices")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("preserved notices registry version must be 1")
    if not isinstance(value["notices"], list):
        raise ValueError("preserved notices must be a list")
    records: dict[str, str] = {}
    for item in value["notices"]:
        path, digest = _record(item)
        if path in records:
            raise ValueError(f"duplicate preserved notice path: {path}")
        records[path] = digest
    return records


def _record(item: object) -> tuple[str, str]:
    """Limit one exemption to an exact notice filename and recorded identity."""
    if not isinstance(item, dict) or set(item) != {"path", "sha256", "source"}:
        raise ValueError("each preserved notice requires path, sha256, and source")
    path = safe_subject_path(item["path"])
    if NOTICE_NAME.fullmatch(Path(path).name) is None or any(char in path for char in "*?[]"):
        raise ValueError(f"preserved notice requires an exact license/notice filename: {path}")
    digest = item["sha256"]
    if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        raise ValueError(f"preserved notice requires a lowercase SHA256: {path}")
    _validate_source(item["source"], path)
    return path, digest


def _validate_source(source: object, path: str) -> None:
    """Require reviewable upstream provenance without fetching remote bytes."""
    if not isinstance(source, str):
        raise ValueError(f"preserved notice requires an upstream source URL: {path}")
    url = urlsplit(source)
    if url.scheme != "https" or not url.netloc or any(char.isspace() for char in source):
        raise ValueError(f"preserved notice requires an HTTPS upstream source URL: {path}")


def verified_notices() -> dict[str, str]:
    """Validate every registry member using the same subject as the governed check."""
    subject = (
        ValidationSubject.from_runtime(Path.cwd())
        if "PROJECT_GOVERNANCE_CHANGE_PACKET" in os.environ
        else ValidationSubject.live_checkout(Path.cwd())
    )
    if subject.entry_kind(REGISTRY_PATH) is None:
        return {}
    records = _records(_read(subject, REGISTRY_PATH))
    for path, digest in records.items():
        if hashlib.sha256(_read(subject, path)).hexdigest() != digest:
            raise ValueError(f"preserved notice SHA256 mismatch: {path}")
    return records
