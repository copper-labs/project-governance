#!/usr/bin/env python3
"""Prove finding states aggregate consistently and process failures stay active."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.checker_scripts.finding_lifecycle import (  # noqa: E402
    FINDING_STATES,
    finding_summary,
)
from project_governance_runtime.execution_commands import normalized_command  # noqa: E402
from project_governance_runtime.processes import CommandResult  # noqa: E402


def command_result(payload: dict[str, object], *, exit_code: int = 0) -> CommandResult:
    """Build one completed checker result with a structured JSON envelope."""
    return CommandResult([], exit_code, json.dumps(payload), "", "completed")


class RuntimeFindingLifecycleTests(unittest.TestCase):
    """Keep lifecycle state distinct from envelope and process outcomes."""

    def test_inactive_findings_pass_and_remain_counted(self) -> None:
        """Retain reviewed decisions without turning them into active warnings."""
        findings = [
            {"severity": "accepted"},
            {"severity": "waived"},
            {"severity": "suppressed"},
        ]
        summary = finding_summary(findings)
        self.assertEqual(summary["status"], "passed")
        self.assertEqual(summary["finding_count"], 3)
        self.assertEqual(
            summary["finding_counts"],
            {
                state: int(state in {"accepted", "waived", "suppressed"})
                for state in FINDING_STATES
            },
        )

    def test_advisory_finding_promotes_a_passed_envelope_to_warning(self) -> None:
        """Make active advisory state visible even when a checker mislabels its envelope."""
        command, status = normalized_command(command_result({
            "status": "passed",
            "findings": [{"rule_id": "example.advice", "severity": "advisory"}],
        }), ["checker"])
        self.assertEqual(status, "warning")
        self.assertEqual(command["status"], "warning")
        self.assertEqual(command["finding_counts"]["advisory"], 1)
        self.assertEqual(set(command["finding_counts"]), set(FINDING_STATES))

    def test_inactive_findings_clear_a_stale_warning_envelope(self) -> None:
        """Derive active warning state from findings instead of preserving old debt."""
        command, status = normalized_command(command_result({
            "status": "warning",
            "findings": [
                {"rule_id": "example.accepted", "severity": "accepted"},
                {"rule_id": "example.waived", "severity": "waived"},
                {"rule_id": "example.suppressed", "severity": "suppressed"},
            ],
        }), ["checker"])
        self.assertEqual(status, "passed")
        self.assertEqual(command["status"], "passed")
        self.assertEqual(command["finding_count"], 3)

    def test_unknown_structured_severity_fails_closed(self) -> None:
        """Reject a typed finding whose state is outside the shared lifecycle."""
        command, status = normalized_command(command_result({
            "status": "passed",
            "findings": [{"rule_id": "example.unknown", "severity": "ignored"}],
        }), ["checker"])
        self.assertEqual(status, "failed")
        self.assertEqual(command["finding_counts"]["blocking"], 1)
        self.assertEqual(command["findings"][0]["rule_id"], "checker.finding-severity-invalid")
        self.assertEqual(command["findings"][0]["reported_severity"], "ignored")

    def test_malformed_success_output_fails_closed(self) -> None:
        """Do not infer a pass from exit zero when the required envelope is absent."""
        result = CommandResult([], 0, "ordinary tool output", "", "completed")
        command, status = normalized_command(result, ["checker"])
        self.assertEqual(status, "failed")
        self.assertEqual(command["finding_counts"]["blocking"], 1)
        self.assertEqual(command["findings"][0]["rule_id"], "checker.output-invalid")

    def test_missing_findings_array_fails_closed(self) -> None:
        """Treat a partial JSON object as malformed rather than inventing evidence."""
        command, status = normalized_command(command_result({"status": "passed"}), ["checker"])
        self.assertEqual(status, "failed")
        self.assertEqual(command["findings"][0]["rule_id"], "checker.output-invalid")

    def test_nonzero_exit_cannot_be_hidden_by_accepted_findings(self) -> None:
        """Add an active blocker when process failure has only inactive evidence."""
        command, status = normalized_command(command_result({
            "status": "passed",
            "findings": [{"rule_id": "example.accepted", "severity": "accepted"}],
        }, exit_code=2), ["checker"])
        self.assertEqual(status, "failed")
        self.assertEqual(command["finding_count"], 2)
        self.assertEqual(command["finding_counts"]["accepted"], 1)
        self.assertEqual(command["finding_counts"]["blocking"], 1)

    def test_plain_findings_derive_severity_from_declared_status(self) -> None:
        """Preserve simple target checker envelopes at the normalization boundary."""
        command, status = normalized_command(command_result({
            "status": "warning",
            "findings": ["plain advisory"],
        }), ["checker"])
        self.assertEqual(status, "warning")
        self.assertEqual(command["findings"][0]["severity"], "advisory")
        self.assertEqual(command["finding_counts"]["advisory"], 1)


if __name__ == "__main__":
    unittest.main()
