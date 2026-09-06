#!/usr/bin/env python3
"""Install the exact locked governance wheel into the repository-local environment."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import venv
from pathlib import Path
from urllib.parse import quote, unquote


# The launcher is installed at <repository>/tools/governance-bootstrap.py.
ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / "config/governance/runtime.lock.yaml"
RUNTIME_ROOT = ROOT / ".governance/runtime"
SOURCE_COMMIT = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
GITHUB_RELEASE_ASSET = re.compile(
    r"^https://github\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/?#]+)$"
)


def github_token() -> str | None:
    """Resolve private-release authentication without writing credentials to the repository."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    if shutil.which("gh") is None:
        return None
    result = subprocess.run(
        ["gh", "auth", "token"], text=True, capture_output=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 and result.stdout.strip() else None


def read_remote(location: str) -> bytes:
    """Read a public URL or authenticated private GitHub release asset."""
    match = GITHUB_RELEASE_ASSET.fullmatch(location)
    token = github_token() if match else None
    if match and token:
        owner, repository, tag, asset_name = (unquote(value) for value in match.groups())
        release_url = (
            f"https://api.github.com/repos/{quote(owner)}/{quote(repository)}"
            f"/releases/tags/{quote(tag, safe='')}"
        )
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "project-governance-runtime-bootstrap",
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
            raise SystemExit(f"GitHub release asset is missing: {asset_name}")
        headers["Accept"] = "application/octet-stream"
        with urllib.request.urlopen(
            urllib.request.Request(str(asset_url), headers=headers), timeout=60
        ) as response:
            return response.read()
    with urllib.request.urlopen(location, timeout=60) as response:
        return response.read()


def install_locked() -> int:
    """Download, verify, and install only the wheel named by the target lock."""
    lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    wheel_name = str(lock["wheel"])
    if Path(wheel_name).name != wheel_name or not wheel_name.endswith(".whl"):
        raise SystemExit("Locked governance wheel must be one ordinary wheel filename.")
    release_base = str(lock["release_base_url"]).rstrip("/")
    if SOURCE_COMMIT.fullmatch(str(lock.get("source_commit", ""))) is None:
        raise SystemExit("Locked governance source_commit must be one full lowercase Git object id.")
    source = str(lock.get("wheel_url") or f"{release_base}/{lock['version']}/{wheel_name}")
    with tempfile.TemporaryDirectory(prefix="governance-wheel-") as directory:
        wheel = Path(directory) / wheel_name
        if source.startswith("file://"):
            wheel.write_bytes(Path(source.removeprefix("file://")).read_bytes())
        else:
            wheel.write_bytes(read_remote(source))
        actual = hashlib.sha256(wheel.read_bytes()).hexdigest()
        if actual != lock["sha256"]:
            raise SystemExit("Locked governance wheel SHA256 does not match the downloaded bytes.")
        venv.EnvBuilder(with_pip=True, clear=True).create(RUNTIME_ROOT)
        python = RUNTIME_ROOT / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
        result = subprocess.run(
            [str(python), "-m", "pip", "install", str(wheel)],
            cwd=ROOT,
            env={**os.environ, "PIP_DISABLE_PIP_VERSION_CHECK": "1"},
            check=False,
        )
        if result.returncode != 0:
            return result.returncode
        result = subprocess.run(
            [
                str(python),
                "-c",
                "from pathlib import Path; from project_governance_runtime.installation import materialize_skills; materialize_skills(Path.cwd())",
            ],
            cwd=ROOT,
            check=False,
        )
        if result.returncode != 0:
            return result.returncode
    print(f"Installed project-governance-runtime {lock['version']}.")
    return 0


@contextmanager
def environment_replacement_lock():
    """Refuse replacement while an optional process still uses this environment."""
    if os.name != "posix":
        yield
        return
    import fcntl

    RUNTIME_ROOT.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(RUNTIME_ROOT.parent / "runtime-use.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise SystemExit("Governance environment is in use. Finish or cancel active provider jobs before bootstrap.") from error
        yield
    finally:
        os.close(descriptor)


def main() -> int:
    """Protect the installed environment for the complete replacement transaction."""
    with environment_replacement_lock():
        return install_locked()


if __name__ == "__main__":
    raise SystemExit(main())
