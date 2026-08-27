#!/usr/bin/env python3
"""Prove the lean package retains required selection and dependency behavior."""

from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.configuration import ConfigurationError, load_packs  # noqa: E402
from project_governance_runtime.changed_paths import ChangedPathError, _base_commit  # noqa: E402
from project_governance_runtime.cli import (  # noqa: E402
    _doctor,
    _parser,
    _plan_summary,
    _resolve_plan,
)
from project_governance_runtime.installation import initialize  # noqa: E402
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

    def test_root_version_flag_reports_the_running_package(self) -> None:
        """Let operators identify an installed runtime without selecting a command."""
        output = io.StringIO()
        with (
            patch("project_governance_runtime.cli.__version__", "2.0.1"),
            redirect_stdout(output),
            self.assertRaises(SystemExit) as raised,
        ):
            _parser().parse_args(["--version"])
        self.assertEqual(raised.exception.code, 0)
        self.assertEqual(output.getvalue(), "project-governance 2.0.1\n")

    def test_timeout_is_optional_and_explicit_values_are_positive(self) -> None:
        """Leave duration to the target unless an operator supplies a valid deadline."""
        default = _parser().parse_args(
            ["check", "--pack", "format", "--base-ref", "HEAD"]
        )
        self.assertIsNone(default.timeout_seconds)
        for value in ("0", "-1", "nan", "inf"):
            with self.subTest(value=value), self.assertRaisesRegex(
                ConfigurationError, "finite positive"
            ):
                _resolve_plan(
                    _parser().parse_args(
                        [
                            "check",
                            "--pack",
                            "format",
                            "--base-ref",
                            "HEAD",
                            "--timeout-seconds",
                            value,
                        ]
                    ),
                    ROOT / "tests/fixtures/empty-target",
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
            mode="impacted",
            changed_paths=[],
            explicit_pack_ids=["second"],
        )
        self.assertEqual(plan["execution_order"], ["first", "second"])
        packs["first"]["depends_on"] = ["second"]
        blocked = build_plan(
            packs,
            stage="pre-pr",
            mode="impacted",
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
                "mode": "changed",
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
        self.assertEqual(plan["mode"], "impacted")
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
            mode="impacted",
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

        summary = _plan_summary(rendered)
        self.assertEqual(summary["changed_path_count"], 1)
        self.assertEqual(summary["selected_packs"], rendered["selected_packs"])
        self.assertNotIn("execution_order", summary)
        self.assertNotIn("changed_paths", summary)
        self.assertNotIn("path_matches", summary)
        self.assertNotIn("selection_reasons", summary)

    def test_summary_flags_are_additive(self) -> None:
        """Keep full output as the default while allowing one compact projection."""
        check = _parser().parse_args(["check", "--pack", "format", "--summary"])
        plan = _parser().parse_args(["plan", "--pack", "format", "--summary"])
        telemetry = _parser().parse_args(["telemetry", "status"])
        self.assertTrue(check.summary)
        self.assertTrue(plan.summary)
        self.assertEqual(telemetry.telemetry_command, "status")


class NamedPackScopeTests(unittest.TestCase):
    """Prove named repair packs retain one honest selection subject."""

    def test_named_pack_retains_real_scope_packets(self) -> None:
        """Compose pack selection with staged, changed, explicit, and all Git subjects."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def git(*arguments: str) -> None:
                subprocess.run(
                    ["git", *arguments],
                    cwd=root,
                    check=True,
                    capture_output=True,
                )

            git("init", "-q", "-b", "main")
            git("config", "user.email", "runtime@example.invalid")
            git("config", "user.name", "Runtime Planning Tests")
            source = root / "src/example.py"
            source.parent.mkdir()
            source.write_text("value = 1\n", encoding="utf-8")
            git("add", "src/example.py")
            git("commit", "-qm", "baseline")
            source.write_text("value = 2\n", encoding="utf-8")

            cases = (
                (
                    "changed",
                    ["plan", "--pack", "secrets", "--stage", "pre-push", "--base-ref", "HEAD"],
                    "changed",
                ),
                (
                    "explicit",
                    [
                        "plan", "--pack", "secrets", "--stage", "pre-push",
                        "--changed-path", "src/example.py", "--base-ref", "HEAD",
                    ],
                    "explicit",
                ),
                (
                    "all",
                    ["plan", "--pack", "secrets", "--stage", "release", "--mode", "all"],
                    "all",
                ),
                ("bare-named", ["plan", "--pack", "secrets", "--base-ref", "HEAD"], "changed"),
            )
            for case, command, packet_mode in cases:
                with self.subTest(case=case):
                    arguments = _parser().parse_args(command)
                    plan, _ = _resolve_plan(arguments, root)
                    self.assertEqual(plan["status"], "ready", plan["blockers"])
                    self.assertEqual(plan["selected_packs"], ["secrets"])
                    self.assertEqual(plan["change_scope"]["mode"], packet_mode)
                    if packet_mode != "all":
                        self.assertEqual(
                            [record["path"] for record in plan["change_scope"]["records"]],
                            ["src/example.py"],
                        )

            git("add", "src/example.py")
            staged_arguments = _parser().parse_args(
                [
                    "plan", "--pack", "secrets", "--stage", "pre-commit",
                    "--mode", "impacted", "--staged",
                ]
            )
            staged_plan, _ = _resolve_plan(staged_arguments, root)
            self.assertEqual(staged_plan["status"], "ready", staged_plan["blockers"])
            self.assertEqual(staged_plan["selected_packs"], ["secrets"])
            self.assertEqual(staged_plan["change_scope"]["mode"], "staged")
            self.assertEqual(
                [record["path"] for record in staged_plan["change_scope"]["records"]],
                ["src/example.py"],
            )

    def test_scope_validation_rejects_ambiguous_stage_combinations(self) -> None:
        """Reject stage-less impacted and staged non-pre-commit subjects plainly."""
        cases = (
            ["plan", "--changed-path", "src/example.py", "--base-ref", "HEAD"],
            ["plan", "--pack", "secrets", "--staged"],
            ["plan", "--pack", "secrets", "--stage", "pre-push", "--staged"],
        )
        for arguments in cases:
            with self.subTest(arguments=arguments), self.assertRaises(ConfigurationError):
                _resolve_plan(
                    _parser().parse_args(arguments),
                    ROOT / "tests/fixtures/empty-target",
                )

    def test_all_mode_rejects_changed_subject_inputs(self) -> None:
        """Keep all scope distinct from staged, explicit-path, and base comparisons."""
        cases = (
            ["--stage", "pre-commit", "--staged"],
            ["--stage", "release", "--changed-path", "src/example.py"],
            ["--stage", "release", "--base-ref", "HEAD"],
        )
        for options in cases:
            with self.subTest(options=options), self.assertRaises(ConfigurationError):
                _resolve_plan(
                    _parser().parse_args(
                        ["plan", "--pack", "secrets", "--mode", "all", *options]
                    ),
                    ROOT / "tests/fixtures/empty-target",
                )


class PackStageCoverageTests(unittest.TestCase):
    """Prove stage claims cannot turn into false-green pack results."""

    @staticmethod
    def lifecycle_pack(command_stages: list[str] | None) -> dict[str, dict[str, object]]:
        """Build one pack whose command either spans or narrows its declared lifecycle."""
        command: dict[str, object] = {"run": "true"}
        if command_stages is not None:
            command["stages"] = command_stages
        return {
            "target": {
                "id": "target",
                "implementation_status": "active",
                "stages": ["pre-commit", "pre-push"],
                "path_globs": ["src/**"],
                "commands": [command],
                "enforcement": "blocking",
                "depends_on": [],
            }
        }

    def test_declared_stage_without_an_applicable_command_blocks_planning(self) -> None:
        """Reject a lifecycle claim that would otherwise pass without running a command."""
        plan = build_plan(
            self.lifecycle_pack(["pre-commit"]),
            stage="pre-push",
            mode="impacted",
            changed_paths=["src/example.py"],
        )
        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["execution_order"], [])
        self.assertEqual(plan["blockers"], [
            {
                "code": "pack-stage-without-command",
                "pack_id": "target",
                "uncovered_stages": ["pre-push"],
            }
        ])

    def test_advisory_stage_gap_remains_nonblocking(self) -> None:
        """Preserve an advisory pack's configured enforcement posture."""
        packs = self.lifecycle_pack(["pre-commit"])
        packs["target"]["enforcement"] = "advisory"
        plan = build_plan(
            packs,
            stage="pre-push",
            mode="impacted",
            changed_paths=["src/example.py"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])

    def test_unstaged_command_covers_every_declared_stage(self) -> None:
        """Treat an unfiltered command as runnable throughout its pack lifecycle."""
        plan = build_plan(
            self.lifecycle_pack(None),
            stage="pre-push",
            mode="impacted",
            changed_paths=["src/example.py"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])

    def test_named_diagnostic_has_no_stage_coverage_false_positive(self) -> None:
        """Keep direct pack repair runnable because explicit execution has no stage filter."""
        plan = build_plan(
            self.lifecycle_pack(["pre-commit"]),
            stage=None,
            mode="impacted",
            changed_paths=[],
            explicit_pack_ids=["target"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])

    def test_stage_less_impacted_selection_does_not_cross_lifecycle_boundaries(self) -> None:
        """Require a stage unless explicit pack selection makes the diagnostic bounded."""
        plan = build_plan(
            self.lifecycle_pack(["pre-commit"]),
            stage=None,
            mode="impacted",
            changed_paths=["src/example.py"],
        )
        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["selected_packs"], [])
        self.assertEqual(plan["blockers"][0]["code"], "unknown-impact")

    def test_named_pack_preserves_requested_stage(self) -> None:
        """Keep named-pack selection independent from lifecycle command filtering."""
        plan = build_plan(
            self.lifecycle_pack(["pre-commit", "pre-push"]),
            stage="pre-push",
            mode="impacted",
            changed_paths=["src/example.py"],
            explicit_pack_ids=["target"],
        )
        self.assertEqual(plan["status"], "ready", plan["blockers"])
        self.assertEqual(plan["stage"], "pre-push")
        self.assertEqual(plan["mode"], "impacted")
        self.assertEqual(plan["selected_packs"], ["target"])
        self.assertEqual(plan["selection_reasons"], {"target": ["explicit"]})

    def test_named_pack_must_be_available_at_requested_stage(self) -> None:
        """Reject a named pack whose declared lifecycle excludes the requested stage."""
        plan = build_plan(
            self.lifecycle_pack(["pre-commit"]),
            stage="ci-pr",
            mode="impacted",
            changed_paths=["src/example.py"],
            explicit_pack_ids=["target"],
        )
        self.assertEqual(plan["status"], "blocked")
        self.assertEqual(plan["selected_packs"], [])
        self.assertEqual(plan["blockers"][0]["code"], "explicit-pack-unavailable")

    def test_doctor_reports_stage_command_coverage(self) -> None:
        """Expose the configuration defect before an operator starts a check."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack_root = root / "config/validation/packs"
            pack_root.mkdir(parents=True)
            (pack_root / "target.yaml").write_text(
                yaml.safe_dump(self.lifecycle_pack(["pre-commit"])["target"]),
                encoding="utf-8",
            )
            result = _doctor(root)
        self.assertIn(
            "pack target has no command for declared stage(s): pre-push",
            result["findings"],
        )

    def test_doctor_reports_invalid_pack_yaml_without_a_traceback(self) -> None:
        """Keep doctor useful when the target manifest itself cannot be parsed."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack_root = root / "config/validation/packs"
            pack_root.mkdir(parents=True)
            (pack_root / "invalid.yaml").write_text("id: [\n", encoding="utf-8")
            result = _doctor(root)
        self.assertTrue(any("invalid YAML" in finding for finding in result["findings"]))

    def test_doctor_treats_the_runtime_source_checkout_as_source_mode(self) -> None:
        """Do not require an adopter lock or facts file from runtime source development."""
        result = _doctor(ROOT)
        self.assertEqual(result["mode"], "source")
        self.assertIsNone(result["lock_version"])
        self.assertIsNone(result["runtime_lock_match"])
        self.assertFalse(
            any("runtime.lock.yaml is missing" in finding for finding in result["findings"])
        )
        self.assertFalse(
            any("facts.lock.yaml is missing" in finding for finding in result["findings"])
        )

    def test_installed_doctor_reports_matching_and_mismatched_runtime_versions(self) -> None:
        """Make the installed wheel and tracked lock relationship directly observable."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initialize(root)
            lock_path = root / "config/governance/runtime.lock.yaml"
            lock = {
                "schema_version": 1,
                "package": "project-governance-runtime",
                "version": "2.0.1",
                "wheel": "project_governance_runtime-2.0.1-py3-none-any.whl",
                "sha256": "0" * 64,
                "source_commit": "a" * 40,
                "python": ">=3.9,<4",
                "configuration_schema": 2,
                "release_base_url": "https://example.invalid/releases/download",
            }
            lock_path.write_text(json.dumps(lock), encoding="utf-8")
            with patch("project_governance_runtime.cli.__version__", "2.0.1"):
                matched = _doctor(root)
            self.assertEqual(matched["status"], "passed", matched["findings"])
            self.assertEqual(matched["runtime_version"], "2.0.1")
            self.assertEqual(matched["lock_version"], "2.0.1")
            self.assertIs(matched["runtime_lock_match"], True)

            lock["version"] = "2.0.0"
            lock_path.write_text(json.dumps(lock), encoding="utf-8")
            with patch("project_governance_runtime.cli.__version__", "2.0.1"):
                mismatched = _doctor(root)
            self.assertEqual(mismatched["status"], "failed")
            self.assertIs(mismatched["runtime_lock_match"], False)
            self.assertIn(
                "installed runtime version 2.0.1 does not match lock version 2.0.0",
                mismatched["findings"],
            )


if __name__ == "__main__":
    unittest.main()
