#!/usr/bin/env python3
"""Prove lock validation and one-time lean repository initialization."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.installation import (  # noqa: E402
    InstallationError,
    initialize,
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
        """Fail before installation when artifact identity is not exact."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["sha256"] = "not-a-digest"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "sha256"):
                load_lock(path)

    def test_lock_rejects_a_wheel_path_instead_of_a_filename(self) -> None:
        """Prevent a tracked lock from escaping bootstrap's temporary download directory."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["wheel"] = "../runtime.whl"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "wheel filename"):
                load_lock(path)

    def test_lock_rejects_an_ambiguous_source_revision(self) -> None:
        """Keep the lock's audit identity bound to one full Git object id."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime.lock.yaml"
            value = valid_lock()
            value["source_commit"] = "abc123"
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "source_commit"):
                load_lock(path)

    def test_init_creates_once_without_overwriting_project_choices(self) -> None:
        """Materialize thin defaults once and leave later target edits alone."""
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

    def test_installed_bootstrap_resolves_the_child_repository_root(self) -> None:
        """Keep the copied launcher bound to the lock in its own repository."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            launcher = (root / "tools/governance-bootstrap.py").read_text(encoding="utf-8")
            self.assertIn("Path(__file__).resolve().parents[1]", launcher)
            self.assertNotIn("Path(__file__).resolve().parents[2]", launcher)

    def test_bootstrap_rejects_an_ambiguous_source_revision_before_download(self) -> None:
        """Apply the lock identity rule in the dependency-free launcher too."""
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
    """Prove deliberate updates, migrations, and bounded predecessor cleanup."""

    @staticmethod
    def _release_update(root: Path, *, schema: int = 1, migrations=None):
        """Create one current lock and immutable candidate release."""
        lock_path = root / "config/governance/runtime.lock.yaml"
        release_root = root / "releases"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        release_root.mkdir(exist_ok=True)
        current = valid_lock()
        current["release_base_url"] = release_root.as_uri()
        lock_path.write_text(json.dumps(current), encoding="utf-8")
        candidate = dict(current)
        candidate.update({
            "version": "0.2.0",
            "wheel": "project_governance_runtime-0.2.0-py3-none-any.whl",
            "sha256": "1" * 64,
            "source_commit": "b" * 40,
            "configuration_schema": schema,
        })
        if migrations is not None:
            candidate["required_target_migrations"] = migrations
        candidate_directory = release_root / "0.2.0"
        candidate_directory.mkdir(exist_ok=True)
        (candidate_directory / "runtime.lock.yaml").write_text(
            json.dumps(candidate), encoding="utf-8"
        )
        return lock_path, current, candidate

    @staticmethod
    def _legacy_cleanup_fixture(root: Path) -> dict[str, Path]:
        """Create the predecessor artifact ownership cases."""
        paths = {
            "exact": root / "scripts/retired-runtime.py",
            "modified": root / "config/policies/modified.yaml",
            "repository_owned": root / "docs/governance/local.md",
            "retained": root / "tools/governance-bootstrap.py",
            "agent_run": root / ".agent/upgrade-runs/old/state.json",
        }
        for key, content in (("exact", "old runtime\n"), ("modified", "locally changed\n"),
                             ("repository_owned", "repository authority\n"),
                             ("retained", "current launcher\n"), ("agent_run", "{}\n")):
            paths[key].parent.mkdir(parents=True, exist_ok=True)
            paths[key].write_text(content, encoding="utf-8")
        digest = lambda path: "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        specs = [
            ("exact", "template-owned", digest(paths["exact"])),
            ("modified", "derived", "sha256:" + "2" * 64),
            ("repository_owned", "target-owned", digest(paths["repository_owned"])),
            ("retained", "template-owned", digest(paths["retained"])),
        ]
        paths["legacy_lock"] = root / "config/governance/generated-files.lock.yaml"
        paths["legacy_lock"].write_text(yaml.safe_dump({
            "version": 1,
            "kind": "governance-generated-files-lock",
            "files": [{
                "path": paths[key].relative_to(root).as_posix(), "ownership": ownership,
                "provenance": "verified", "accepted_target_sha256": digest_value,
            } for key, ownership, digest_value in specs],
        }), encoding="utf-8")
        return paths

    @staticmethod
    def _dependency_record(name: str = "Requests_Package") -> dict[str, str]:
        return {
            "ecosystem": "PyPI", "name": name, "version": "1.0.0",
            "artifact_type": "Direct", "published_at": "2025-01-01T00:00:00Z",
            "source_url": "https://pypi.org/project/requests-package/1.0.0",
        }

    @classmethod
    def _dependency_registry_fixture(cls, root: Path):
        """Write duplicate-normalizing legacy evidence and overrides."""
        policy = root / "config/policies"
        policy.mkdir(parents=True, exist_ok=True)
        dependency = cls._dependency_record()
        override = {
            **dependency, "path": "requirements.txt", "sha256": "a" * 64,
            "reason": "bounded exception", "risk_owner": "owner", "approved_by": "operator",
            "approver_role": "operator", "approved_at": "2026-01-01",
            "expires_at": "2026-01-15", "follow_up": "remove exception",
            "evidence": "review record",
        }
        evidence_path = policy / "dependency-freshness-evidence.yaml"
        overrides_path = policy / "dependency-freshness-overrides.yaml"
        evidence_path.write_text(yaml.safe_dump({"version": 1, "owner": "repository", "records": [
            {"path": "requirements.txt", "sha256": "a" * 64,
             "evaluated_at": "2026-01-01T00:00:00Z", "dependencies": [dependency]},
            {"path": "requirements-dev.txt", "sha256": "b" * 64,
             "evaluated_at": "2026-01-02T00:00:00Z",
             "dependencies": [cls._dependency_record("requests-package")]},
        ]}), encoding="utf-8")
        overrides_path.write_text(yaml.safe_dump({"version": 1, "owner": "repository", "overrides": [
            override, {**override, "path": "requirements-dev.txt", "sha256": "b" * 64,
                       "name": "requests-package"},
        ]}), encoding="utf-8")
        return evidence_path, overrides_path, dependency, override

    def test_update_previews_applies_and_detects_an_exact_no_op(self) -> None:
        """Keep routine adoption to one reviewed lock change and reject mutable releases."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path = root / "config/governance/runtime.lock.yaml"
            release_root = root / "releases"
            lock_path.parent.mkdir(parents=True)
            release_root.mkdir()
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
                }
            )
            candidate_directory = release_root / "0.2.0"
            candidate_directory.mkdir()
            candidate_path = candidate_directory / "runtime.lock.yaml"
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")

            preview = update(root, "0.2.0", apply=False)
            self.assertEqual(preview["status"], "dry-run")
            self.assertEqual(load_lock(lock_path), current)
            applied = update(root, "0.2.0", apply=True)
            self.assertEqual(applied["status"], "applied")
            self.assertEqual(load_lock(lock_path), candidate)
            self.assertEqual(update(root, "0.2.0", apply=False)["status"], "no-op")

            candidate["sha256"] = "2" * 64
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
            with self.assertRaisesRegex(InstallationError, "immutable"):
                update(root, "0.2.0", apply=False)

    def test_update_reports_exact_v1_disposition_conversions(self) -> None:
        """Make dry-run migration output actionable without changing target decisions."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path = root / "config/governance/runtime.lock.yaml"
            release_root = root / "releases"
            disposition_path = root / "config/policies/code-quality-dispositions.yaml"
            disposition_path.parent.mkdir(parents=True)
            lock_path.parent.mkdir(parents=True)
            release_root.mkdir()
            current = valid_lock()
            current["release_base_url"] = release_root.as_uri()
            lock_path.write_text(json.dumps(current), encoding="utf-8")
            candidate = dict(current)
            candidate.update({
                "version": "0.2.0",
                "wheel": "project_governance_runtime-0.2.0-py3-none-any.whl",
                "sha256": "1" * 64,
                "source_commit": "b" * 40,
                "configuration_schema": 2,
                "required_target_migrations": [{
                    "kind": "quality-dispositions-v2",
                    "path": "config/policies/code-quality-dispositions.yaml",
                }],
            })
            candidate_directory = release_root / "0.2.0"
            candidate_directory.mkdir()
            (candidate_directory / "runtime.lock.yaml").write_text(
                json.dumps(candidate), encoding="utf-8"
            )
            v1 = {
                "version": 1,
                "owner": "repository",
                "dispositions": [
                    {
                        "finding": "quality.large-type",
                        "path": "src/large.py",
                        "symbol": "Large",
                        "disposition": "temporary-waiver",
                    },
                    {
                        "finding": "quality.large-file",
                        "path": "src/accepted.py",
                        "symbol": "<file>",
                        "disposition": "cohesion-accepted",
                    },
                ],
            }
            disposition_path.write_text(yaml.safe_dump(v1), encoding="utf-8")

            preview = update(root, "0.2.0", apply=False)

            self.assertEqual(preview["status"], "migration-required")
            migrations = preview["upgrade_cleanup"]["quality_disposition_migrations"]
            self.assertEqual(
                [item["key"] for item in migrations],
                [
                    "quality.large-file|src/accepted.py|<file>",
                    "quality.large-type|src/large.py|Large",
                ],
            )
            self.assertEqual(migrations[0]["disposition"], "cohesion-accepted")
            self.assertIn("remove current_lines", migrations[0]["required_conversion"])
            self.assertEqual(migrations[1]["disposition"], "temporary-waiver")
            self.assertIn("do not convert to cohesion-accepted", migrations[1]["required_conversion"])
            self.assertEqual(load_lock(lock_path), current)
            self.assertEqual(yaml.safe_load(disposition_path.read_text(encoding="utf-8")), v1)

    def test_update_prunes_only_hash_proven_runtime_artifacts_after_lock_swap(self) -> None:
        """Preserve modified and repository-owned predecessor files during bounded cleanup."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            (root / ".gitignore").write_text(".agent/\n", encoding="utf-8")
            lock_path, _, candidate = self._release_update(root)
            paths = self._legacy_cleanup_fixture(root)

            preview = update(root, "0.2.0", apply=False)
            cleanup = preview["upgrade_cleanup"]
            by_path = {
                item["path"]: item
                for item in cleanup["previous_governance_artifacts"]
            }
            self.assertEqual(cleanup["summary"], {
                "auto_prune": 1,
                "manual_review": 4,
                "runtime_purge": 1,
            })
            self.assertEqual(by_path["scripts/retired-runtime.py"]["disposition"], "auto-prune")
            self.assertEqual(by_path["config/policies/modified.yaml"]["disposition"], "manual-review")
            self.assertEqual(by_path["docs/governance/local.md"]["disposition"], "manual-review")
            self.assertEqual(by_path["tools/governance-bootstrap.py"]["disposition"], "manual-review")
            self.assertTrue(paths["exact"].exists())
            self.assertTrue(paths["agent_run"].exists())

            applied = update(root, "0.2.0", apply=True)

            self.assertEqual(applied["status"], "applied")
            self.assertFalse(paths["exact"].exists())
            for key in ("agent_run", "modified", "repository_owned", "retained", "legacy_lock"):
                self.assertTrue(paths[key].exists())
            self.assertEqual(load_lock(lock_path), candidate)

    def test_schema_update_applies_after_validated_v2_conversion(self) -> None:
        """Allow the lock to advance only after the declared target migration validates."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock_path = root / "config/governance/runtime.lock.yaml"
            release_root = root / "releases"
            disposition_path = root / "config/policies/code-quality-dispositions.yaml"
            lock_path.parent.mkdir(parents=True)
            disposition_path.parent.mkdir(parents=True)
            release_root.mkdir()
            current = valid_lock()
            current["release_base_url"] = release_root.as_uri()
            lock_path.write_text(json.dumps(current), encoding="utf-8")
            candidate = dict(current)
            candidate.update({
                "version": "0.2.0",
                "wheel": "project_governance_runtime-0.2.0-py3-none-any.whl",
                "sha256": "1" * 64,
                "source_commit": "b" * 40,
                "configuration_schema": 2,
                "required_target_migrations": [{
                    "kind": "quality-dispositions-v2",
                    "path": "config/policies/code-quality-dispositions.yaml",
                }],
            })
            candidate_directory = release_root / "0.2.0"
            candidate_directory.mkdir()
            (candidate_directory / "runtime.lock.yaml").write_text(
                json.dumps(candidate), encoding="utf-8"
            )
            disposition_path.write_text(yaml.safe_dump({
                "version": 2,
                "owner": "repository",
                "dispositions": [{
                    "finding": "quality.large-type",
                    "path": "src/large.py",
                    "symbol": "Large",
                    "disposition": "cohesion-accepted",
                    "owner": "repository",
                    "reviewer": "reviewer",
                    "approved_on": "2026-08-15",
                    "responsibility": "Own the bounded installation workflow.",
                    "rationale": "The responsibilities remain cohesive and readable.",
                }],
            }), encoding="utf-8")

            preview = update(root, "0.2.0", apply=False)
            self.assertEqual(preview["status"], "dry-run")
            self.assertEqual(preview["migration_validation"]["status"], "complete")
            applied = update(root, "0.2.0", apply=True)
            self.assertEqual(applied["status"], "applied")
            self.assertEqual(load_lock(lock_path), candidate)

    def test_cleanup_rejects_a_symlinked_parent_before_pruning(self) -> None:
        """Never follow a manifest path through a symlink outside the target root."""
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            outside_root = Path(outside)
            lock_path = root / "config/governance/runtime.lock.yaml"
            release_root = root / "releases"
            lock_path.parent.mkdir(parents=True)
            release_root.mkdir()
            current = valid_lock()
            current["release_base_url"] = release_root.as_uri()
            lock_path.write_text(json.dumps(current), encoding="utf-8")
            candidate = dict(current)
            candidate.update({
                "version": "0.2.0",
                "wheel": "project_governance_runtime-0.2.0-py3-none-any.whl",
                "sha256": "1" * 64,
                "source_commit": "b" * 40,
            })
            candidate_directory = release_root / "0.2.0"
            candidate_directory.mkdir()
            (candidate_directory / "runtime.lock.yaml").write_text(
                json.dumps(candidate), encoding="utf-8"
            )
            outside_file = outside_root / "escape.txt"
            outside_file.write_text("must survive\n", encoding="utf-8")
            (root / "linked").symlink_to(outside_root, target_is_directory=True)
            legacy_lock = {
                "version": 1,
                "kind": "governance-generated-files-lock",
                "files": [{
                    "path": "linked/escape.txt",
                    "ownership": "template-owned",
                    "provenance": "verified",
                    "accepted_target_sha256": (
                        "sha256:" + __import__("hashlib").sha256(outside_file.read_bytes()).hexdigest()
                    ),
                }],
            }
            legacy_lock_path = root / "config/governance/generated-files.lock.yaml"
            legacy_lock_path.write_text(yaml.safe_dump(legacy_lock), encoding="utf-8")

            preview = update(root, "0.2.0", apply=False)
            escaped = next(
                item for item in preview["upgrade_cleanup"]["previous_governance_artifacts"]
                if item["path"] == "linked/escape.txt"
            )
            self.assertEqual(escaped["disposition"], "manual-review")
            self.assertIn("symlink", escaped["reason"])
            update(root, "0.2.0", apply=True)
            self.assertEqual(outside_file.read_text(encoding="utf-8"), "must survive\n")

    def test_dependency_v1_migration_deduplicates_coordinates_and_validates_v2(self) -> None:
        """Report exact path-bound inputs and advance only after both registries are strict v2."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = [
                {"kind": "dependency-freshness-evidence",
                 "path": "config/policies/dependency-freshness-evidence.yaml"},
                {"kind": "dependency-freshness-overrides",
                 "path": "config/policies/dependency-freshness-overrides.yaml"},
            ]
            lock_path, current, candidate = self._release_update(
                root, schema=2, migrations=migrations
            )
            evidence_path, overrides_path, dependency, override = (
                self._dependency_registry_fixture(root)
            )

            preview = update(root, "0.2.0", apply=False)
            self.assertEqual(preview["status"], "migration-required")
            migrations = {
                item["kind"]: item
                for item in preview["upgrade_cleanup"]["dependency_registry_migrations"]
            }
            evidence_records = migrations["dependency-freshness-evidence"]["records"]
            self.assertEqual(len(evidence_records), 1)
            self.assertEqual(
                evidence_records[0]["key"], "pypi|requests-package|1.0.0|direct"
            )
            self.assertEqual(len(evidence_records[0]["legacy_records"]), 2)
            self.assertEqual(
                evidence_records[0]["legacy_records"][0]["path"], "requirements.txt"
            )
            self.assertIn("drop path and sha256", evidence_records[0]["required_conversion"])
            override_records = migrations["dependency-freshness-overrides"]["records"]
            self.assertEqual(len(override_records), 1)
            self.assertEqual(len(override_records[0]["legacy_records"]), 2)
            self.assertEqual(load_lock(lock_path), current)

            evidence_record = {
                **{key: value for key, value in dependency.items() if key != "name"},
                "name": "requests-package",
                "ecosystem": "pypi",
                "artifact_type": "direct",
                "evaluated_at": "2026-01-02T00:00:00Z",
            }
            evidence_path.write_text(yaml.safe_dump({
                "version": 2,
                "owner": "repository",
                "records": [evidence_record],
                "unknown": True,
            }), encoding="utf-8")
            override_v2 = {key: value for key, value in override.items() if key not in {"path", "sha256"}}
            overrides_path.write_text(yaml.safe_dump({
                "version": 2, "owner": "repository", "overrides": [override_v2]
            }), encoding="utf-8")
            malformed = update(root, "0.2.0", apply=True)
            self.assertEqual(malformed["status"], "migration-required")
            self.assertEqual(load_lock(lock_path), current)

            evidence_path.write_text(yaml.safe_dump({
                "version": 2, "owner": "repository", "records": [evidence_record]
            }), encoding="utf-8")
            applied = update(root, "0.2.0", apply=True)
            self.assertEqual(applied["status"], "applied")
            self.assertEqual(applied["migration_validation"]["status"], "complete")
            self.assertEqual(load_lock(lock_path), candidate)

class RuntimeSkillMaterializationTests(unittest.TestCase):
    """Prove generic skills remain installed runtime material rather than target authority."""

    def test_generic_skills_materialize_only_under_ignored_runtime_state(self) -> None:
        """Expose wheel skills without making them tracked child-repository authority."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stale = root / ".governance/runtime/skills/retired/SKILL.md"
            stale.parent.mkdir(parents=True)
            stale.write_text("retired\n", encoding="utf-8")
            copied = materialize_skills(root)
            self.assertIn("governed-implementation", copied)
            self.assertTrue(
                (
                    root
                    / ".governance/runtime/skills/governed-implementation/SKILL.md"
                ).is_file()
            )
            catalog = root / ".governance/runtime/skills/catalog.yaml"
            self.assertTrue(catalog.is_file())
            self.assertNotIn(
                "source-template-skill-path",
                catalog.read_text(encoding="utf-8"),
            )
            self.assertTrue(
                (root / ".governance/runtime/skills/review-finding.schema.yaml").is_file()
            )
            self.assertFalse(stale.exists())


if __name__ == "__main__":
    unittest.main()
