#!/usr/bin/env python3
"""Validate immutable KMP baseline and behavior-first scenario fixtures."""

from __future__ import annotations

import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/kmp-skills"
ALLOWED_DISPOSITIONS = {"retain-in-v0", "defer", "reject"}


def load_mapping(path: Path) -> dict[str, object]:
    """Load one versioned fixture mapping."""
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"{path}: expected a mapping")
    return value


class KmpSkillFixtureTests(unittest.TestCase):
    """Keep the pre-change identity and selection rubric complete and reusable."""

    def test_legacy_snapshot_has_unique_complete_historical_identities(self) -> None:
        """Freeze the router, 24 leaves, and eight supplied candidates without live ownership."""
        snapshot = load_mapping(FIXTURES / "legacy-2026-08-24.yaml")
        self.assertIs(snapshot.get("historical"), True)
        shipping = snapshot.get("shipping_payload")
        self.assertIsInstance(shipping, list)
        self.assertEqual(len(shipping), 25)
        supplied = snapshot.get("supplied_candidates")
        self.assertIsInstance(supplied, dict)
        candidates = supplied.get("entries")
        self.assertIsInstance(candidates, list)
        self.assertEqual(len(candidates), 8)
        self.assertIs(supplied.get("package_bytes_copied"), False)

        entries = [*shipping, *candidates]
        identifiers = [entry.get("id") for entry in entries]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        for entry in entries:
            self.assertRegex(str(entry.get("sha256")), r"^[0-9a-f]{64}$")
            self.assertGreater(int(entry.get("bytes", 0)), 0)
            self.assertIn(entry.get("disposition"), ALLOWED_DISPOSITIONS)
        self.assertEqual(sum(entry.get("kind") == "router" for entry in shipping), 1)
        self.assertEqual(sum(entry.get("kind") == "leaf" for entry in shipping), 24)

    def test_selection_scenarios_cover_modes_expectations_and_capabilities(self) -> None:
        """Reject incomplete rubrics, duplicate IDs, and unreferenced V0 capabilities."""
        fixture = load_mapping(FIXTURES / "selection-scenarios.yaml")
        comparisons = set(fixture.get("required_comparisons", []))
        self.assertEqual(comparisons, {"no-skill", "forced", "automatic"})
        expectations = set(fixture.get("required_expectations", []))
        capabilities = set(fixture.get("capabilities", []))
        scenarios = fixture.get("scenarios")
        self.assertIsInstance(scenarios, list)
        self.assertEqual(len(scenarios), 5)
        identifiers = [scenario.get("id") for scenario in scenarios]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        covered: set[str] = set()
        for scenario in scenarios:
            self.assertIsInstance(scenario.get("task"), str)
            self.assertTrue(scenario.get("changed_paths"))
            self.assertTrue(scenario.get("facts"))
            actual = scenario.get("expectations")
            self.assertIsInstance(actual, dict)
            self.assertEqual(set(actual), expectations)
            covered.update(actual["automatic"])
        self.assertEqual(covered & capabilities, capabilities)
        wearable = [item for item in scenarios if item.get("kind") == "wearable-conditional"]
        self.assertEqual(len(wearable), 1)
        pressure = set(wearable[0]["facts"]["boundary_pressure"])
        self.assertTrue({"authority", "event-delivery", "lifecycle", "power"}.issubset(pressure))


if __name__ == "__main__":
    unittest.main()
