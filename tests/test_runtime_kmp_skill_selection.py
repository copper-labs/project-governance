#!/usr/bin/env python3
"""Prove the governed KMP V0 pack selects and materializes by behavior."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ROOT / "tests/fixtures/kmp-skills/selection-scenarios.yaml"
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.context import resolve_context  # noqa: E402
from project_governance_runtime.installation import materialize_skills  # noqa: E402


def kmp_profile(*, total_tokens: int = 10_000, default_skills: list[str] | None = None) -> dict[str, object]:
    """Return one matched route that explicitly opts into the stable KMP router."""
    return {
        "profile_id": "kmp-sample",
        "context_router": {
            "default_context": ["AGENTS.md"],
            "default_skills": default_skills or [],
            "routes": [
                {
                    "id": "kmp",
                    "match": {
                        "prompt_terms": [
                            "shared",
                            "upgrade",
                            "coroutine",
                            "framework",
                            "Wear OS",
                            "commonMain",
                        ]
                    },
                    "skills": ["kmp-implementation"],
                    "token_budget": {
                        "primary_context_tokens": total_tokens,
                        "active_plan_context_tokens": total_tokens,
                        "expansion_context_tokens": total_tokens,
                        "total_context_tokens": total_tokens,
                    },
                }
            ],
        },
    }


def write_target(
    root: Path, profile: dict[str, object], facts: dict[str, object] | None
) -> None:
    """Materialize package skills and direct target-owned KMP selection inputs."""
    (root / "AGENTS.md").write_text("Target rules\n", encoding="utf-8")
    config = root / "config/governance"
    config.mkdir(parents=True)
    (config / "profile.yaml").write_text(yaml.safe_dump(profile), encoding="utf-8")
    fact_values = {} if facts is None else {"skill_context": facts}
    (config / "facts.lock.yaml").write_text(
        yaml.safe_dump(
            {"schema_version": 1, "profile_id": "kmp-sample", "facts": fact_values}
        ),
        encoding="utf-8",
    )
    materialize_skills(root)


class RuntimeKmpSkillSelectionTests(unittest.TestCase):
    """Keep KMP routing proactive, restrained, exact, and deterministic."""

    def test_frozen_scenarios_select_the_expected_minimal_governed_packets(self) -> None:
        """Exercise four general decisions and one conditional wearable topology."""
        fixture = yaml.safe_load(SCENARIOS.read_text(encoding="utf-8"))
        for scenario in fixture["scenarios"]:
            with self.subTest(scenario=scenario["id"]), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                write_target(root, kmp_profile(), scenario["facts"])

                result = resolve_context(
                    root,
                    scenario["task"],
                    scenario["changed_paths"],
                )

                expected = ["kmp-implementation", *scenario["expectations"]["automatic"]]
                self.assertEqual(result["status"], "passed", result["blockers"])
                self.assertEqual([skill["id"] for skill in result["skills"]], expected)
                self.assertEqual(result["materialization"]["byte_limits"]["skill"], 16_000)
                self.assertEqual(result["materialization"]["byte_limits"]["combined"], 56_000)
                for skill in result["skills"]:
                    packet = root / result["materialization"]["root"] / skill["materialized_path"]
                    installed = root / skill["path"]
                    self.assertEqual(packet.read_bytes(), installed.read_bytes())

    def test_ordinary_selection_activates_the_governed_router(self) -> None:
        """Make the promoted KMP core available to normal coordination."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            facts = {
                "ecosystems": ["kmp"],
                "target_families": ["android"],
                "support_tiers": ["primary"],
            }
            write_target(root, kmp_profile(), facts)

            result = resolve_context(root, "Upgrade the shared module", [])

            self.assertEqual(result["status"], "passed", result["blockers"])
            self.assertEqual(
                [skill["id"] for skill in result["skills"]],
                ["kmp-implementation", "kmp-build-and-compatibility"],
            )
            router = root / result["materialization"]["root"] / result["skills"][0][
                "materialized_path"
            ]
            self.assertIn(
                "project-governance plan --pack kmp-surface-validation --json",
                router.read_text(encoding="utf-8"),
            )

    def test_proof_task_selects_target_local_surface_guidance(self) -> None:
        """Keep proof-specific graph obligations in the evidence leaf, not the router alone."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(
                root,
                kmp_profile(),
                {
                    "ecosystems": ["kmp"],
                    "target_families": ["web", "apple"],
                    "boundary_pressure": ["test-parity"],
                },
            )

            result = resolve_context(root, "Add shared target proof for KMP surface parity", [])

            self.assertEqual(
                [skill["id"] for skill in result["skills"]],
                ["kmp-implementation", "kmp-test-and-evidence"],
            )
            leaf = root / result["materialization"]["root"] / result["skills"][1][
                "materialized_path"
            ]
            self.assertIn("required_target_proof_claims", leaf.read_text(encoding="utf-8"))

    def test_absent_kmp_facts_and_default_router_never_compose_leaves(self) -> None:
        """Require route-local enablement and explicit KMP facts without Android inference."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(root, kmp_profile(), None)

            result = resolve_context(root, "Upgrade the shared module", [])

            self.assertEqual(result["status"], "passed")
            self.assertEqual([skill["id"] for skill in result["skills"]], ["kmp-implementation"])
            self.assertEqual(result["skill_selection"]["unresolved_facts"], [])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = kmp_profile(default_skills=["kmp-implementation"])
            profile["context_router"]["routes"][0]["skills"] = []
            write_target(
                root,
                profile,
                {
                    "ecosystems": ["kmp"],
                    "target_families": ["android"],
                    "boundary_pressure": ["toolchain-compatibility"],
                },
            )

            default_only = resolve_context(root, "Upgrade the shared module", [])

            self.assertEqual(
                [skill["id"] for skill in default_only["skills"]], ["kmp-implementation"]
            )

    def test_triggered_leaf_with_missing_required_fact_blocks_without_inference(self) -> None:
        """Expose a missing concurrency fact only when the task actually triggers that leaf."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(
                root,
                kmp_profile(),
                {
                    "ecosystems": ["kmp"],
                    "target_families": ["android", "apple"],
                },
            )

            result = resolve_context(root, "Change the coroutine event stream", [])

            self.assertIn("boundary_pressure", result["skill_selection"]["unresolved_facts"])
            self.assertIn("skill-unresolved-fact:boundary_pressure", result["blockers"])

    def test_ambiguous_route_keeps_router_only_and_does_not_compose(self) -> None:
        """Never attach leaves when route evidence cannot choose one target-owned route."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = kmp_profile()
            profile["context_router"]["routes"] = [
                {
                    "id": "a-kmp",
                    "match": {"prompt_terms": ["upgrade"]},
                    "skills": ["kmp-implementation"],
                },
                {"id": "b-other", "match": {"prompt_terms": ["upgrade"]}},
            ]
            write_target(
                root,
                profile,
                {
                    "ecosystems": ["kmp"],
                    "target_families": ["android"],
                    "boundary_pressure": ["toolchain-compatibility"],
                },
            )

            result = resolve_context(root, "Upgrade dependencies", [])

            self.assertEqual(result["route"]["outcome"], "ambiguous")
            self.assertEqual([skill["id"] for skill in result["skills"]], ["kmp-implementation"])
            self.assertIn("route-ambiguous", result["blockers"])

    def test_stale_materialization_and_required_skill_budget_are_explicit(self) -> None:
        """Fail closed on wheel drift and a router that cannot fit the computed cap."""
        facts = {
            "ecosystems": ["kmp"],
            "target_families": ["android"],
            "support_tiers": ["primary"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(root, kmp_profile(), facts)
            router = root / ".governance/runtime/skills/kmp-implementation/SKILL.md"
            router.write_text(router.read_text(encoding="utf-8") + "\nstale\n", encoding="utf-8")

            stale = resolve_context(root, "Upgrade the shared module", [])

            self.assertIn(
                "skill-stale-materialization:kmp-implementation", stale["blockers"]
            )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(root, kmp_profile(total_tokens=100), facts)

            bounded = resolve_context(root, "Upgrade the shared module", [])

            self.assertIn(
                "skill-outside-byte-budget:kmp-implementation", bounded["blockers"]
            )
            self.assertEqual(bounded["materialization"]["byte_limits"]["skill"], 200)

    def test_packet_identity_uses_selected_bytes_not_diagnostic_reasons(self) -> None:
        """Keep the packet stable when the same skill set matches through more task terms."""
        facts = {
            "ecosystems": ["kmp"],
            "target_families": ["android", "apple"],
            "support_tiers": ["primary"],
            "boundary_pressure": ["platform-api"],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_target(root, kmp_profile(), facts)

            first = resolve_context(root, "Move code to commonMain", [])
            second = resolve_context(root, "Move a source set to commonMain", [])

            self.assertNotEqual(
                first["skills"][1]["selection_reasons"],
                second["skills"][1]["selection_reasons"],
            )
            self.assertEqual(
                first["materialization"]["root"], second["materialization"]["root"]
            )


if __name__ == "__main__":
    unittest.main()
