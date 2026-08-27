#!/usr/bin/env python3
"""Prove stable semantic releases and traceable development wheel versions."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from build_release_assets import release_lock  # noqa: E402
from release_version import development_version, git_version, semantic_version  # noqa: E402


def git(root: Path, *arguments: str) -> None:
    """Run one required Git fixture operation."""
    subprocess.run(
        ["git", *arguments],
        cwd=root,
        text=True,
        capture_output=True,
        check=True,
    )


def fake_wheel(root: Path, version: str) -> Path:
    """Create the smallest wheel-shaped archive carrying package metadata."""
    wheel = root / f"project_governance_runtime-{version}-py3-none-any.whl"
    with zipfile.ZipFile(wheel, "w") as archive:
        archive.writestr(
            f"project_governance_runtime-{version}.dist-info/METADATA",
            f"Metadata-Version: 2.1\nName: project-governance-runtime\nVersion: {version}\n",
        )
    return wheel


class RuntimeReleaseVersioningTests(unittest.TestCase):
    """Keep release names readable and artifact identity exact."""

    def test_semantic_tags_are_exact_and_development_versions_remain_traceable(self) -> None:
        """Accept stable triplets and keep SHA identity out of public release versions."""
        self.assertEqual(semantic_version("1.0.0"), "1.0.0")
        self.assertEqual(semantic_version("12.34.56"), "12.34.56")
        for invalid in ("v1.0.0", "1.0", "01.0.0", "1.0.0-rc.1", "0+gabc"):
            self.assertIsNone(semantic_version(invalid))
        self.assertEqual(
            development_version(
                "1.2.3",
                distance=4,
                revision="ABCDEF123456",
                dirty=True,
            ),
            "1.2.4.dev4+gabcdef123456.dirty",
        )

    def test_git_version_uses_an_exact_clean_tag_and_rejects_a_dirty_release(self) -> None:
        """Make a stable wheel reproducible from one clean tagged source commit only."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            git(root, "init", "-q")
            git(root, "config", "user.email", "release@example.invalid")
            git(root, "config", "user.name", "Release Test")
            (root / "source.txt").write_text("release\n", encoding="utf-8")
            git(root, "add", "source.txt")
            git(root, "commit", "-qm", "release source")
            git(root, "tag", "1.0.0")
            self.assertEqual(git_version(root), "1.0.0")
            (root / "untracked.txt").write_text("dirty\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "dirty checkout"):
                git_version(root)

    def test_release_lock_matches_the_semantic_wheel_without_migration_payloads(self) -> None:
        """Publish one exact wheel identity without carrying historical target procedures."""
        with tempfile.TemporaryDirectory() as directory:
            wheel = fake_wheel(Path(directory), "1.0.0")
            lock = release_lock(wheel, "1.0.0", "a" * 40)
            with self.assertRaisesRegex(ValueError, "does not match"):
                release_lock(wheel, "1.1.0", "a" * 40)
        self.assertEqual(lock["version"], "1.0.0")
        self.assertEqual(lock["wheel"], wheel.name)
        self.assertEqual(lock["configuration_schema"], 2)
        self.assertNotIn("required_target_migrations", lock)

    def test_source_readiness_runs_once_at_candidate_boundaries(self) -> None:
        """Avoid complete release proof on every repair push and again after merge."""
        workflow = yaml.load(
            (ROOT / ".github/workflows/source-readiness.yml").read_text(encoding="utf-8"),
            Loader=yaml.BaseLoader,
        )
        triggers = workflow["on"]
        self.assertEqual(set(triggers), {"pull_request"})
        self.assertEqual(
            triggers["pull_request"]["types"],
            ["opened", "reopened", "ready_for_review"],
        )
        self.assertNotIn("push", triggers)
        self.assertEqual(
            workflow["jobs"]["source-readiness"]["if"],
            "github.event.pull_request.draft == false",
        )
        self.assertEqual(workflow["concurrency"]["cancel-in-progress"], "true")
        self.assertEqual(
            workflow["jobs"]["source-readiness"]["timeout-minutes"], "30"
        )
        release = yaml.load(
            (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8"),
            Loader=yaml.BaseLoader,
        )
        self.assertEqual(release["concurrency"]["cancel-in-progress"], "false")
        self.assertEqual(release["jobs"]["release"]["timeout-minutes"], "30")


if __name__ == "__main__":
    unittest.main()
