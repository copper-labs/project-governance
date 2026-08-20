#!/usr/bin/env python3
"""Prove the Version 4 delegated contract stays compact and provider-neutral."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.agent_contract import (  # noqa: E402
    AgentContractError,
    WORKER_BRIEF_FIELDS,
    project_worker_packet,
)
from project_governance_runtime.agent_routing import catalog_digest  # noqa: E402


RESOURCES = ROOT / "src/project_governance_runtime/assets/skills/resources"


def task_envelope() -> dict[str, object]:
    """Return a host envelope containing worker fields and private host metadata."""
    return {
        "task_id": "task-1",
        "role": "implementation-worker",
        "required_capability_tier": "economy",
        "objective": "Change one component",
        "governing_refs": ["docs/spec.md"],
        "base_snapshot": "abc123",
        "read_scope": ["src/component.py"],
        "write_scope": ["src/component.py"],
        "exclusions": ["src/other.py"],
        "fixed_decisions": ["Keep the public API"],
        "acceptance": ["Focused test passes"],
        "focused_proof": ["python -m unittest tests.test_component"],
        "output_token_ceiling": 1200,
        "escalate_or_stop_when": ["A public API decision is required"],
        "context_packet_id": "host-only-packet",
        "context_provider_ids": ["host-only-provider"],
        "materialization_lease_id": "host-only-lease",
    }


class RuntimeAgentContractTests(unittest.TestCase):
    """Keep host metadata out of worker-visible packets."""

    def test_projects_only_the_compact_brief_and_selected_materialized_context(self) -> None:
        """Do not expose provider handles, leases, host paths, or the full task envelope."""
        context = {
            "materialization": {
                "root": ".governance/runtime/context/context-1",
                "items": [{
                    "id": "context-1",
                    "group": "primary",
                    "source_path": "private/source.md",
                    "materialized_path": "items/001-context-1.md",
                    "sha256": "a" * 64,
                    "exact_bytes": 42,
                }],
            }
        }
        original = json.dumps(context, sort_keys=True)

        packet = project_worker_packet(task_envelope(), context)

        self.assertEqual(tuple(packet["brief"]), WORKER_BRIEF_FIELDS)
        self.assertNotIn("context_packet_id", packet["brief"])
        self.assertNotIn("source_path", packet["materialized_context"][0])
        self.assertEqual(json.dumps(context, sort_keys=True), original)

    def test_rejects_an_incomplete_or_unbounded_brief(self) -> None:
        """Fail before dispatch when a required decision or ceiling is absent."""
        envelope = task_envelope()
        del envelope["acceptance"]
        with self.assertRaisesRegex(AgentContractError, "acceptance"):
            project_worker_packet(envelope, {"materialization": {"items": []}})
        envelope = task_envelope()
        envelope["output_token_ceiling"] = 0
        with self.assertRaisesRegex(AgentContractError, "positive integer"):
            project_worker_packet(envelope, {"materialization": {"items": []}})
        envelope = task_envelope()
        envelope["objective"] = {"unexpected": "object"}
        with self.assertRaisesRegex(AgentContractError, "worker brief is invalid"):
            project_worker_packet(envelope, {"materialization": {"items": []}})

    def test_version_four_catalog_and_three_schemas_are_valid(self) -> None:
        """Ship one V4 authority and exactly the approved schema set."""
        roles = yaml.safe_load((RESOURCES / "execution-roles.yaml").read_text(encoding="utf-8"))
        self.assertEqual(roles["version"], 4)
        self.assertNotIn("parallel-isolated", roles["mode_order"])
        self.assertNotIn("optional_target_policy", roles)
        self.assertEqual(roles["context_contract"]["estimator"]["real_provider_usage"], "optional")
        self.assertEqual(
            set(roles["worker_brief"]["required_fields"]), set(WORKER_BRIEF_FIELDS)
        )
        schema_paths = sorted(RESOURCES.glob("agent-*.schema.json"))
        self.assertEqual(len(schema_paths), 3)
        for schema_path in schema_paths:
            Draft202012Validator.check_schema(
                json.loads(schema_path.read_text(encoding="utf-8"))
            )

    def test_native_catalogs_validate_after_the_cli_adds_their_digest(self) -> None:
        """Keep concrete provider names confined to thin native catalog inputs."""
        schema = json.loads((RESOURCES / "agent-routing.schema.json").read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        for provider, relative in (
            ("codex", ".codex/agent-profiles.json"),
            ("claude", ".claude/agent-profiles.json"),
        ):
            path = ROOT / relative
            catalog = json.loads(path.read_text(encoding="utf-8"))
            catalog["digest"] = catalog_digest(catalog)
            primary = next(item for item in catalog["profiles"] if item["tier"] == "primary")
            instance = {
                "kind": "agent-route-input",
                "task": {},
                "session": {
                    "provider": provider,
                    "profile_id": primary["id"],
                    "model": primary["model"],
                    "tier_rank": primary["tier_rank"],
                },
                "catalog": catalog,
                "control_state": {},
            }
            self.assertEqual(list(validator.iter_errors(instance)), [])

    def test_plan_template_declares_dependencies_without_parallel_safe(self) -> None:
        """Express safe parallelism through dependency and execution fields only."""
        text = (RESOURCES / "implementation-plan-template.md").read_text(encoding="utf-8")
        self.assertIn("Depends on:", text)
        self.assertIn("Execution: sequential | parallel with", text)
        self.assertIn("Semantic contract: settled | unresolved", text)
        self.assertIn("Invalidates prior proof when:", text)
        self.assertIn("Proof state: not-run | passed on", text)
        self.assertIn("Run once on the frozen candidate", text)
        self.assertIn("Packet ready: yes | no", text)
        self.assertNotIn("Parallel safe", text)

    def test_delegation_skill_exposes_the_short_operator_trigger(self) -> None:
        """Keep activation a natural-language request rather than an operator-run CLI ritual."""
        path = ROOT / "src/project_governance_runtime/assets/skills/delegated-execution/SKILL.md"
        self.assertIn("Use delegation for this task", path.read_text(encoding="utf-8"))

    def test_delegation_skill_requires_governed_native_lifecycle_and_one_qa_recheck(self) -> None:
        """Prevent native spawning and repair loops from bypassing the one-wave contract."""
        path = ROOT / "src/project_governance_runtime/assets/skills/delegated-execution/SKILL.md"
        text = path.read_text(encoding="utf-8")
        self.assertIn("native-host agents only from the entries returned", text)
        self.assertIn("one primary-owned repair and one", text)
        self.assertIn("do not launch another QA reviewer, verifier, or broad proof cycle", text)

    def test_peer_dispatch_pins_the_repeated_failure_consultation_ladder(self) -> None:
        """Start with a fresh perspective and reserve the heavier fallback for uncertainty."""
        peer_dispatch = yaml.safe_load(
            (RESOURCES / "peer-dispatch.yaml").read_text(encoding="utf-8")
        )

        self.assertEqual(
            peer_dispatch["repeated_failure_consultation"],
            {
                "mode": "read-only-second-opinion",
                "steps": [
                    {
                        "model": "claude-opus-5",
                        "effort": "high",
                        "when": "first-attempt",
                    },
                    {
                        "model": "claude-fable-5",
                        "effort": "xhigh",
                        "when": "prior-failed-unavailable-or-inconclusive",
                    },
                ],
                "automatic_max": "prohibited",
            },
        )

    def test_native_adapters_reference_only_installed_skill_paths(self) -> None:
        """Keep thin Codex and Claude launch pointers off removed source-template paths."""
        paths = [ROOT / ".claude/CLAUDE.md", *sorted((ROOT / ".claude/agents").glob("*.md")),
                 *sorted((ROOT / ".codex/agents").glob("*.toml"))]
        text = "\n".join(path.read_text(encoding="utf-8") for path in paths)
        self.assertNotIn("template/agent-context", text)
        self.assertNotIn("task envelope", text.lower())


if __name__ == "__main__":
    unittest.main()
