#!/usr/bin/env python3
"""Prove skill utilization receipts are exact, bounded, redacted, and provider-neutral."""

from __future__ import annotations

import contextlib
import io
import json
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
from project_governance_runtime.skill_utilization import (  # noqa: E402
    SkillUtilizationError,
    begin,
    finish,
)
from project_governance_runtime.telemetry import append, status  # noqa: E402


def write_kmp_target(root: Path) -> None:
    """Create one target-owned KMP route that selects the router and build leaf."""
    (root / "AGENTS.md").write_text("Target rules\n", encoding="utf-8")
    config = root / "config/governance"
    config.mkdir(parents=True)
    profile = {
        "profile_id": "kmp-sample",
        "context_router": {
            "default_context": ["AGENTS.md"],
            "routes": [
                {
                    "id": "kmp",
                    "match": {"prompt_terms": ["upgrade"]},
                    "skills": ["kmp-implementation"],
                    "token_budget": {
                        "primary_context_tokens": 10_000,
                        "active_plan_context_tokens": 10_000,
                        "expansion_context_tokens": 10_000,
                        "total_context_tokens": 10_000,
                    },
                }
            ],
        },
    }
    facts = {
        "schema_version": 1,
        "profile_id": "kmp-sample",
        "facts": {
            "skill_context": {
                "ecosystems": ["kmp"],
                "target_families": ["android"],
                "boundary_pressure": ["toolchain-compatibility"],
            }
        },
    }
    (config / "profile.yaml").write_text(yaml.safe_dump(profile), encoding="utf-8")
    (config / "facts.lock.yaml").write_text(yaml.safe_dump(facts), encoding="utf-8")
    materialize_skills(root)


def applied_outcomes(context: dict[str, object]) -> dict[str, object]:
    """Close every selected skill with one observable influence category."""
    return {
        "task_outcome": "completed",
        "skills": [
            {
                "id": skill["id"],
                "status": "applied",
                "influences": ["decision" if index == 0 else "validation"],
                "prompt": "private task detail",
                "path": "/private/adopter/source.kt",
            }
            for index, skill in enumerate(context["skills"])
            if "materialized_path" in skill
        ],
        "source": "private source content",
    }


