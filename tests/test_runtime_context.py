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
from project_governance_runtime.context import (  # noqa: E402
    ContextError,
    MAX_CONTEXT_PACKET_BYTES,
    MAX_CONTEXT_PACKETS,
    MAX_CONTEXT_TOKENS,
    MAX_SKILL_BYTES,
    resolve_context,
)
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
                        "primary_context_tokens": 100,
                        "active_plan_context_tokens": 100,
                        "expansion_context_tokens": 100,
                        "total_context_tokens": 10000,
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
            materialize_skills(root)
            write_repository(root, routing_profile(context=["AGENTS.md"]))

            result = resolve_context(root, "Review the governance rules", ["docs/governance/guide.md"])

            self.assertEqual(result["status"], "passed")
            self.assertEqual(result["route"]["id"], "governance")
            self.assertEqual([skill["id"] for skill in result["skills"]], ["work"])
            materialized_skill = (
                root
                / result["materialization"]["root"]
                / result["skills"][0]["materialized_path"]
            )
            self.assertEqual(
                materialized_skill.read_bytes(),
                (root / result["skills"][0]["path"]).read_bytes(),
            )
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
            profile["context_router"]["routes"][0]["skills"] = [
                "kmp-coroutines-and-concurrency"
            ]
            profile["context_router"]["routes"][0]["token_budget"] = {
                "primary_context_tokens": 100,
                "active_plan_context_tokens": 100,
                "expansion_context_tokens": 100,
                "total_context_tokens": 10000,
            }
            write_repository(root, profile)

            result = resolve_context(root, "Review governance", [])

            self.assertEqual(result["status"], "passed")
            self.assertEqual(
                [skill["id"] for skill in result["skills"]],
                ["kmp-coroutines-and-concurrency"],
            )
            self.assertEqual(
                result["skills"][0]["path"],
                ".governance/runtime/skills/stack-packs/kmp/core/kmp-coroutines-and-concurrency/SKILL.md",
            )

    def test_materialization_refuses_a_symlinked_context_source(self) -> None:
        """Treat an escaping link as unavailable instead of copying external content."""
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside_directory:
            root = Path(directory)
            outside = Path(outside_directory) / "outside.md"
            outside.write_text("do not read\n", encoding="utf-8")
            (root / "link.md").symlink_to(outside)
            profile = routing_profile(context=["link.md"])
            profile["context_router"]["default_skills"] = []
            write_repository(root, profile)

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
            materialize_skills(root)
            write_repository(root, routing_profile(context=["AGENTS.md"]))
            output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys, "argv", ["project-governance", "context", "--task", "governance", "--json"]
            ), contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            self.assertIn('"route": {', output.getvalue())
            self.assertIn('"id": "governance"', output.getvalue())

    def test_context_materializations_keep_only_eight_recent_packets(self) -> None:
        """Prevent ordinary context selection from growing ignored state indefinitely."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            materialize_skills(root)
            write_repository(root, routing_profile(context=[]))
            latest = None
            for index in range(MAX_CONTEXT_PACKETS + 4):
                guide.write_text(f"Governance guide {index}\n", encoding="utf-8")
                latest = resolve_context(root, "Review governance", [])

            packets = list((root / ".governance/runtime/context").glob("context-*"))
            self.assertEqual(len(packets), MAX_CONTEXT_PACKETS)
            self.assertIsNotNone(latest)
            self.assertTrue((root / latest["materialization"]["root"]).is_dir())

    def test_context_rejects_a_configured_packet_above_the_runtime_ceiling(self) -> None:
        """Fail explicitly instead of materializing arbitrarily large target budgets."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            profile = routing_profile(context=[])
            profile["context_router"]["routes"][0]["token_budget"][
                "total_context_tokens"
            ] = MAX_CONTEXT_TOKENS + 1
            write_repository(root, profile)

            with self.assertRaisesRegex(ContextError, "packet ceiling"):
                resolve_context(root, "Review governance", [])

    def test_context_packet_limits_include_skill_bytes(self) -> None:
        """Keep the published combined ceiling within one runtime-owned disk bound."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            materialize_skills(root)
            write_repository(root, routing_profile(context=[]))

            result = resolve_context(root, "Review governance", [])

            self.assertLessEqual(
                result["materialization"]["byte_limits"]["combined"],
                MAX_CONTEXT_PACKET_BYTES,
            )

    def test_context_removes_abandoned_staging_without_following_symlinks(self) -> None:
        """Clean runtime-owned crash debris while preserving anything outside the cache root."""
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            materialize_skills(root)
            write_repository(root, routing_profile(context=[]))
            runtime_root = root / ".governance/runtime/context"
            abandoned = runtime_root / ".context-abandoned"
            abandoned.mkdir(parents=True)
            (abandoned / "partial.md").write_text("partial\n", encoding="utf-8")
            outside_file = Path(outside) / "preserve.md"
            outside_file.write_text("preserve\n", encoding="utf-8")
            linked = runtime_root / ".context-linked"
            linked.symlink_to(Path(outside), target_is_directory=True)

            resolve_context(root, "Review governance", [])

            self.assertFalse(abandoned.exists())
            self.assertTrue(linked.is_symlink())
            self.assertEqual(outside_file.read_text(encoding="utf-8"), "preserve\n")

    def test_context_rejects_an_oversized_source_without_an_unbounded_read(self) -> None:
        """Use the remaining packet budget as the source read ceiling."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("outside the four-byte budget\n", encoding="utf-8")
            profile = routing_profile(context=[])
            profile["context_router"]["default_skills"] = []
            profile["context_router"]["routes"][0]["token_budget"] = {
                "primary_context_tokens": 1,
                "active_plan_context_tokens": 1,
                "expansion_context_tokens": 1,
                "total_context_tokens": 1,
            }
            write_repository(root, profile)

            with patch.object(Path, "read_bytes", side_effect=AssertionError("unbounded read")):
                result = resolve_context(root, "Review governance", [])

            self.assertEqual(result["status"], "blocked")
            self.assertEqual(result["omissions"][0]["reason"], "outside-byte-budget")

    def test_context_rebuilds_a_corrupted_runtime_owned_packet(self) -> None:
        """Recover ignored cache state instead of preserving a permanent poison packet."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            materialize_skills(root)
            write_repository(root, routing_profile(context=[]))
            first = resolve_context(root, "Review governance", [])
            packet = root / first["materialization"]["root"]
            selected = packet / first["skills"][0]["materialized_path"]
            selected.write_text("corrupted\n", encoding="utf-8")

            second = resolve_context(root, "Review governance", [])

            rebuilt = root / second["materialization"]["root"] / second["skills"][0]["materialized_path"]
            self.assertEqual(second["status"], "passed")
            self.assertEqual(rebuilt.read_bytes(), (root / second["skills"][0]["path"]).read_bytes())

    def test_target_declared_skill_reads_stop_at_the_skill_budget(self) -> None:
        """Block a large unindexed skill without loading it beyond the runtime ceiling."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            guide = root / "docs/governance/guide.md"
            guide.parent.mkdir(parents=True)
            guide.write_text("Governance guide\n", encoding="utf-8")
            skill = root / ".governance/runtime/skills/custom/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_bytes(b"x" * (MAX_SKILL_BYTES + 1))
            profile = routing_profile(context=[])
            profile["context_router"]["default_skills"] = ["custom"]
            write_repository(root, profile)

            result = resolve_context(root, "Review governance", [])

            self.assertEqual(result["status"], "blocked")
            self.assertEqual(
                result["blockers"], ["skill-outside-byte-budget:custom"]
            )


if __name__ == "__main__":
    unittest.main()
