#!/usr/bin/env python3
"""Exercise the stack-neutral exact-match skill selector."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.skill_selection import select_attached_skills  # noqa: E402


def record(skill_id: str, **values: object) -> dict[str, object]:
    """Build one compact selector record."""
    return {
        "id": skill_id,
        "pack_id": "example-pack",
        "activation_mode": "governed",
        "default_level": "recommended",
        "applicability": {},
        "conflicts": [],
        **values,
    }


class RuntimeSkillSelectionTests(unittest.TestCase):
    """Keep selection shallow, deterministic, restrained, and provider-neutral."""

    def setUp(self) -> None:
        self.index = {
            "router": {"id": "router", "router_for": ["example-pack"], "pack_id": None},
            "source-sets": record(
                "source-sets",
                applicability={
                    "require_facts": {"ecosystems": ["kmp"]},
                    "task_terms": ["source set"],
                    "path_globs": ["shared/src/*Main/**"],
                },
            ),
            "bridge-events": record(
                "bridge-events",
                activation_mode="evaluation-only",
                applicability={
                    "require_facts": {
                        "ecosystems": ["kmp"],
                        "boundary_pressure": ["event-delivery"],
                    },
                    "task_terms": ["event delivery"],
                    "fact_terms": {"boundary_pressure": ["event-delivery"]},
                    "exclude_facts": {"support_tiers": ["unsupported"]},
                },
            ),
        }

    def test_exact_task_path_and_fact_overlap_select_in_declaration_order(self) -> None:
        """Select only triggered records and retain stable reasons."""
        result = select_attached_skills(
            self.index,
            ["router"],
            "Change the source set and event stream",
            ["shared/src/commonMain/Domain.kt"],
            {"ecosystems": ["kmp"], "boundary_pressure": ["event-delivery"]},
            include_evaluation=True,
        )
        self.assertEqual(
            [item["id"] for item in result["selected"]],
            ["source-sets", "bridge-events"],
        )
        self.assertIn("task:source set", result["selected"][0]["selection_reasons"])
        self.assertIn(
            "fact:boundary_pressure=event-delivery",
            result["selected"][1]["selection_reasons"],
        )

    def test_evaluation_only_is_excluded_from_ordinary_selection(self) -> None:
        """Keep candidate entries out of normal routing while exposing the reason."""
        result = select_attached_skills(
            self.index,
            ["router"],
            "Repair event delivery",
            [],
            {"ecosystems": ["kmp"], "boundary_pressure": ["event-delivery"]},
        )
        self.assertEqual(result["selected"], [])
        self.assertIn(
            {"id": "bridge-events", "reason": "activation-mode:evaluation-only"},
            result["exclusions"],
        )

    def test_missing_and_excluded_facts_are_explicit_without_inference(self) -> None:
        """Distinguish absent required facts from declared target exclusions."""
        missing = select_attached_skills(
            self.index,
            ["router"],
            "Repair event delivery",
            [],
            {"ecosystems": ["kmp"]},
            include_evaluation=True,
        )
        self.assertEqual(missing["unresolved_facts"], ["boundary_pressure"])
        excluded = select_attached_skills(
            self.index,
            ["router"],
            "Repair event delivery",
            [],
            {
                "ecosystems": ["kmp"],
                "boundary_pressure": ["event-delivery"],
                "support_tiers": ["unsupported"],
            },
            include_evaluation=True,
        )
        self.assertIn(
            {"id": "bridge-events", "reason": "excluded-fact:support_tiers=unsupported"},
            excluded["exclusions"],
        )

    def test_conflicting_selected_ids_are_reported(self) -> None:
        """Expose declared conflicts instead of silently choosing an owner."""
        self.index["source-sets"]["conflicts"] = ["other"]
        self.index["other"] = record(
            "other",
            applicability={
                "require_facts": {"ecosystems": ["kmp"]},
                "task_terms": ["source set"],
            },
        )
        result = select_attached_skills(
            self.index, ["router"], "Change the source set", [], {"ecosystems": ["kmp"]}
        )
        self.assertEqual(result["conflicts"], ["source-sets:other"])


if __name__ == "__main__":
    unittest.main()
