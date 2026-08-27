#!/usr/bin/env python3
"""Prove lock validation, lean initialization, and lock-only updates."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.cli import _doctor  # noqa: E402
from project_governance_runtime.installation import (  # noqa: E402
    InstallationError,
    initialize,
    launcher_drift,
    load_lock,
    materialize_skills,
    update,
)


def valid_lock() -> dict[str, object]:
    """Return the smallest exact immutable runtime lock fixture."""
    return {
        "schema_version": 1,
        "package": "project-governance-runtime",
        "version": "0.1.0",
        "wheel": "project_governance_runtime-0.1.0-py3-none-any.whl",
        "sha256": "0" * 64,
        "source_commit": "a" * 40,
        "python": ">=3.9,<4",
        "configuration_schema": 1,
        "release_base_url": "https://example.invalid/project-governance/releases/download",
    }


class RuntimeInstallationTests(unittest.TestCase):
    """Keep installation exact and preserve child-owned files."""

    def test_lock_rejects_invalid_sha(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["sha256"] = "not-a-digest"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "sha256"):
                load_lock(path)

    def test_lock_rejects_a_wheel_path_instead_of_a_filename(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["wheel"] = "../runtime.whl"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "wheel filename"):
                load_lock(path)

    def test_lock_rejects_an_ambiguous_source_revision(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["source_commit"] = "abc123"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "source_commit"):
                load_lock(path)

    def test_init_creates_once_without_overwriting_project_choices(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = initialize(root)
            profile = root / "config/governance/profile.yaml"
            profile.write_text("project-owned: true\n", encoding="utf-8")
            second = initialize(root)
            self.assertIn("tools/governance-bootstrap.py", first["created"])
            self.assertEqual(
                (root / ".governance/.gitignore").read_text(encoding="utf-8"),
                "*\n!.gitignore\n",
            )
            self.assertEqual(profile.read_text(encoding="utf-8"), "project-owned: true\n")
            self.assertEqual(second["created"], [])
            self.assertEqual(second["refreshed"], [])

    def test_init_reports_launcher_drift_and_refreshes_only_when_explicit(self) -> None:
        """Keep target customizations intact until the operator requests replacement."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            hook = root / ".githooks/pre-push"
            hook.write_text("#!/bin/sh\necho custom\n", encoding="utf-8")

            preview = initialize(root)
            self.assertEqual(preview["refreshed"], [])
            self.assertEqual(
                preview["launcher_drift"]["modified"], [".githooks/pre-push"]
            )
            self.assertEqual(
                hook.read_text(encoding="utf-8"), "#!/bin/sh\necho custom\n"
            )

            refreshed = initialize(root, refresh_launchers=True)
            self.assertEqual(refreshed["refreshed"], [".githooks/pre-push"])
            self.assertEqual(refreshed["launcher_drift"], {
                "missing": [],
                "modified": [],
            })
            self.assertEqual(launcher_drift(root), {
                "missing": [],
                "modified": [],
            })

    def test_doctor_reports_launcher_drift_without_rejecting_customization(self) -> None:
        """Make tracked integration differences visible without assuming they are invalid."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            lock = valid_lock()
            lock["version"] = "source-tree"
            lock_path = root / "config/governance/runtime.lock.yaml"
            lock_path.write_text(json.dumps(lock), encoding="utf-8")
            hook = root / ".githooks/pre-pr"
            hook.write_text("#!/bin/sh\necho custom\n", encoding="utf-8")

            result = _doctor(root)

        self.assertEqual(result["status"], "passed", result)
        self.assertEqual(
            result["launcher_drift"]["modified"], [".githooks/pre-pr"]
        )
        self.assertTrue(
            any("--refresh-launchers" in item for item in result["notices"])
        )

    def test_installed_bootstrap_resolves_the_child_repository_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            launcher = (root / "tools/governance-bootstrap.py").read_text(encoding="utf-8")
            self.assertIn("Path(__file__).resolve().parents[1]", launcher)
            self.assertNotIn("Path(__file__).resolve().parents[2]", launcher)
            self.assertIn("PIP_DISABLE_PIP_VERSION_CHECK", launcher)

    def test_bootstrap_rejects_an_ambiguous_source_revision_before_download(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            value = valid_lock()
            value["source_commit"] = "abc123"
            lock = root / "config/governance/runtime.lock.yaml"
            lock.write_text(json.dumps(value), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(root / "tools/governance-bootstrap.py")],
                cwd=root,
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source_commit", result.stderr)


class RuntimeUpdateTests(unittest.TestCase):
    """Prove deliberate updates change only the tracked runtime lock."""

    @staticmethod
    def _release_update(root: Path, *, schema: int = 1):
        lock_path = root / "config/governance/runtime.lock.yaml"
        release_root = root / "releases"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        release_root.mkdir(exist_ok=True)
        current = valid_lock()
        current["release_base_url"] = release_root.as_uri()
        lock_path.write_text(json.dumps(current), encoding="utf-8")
        candidate = dict(current)
        candidate.update(
            {
                "version": "0.2.0",
                "wheel": "project_governance_runtime-0.2.0-py3-none-any.whl",
                "sha256": "1" * 64,
                "source_commit": "b" * 40,
                "configuration_schema": schema,
            }
        )
        candidate_directory = release_root / "0.2.0"
        candidate_directory.mkdir(exist_ok=True)
        candidate_path = candidate_directory / "runtime.lock.yaml"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        return lock_path, current, candidate, candidate_path

    def test_update_previews_applies_and_detects_an_exact_no_op(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path, current, candidate, candidate_path = self._release_update(root)

            preview = update(root, "0.2.0", apply=False)
            self.assertEqual(preview["status"], "dry-run")
            self.assertEqual(
                preview["verification_commands"],
                [
                    "python3 tools/governance-bootstrap.py",
                    ".governance/runtime/bin/project-governance doctor",
                ],
            )
            self.assertFalse(
                any(" check " in command for command in preview["verification_commands"])
            )
            self.assertEqual(load_lock(lock_path), current)
            applied = update(root, "0.2.0", apply=True)
            self.assertEqual(applied["status"], "applied")
            self.assertEqual(load_lock(lock_path), candidate)
            self.assertEqual(update(root, "0.2.0", apply=False)["status"], "no-op")

            candidate["sha256"] = "2" * 64
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "immutable"):
                update(root, "0.2.0", apply=False)

    def test_schema_change_requires_review_then_deliberate_apply(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path, current, candidate, _ = self._release_update(root, schema=2)
            owned = root / "config/policies/project-owned.yaml"
            historical = root / "scripts/retired-runtime.py"
            owned.parent.mkdir(parents=True)
            historical.parent.mkdir(parents=True)
            owned.write_text("owner: repository\n", encoding="utf-8")
            historical.write_text("preserve through lock update\n", encoding="utf-8")

            preview = update(root, "0.2.0", apply=False)
            self.assertEqual(preview["status"], "migration-required")
            self.assertIn("use --apply", preview["reason"])
            self.assertEqual(load_lock(lock_path), current)

            applied = update(root, "0.2.0", apply=True)
            self.assertEqual(applied["status"], "applied")
            self.assertEqual(load_lock(lock_path), candidate)
            self.assertEqual(owned.read_text(encoding="utf-8"), "owner: repository\n")
            self.assertEqual(
                historical.read_text(encoding="utf-8"),
                "preserve through lock update\n",
            )

    def test_update_rejects_an_incomplete_candidate_without_fixed_temporary_state(self) -> None:
        """Validate downloaded lock content in memory before one atomic tracked-file update."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path, current, candidate, candidate_path = self._release_update(root)
            del candidate["sha256"]
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")

            with self.assertRaisesRegex(
                InstallationError, "candidate runtime lock.*incomplete"
            ):
                update(root, "0.2.0", apply=True)

            self.assertEqual(load_lock(lock_path), current)
            self.assertFalse(
                (root / ".governance/candidate-runtime.lock.yaml").exists()
            )


class RuntimeSkillMaterializationTests(unittest.TestCase):
    """Prove generic skills remain ignored installed runtime material."""

    def test_generic_skills_materialize_only_under_ignored_runtime_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stale = root / ".governance/runtime/skills/retired/SKILL.md"
            stale.parent.mkdir(parents=True)
            stale.write_text("retired\n", encoding="utf-8")
            copied = materialize_skills(root)
            self.assertIn("work", copied)
            self.assertTrue(
                (root / ".governance/runtime/skills/work/SKILL.md").is_file()
            )
            catalog = root / ".governance/runtime/skills/catalog.yaml"
            self.assertTrue(catalog.is_file())
            self.assertNotIn(
                "source-template-skill-path", catalog.read_text(encoding="utf-8")
            )
            self.assertTrue(
                (root / ".governance/runtime/skills/review-finding.schema.yaml").is_file()
            )
            self.assertFalse(stale.exists())


if __name__ == "__main__":
    unittest.main()
