#!/usr/bin/env python3
"""Create the immutable runtime lock for one semantic GitHub release."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from email.parser import Parser
from pathlib import Path

from release_version import semantic_version


RELEASE_BASE_URL = "https://github.com/copper-labs/project-governance/releases/download"
def wheel_identity(wheel: Path) -> tuple[str, str]:
    """Read the normalized project name and version from wheel metadata."""
    with zipfile.ZipFile(wheel) as archive:
        metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(metadata) != 1:
            raise ValueError(f"expected one wheel metadata file, found {len(metadata)}")
        message = Parser().parsestr(archive.read(metadata[0]).decode("utf-8"))
    return str(message["Name"]), str(message["Version"])


def release_lock(wheel: Path, tag: str, source_commit: str) -> dict[str, object]:
    """Return one exact adopter lock after validating tag and wheel agreement."""
    version = semantic_version(tag)
    if version is None:
        raise ValueError("release tag must use exact MAJOR.MINOR.PATCH form")
    name, wheel_version = wheel_identity(wheel)
    if name != "project-governance-runtime" or wheel_version != version:
        raise ValueError(
            f"wheel identity {name} {wheel_version} does not match release {version}"
        )
    if len(source_commit) not in {40, 64}:
        raise ValueError("release source commit must be one full Git object id")
    return {
        "schema_version": 1,
        "package": name,
        "version": version,
        "wheel": wheel.name,
        "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
        "source_commit": source_commit,
        "python": ">=3.9,<4",
        "configuration_schema": 2,
        "release_base_url": RELEASE_BASE_URL,
    }


def git_revision(root: Path) -> str:
    """Return the full source identity for the release lock."""
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("release source commit is unavailable")
    return result.stdout.strip()


def main() -> int:
    """Validate one release wheel and write its deterministic runtime lock."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--wheel", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    wheel = arguments.wheel.resolve()
    if not wheel.is_file():
        raise SystemExit(f"release wheel is missing: {wheel}")
    root = Path(__file__).resolve().parents[1]
    lock = release_lock(wheel, arguments.tag, git_revision(root))
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(lock, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(lock, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