class RuntimeSkillUtilizationTests(unittest.TestCase):
    """Keep selection and closeout observable without making telemetry authoritative."""

    def test_kmp_selection_and_closeout_are_redacted_summarized_and_idempotent(self) -> None:
        """Bind the real KMP router and leaf bytes to one complete retained receipt."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_kmp_target(root)
            context = resolve_context(root, "Upgrade the shared module", [])
            identity = begin(root, context)
            self.assertIsNotNone(identity)
            context["skill_utilization"] = identity

            before = status(root)["skills"]
            result = finish(root, context, applied_outcomes(context))
            repeated = finish(root, context, applied_outcomes(context))
            after = status(root)["skills"]
            text = (root / ".governance/telemetry/runs.jsonl").read_text(encoding="utf-8")

        self.assertEqual(
            [skill["id"] for skill in context["skills"]],
            ["kmp-implementation", "kmp-build-and-compatibility"],
        )
        self.assertEqual(before["unclosed_selection_count"], 1)
        self.assertEqual(result["status"], "recorded")
        self.assertEqual(repeated["status"], "recorded")
        self.assertEqual(after["retained_selection_count"], 1)
        self.assertEqual(after["retained_closeout_count"], 1)
        self.assertEqual(after["closed_selection_count"], 1)
        self.assertEqual(after["unclosed_selection_count"], 0)
        self.assertEqual(after["utilization_counts"], {"applied": 2})
        self.assertEqual(after["influence_counts"], {"decision": 1, "validation": 1})
        self.assertEqual(after["task_outcome_counts"], {"completed": 1})
        self.assertIn("not proof", after["interpretation"])
        for forbidden in (
            "private task detail",
            "/private/adopter",
            "private source content",
            "Upgrade the shared module",
        ):
            self.assertNotIn(forbidden, text)

    def test_closeout_requires_exact_coverage_and_verified_packet_bytes(self) -> None:
        """Reject missing skills, invalid evidence claims, and a changed materialized skill."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_kmp_target(root)
            context = resolve_context(root, "Upgrade the shared module", [])
            context["skill_utilization"] = begin(root, context)
            outcomes = applied_outcomes(context)
            outcomes["skills"] = outcomes["skills"][:-1]
            with self.assertRaisesRegex(SkillUtilizationError, "missing="):
                finish(root, context, outcomes)

            outcomes = applied_outcomes(context)
            outcomes["skills"][0]["influences"] = []
            with self.assertRaisesRegex(SkillUtilizationError, "must name an influence"):
                finish(root, context, outcomes)

            packet = root / context["materialization"]["root"]
            relative = context["skills"][0]["materialized_path"]
            (packet / relative).write_text("changed\n", encoding="utf-8")
            with self.assertRaisesRegex(SkillUtilizationError, "digest mismatch"):
                finish(root, context, applied_outcomes(context))

    def test_public_context_and_closeout_commands_share_one_utilization_identity(self) -> None:
        """Exercise the public CLI seam a provider-neutral coordinator uses."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_kmp_target(root)
            context_output = io.StringIO()
            context_path = root / ".governance/runtime/context-result.json"
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys,
                "argv",
                [
                    "project-governance",
                    "context",
                    "--task",
                    "upgrade",
                    "--json-output",
                    str(context_path),
                ],
            ), contextlib.redirect_stdout(context_output):
                self.assertEqual(main(), 0)
            context = json.loads(context_output.getvalue())
            outcomes_path = root / ".governance/runtime/skill-outcomes.json"
            outcomes_path.write_text(json.dumps(applied_outcomes(context)), encoding="utf-8")
            closeout_output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys,
                "argv",
                [
                    "project-governance",
                    "skills",
                    "closeout",
                    "--context-result",
                    str(context_path),
                    "--outcomes",
                    str(outcomes_path),
                ],
            ), contextlib.redirect_stdout(closeout_output):
                self.assertEqual(main(), 0)
            closeout = json.loads(closeout_output.getvalue())
            saved_context = json.loads(context_path.read_text(encoding="utf-8"))
            summary = status(root)["skills"]

        self.assertTrue(context["skill_utilization"]["selection_recorded"])
        self.assertEqual(saved_context, context)
        self.assertEqual(closeout["usage_id"], context["skill_utilization"]["usage_id"])
        self.assertEqual(closeout["status"], "recorded")
        self.assertEqual(summary["closed_selection_count"], 1)

    def test_direct_telemetry_append_rejects_semantically_invalid_skill_entries(self) -> None:
        """Do not let bypass callers retain partial, duplicate, or contradictory receipts."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = {
                "event": "skill-utilization-terminal",
                "usage_id": "12345678-1234-4123-8123-123456789abc",
                "packet_id": "context-0123456789abcdef",
                "task_outcome": "completed",
            }
            invalid_influence = append(
                root,
                {
                    **base,
                    "skills": [
                        {
                            "id": "kmp-implementation",
                            "sha256": "a" * 64,
                            "status": "consulted-no-change",
                            "influences": ["decision"],
                        }
                    ],
                },
            )
            duplicate = append(
                root,
                {
                    **base,
                    "skills": [
                        {
                            "id": "kmp-implementation",
                            "sha256": "a" * 64,
                            "status": "applied",
                            "influences": ["decision"],
                        },
                        {
                            "id": "kmp-implementation",
                            "sha256": "a" * 64,
                            "status": "applied",
                            "influences": ["validation"],
                        },
                    ],
                },
            )
            summary = status(root)["skills"]

        self.assertFalse(invalid_influence)
        self.assertFalse(duplicate)
        self.assertEqual(summary["retained_closeout_count"], 0)


if __name__ == "__main__":
    unittest.main()
