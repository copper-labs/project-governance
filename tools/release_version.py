#!/usr/bin/env python3
"""Derive stable release or traceable development versions from Git."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path


SEMANTIC_TAG = re.compile(
    r"^(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)$"
)


def semantic_version(tag: str) -> str | None:
    """Return the canonical package version for one stable release tag."""
    match = SEMANTIC_TAG.fullmatch(tag)
    if match is None:
        return None
    return ".".join(match.group(name) for name in ("major", "minor", "patch"))


def development_version(
    latest_tag: str | None,
    *,
    distance: int,
    revision: str,
    dirty: bool,
) -> str:
    """Return a readable PEP 440 version for an untagged source build."""
    released = semantic_version(latest_tag or "")
    major, minor, patch = (
        (int(part) for part in released.split("."))
        if released is not None
        else (0, 0, 0)
    )
    local = f"g{revision.lower()}" + (".dirty" if dirty else "")
    return f"{major}.{minor}.{patch + 1}.dev{distance}+{local}"


def _git(root: Path, *arguments: str) -> str:
    """Read one required value from the source repository."""
    result = subprocess.run(
        ["git", *arguments],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    value = result.stdout.strip()
    if result.returncode != 0:
        raise RuntimeError("Git source metadata is required to build the governance wheel.")
    return value


def _stable_tags(root: Path, *arguments: str) -> list[str]:
    """Return only exact stable semantic tags from one Git tag query."""
    return [
        value
        for value in _git(root, "tag", *arguments).splitlines()
        if semantic_version(value) is not None
    ]


def git_version(root: Path | None = None) -> str:
    """Return the stable tag version or a traceable development version."""
    source = (root or Path(__file__).resolve().parents[1]).resolve()
    revision = _git(source, "rev-parse", "--short=12", "HEAD")
    os.environ.setdefault("SOURCE_DATE_EPOCH", _git(source, "show", "-s", "--format=%ct", "HEAD"))
    dirty = bool(_git(source, "status", "--porcelain", "--untracked-files=all"))
    exact = _stable_tags(source, "--points-at", "HEAD")
    if len(exact) > 1:
        raise RuntimeError("A release commit must have exactly one stable semantic tag.")
    if exact:
        if dirty:
            raise RuntimeError("A stable release wheel cannot be built from a dirty checkout.")
        return semantic_version(exact[0]) or ""

    reachable = _stable_tags(source, "--merged", "HEAD", "--sort=-version:refname")
    latest = reachable[0] if reachable else None
    distance_range = f"{latest}..HEAD" if latest else "HEAD"
    distance = int(_git(source, "rev-list", "--count", distance_range))
    return development_version(
        latest,
        distance=distance,
        revision=revision,
        dirty=dirty,
    )
