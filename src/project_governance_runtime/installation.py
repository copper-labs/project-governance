"""Initialize and deliberately update the lean child-repository integration."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.request
from importlib.resources import files
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

LOCK_PATH = Path("config/governance/runtime.lock.yaml")
PROFILE_DEFAULT_TEXT = "schema_version: 1\nproject_extensions: []\n"
REQUIRED_LOCK_KEYS = {
    "schema_version", "package", "version", "wheel", "sha256", "source_commit",
    "python", "configuration_schema", "release_base_url",
}
SOURCE_COMMIT = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
GITHUB_RELEASE_ASSET = re.compile(
    r"^https://github\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/?#]+)$"
)


class InstallationError(RuntimeError):
    """Report a lock, bootstrap, or deliberate update failure."""


def load_lock(path: Path) -> dict[str, Any]:
    """Load the JSON-compatible YAML lock used by dependency-free bootstrap code."""
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not REQUIRED_LOCK_KEYS.issubset(value):
        raise InstallationError(f"{path}: runtime lock is incomplete")
    if value.get("package") != "project-governance-runtime":
        raise InstallationError(f"{path}: package must be project-governance-runtime")
    wheel = str(value["wheel"])
    if not wheel.endswith(".whl") or Path(wheel).name != wheel:
        raise InstallationError(f"{path}: wheel must be one ordinary wheel filename")
    release_base = str(value["release_base_url"])
    if not release_base.startswith(("https://", "file://")):
        raise InstallationError(f"{path}: release_base_url must use https:// or file://")
    source_commit = str(value["source_commit"])
    if SOURCE_COMMIT.fullmatch(source_commit) is None:
        raise InstallationError(
            f"{path}: source_commit must be one full lowercase Git object id"
        )
    digest = str(value["sha256"])
    if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise InstallationError(f"{path}: sha256 must be 64 lowercase hexadecimal characters")
    return value


def sha256(path: Path) -> str:
    """Return the exact wheel digest pinned by a runtime lock."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _github_token() -> str | None:
    """Resolve private-release authentication without persisting credentials in target state."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    if shutil.which("gh") is None:
        return None
    result = subprocess.run(
        ["gh", "auth", "token"], text=True, capture_output=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None


def _read_remote(location: str) -> bytes:
    """Read a public URL or authenticated private GitHub release asset."""
    match = GITHUB_RELEASE_ASSET.fullmatch(location)
    token = _github_token() if match else None
    if match and token:
        owner, repository, tag, asset_name = (unquote(value) for value in match.groups())
        release_url = (
            f"https://api.github.com/repos/{quote(owner)}/{quote(repository)}"
            f"/releases/tags/{quote(tag, safe='')}"
        )
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "project-governance-runtime",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        with urllib.request.urlopen(
            urllib.request.Request(release_url, headers=headers), timeout=30
        ) as response:
            release = json.loads(response.read().decode("utf-8"))
        asset_url = next(
            (entry.get("url") for entry in release.get("assets", []) if entry.get("name") == asset_name),
            None,
        )
        if not asset_url:
            raise InstallationError(f"GitHub release asset is missing: {asset_name}")
        headers["Accept"] = "application/octet-stream"
        with urllib.request.urlopen(
            urllib.request.Request(str(asset_url), headers=headers), timeout=60
        ) as response:
            return response.read()
    with urllib.request.urlopen(location, timeout=60) as response:
        return response.read()


def initialize(root: Path) -> dict[str, Any]:
    """Create only missing child-owned configuration and thin launch surfaces."""
    created: list[str] = []
    defaults = {
        "config/governance/profile.yaml": PROFILE_DEFAULT_TEXT,
        "config/governance/facts.lock.yaml": "schema_version: 1\nfacts: {}\n",
        ".governance/.gitignore": "*\n!.gitignore\n",
    }
    for relative, content in defaults.items():
        path = root / relative
        if path.exists():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        created.append(relative)
    for relative in (
        "tools/governance-bootstrap.py", ".githooks/commit-msg", ".githooks/pre-commit",
        ".githooks/pre-push", ".githooks/pre-pr",
    ):
        destination = root / relative
        if destination.exists():
            continue
        resource = files("project_governance_runtime").joinpath(
            "assets", *Path(relative).parts
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(resource.read_bytes())
        destination.chmod(0o755)
        created.append(relative)
    return {"status": "initialized", "created": created}


def materialize_skills(root: Path) -> list[str]:
    """Replace ignored generic skill discovery with the exact installed wheel payload."""
    destination = root / ".governance/runtime/skills"
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    source = files("project_governance_runtime").joinpath("assets", "skills")
    for resource in sorted(source.iterdir(), key=lambda item: item.name):
        target = destination / resource.name
        if resource.is_dir():
            shutil.copytree(Path(str(resource)), target)
            copied.append(resource.name)
        else:
            target.write_bytes(resource.read_bytes())
    return copied


def _candidate_lock(current: dict[str, Any], version: str) -> dict[str, Any]:
    """Download or read the release lock for an explicitly requested package version."""
    base = str(current["release_base_url"]).rstrip("/")
    location = f"{base}/{version}/runtime.lock.yaml"
    if location.startswith("file://"):
        raw = Path(location.removeprefix("file://")).read_text(encoding="utf-8")
    else:
        raw = _read_remote(location).decode("utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise InstallationError("candidate runtime lock is not an object")
    if str(value.get("version")) != version:
        raise InstallationError("candidate runtime lock version does not match --to")
    return value


def update(root: Path, version: str, *, apply: bool) -> dict[str, Any]:
    """Preview or apply one lock-only update without mutating project-owned configuration."""
    path = root / LOCK_PATH
    current = load_lock(path)
    candidate = _candidate_lock(current, version)
    temporary = root / ".governance/candidate-runtime.lock.yaml"
    temporary.parent.mkdir(parents=True, exist_ok=True)
    temporary.write_text(
        json.dumps(candidate, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    try:
        candidate = load_lock(temporary)
    finally:
        temporary.unlink(missing_ok=True)
    if candidate == current:
        return {
            "status": "no-op",
            "old_version": current["version"],
            "new_version": candidate["version"],
            "old_sha256": current["sha256"],
            "new_sha256": candidate["sha256"],
            "configuration_schema_change": {
                "old": current["configuration_schema"],
                "new": candidate["configuration_schema"],
            },
            "verification_commands": [],
        }
    if candidate["version"] == current["version"]:
        raise InstallationError(
            "the current immutable runtime version resolves to different lock content"
        )
    schema_change = candidate["configuration_schema"] != current["configuration_schema"]
    result = {
        "status": "applied" if apply else ("migration-required" if schema_change else "dry-run"),
        "old_version": current["version"],
        "new_version": candidate["version"],
        "old_sha256": current["sha256"],
        "new_sha256": candidate["sha256"],
        "configuration_schema_change": {
            "old": current["configuration_schema"],
            "new": candidate["configuration_schema"],
        },
        "verification_commands": [
            "python3 tools/governance-bootstrap.py",
            ".governance/runtime/bin/project-governance doctor",
        ],
    }
    if schema_change and not apply:
        result["reason"] = (
            "configuration schema changed; review and update project-owned configuration, "
            "then use --apply to accept the new lock deliberately"
        )
        return result
    if apply:
        path.write_text(
            json.dumps(candidate, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    return result
