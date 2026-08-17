#!/usr/bin/env python3
"""Consume the runtime's one versioned, immutable changed-scope packet."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
from pathlib import Path
from typing import Any


PACKET_ENV = "PROJECT_GOVERNANCE_CHANGE_PACKET"
PACKET_SHA256_ENV = "PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256"
PACKET_KIND = "project-governance-change-packet"
PACKET_VERSION = 1


def git(*args: str) -> tuple[int, list[str]]:
    """Run one read-only Git query for a non-scope repository fact."""
    result = subprocess.run(["git", *args], text=True, capture_output=True, check=False)
    return result.returncode, [line for line in result.stdout.splitlines() if line]


def _safe_repository_path(value: Any) -> str:
    """Validate one stable repository-relative packet path."""
    if not isinstance(value, str):
        raise RuntimeError("change packet path must be a string")
    path = Path(value)
    if not value or path.is_absolute() or ".." in path.parts:
        raise RuntimeError("change packet contains an unsafe repository path")
    return path.as_posix()


def _regular_file_bytes(path: Path) -> bytes:
    """Read one ordinary packet file without following a replacement symlink."""
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise RuntimeError("change packet content must be a regular file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise RuntimeError("change packet content changed file type")
        return handle.read()


def _materialized_path(
    value: Any, expected_sha256: Any, *, required: bool
) -> str | None:
    """Validate one runtime-created absolute content path and its bound bytes."""
    if value is None and not required:
        if expected_sha256 is not None:
            raise RuntimeError("change packet has an identity without content")
        return None
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise RuntimeError("change packet content path must be absolute")
    path = Path(value)
    try:
        content = _regular_file_bytes(path)
    except OSError as error:
        raise RuntimeError(f"change packet content is unavailable: {value}") from error
    if expected_sha256 is not None:
        if (
            not isinstance(expected_sha256, str)
            or len(expected_sha256) != 64
            or any(character not in "0123456789abcdef" for character in expected_sha256)
        ):
            raise RuntimeError("change packet content identity is malformed")
        if hashlib.sha256(content).hexdigest() != expected_sha256:
            raise RuntimeError("change packet content no longer matches its identity")
    return str(path)


def _packet_envelope() -> dict[str, Any] | None:
    """Load and validate the immutable packet's versioned outer envelope."""
    raw_path = os.environ.get(PACKET_ENV)
    if raw_path is None:
        return None
    packet_path = Path(raw_path)
    if not packet_path.is_absolute():
        raise RuntimeError("PROJECT_GOVERNANCE_CHANGE_PACKET must name a readable absolute file")
    try:
        packet_bytes = _regular_file_bytes(packet_path)
    except OSError as error:
        raise RuntimeError(
            "PROJECT_GOVERNANCE_CHANGE_PACKET must name a readable absolute file"
        ) from error
    expected_packet_sha256 = os.environ.get(PACKET_SHA256_ENV)
    if (
        expected_packet_sha256 is not None
        and hashlib.sha256(packet_bytes).hexdigest() != expected_packet_sha256
    ):
        raise RuntimeError("change packet envelope no longer matches its runtime identity")
    value = json.loads(packet_bytes)
    if (
        not isinstance(value, dict)
        or value.get("kind") != PACKET_KIND
        or value.get("version") != PACKET_VERSION
        or value.get("scope") not in {"changed", "all"}
        or value.get("mode") not in {"staged", "changed", "explicit", "all"}
        or not isinstance(value.get("records"), list)
    ):
        raise RuntimeError("change packet envelope is malformed or unsupported")
    return value


def _normalized_ranges(value: Any) -> list[dict[str, int]]:
    """Validate one record's exact after-image ranges."""
    if not isinstance(value, list):
        raise RuntimeError("change packet changed_ranges must be a list")
    result: list[dict[str, int]] = []
    for changed_range in value:
        valid = (
            isinstance(changed_range, dict)
            and isinstance(changed_range.get("start"), int)
            and isinstance(changed_range.get("end"), int)
        )
        if not valid:
            raise RuntimeError("change packet contains a malformed changed range")
        start = changed_range["start"]
        end = changed_range["end"]
        if start < 1 or end < start:
            raise RuntimeError("change packet contains a malformed changed range")
        result.append({"start": start, "end": end})
    return result


