"""Discover bounded, immutable compatible releases without trusting release prose."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlparse
import urllib.request

from .installation import _validated_lock
from .startup_state import StartupError, digest, read_json, result, state_root, write_json


STABLE = re.compile(r"^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$")
BASE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/releases/download$")
CONTRACT = 1


def version(value: str) -> tuple[int, int, int]:
    """Accept only canonical stable release identities, never lexical ordering."""
    match = STABLE.fullmatch(str(value))
    if not match:
        raise StartupError("Automatic adoption requires a stable MAJOR.MINOR.PATCH version", "approval-required")
    return tuple(int(part) for part in match.groups())


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    """Prevent GitHub credentials following asset redirects to a different authority."""

    def redirect_request(self, request, fp, code, message, headers, newurl):
        """Follow only supported HTTPS distribution hops and scope authorization to its host."""
        target = urlparse(newurl)
        if target.scheme != "https" or target.hostname not in {
            "api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
        }:
            raise StartupError("Release asset redirected outside the supported distribution hosts")
        redirected = super().redirect_request(request, fp, code, message, headers, newurl)
        if redirected is not None and target.netloc != urlparse(request.full_url).netloc:
            redirected.remove_header("Authorization")
        return redirected


class Client:
    """Bound all release discovery calls by one operation deadline."""

    def __init__(self, base: str, seconds: float):
        match = BASE.fullmatch(base.rstrip("/"))
        if not match:
            raise StartupError("Automatic updates currently require a configured GitHub release owner")
        self.api = "https://api.github.com/repos/" + "/".join(match.groups())
        self.deadline = time.monotonic() + seconds
        self.token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if not self.token:
            try:
                found = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True,
                                       timeout=min(seconds, 5), check=False)
                if found.returncode == 0:
                    self.token = found.stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                pass

    def read(self, url: str, *, limit: int = 1048576, asset: bool = False) -> bytes:
        """Read one verified owner's API resource without leaking credentials or unbounded bytes."""
        if not url.startswith(self.api + "/"):
            raise StartupError("Release resource does not belong to the configured owner")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise StartupError("Release discovery deadline expired; retain the current version")
        headers = {"Accept": "application/octet-stream" if asset else "application/vnd.github+json",
                   "User-Agent": "project-governance-startup", "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.build_opener(SafeRedirect()).open(request, timeout=remaining) as response:
            data = response.read(limit + 1)
        if len(data) > limit:
            raise StartupError("Release resource exceeds the supported size limit")
        return data

    def json(self, url: str):
        """Decode a bounded release response without treating it as instructions."""
        return json.loads(self.read(url))


def asset_record(release: dict, name: str, client: Client) -> dict:
    """Require one uploaded, digest-bound asset from the selected release owner."""
    records = [item for item in release.get("assets", []) if item.get("name") == name]
    if len(records) != 1:
        raise StartupError("Release is missing one unambiguous " + name, "approval-required")
    record = records[0]
    if (record.get("state") != "uploaded" or not re.fullmatch(r"sha256:[a-f0-9]{64}", str(record.get("digest")))
            or not re.fullmatch(re.escape(client.api) + r"/releases/assets/[0-9]+", str(record.get("url")))):
        raise StartupError("Release asset lacks verified identity: " + name, "approval-required")
    return record


def asset_bytes(record: dict, client: Client, limit: int = 1048576) -> bytes:
    """Check downloaded bytes against the immutable API asset digest."""
    raw = client.read(record["url"], asset=True, limit=limit)
    if "sha256:" + digest(raw) != record["digest"]:
        raise StartupError("Downloaded release asset digest does not match its published identity")
    return raw


def eligible(current: dict, lock_raw: bytes, metadata: dict) -> dict:
    """Bind declared compatibility to exact lock bytes and an explicitly supported source range."""
    lock = _validated_lock(json.loads(lock_raw), owner="startup candidate")
    required = {"schema_version", "version", "lock_sha256", "startup_contract", "automatic",
                "from_version", "before_version", "configuration_schema", "integration_change"}
    if not isinstance(metadata, dict) or set(metadata) != required:
        raise StartupError("Release compatibility declaration is missing or unsupported", "approval-required")
    if (metadata["schema_version"] != 1 or metadata["startup_contract"] != CONTRACT
            or metadata["automatic"] is not True or metadata["integration_change"] is not False):
        raise StartupError("Release requires deliberate integration or an unsupported startup contract", "approval-required")
    old, new = version(current["version"]), version(lock["version"])
    if not (old < new and old[0] == new[0] and version(metadata["from_version"]) <= old < version(metadata["before_version"])):
        raise StartupError("Release does not authorize automatic adoption from this version", "approval-required")
    _compatible_identity(current, lock, lock_raw, metadata)

    return lock


def _compatible_identity(current: dict, lock: dict, raw: bytes, metadata: dict) -> None:
    """Compare exact distribution and schema declarations without treating versions as proof."""
    expected = {"lock_sha256": digest(raw), "version": lock["version"],
                "configuration_schema": lock["configuration_schema"]}
    actual = {key: metadata[key] for key in expected}
    inherited = ("configuration_schema", "release_base_url", "python")
    if actual != expected or any(lock[key] != current[key] for key in inherited) or lock.get("wheel_url"):
        raise StartupError("Release lock, compatibility, Python, or distribution identity requires review", "approval-required")


def _release_inventory(client: Client) -> list:
    """Require a complete bounded listing rather than assuming API order means newest."""
    releases = []
    for page in range(1, 5):
        batch = client.json(client.api + "/releases?per_page=100&page=" + str(page))
        if not isinstance(batch, list) or any(not isinstance(item, dict) for item in batch):
            raise StartupError("Release listing is malformed")
        releases.extend(batch)
        if len(batch) < 100:
            return releases
    raise StartupError("Release listing exceeds the discovery bound; current version retained")


def _candidate(current: dict, client: Client, release: dict, major) -> dict:
    """Bind immutable metadata, lock, and wheel to one selected release."""
    if release.get("immutable") is not True:
        raise StartupError("Automatic adoption requires an immutable release", "approval-required")
    metadata_record = asset_record(release, "runtime-update.json", client)
    lock_record = asset_record(release, "runtime.lock.yaml", client)
    metadata = json.loads(asset_bytes(metadata_record, client))
    raw = asset_bytes(lock_record, client)
    lock = eligible(current, raw, metadata)
    if lock["version"] != release["tag_name"]:
        raise StartupError("Candidate tag and lock disagree")
    wheel = asset_record(release, lock["wheel"], client)
    if wheel["digest"] != "sha256:" + lock["sha256"]:
        raise StartupError("Wheel asset and runtime lock disagree")
    return result("available", "Compatible runtime release available", version=lock["version"],
                  lock_text=raw.decode(), metadata=metadata, wheel=wheel, major=major)


def _discover(current: dict, client: Client) -> dict:
    """Resolve a complete bounded release list and the highest eligible current-major release."""
    releases = _release_inventory(client)
    old = version(current["version"])
    candidates = []
    major = None
    for release in releases:
        tag = release.get("tag_name", "")
        if release.get("draft") is not False or release.get("prerelease") is not False or not STABLE.fullmatch(str(tag)):
            continue
        parsed = version(tag)
        if parsed[0] > old[0]:
            major = max(major or parsed, parsed)
        if parsed > old and parsed[0] == old[0]:
            candidates.append(release)
    manual = None
    for release in sorted(candidates, key=lambda r: version(r["tag_name"]), reverse=True)[:4]:
        try:
            return _candidate(current, client, release, major)
        except StartupError as error:
            if error.status != "approval-required":
                raise
            manual = manual or result("approval-required", str(error), version=release["tag_name"])
    if manual:
        return manual
    if major:
        return result("approval-required", "A major release requires operator approval", version=".".join(map(str, major)))
    return result("current", "No newer compatible stable release is available")


def discover(root: Path, current: dict, settings: dict) -> dict:
    """Reuse only bounded distribution metadata, never task or worktree safety judgments."""
    key = digest(json.dumps([current, settings], sort_keys=True).encode())
    path = state_root(root) / "releases.json"
    cached = None
    try:
        cached = read_json(path)
    except StartupError:
        if path.is_symlink():
            raise
    if (isinstance(cached, dict) and cached.get("key") == key
            and isinstance(cached.get("time"), (int, float))
            and isinstance(cached.get("result"), dict)
            and cached["result"].get("status") in {"available", "current", "approval-required"}
            and isinstance(cached["result"].get("reason"), str)
            and 0 <= time.time() - cached["time"] < settings["cache_seconds"]):
        if cached["result"]["status"] == "available":
            value = cached["result"]
            try:
                eligible(current, value["lock_text"].encode(), value["metadata"])
                if not isinstance(value["wheel"], dict):
                    raise ValueError("Invalid cached asset")
            except (KeyError, ValueError, StartupError, AttributeError):
                cached = None
        if cached is not None:
            return cached["result"]
    answer = _discover(current, Client(current["release_base_url"], settings["discovery_seconds"]))
    write_json(path, {"key": key, "time": time.time(), "result": answer})
    return answer
