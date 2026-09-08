"""Resolve exact npm workspace dependencies from the validation subject."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from project_governance_runtime.validation_subject import ValidationSubject
from governance_changed_paths import load_change_packet


MANIFEST_LIMIT = 4 * 1024 * 1024


def _manifest(subject: ValidationSubject, path: str) -> dict:
    """Read only ordinary, bounded manifests from the candidate subject."""
    if subject.entry_kind(path) != "regular":
        return {}
    raw = subject.read_bytes(path, limit=MANIFEST_LIMIT)
    if len(raw) > MANIFEST_LIMIT:
        return {}
    value = json.loads(raw)
    return value if isinstance(value, dict) else {}


def _matches(directory: str, pattern: str) -> bool:
    """Match bounded root-relative workspace paths with ordinary npm stars."""
    pattern = pattern.removeprefix("./").rstrip("/")
    if not pattern or pattern.startswith("/") or ".." in pattern.split("/"):
        return False
    # Unsupported glob syntax cannot establish a local-resolution exemption.
    if any(char in pattern for char in "!{}[]()\\"):
        return False
    parts = pattern.split("/")
    expression = ""
    for index, part in enumerate(parts):
        if part == "**":
            expression += "(?:[^/.][^/]*/)*" if index < len(parts) - 1 else "(?:[^/.][^/]*(?:/[^/.][^/]*)*)?"
        else:
            if not part.startswith("."):
                expression += r"(?!\.)"
            expression += re.escape(part).replace(r"\*", "[^/]*").replace(r"\?", "[^/]")
            if index < len(parts) - 1:
                expression += "/"
    return re.fullmatch(expression, directory) is not None


def _subject_paths(subject: ValidationSubject, packet: dict | None) -> set[str]:
    """Enumerate candidate paths while leaving content reads to the subject owner."""
    arguments = (
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"] if subject.live
        else ["ls-tree", "-r", "--name-only", "-z", str(subject.base_ref)]
    )
    result = subprocess.run(["git", *arguments], capture_output=True, check=False)
    if result.returncode != 0:
        return set()
    paths = set(result.stdout.decode().split("\0"))
    if packet and not subject.live:
        paths.update(record["path"] for record in packet["records"])
    return paths


def _workspace_members(subject: ValidationSubject, paths: set[str], patterns: list[str]) -> tuple[set[str], dict[str, str]]:
    """Resolve unique declared names; ambiguous names cannot prove local resolution."""
    consumers = {"package.json"}
    versions: dict[str, list[object]] = {}
    for path in sorted(paths):
        if not path.endswith("/package.json") or "node_modules" in Path(path).parts:
            continue
        if not any(_matches(str(Path(path).parent), pattern) for pattern in patterns):
            continue
        manifest = _manifest(subject, path)
        if not manifest:
            continue
        consumers.add(path)
        name, version = manifest.get("name"), manifest.get("version")
        if isinstance(name, str):
            versions.setdefault(name, []).append(version)
    return consumers, {
        name: values[0] for name, values in versions.items()
        if len(values) == 1 and isinstance(values[0], str)
    }


def local_workspace_coordinates() -> tuple[set[str], dict[str, str]]:
    """Return declared consumers and unique local names without trusting live drift."""
    try:
        packet = load_change_packet()
        subject = ValidationSubject.from_runtime(Path.cwd()) if packet else ValidationSubject.live_checkout(Path.cwd())
        root = _manifest(subject, "package.json")
        patterns = root.get("workspaces", [])
        if isinstance(patterns, dict):
            patterns = patterns.get("packages", [])
        if not isinstance(patterns, list) or not patterns or not all(isinstance(item, str) for item in patterns):
            return set(), {}
        if any(any(char in pattern for char in "!{}[]()\\") for pattern in patterns):
            return set(), {}
        return _workspace_members(subject, _subject_paths(subject, packet), patterns)
    except (OSError, ValueError, RuntimeError):
        # Unproven membership retains the existing external-evidence requirement.
        return set(), {}