def _normalized_record(value: Any) -> dict[str, Any]:
    """Validate one changed record without mixing concerns into envelope loading."""
    if not isinstance(value, dict) or value.get("status") not in {
        "added", "modified", "renamed", "deleted"
    }:
        raise RuntimeError("change packet record status is malformed")
    status = value["status"]
    previous = value.get("previous_path")
    return {
        "status": status,
        "path": _safe_repository_path(value.get("path")),
        "previous_path": (
            _safe_repository_path(previous) if previous is not None else None
        ),
        "before_path": _materialized_path(
            value.get("before_path"),
            value.get("before_sha256"),
            required=status != "added",
        ),
        "after_path": _materialized_path(
            value.get("after_path"),
            value.get("after_sha256"),
            required=status != "deleted",
        ),
        "changed_ranges": _normalized_ranges(value.get("changed_ranges")),
    }


def _load_packet() -> dict[str, Any] | None:
    """Return one normalized packet after independent envelope and record validation."""
    value = _packet_envelope()
    if value is None:
        return None
    return {**value, "records": [_normalized_record(record) for record in value["records"]]}


def _packet(mode: str) -> dict[str, Any] | None:
    """Return a mode-compatible packet without rediscovering Git scope."""
    value = _load_packet()
    if value is None:
        return None
    compatible = (
        value["scope"] == "all" and mode == "all"
        or mode == "staged" and value["mode"] == "staged"
        or mode == "changed" and value["mode"] in {"changed", "explicit"}
    )
    if not compatible:
        raise RuntimeError(f"change packet cannot satisfy {mode} selection")
    return value


def _git_nul(*args: str) -> list[str]:
    """Return filesystem-decoded NUL-delimited Git fields for explicit all mode."""
    result = subprocess.run(["git", *args], capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode(errors="replace").strip() or "Git path query failed")
    return [os.fsdecode(value) for value in result.stdout.split(b"\0") if value]


def _all_records() -> list[tuple[str, bool]]:
    """Return tracked and nonignored untracked files for explicit exhaustive checks."""
    tracked = [(path, False) for path in _git_nul("ls-files", "-z", "--cached")]
    untracked = [(path, True) for path in _git_nul("ls-files", "-z", "--others", "--exclude-standard")]
    return sorted(set([*tracked, *untracked]))


def changed_path_records(mode: str) -> list[tuple[str, bool]]:
    """Return current changed records without deleted before-images."""
    if mode == "all":
        # Explicit exhaustive checks are checkout-wide and do not require a
        # changed-scope packet. This also preserves direct-check fallback.
        return _all_records()
    packet = _packet(mode)
    if packet is None:
        raise RuntimeError("direct checker requires a runtime change packet")
    return [
        (record["path"], record["status"] in {"added", "renamed"})
        for record in packet["records"]
        if record["status"] != "deleted"
    ]


def changed_paths(mode: str) -> list[str]:
    """Return the repository-relative path projection for a direct checker."""
    return [path for path, _ in changed_path_records(mode)]


def changed_line_ranges(mode: str) -> dict[str, list[tuple[int, int]]]:
    """Return exact after-image ranges from the packet without invoking Git."""
    if mode == "all":
        return {}
    packet = _packet(mode)
    if packet is None:
        raise RuntimeError("direct checker requires a runtime change packet")
    return {
        record["path"]: [
            (changed_range["start"], changed_range["end"])
            for changed_range in record["changed_ranges"]
        ]
        for record in packet["records"]
        if record["status"] != "deleted"
    }


def analysis_path(repository_path: str, mode: str) -> Path:
    """Return the exact after-image file that a checker must analyze."""
    if mode == "all":
        return Path(repository_path)
    packet = _packet(mode)
    if packet is None:
        raise RuntimeError("direct checker requires a runtime change packet")
    for record in packet["records"]:
        if record["path"] == repository_path and record["status"] != "deleted":
            return Path(record["after_path"])
    raise RuntimeError(f"change packet has no after-image for {repository_path}")


def changed_path_views(mode: str) -> list[tuple[str, Path, bool]]:
    """Pair each stable repository path with the exact file bytes to analyze."""
    return [
        (repository_path, analysis_path(repository_path, mode), is_new)
        for repository_path, is_new in changed_path_records(mode)
    ]


def packet_records(mode: str) -> list[dict[str, Any]]:
    """Expose validated records to a checker that must reason about deletes or renames."""
    if mode == "all":
        return []
    packet = _packet(mode)
    if packet is None:
        raise RuntimeError("direct checker requires a runtime change packet")
    return list(packet["records"])


def template_managed_paths() -> set[str]:
    """Retain no generated-runtime exclusion because runtime code is no longer copied."""
    return set()
