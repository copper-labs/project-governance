#!/usr/bin/env python3
"""Prove the packaged context command preserves small, safe local packets."""

from __future__ import annotations

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.cli import main  # noqa: E402
from project_governance_runtime.context import resolve_context  # noqa: E402
from project_governance_runtime.installation import materialize_skills  # noqa: E402


def write_repository(root: Path, profile: dict[str, object]) -> None:
    """Create the direct child-owned configuration required by the lean resolver."""
    config = root / "config/governance"
    config.mkdir(parents=True)
    (config / "profile.yaml").write_text(yaml.safe_dump(profile), encoding="utf-8")
    (config / "facts.lock.yaml").write_text(
        yaml.safe_dump({"profile_id": "sample"}), encoding="utf-8"
    )


def routing_profile(*, context: list[str]) -> dict[str, object]:
    """Return a small target-owned route fixture with one materialized skill."""
    return {
        "profile_id": "sample",
        "context_router": {
            "default_context": context,
            "default_skills": ["work"],
            "routes": [
                {
                    "id": "governance",
                    "aliases": ["rules"],
                    "match": {"prompt_terms": ["governance"], "path_globs": ["docs/governance/**"]},
                    "primary_context": ["docs/governance/guide.md"],
                    "token_budget": {
                        "primary_context_tokens": 20,
                        "active_plan_context_tokens": 20,
                        "expansion_context_tokens": 20,
                        "total_context_tokens": 40,
                    },
                },
                {
                    "id": "application",
                    "match": {"prompt_terms": ["application"]},
                    "primary_context": ["docs/application.md"],
                },
            ],
        },
    }


class RuntimeContextTests(unittest.TestCase):
    """Keep context selection and materialization bounded by direct child configuration."""

    def test_route_selection_discovers_skills_and_materializes_exact_files(self) -> None:
        """Select the strongest declared route and publish only its bounded local bytes."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "AGENTS.md").write_text("Agent contract\n", encoding="utf-8")
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            skill = root / ".governance/runtime/skills/work/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text("Work skill\n", encoding="utf-8")
            write_repository(root, routing_profile(context=["AGENTS.md"]))

            result = resolve_context(root, "Review the governance rules", ["docs/governance/guide.md"])

            self.assertEqual(result["status"], "passed")
            self.assertEqual(result["route"]["id"], "governance")
            self.assertEqual([skill["id"] for skill in result["skills"]], ["work"])
            items = result["materialization"]["items"]
            self.assertEqual([item["source_path"] for item in items], ["AGENTS.md", "docs/governance/guide.md"])
            for item in items:
                materialized = root / result["materialization"]["root"] / item["materialized_path"]
                self.assertTrue(materialized.is_file())
                self.assertEqual(materialized.read_bytes(), (root / item["source_path"]).read_bytes())

    def test_route_selection_resolves_a_manifest_owned_nested_skill_by_id(self) -> None:
        """Use the catalog path for nested skills instead of assuming a top-level directory."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            materialize_skills(root)
            profile = routing_profile(context=[])
            profile["context_router"]["default_skills"] = []
            profile["context_router"]["routes"][0]["skills"] = ["kotlin-testing-kmp"]
            write_repository(root, profile)

            result = resolve_context(root, "Review governance", [])

            self.assertEqual(result["status"], "passed")
            self.assertEqual([skill["id"] for skill in result["skills"]], ["kotlin-testing-kmp"])
            self.assertEqual(
                result["skills"][0]["path"],
                ".governance/runtime/skills/stack-packs/kmp/upstream/kotlin-testing-kmp/SKILL.md",
            )

    def test_materialization_refuses_a_symlinked_context_source(self) -> None:
        """Treat an escaping link as unavailable instead of copying external content."""
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory) / "outside.md"
            outside.write_text("do not read\n", encoding="utf-8")
            (root / "link.md").symlink_to(outside)
            write_repository(root, routing_profile(context=["link.md"]))

            result = resolve_context(root, "Review governance", [])

            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["omissions"][0]["reason"], "source-unavailable")
            self.assertEqual(result["materialization"]["items"], [])
            self.assertFalse(any((root / ".governance/runtime/context").rglob("*.md")))

    def test_context_cli_exposes_the_minimal_json_surface(self) -> None:
        """Keep the public command usable without a generated resolver copy."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "AGENTS.md").write_text("Agent contract\n", encoding="utf-8")
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            skill = root / ".governance/runtime/skills/work/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text("Work skill\n", encoding="utf-8")
            write_repository(root, routing_profile(context=["AGENTS.md"]))
            output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys, "argv", ["project-governance", "context", "--task", "governance", "--json"]
            ), contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            self.assertIn('"route": {', output.getvalue())
            self.assertIn('"id": "governance"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
