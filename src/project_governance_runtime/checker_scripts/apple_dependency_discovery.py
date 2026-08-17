"""Discover Apple dependency surfaces without coupling policy decisions to Git traversal.

The checker needs the same classifications for changed paths, exhaustive inventory, and recoverable
deleted files, so this module owns only the evidence-gathering boundary.
"""

from __future__ import annotations

import fnmatch
import os
import subprocess
from pathlib import Path


COCOAPODS_GLOBS = ["**/Podfile", "**/Podfile.lock", "**/*.podspec"]
SPM_GLOBS = ["**/Package.swift", "**/Package.resolved"]
COCOAPODS_COMMAND_GLOBS = ["scripts/**", ".github/**", "config/**", "**/*.sh", "**/*.rb", "**/*.yml", "**/*.yaml"]
COCOAPODS_COMMAND_MARKERS = ("pod install", "pod update", "pod repo", "pod trunk", "bundle exec pod", "gem install cocoapods")


def all_files() -> list[str]:
    """Return tracked and unignored repository files for dependency discovery."""
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        return result.stdout.splitlines()
    return [path.as_posix() for path in Path(".").rglob("*") if path.is_file()]


def matches(path: str, globs: list[str]) -> bool:
    """Match a repository-relative path against root-aware policy globs."""
    return any(
        fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch("x/" + path, pattern)
        for pattern in globs
    )


def contains(path: str, needles: tuple[str, ...]) -> bool:
    """Find dependency markers in current or recoverable deleted file content."""
    candidate = Path(path)
    if candidate.is_file():
        text = candidate.read_text(encoding="utf-8", errors="ignore")
    else:
        text = _deleted_file_text(path)
    return any(needle in text for needle in needles)


def _deleted_file_text(path: str) -> str:
    """Recover a deleted path's latest available Git content for classification."""
    refs = ["HEAD^", "HEAD"]
    base = os.environ.get("GOVERNANCE_BASE_REF") or os.environ.get("GITHUB_BASE_REF")
    if base:
        refs.extend([base, f"origin/{base}" if not base.startswith("origin/") else base])
    for ref in refs:
        result = subprocess.run(
            ["git", "show", f"{ref}:{path}"],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout
    return ""


def is_cocoapods_surface(path: str) -> bool:
    """Classify manifests, project references, and commands owned by CocoaPods."""
    if path in {
        "scripts/check-apple-dependencies.py",
        "config/policies/apple-dependencies.yaml",
        "config/policies/apple-dependency-exceptions.yaml",
    }:
        return False
    return (
        matches(path, COCOAPODS_GLOBS)
        or _is_cocoapods_project_reference(path)
        or _is_cocoapods_workspace_reference(path)
        or _is_cocoapods_command(path)
    )


def _is_cocoapods_project_reference(path: str) -> bool:
    """Recognize CocoaPods records embedded in an Xcode project file."""
    return path.endswith(".xcodeproj/project.pbxproj") and contains(
        path,
        ("[CP]", "Pods_", "Pods/"),
    )


def _is_cocoapods_workspace_reference(path: str) -> bool:
    """Recognize a CocoaPods-owned Xcode workspace reference."""
    return path.endswith(".xcworkspace/contents.xcworkspacedata") and contains(
        path,
        ("Pods.xcodeproj",),
    )


def _is_cocoapods_command(path: str) -> bool:
    """Recognize an allowed script or configuration path that invokes CocoaPods."""
    return matches(path, COCOAPODS_COMMAND_GLOBS) and contains(
        path,
        COCOAPODS_COMMAND_MARKERS,
    )


def is_swiftpm_surface(path: str) -> bool:
    """Classify SwiftPM manifests and Xcode package references."""
    return matches(path, SPM_GLOBS) or _is_swiftpm_project_reference(path)


def _is_swiftpm_project_reference(path: str) -> bool:
    """Recognize Swift Package Manager records embedded in an Xcode project file."""
    return path.endswith(".xcodeproj/project.pbxproj") and contains(
        path,
        ("XCRemoteSwiftPackageReference", "XCLocalSwiftPackageReference"),
    )
