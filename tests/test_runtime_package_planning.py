#!/usr/bin/env python3
"""Prove the lean package retains required selection and dependency behavior."""

from __future__ import annotations

import argparse
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.configuration import ConfigurationError, load_packs  # noqa: E402
from project_governance_runtime.changed_paths import ChangedPathError, _base_commit  # noqa: E402
from project_governance_runtime.cli import _resolve_plan  # noqa: E402
from project_governance_runtime.planning import build_plan, public_plan  # noqa: E402


class RuntimePlanningTests(unittest.TestCase):
    """Keep the new selection contract small, deterministic, and fail-closed."""

    def setUp(self) -> None:
        """Load only wheel-owned packs for the generic behavior baseline."""
        self.packs = load_packs(ROOT / "tests/fixtures/empty-target")
        self.fixture = yaml.safe_load(
            (ROOT / "tests/fixtures/runtime-behavior-baseline.yaml").read_text(
                encoding="utf-8"
            )
        )

    def replacement_packs(self, patterns: list[str] | None = None) -> dict[str, dict[str, object]]:
        """Add one valid target owner without mutating the shared built-in fixture."""
        packs = {pack_id: dict(pack) for pack_id, pack in self.packs.items()}
        packs["target-maintainability"] = {
            "id": "target-maintainability",
            "implementation_status": "active",
            "enforcement": "blocking",
            "stages": ["pre-commit", "pre-push", "pre-pr", "ci-pr"],
            "path_globs": patterns or ["src/**"],
            "depends_on": [],
            "commands": ["true"],
            "replaces_builtin_packs": ["maintainability"],
            "change_packet_contract": 1,
            "_origin": "target",
            "_source": "fixture",
        }
        return packs

    def test_fixed_behavior_scenarios(self) -> None:
        """Preserve required capability selection across representative repositories."""
        for scenario in self.fixture["scenarios"]:
            with self.subTest(scenario=scenario["id"]):
                plan = build_plan(
                    self.packs,
                    stage=scenario.get("stage"),
                    mode=scenario["mode"],
                    changed_paths=scenario.get("changed_paths", []),
                    explicit_pack_ids=scenario.get("packs", []),
                )
                if "blocker" in scenario:
                    self.assertEqual(plan["status"], "blocked")
                    self.assertEqual(plan["blockers"][0]["code"], scenario["blocker"])
                else:
                    self.assertEqual(plan["status"], "ready", plan["blockers"])
                    self.assertTrue(
                        set(scenario["required_packs"]).issubset(plan["selected_packs"]),
                        plan,
                    )

    def test_dependency_order_and_cycle_rejection(self) -> None:
        """Execute prerequisites first and fail closed on cyclic extension packs."""
        packs = {
            "first": {"implementation_status": "active", "stages": ["pre-pr"], "path_globs": ["src/**"], "commands": ["true"], "enforcement": "blocking", "depends_on": []},
            "second": {"implementation_status": "active", "stages": ["pre-pr"], "path_globs": ["src/**"], "commands": ["true"], "enforcement": "blocking", "depends_on": ["first"]},
        }
        plan = build_plan(
            packs,
            stage="pre-pr",
            mode="explicit",
            changed_paths=[],
            explicit_pack_ids=["second"],
        )
        self.assertEqual(plan["execution_order"], ["first", "second"])
        packs["first"]["depends_on"] = ["second"]
        blocked = build_plan(
            packs,
            stage="pre-pr",
            mode="explicit",
            changed_paths=[],
            explicit_pack_ids=["second"],
        )
        self.assertEqual(blocked["blockers"][0]["code"], "invalid-dependency-graph")

    def test_recursive_globs_also_own_root_level_files(self) -> None:
        """Match the conventional zero-directory meaning of a leading recursive glob."""
        plan = build_plan(
            self.packs,
            stage="pre-commit",
            mode="impacted",
            changed_paths=["setup.py", "requirements-dev.txt"],
            explicit_pack_ids=[],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])
        self.assertIn("format", plan["selected_packs"])
        self.assertIn("maintainability", plan["selected_packs"])

    def test_pre_push_retains_impacted_owners_for_changed_files(self) -> None:
        """Keep the branch-aware hook mapped to the same narrow owners as pre-PR."""
        for path in (
            "src/example.py",
            "docs/specs/example.md",
            "config/governance/profile.yaml",
        ):
            with self.subTest(path=path):
                plan = build_plan(
                    self.packs,
                    stage="pre-push",
                    mode="impacted",
                    changed_paths=[path],
                    explicit_pack_ids=[],
                )
                self.assertEqual(plan["status"], "ready", plan["blockers"])
                self.assertIn("secrets", plan["selected_packs"])

    def test_documentation_profile_change_selects_the_existing_documentation_pack(self) -> None:
        """Keep module configuration under the established documentation owner."""
        plan = build_plan(
            self.packs,
            stage="pre-commit",
            mode="impacted",
            changed_paths=["config/governance/profile.yaml"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])
        self.assertIn("documentation", plan["selected_packs"])
        self.assertNotIn("developer-documentation", plan["selected_packs"])

    def test_configured_documentation_root_and_sources_extend_pack_selection(self) -> None:
        """Follow adopter-owned corpus and evidence paths without creating another pack."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "config/governance/profile.yaml"
            profile.parent.mkdir(parents=True)
            profile.write_text(
                yaml.safe_dump(
                    {
                        "schema_version": 1,
                        "project_extensions": [],
                        "documentation": {
                            "enabled": True,
                            "root": "knowledge/developer",
                            "research": "allowed",
                        },
                    }
                ),
                encoding="utf-8",
            )
            catalog = root / "knowledge/developer/catalog.yaml"
            catalog.parent.mkdir(parents=True)
            catalog.write_text(
                yaml.safe_dump(
                    {
                        "version": 1,
                        "capabilities": [
                            {
                                "id": "runtime",
                                "title": "Runtime",
                                "reference": "knowledge/developer/reference.md",
                                "sources": ["src/runtime.py"],
                            },
                            {
                                "id": "unsafe",
                                "title": "Unsafe",
                                "reference": "../../outside.md",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            arguments = argparse.Namespace(
                pack=[],
                mode="impacted",
                stage="pre-commit",
                staged=True,
                changed_path=[],
                base_ref=None,
            )
            for changed_path in ("knowledge/developer/catalog.yaml", "src/runtime.py"):
                with self.subTest(path=changed_path), patch(
                    "project_governance_runtime.cli.resolve_change_scope",
                    return_value={
                        "kind": "project-governance-change-packet",
                        "version": 1,
                        "scope": "changed",
                        "mode": "staged",
                        "base_ref": None,
                        "records": [
                            {
                                "status": "modified",
                                "path": changed_path,
                                "previous_path": None,
                                "before": {"kind": "index"},
                                "after": {"kind": "index"},
                                "changed_ranges": [],
                            }
                        ],
                    },
                ):
                    plan, _ = _resolve_plan(arguments, root)
                self.assertEqual(plan["status"], "ready", plan["blockers"])
                self.assertIn("documentation", plan["selected_packs"])

    def test_branch_selection_prefers_the_configured_upstream(self) -> None:
        """Compare established release branches with their upstream before main."""
        with patch.dict("os.environ", {}, clear=True), patch(
            "project_governance_runtime.changed_paths._verified_commit",
            return_value="upstream-commit",
        ) as verified, patch(
            "project_governance_runtime.changed_paths._git", return_value="base-commit\n"
        ) as git:
            self.assertEqual(_base_commit(ROOT), "base-commit")
        verified.assert_called_once_with(ROOT, "@{upstream}")
        git.assert_called_once_with(ROOT, ["merge-base", "HEAD", "upstream-commit"])

    def test_explicit_pack_retains_the_branch_delta_packet(self) -> None:
        """Give a repaired pack the same changed files as the impacted closeout run."""
        arguments = argparse.Namespace(
            pack=["naming"],
            mode="impacted",
            stage=None,
            staged=False,
            changed_path=[],
        )
        with patch(
            "project_governance_runtime.cli.resolve_change_scope",
            return_value={
                "kind": "project-governance-change-packet",
                "version": 1,
                "scope": "changed",
                "mode": "explicit",
                "base_ref": "base",
                "records": [{
                    "status": "added",
                    "path": "src/example.tsx",
                    "previous_path": None,
                    "before": None,
                    "after": {"kind": "worktree", "path": "src/example.tsx"},
                    "changed_ranges": [{"start": 1, "end": 1}],
                }],
            },
        ):
            plan, _ = _resolve_plan(arguments, ROOT / "tests/fixtures/empty-target")
        self.assertEqual(plan["mode"], "explicit")
        self.assertEqual(plan["changed_paths"], ["src/example.tsx"])
        self.assertEqual(
            plan["changed_records"],
            [{"path": "src/example.tsx", "is_new": True}],
        )

    def test_unresolved_comparison_subject_is_one_grouped_plan_blocker(self) -> None:
        """Stop once instead of letting each change-sensitive checker guess a base."""
        arguments = argparse.Namespace(
            pack=[],
            mode="impacted",
            stage="pre-pr",
            staged=False,
            changed_path=[],
            base_ref=None,
        )
        with patch(
            "project_governance_runtime.cli.resolve_change_scope",
            side_effect=ChangedPathError("no upstream merge-base"),
        ):
            plan, _ = _resolve_plan(arguments, ROOT / "tests/fixtures/empty-target")
        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["blockers"], [{
            "code": "comparison-subject-unresolved",
            "mode": "changed",
            "paths": [],
            "message": "no upstream merge-base",
        }])

    def test_target_replacement_is_the_only_impacted_and_all_mode_owner(self) -> None:
        """Run the target once while keeping the named built-in available diagnostically."""
        packs = self.replacement_packs()
        impacted = build_plan(
            packs,
            stage="pre-commit",
            mode="impacted",
            changed_paths=["src/one.py", "src/two.py"],
        )
        exhaustive = build_plan(
            packs,
            stage="pre-commit",
            mode="all",
            changed_paths=[],
        )
        diagnostic = build_plan(
            packs,
            stage=None,
            mode="explicit",
            changed_paths=[],
            explicit_pack_ids=["maintainability"],
        )
        for plan in (impacted, exhaustive):
            self.assertNotIn("maintainability", plan["selected_packs"])
            self.assertEqual(plan["selected_packs"].count("target-maintainability"), 1)
            self.assertEqual(
                plan["omitted_packs"]["maintainability"],
                "replaced by target pack target-maintainability",
            )
        self.assertEqual(diagnostic["selected_packs"], ["maintainability"])

    def test_replacement_coverage_gap_is_grouped_once(self) -> None:
        """Report residual built-in path coverage once rather than once per file."""
        plan = build_plan(
            self.replacement_packs(),
            stage="pre-commit",
            mode="impacted",
            changed_paths=["tests/one.py", "tests/two.py"],
        )
        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["blockers"], [{
            "code": "replacement-coverage-gap",
            "built_in_pack_id": "maintainability",
            "replacement_pack_id": "target-maintainability",
            "paths": ["tests/one.py", "tests/two.py"],
        }])

    def test_replacement_can_own_paths_outside_the_builtin_patterns(self) -> None:
        """Select the target through its own patterns without inheriting built-in globs."""
        plan = build_plan(
            self.replacement_packs(["docs/**"]),
            stage="pre-commit",
            mode="impacted",
            changed_paths=["docs/example.md"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])
        self.assertIn("target-maintainability", plan["selected_packs"])
        self.assertNotIn("maintainability", plan["selected_packs"])

    def test_invalid_replacement_contracts_fail_configuration_once(self) -> None:
        """Reject unsafe ownership transfers before planning begins."""
        base = {
            "implementation_status": "active",
            "enforcement": "blocking",
            "stages": ["pre-commit", "pre-push", "pre-pr", "ci-pr"],
            "path_globs": ["src/**"],
            "depends_on": [],
            "commands": ["true"],
            "change_packet_contract": 1,
        }
        cases = {
            "unknown": [{**base, "id": "target", "replaces_builtin_packs": ["missing"]}],
            "supplemental": [{**base, "id": "target", "replaces_builtin_packs": ["secrets"]}],
            "missing-contract": [{
                **base,
                "id": "target",
                "replaces_builtin_packs": ["maintainability"],
                "change_packet_contract": None,
            }],
            "missing-stage": [{
                **base,
                "id": "target",
                "stages": ["pre-commit"],
                "replaces_builtin_packs": ["maintainability"],
            }],
            "weaker-enforcement": [{
                **base,
                "id": "target",
                "enforcement": "advisory",
                "replaces_builtin_packs": ["maintainability"],
            }],
            "duplicate": [
                {**base, "id": "first", "replaces_builtin_packs": ["maintainability"]},
                {**base, "id": "second", "replaces_builtin_packs": ["maintainability"]},
            ],
        }
        for case, documents in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                pack_root = root / "config/validation/packs"
                pack_root.mkdir(parents=True)
                for index, document in enumerate(documents):
                    (pack_root / f"pack-{index}.yaml").write_text(
                        yaml.safe_dump(document), encoding="utf-8"
                    )
                with self.assertRaises(ConfigurationError):
                    load_packs(root)

    def test_equivalent_and_stronger_replacements_plan_in_impacted_and_all_modes(self) -> None:
        """Allow ownership transfer only when target enforcement preserves or raises strength."""
        cases = {
            "equivalent": ("maintainability", "blocking", ["src/**"], "src/example.py"),
            "stronger": ("prose", "blocking", ["docs/**"], "docs/example.md"),
        }
        for case, (built_in_id, enforcement, path_globs, changed_path) in cases.items():
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                pack_root = root / "config/validation/packs"
                pack_root.mkdir(parents=True)
                target_id = f"target-{built_in_id}"
                document = {
                    "id": target_id,
                    "implementation_status": "active",
                    "enforcement": enforcement,
                    "stages": ["pre-commit", "pre-push", "pre-pr", "ci-pr"],
                    "path_globs": path_globs,
                    "depends_on": [],
                    "commands": ["true"],
                    "change_packet_contract": 1,
                    "replaces_builtin_packs": [built_in_id],
                }
                (pack_root / "replacement.yaml").write_text(
                    yaml.safe_dump(document), encoding="utf-8"
                )
                packs = load_packs(root)

                impacted = build_plan(
                    packs,
                    stage="pre-commit",
                    mode="impacted",
                    changed_paths=[changed_path],
                )
                exhaustive = build_plan(
                    packs,
                    stage="pre-commit",
                    mode="all",
                    changed_paths=[],
                )
                for plan in (impacted, exhaustive):
                    self.assertEqual(plan["status"], "ready", plan["blockers"])
                    self.assertIn(target_id, plan["selected_packs"])
                    self.assertNotIn(built_in_id, plan["selected_packs"])

    def test_public_plan_summarizes_the_internal_change_packet(self) -> None:
        """Keep command output useful without echoing every hunk and temporary locator."""
        plan = build_plan(
            self.packs,
            stage="pre-commit",
            mode="impacted",
            changed_paths=["src/example.py"],
        )
        plan["change_scope"] = {
            "kind": "project-governance-change-packet",
            "version": 1,
            "scope": "changed",
            "mode": "staged",
            "base_ref": "abc123",
            "records": [{"path": "src/example.py", "after": {"kind": "index"}}],
        }
        rendered = public_plan(plan)
        self.assertEqual(rendered["change_scope"]["record_count"], 1)
        self.assertNotIn("records", rendered["change_scope"])


if __name__ == "__main__":
    unittest.main()
