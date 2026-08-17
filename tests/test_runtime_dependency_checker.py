#!/usr/bin/env python3
"""Prove dependency freshness is scoped to introduced and updated coordinates."""

from __future__ import annotations

import contextlib
import base64
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime import checkers  # noqa: E402
from project_governance_runtime.configuration import load_packs  # noqa: E402
from project_governance_runtime.planning import build_plan  # noqa: E402


class RuntimeDependencyCheckerTests(unittest.TestCase):
    """Protect tuple-diff selection, coordinate evidence, and packet byte authority."""

    def test_changed_dependency_path_selects_dependency_freshness(self) -> None:
        plan = build_plan(
            load_packs(ROOT / "tests/fixtures/empty-target"),
            stage="pre-commit",
            mode="impacted",
            changed_paths=["apps/demo/package.json"],
            explicit_pack_ids=[],
        )
        self.assertEqual(plan["status"], "ready")
        self.assertIn("dependencies", plan["selected_packs"])

    def test_script_only_edit_needs_no_evidence_for_unchanged_dependencies(self) -> None:
        before = json.dumps({"scripts": {"test": "old"}, "dependencies": {"left-pad": "1.3.0"}})
        after = json.dumps({"scripts": {"test": "new"}, "dependencies": {"left-pad": "1.3.0"}})
        with self._fixture({"package.json": (before, after)}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["status"], "no-coordinate-changes")
        self.assertEqual(report["checked"][0]["changed_dependency_count"], 0)

    def test_zero_coordinate_edit_ignores_unrelated_invalid_evidence_record(self) -> None:
        before = json.dumps({"scripts": {"test": "old"}, "dependencies": {"left-pad": "1.3.0"}})
        after = json.dumps({"scripts": {"test": "new"}, "dependencies": {"left-pad": "1.3.0"}})
        unrelated = self._npm_evidence("unrelated", "9.0.0")
        unrelated["source_url"] = "https://example.invalid/unrelated/9.0.0"
        with self._fixture({"package.json": (before, after)}) as root:
            self._write_evidence(root, [unrelated])
            self._write_overrides(root, [{
                "ecosystem": "npm",
                "name": "unrelated",
                "version": "9.0.0",
                "artifact_type": "direct",
            }])
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["finding_count"], 0)
        self.assertEqual(report["checked"][0]["status"], "no-coordinate-changes")

    def test_version_update_requires_only_the_new_coordinate(self) -> None:
        before = json.dumps({"dependencies": {"left-pad": "1.2.0", "stable": "2.0.0"}})
        after = json.dumps({"dependencies": {"left-pad": "1.3.0", "stable": "2.0.0"}})
        unrelated = self._npm_evidence("unrelated", "9.0.0")
        unrelated["source_url"] = "https://example.invalid/unrelated/9.0.0"
        with self._fixture({"package.json": (before, after)}) as root:
            self._write_evidence(
                root,
                [self._npm_evidence("left-pad", "1.3.0"), unrelated],
            )
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["changed_dependency_count"], 1)
        self.assertEqual(report["checked"][0]["changed_dependencies"][0]["version"], "1.3.0")

    def test_added_dependency_ignores_many_unchanged_coordinates(self) -> None:
        before = json.dumps({"dependencies": {"alpha": "1.0.0", "beta": "2.0.0"}})
        after = json.dumps({"dependencies": {"alpha": "1.0.0", "beta": "2.0.0", "gamma": "3.0.0"}})
        with self._fixture({"package.json": (before, after)}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertIn("('npm', 'gamma', '3.0.0', 'direct')", report["findings"][0]["message"])

    def test_matching_invalid_evidence_record_blocks_once_without_missing_duplicate(self) -> None:
        after = json.dumps({"dependencies": {"left-pad": "1.3.0"}})
        matching = self._npm_evidence("left-pad", "1.3.0")
        matching["source_url"] = "https://example.invalid/left-pad/1.3.0"
        with self._fixture({"package.json": (json.dumps({}), after)}) as root:
            self._write_evidence(root, [matching])
            code, report = self._run_checker(root)
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertEqual(report["findings"][0]["rule_id"], "dependency.evidence-invalid")
        self.assertEqual(report["checked"][0]["status"], "evidence-invalid")

    def test_registry_envelope_corruption_is_one_grouped_failure(self) -> None:
        with self._fixture({"package.json": (json.dumps({}), json.dumps({}))}) as root:
            (root / "config/policies/dependency-freshness-evidence.yaml").write_text(
                yaml.safe_dump({"version": 2, "records": "not-a-list", "unknown": True}),
                encoding="utf-8",
            )
            code, report = self._run_checker(root)
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertEqual(report["findings"][0]["rule_id"], "dependency.evidence-invalid")
        self.assertIn("invalid registry envelope", report["findings"][0]["message"])

    def test_legacy_v1_coordinate_registries_fail_with_migration_message(self) -> None:
        for registry_name, collection, expected_rule in (
            ("dependency-freshness-evidence.yaml", "records", "dependency.evidence-invalid"),
            ("dependency-freshness-overrides.yaml", "overrides", "dependency.override-invalid"),
        ):
            with self.subTest(registry=registry_name), self._fixture(
                {
                    "package.json": (
                        json.dumps({}),
                        json.dumps({"dependencies": {"left-pad": "1.3.0"}}),
                    )
                }
            ) as root:
                (root / f"config/policies/{registry_name}").write_text(
                    yaml.safe_dump({"version": 1, "owner": "test", collection: []}),
                    encoding="utf-8",
                )
                code, report = self._run_checker(root)
            self.assertEqual(code, 1)
            self.assertEqual(report["finding_count"], 1)
            self.assertEqual(report["findings"][0]["rule_id"], expected_rule)
            self.assertIn("legacy schema version 1", report["findings"][0]["message"])
            self.assertIn("coordinate registry version 2", report["findings"][0]["message"])

    def test_removed_dependency_needs_no_freshness_evidence(self) -> None:
        before = json.dumps({"dependencies": {"alpha": "1.0.0", "beta": "2.0.0"}})
        after = json.dumps({"dependencies": {"alpha": "1.0.0"}})
        with self._fixture({"package.json": (before, after)}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["changed_dependency_count"], 0)

    def test_one_coordinate_record_satisfies_two_manifests(self) -> None:
        after = json.dumps({"dependencies": {"shared": "4.0.0"}})
        manifests = {
            "apps/one/package.json": (json.dumps({}), after),
            "apps/two/package.json": (json.dumps({}), after),
        }
        with self._fixture(manifests) as root:
            self._write_evidence(root, [self._npm_evidence("shared", "4.0.0")])
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(len(report["checked"]), 2)
        self.assertTrue(all(item["status"] == "evidence-verified" for item in report["checked"]))

    def test_malformed_changed_manifest_fails_closed_once(self) -> None:
        with self._fixture({"package.json": (json.dumps({}), "{not-json")}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertEqual(report["findings"][0]["rule_id"], "dependency.unsupported-format")

    def test_ambiguous_dependency_syntax_fails_closed_once(self) -> None:
        before = json.dumps({"dependencies": {"left-pad": "1.0.0"}})
        after = json.dumps({"dependencies": {"left-pad": "^2.0.0"}})
        with self._fixture({"package.json": (before, after)}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertEqual(report["findings"][0]["rule_id"], "dependency.unsupported-format")

    def test_unchanged_legacy_lock_defect_allows_unrelated_registered_coordinate(self) -> None:
        """Allow a content-stable legacy lock defect while checking new valid work."""
        legacy = self._lock_entry("legacy", "1.0.0", resolved="https://proxy.invalid/legacy/-/legacy-1.0.0.tgz")
        lock = json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy}})
        manifests = {
            "package-lock.json": (lock, lock),
            "apps/new/package.json": (json.dumps({}), json.dumps({"dependencies": {"fresh": "2.0.0"}})),
        }
        with self._fixture(manifests) as root:
            self._write_evidence(root, [self._npm_evidence("fresh", "2.0.0")])
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["finding_count"], 0)

    def test_changed_npm_lock_defects_block(self) -> None:
        """Reject new lock defects even when a legacy defect remains tolerated."""
        legacy = self._lock_entry("legacy", "1.0.0", resolved="https://proxy.invalid/legacy/-/legacy-1.0.0.tgz")
        cases = {
            "host": self._lock_entry("new", "2.0.0", resolved="https://proxy.invalid/new/-/new-2.0.0.tgz"),
            "version": self._lock_entry("new", "^2.0.0"),
            "integrity": self._lock_entry("new", "2.0.0", integrity="sha512-not-base64"),
        }
        for kind, new in cases.items():
            with self.subTest(kind=kind), self._fixture({
                "package-lock.json": (
                    json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy}}),
                    json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy, "node_modules/new": new}}),
                )
            }) as root:
                code, report = self._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertEqual(report["finding_count"], 1)

    def test_manifest_range_repair_passes_but_changed_range_blocks(self) -> None:
        """Treat an exact pin as repair while blocking a different ranged literal."""
        before = json.dumps({"dependencies": {"left-pad": "^1.0.0"}})
        with self._fixture({"package.json": (before, json.dumps({"dependencies": {"left-pad": "1.0.0"}}))}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        with self._fixture({"package.json": (before, json.dumps({"dependencies": {"left-pad": "~1.0.0"}}))}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 1, report)
        self.assertEqual(report["finding_count"], 1)

    def test_retained_legacy_and_new_lock_defect_reports_only_new_defect(self) -> None:
        """Report only the introduced lock defect when an old one is unchanged."""
        legacy = self._lock_entry("legacy", "1.0.0", resolved="https://proxy.invalid/legacy/-/legacy-1.0.0.tgz")
        new = self._lock_entry("new", "2.0.0", integrity="sha512-not-base64")
        with self._fixture({"package-lock.json": (
            json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy}}),
            json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy, "node_modules/new": new}}),
        )}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 1, report)
        self.assertEqual(report["finding_count"], 1)
        self.assertIn("new", report["findings"][0]["message"])

    def test_lock_repair_does_not_unmask_an_unchanged_second_defect(self) -> None:
        """Compare every lock-entry defect even when an earlier field is also invalid."""
        invalid_integrity = "sha512-not-base64"
        before = self._lock_entry(
            "legacy",
            "1.0.0",
            resolved="https://proxy.invalid/legacy/-/legacy-1.0.0.tgz",
            integrity=invalid_integrity,
        )
        after = self._lock_entry("legacy", "1.0.0", integrity=invalid_integrity)
        with self._fixture({"package-lock.json": (
            json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": before}}),
            json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": after}}),
        )}) as root:
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["finding_count"], 0)

    def test_all_mode_stays_strict_for_legacy_npm_defects(self) -> None:
        """All mode has no before image and therefore cannot grandfather defects."""
        legacy = self._lock_entry("legacy", "1.0.0", resolved="https://proxy.invalid/legacy/-/legacy-1.0.0.tgz")
        with self._fixture({"package-lock.json": (None, json.dumps({"lockfileVersion": 3, "packages": {"node_modules/legacy": legacy}}))}) as root:
            code, report = self._run_checker(root, mode="all")
        self.assertEqual(code, 1, report)
        self.assertEqual(report["finding_count"], 1)

    def test_workspace_lock_entry_has_no_coordinate_but_registry_entry_does(self) -> None:
        """Skip local workspace members while preserving external package coordinates."""
        workspace = {"name": "workspace-member", "version": "1.0.0"}
        external = self._lock_entry("external", "2.0.0")
        with self._fixture({"package-lock.json": (json.dumps({"lockfileVersion": 3, "packages": {}}), json.dumps({
            "lockfileVersion": 3,
            "packages": {"packages/member": workspace, "node_modules/external": external},
        }))}) as root:
            evidence = self._npm_evidence("external", "2.0.0")
            evidence["artifact_type"] = "transitive"
            self._write_evidence(root, [evidence])
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["changed_dependency_count"], 1)
        self.assertEqual(report["checked"][0]["changed_dependencies"][0]["name"], "external")

    def test_tolerant_manifest_parser_preserves_override_and_toolchain_coordinates(self) -> None:
        """Require freshness evidence for every valid governed manifest coordinate family."""
        cases = {
            "overrides": {"overrides": {"forced": "2.0.0"}},
            "resolutions": {"resolutions": {"forced": "2.0.0"}},
            "pnpm.overrides": {"pnpm": {"overrides": {"forced": "2.0.0"}}},
            "packageManager": {"packageManager": "npm@11.0.0"},
        }
        for field, after in cases.items():
            with self.subTest(field=field), self._fixture({
                "package.json": (json.dumps({}), json.dumps(after)),
            }) as root:
                code, report = self._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertEqual(report["finding_count"], 1)
            self.assertEqual(report["findings"][0]["rule_id"], "dependency.evidence-missing")

    def test_tolerant_manifest_parser_keeps_structural_pnpm_failures_strict(self) -> None:
        """Reject dependency-bearing pnpm syntax that has no deterministic parser."""
        cases = {
            "non-object": {"pnpm": "invalid"},
            "packageExtensions": {"pnpm": {"packageExtensions": {"pkg@1": {}}}},
            "patchedDependencies": {"pnpm": {"patchedDependencies": {"pkg@1": "patch.diff"}}},
        }
        for field, after in cases.items():
            with self.subTest(field=field), self._fixture({
                "package.json": (json.dumps({}), json.dumps(after)),
            }) as root:
                code, report = self._run_checker(root)
            self.assertEqual(code, 1, report)
            self.assertEqual(report["finding_count"], 1)
            self.assertEqual(report["findings"][0]["rule_id"], "dependency.unsupported-format")

    def test_manifest_override_defects_follow_the_same_content_ratchet(self) -> None:
        """Allow unchanged and repaired override debt while rejecting a changed literal."""
        before = {"overrides": {"forced": "^2.0.0"}}
        cases = (
            (before, 0),
            ({"overrides": {"forced": "2.0.0"}}, 0),
            ({"overrides": {"forced": "~2.0.0"}}, 1),
        )
        for after, expected_code in cases:
            with self.subTest(after=after), self._fixture({
                "package.json": (json.dumps(before), json.dumps(after)),
            }) as root:
                code, report = self._run_checker(root)
            self.assertEqual(code, expected_code, report)
            self.assertEqual(report["finding_count"], expected_code)

    def test_package_manager_defects_follow_the_same_content_ratchet(self) -> None:
        """Allow an exact package-manager repair but reject newly changed toolchain debt."""
        before = {"packageManager": "npm@^11.0.0"}
        cases = (
            ({"packageManager": "npm@11.0.0"}, 0),
            ({"packageManager": "npm@~11.0.0"}, 1),
        )
        for after, expected_code in cases:
            with self.subTest(after=after), self._fixture({
                "package.json": (json.dumps(before), json.dumps(after)),
            }) as root:
                code, report = self._run_checker(root)
            self.assertEqual(code, expected_code, report)
            self.assertEqual(report["finding_count"], expected_code)

    def test_active_override_is_keyed_only_by_changed_coordinate(self) -> None:
        after = json.dumps({"dependencies": {"left-pad": "2.0.0"}})
        with self._fixture({"package.json": (json.dumps({}), after)}) as root:
            self._write_overrides(root, [{
                "name": "left-pad",
                "ecosystem": "npm",
                "version": "2.0.0",
                "artifact_type": "direct",
                "published_at": "2026-08-01T00:00:00Z",
                "source_url": "https://registry.npmjs.org/left-pad/2.0.0",
                "reason": "temporary review",
                "risk_owner": "test",
                "approved_by": "operator",
                "approver_role": "operator",
                "approved_at": "2026-08-02T00:00:00Z",
                "expires_at": "2026-08-20",
                "follow_up": "replace with age evidence",
                "evidence": "operator review receipt",
            }])
            code, report = self._run_checker(root)
        self.assertEqual(code, 0, report)
        self.assertEqual(report["checked"][0]["status"], "operator-override")

    def test_packet_mode_controls_exact_after_image_bytes(self) -> None:
        before = json.dumps({"dependencies": {"left-pad": "1.0.0"}})
        selected = json.dumps({"dependencies": {"left-pad": "2.0.0"}})
        worktree = json.dumps({"dependencies": {"left-pad": "9.0.0"}})
        for mode in ("staged", "changed"):
            with self.subTest(mode=mode), self._fixture(
                {"package.json": (before, selected)}, mode=mode, worktree={"package.json": worktree}
            ) as root:
                self._write_evidence(root, [self._npm_evidence("left-pad", "2.0.0")])
                code, report = self._run_checker(root, mode=mode)
            self.assertEqual(code, 0, report)
            self.assertEqual(report["checked"][0]["changed_dependencies"][0]["version"], "2.0.0")

    def test_explicit_path_without_packet_fails_once_for_unresolved_subject(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "package.json").write_text(json.dumps({"dependencies": {"x": "1.0.0"}}))
            self._write_policy_files(root)
            code, report = self._run_checker(root, arguments=["--path", "package.json"])
        self.assertEqual(code, 1)
        self.assertEqual(report["finding_count"], 1)
        self.assertEqual(report["findings"][0]["rule_id"], "dependency.unresolved-subject")

    @contextlib.contextmanager
    def _fixture(
        self,
        manifests: dict[str, tuple[str | None, str | None]],
        *,
        mode: str = "changed",
        worktree: dict[str, str] | None = None,
    ):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            packet_root = root / ".packet"
            records = []
            for number, (relative, (before, after)) in enumerate(manifests.items()):
                before_path = packet_root / "before" / str(number) / relative
                after_path = packet_root / "after" / str(number) / relative
                if before is not None:
                    before_path.parent.mkdir(parents=True, exist_ok=True)
                    before_path.write_text(before, encoding="utf-8")
                if after is not None:
                    after_path.parent.mkdir(parents=True, exist_ok=True)
                    after_path.write_text(after, encoding="utf-8")
                    target = root / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text((worktree or {}).get(relative, after), encoding="utf-8")
                records.append({
                    "status": "added" if before is None else "deleted" if after is None else "modified",
                    "path": relative,
                    "previous_path": None,
                    "before_path": str(before_path.resolve()) if before is not None else None,
                    "after_path": str(after_path.resolve()) if after is not None else None,
                    "changed_ranges": [],
                })
            packet = packet_root / "change-packet.json"
            packet.parent.mkdir(parents=True, exist_ok=True)
            packet.write_text(json.dumps({
                "kind": "project-governance-change-packet",
                "version": 1,
                "scope": "changed",
                "mode": mode,
                "base_ref": "a" * 40,
                "records": records,
            }), encoding="utf-8")
            self._write_policy_files(root)
            with patch.dict(os.environ, {"PROJECT_GOVERNANCE_CHANGE_PACKET": str(packet.resolve())}, clear=False):
                yield root

    @staticmethod
    def _npm_evidence(name: str, version: str) -> dict[str, str]:
        return {
            "name": name,
            "ecosystem": "npm",
            "version": version,
            "artifact_type": "direct",
            "evaluated_at": "2026-07-01T00:00:00Z",
            "published_at": "2025-01-01T00:00:00Z",
            "source_url": f"https://registry.npmjs.org/{name}/{version}",
        }

    @staticmethod
    def _lock_entry(
        name: str,
        version: str,
        *,
        resolved: str | None = None,
        integrity: str | None = None,
    ) -> dict[str, str]:
        """Build a valid lock entry with optional one-field corruption."""
        return {
            "version": version,
            "resolved": resolved or f"https://registry.npmjs.org/{name}/-/{name}-{version}.tgz",
            "integrity": integrity or f"sha512-{base64.b64encode(b'x' * 64).decode('ascii')}",
        }

    @classmethod
    def _write_policy_files(cls, root: Path) -> None:
        policy = root / "config/policies"
        policy.mkdir(parents=True, exist_ok=True)
        (policy / "dependency-freshness-evidence.yaml").write_text(
            yaml.safe_dump({"version": 2, "owner": "test", "records": []}), encoding="utf-8"
        )
        (policy / "dependency-freshness-overrides.yaml").write_text(
            yaml.safe_dump({"version": 2, "owner": "test", "overrides": []}), encoding="utf-8"
        )

    @staticmethod
    def _write_evidence(root: Path, records: list[dict[str, str]]) -> None:
        (root / "config/policies/dependency-freshness-evidence.yaml").write_text(
            yaml.safe_dump({"version": 2, "owner": "test", "records": records}, sort_keys=False),
            encoding="utf-8",
        )

    @staticmethod
    def _write_overrides(root: Path, records: list[dict[str, str]]) -> None:
        (root / "config/policies/dependency-freshness-overrides.yaml").write_text(
            yaml.safe_dump({"version": 2, "owner": "test", "overrides": records}, sort_keys=False),
            encoding="utf-8",
        )

    @staticmethod
    def _run_checker(
        root: Path,
        *,
        mode: str = "changed",
        arguments: list[str] | None = None,
    ) -> tuple[int, dict[str, object]]:
        output = io.StringIO()
        original_directory = Path.cwd()
        selection = "--all" if mode == "all" else "--staged" if mode == "staged" else "--changed"
        try:
            os.chdir(root)
            with (
                patch.object(sys, "argv", ["project-governance", "dependencies", *(arguments or [selection]), "--as-of", "2026-08-11T00:00:00Z"]),
                contextlib.redirect_stdout(output),
            ):
                exit_code = checkers.main()
        finally:
            os.chdir(original_directory)
        return exit_code, json.loads(output.getvalue())


if __name__ == "__main__":
    unittest.main()
