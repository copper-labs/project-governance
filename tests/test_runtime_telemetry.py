#!/usr/bin/env python3
"""Prove local validation telemetry is small, redacted, and advisory."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.telemetry import (  # noqa: E402
    MAX_PACK_SUMMARIES,
    append,
    scope_fingerprint,
    status,
    review,
)
from project_governance_runtime.execution_commands import normalized_command  # noqa: E402
from project_governance_runtime.processes import CommandResult  # noqa: E402
from project_governance_runtime.runner import _failure_counts  # noqa: E402


DIGEST_A = "sha256:" + "a" * 64
FINGERPRINT_A = "sha256:" + "1" * 64


class RuntimeTelemetryTests(unittest.TestCase):
    """Keep advisory measurements useful without retaining governed content."""

    def test_failure_classification_preserves_exit_one_findings(self) -> None:
        """Separate ordinary rejection, broken output, and execution failure by observed facts."""
        finding = {"rule_id": "sample.rule", "severity": "blocking", "message": "private"}
        cases = (
            (1, json.dumps({"status": "failed", "findings": [finding]}), "completed", "check"),
            (1, json.dumps({"status": "passed", "findings": []}), "completed", "execution"),
            (0, "invalid JSON", "completed", "invalid-output"),
            (124, "", "timeout", "timeout"),
            (130, "", "cancelled", "cancelled"),
        )
        for code, output, termination, kind in cases:
            with self.subTest(kind=kind):
                command, outcome = normalized_command(CommandResult([], code, output, "", termination), [])
                self.assertEqual(outcome, "failed")
                self.assertEqual(command["failure_kind"], kind)

    def test_cli_records_selection_failure_and_test_expectation_without_approving_it(self) -> None:
        """Include blocked planning in telemetry while preserving the failing command exit."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            environment = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
            command = [
                sys.executable, "-m", "project_governance_runtime.cli", "check",
                "--stage", "pre-push", "--trigger", "test", "--expected-status", "blocked",
            ]
            result = subprocess.run(command, cwd=root, env=environment, text=True, capture_output=True)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            records = [json.loads(line) for line in (root / ".governance/telemetry/runs.jsonl").read_text().splitlines()]
            self.assertEqual(len(records), 2)
            self.assertEqual(records[-1]["failure_counts"], {"selection": 1})
            self.assertEqual(records[-1]["trigger"], "test")
            self.assertIn("planning_duration_ms", records[-1])
            self.assertEqual(status(root)["validation"]["nonterminal_run_count"], 0)
            self.assertEqual(status(root)["validation"]["expectation_counts"], {"matched": 1})

    def test_filters_test_expectations_and_review_leave_outcomes_intact(self) -> None:
        """Join explicit review labels to retained runs without laundering real failures."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for run_id, version, trigger in (("old", "2.1.0", "hook"), ("negative", "2.3.0", "test")):
                append(root, {
                    "event": "run-terminal", "run_id": run_id, "runtime_version": version,
                    "stage": "pre-commit", "trigger": trigger, "expected_status": "failed",
                    "status": "failed", "failure_counts": {"check": 1, "private text": 5},
                    "failed_pack_ids": ["format"], "planning_duration_ms": 12,
                })
            review(root, "negative", "false-positive")
            selected = status(root, runtime_version="2.3.0", trigger="test", since="2020-01-01")
            actual = selected["validation"]
            self.assertEqual(actual["retained_run_count"], 1)
            self.assertEqual(actual["outcome_counts"], {"failed": 1})
            self.assertEqual(actual["expectation_counts"], {"matched": 1})
            self.assertEqual(actual["review_disposition_counts"], {"false-positive": 1})
            self.assertEqual(actual["failure_counts"], {"check": 1})
            self.assertEqual(actual["planning_duration_ms"], 12)
            self.assertEqual(status(root, trigger="hook")["validation"]["expectation_counts"], {"unspecified": 1})
            with self.assertRaises(ValueError):
                review(root, "missing", "confirmed-issue")
            with self.assertRaises(ValueError):
                status(root, since="2026-09-02T12:00:00")
            self.assertNotIn("private text", (root / ".governance/telemetry/runs.jsonl").read_text())

    def test_review_does_not_change_run_selection_time(self) -> None:
        """Keep an old reviewed run outside a later measurement window."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("project_governance_runtime.telemetry._now", return_value="2020-01-01T00:00:00Z"):
                append(root, {"event": "run-terminal", "run_id": "old", "status": "failed"})
            review(root, "old", "confirmed-issue")
            self.assertEqual(status(root, since="2025-01-01")["validation"]["retained_run_count"], 0)

    def test_telemetry_cli_reviews_and_filters_retained_runs(self) -> None:
        """Exercise parser dispatch while retaining the failed observed verdict after review."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            append(root, {"event": "run-terminal", "run_id": "rejected", "status": "failed",
                          "runtime_version": "2.3.0", "stage": "pre-commit", "trigger": "hook"})
            command = [sys.executable, "-m", "project_governance_runtime.cli", "telemetry"]
            environment = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
            for arguments in (
                ["review", "--run-id", "rejected", "--disposition", "confirmed-issue"],
                ["status", "--since", "2020-01-01", "--runtime-version", "2.3.0",
                 "--stage", "pre-commit", "--trigger", "hook"],
            ):
                result = subprocess.run(command + arguments, cwd=root, env=environment, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            observed = json.loads(result.stdout)["validation"]
            self.assertEqual(observed["outcome_counts"], {"failed": 1})
            self.assertEqual(observed["review_disposition_counts"], {"confirmed-issue": 1})

    def test_invalid_cli_arguments_do_not_create_selection_failures(self) -> None:
        """Keep invocation mistakes outside validation reliability statistics."""
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, "-m", "project_governance_runtime.cli", "check",
                 "--stage", "pre-push", "--expected-status", "failed"],
                cwd=directory, env={**os.environ, "PYTHONPATH": str(ROOT / "src")},
                text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("--expected-status requires --trigger test", result.stdout)
            self.assertFalse((Path(directory) / ".governance/telemetry/runs.jsonl").exists())

    def test_failure_observations_and_failed_pack_ids_are_bounded(self) -> None:
        """Retain separate integrity observations while bounding failed pack identities."""
        failures = _failure_counts([
            {"status": "failed", "commands": [{"failure_kind": "integrity"}],
             "invalid_evidence_manifest_count": 1},
            {"status": "failed", "commands": []},
        ], "runtime-exception")
        self.assertEqual(failures, {"integrity": 2, "configuration": 1, "runtime": 1})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            append(root, {"event": "run-terminal", "run_id": "bounded", "status": "failed",
                          "failure_counts": failures, "blocking_finding_count": 3,
                          "failed_pack_ids": [f"pack-{index:02}" for index in range(20)]})
            observed = status(root)["validation"]
            self.assertEqual(observed["failure_counts"], failures)
            self.assertEqual(observed["blocking_finding_count"], 3)
            self.assertEqual(len(observed["failed_pack_counts"]), MAX_PACK_SUMMARIES)

    def test_scope_fingerprint_is_stable_without_exposing_paths(self) -> None:
        first = scope_fingerprint(
            "pre-commit", "impacted", ["secret/b.py", "a.py"], ["b", "a"]
        )
        second = scope_fingerprint(
            "pre-commit", "impacted", ["a.py", "secret/b.py"], ["a", "b"]
        )
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("sha256:"))
        self.assertNotIn("secret", first)

    def test_append_keeps_only_minimal_validation_fields_and_ten_slowest_packs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertTrue(
                append(
                    root,
                    {
                        "event": "run-started",
                        "run_id": "run-1",
                        "runtime_version": "1.2.3",
                        "stage": "pre-commit",
                        "mode": "impacted",
                        "changed_path_count": 2,
                        "selected_pack_count": 12,
                        "scope_fingerprint": FINGERPRINT_A,
                        "subject_digest": DIGEST_A,
                        "absolute_path": "/private/adopter/source.py",
                        "prompt": "private prompt",
                    },
                )
            )
            packs = [
                {
                    "id": f"pack-{index:02d}",
                    "duration_ms": index,
                    "status": "failed",
                    "findings": [{"message": "private finding"}],
                    "stdout": "private output",
                }
                for index in range(15)
            ]
            self.assertTrue(
                append(
                    root,
                    {
                        "event": "run-terminal",
                        "run_id": "run-1",
                        "stage": "pre-commit",
                        "mode": "impacted",
                        "status": "failed",
                        "termination_reason": "exit",
                        "duration_ms": 120,
                        "pack_duration_ms": 105,
                        "scope_fingerprint": FINGERPRINT_A,
                        "subject_digest": DIGEST_A,
                        "packs": packs,
                        "stderr": "private error",
                    },
                )
            )
            text = (root / ".governance/telemetry/runs.jsonl").read_text(
                encoding="utf-8"
            )
            records = [json.loads(line) for line in text.splitlines()]

        self.assertEqual(records[0]["schema_version"], 3)
        self.assertEqual(records[0]["selected_pack_count"], 12)
        self.assertEqual(len(records[1]["packs"]), MAX_PACK_SUMMARIES)
        self.assertEqual(records[1]["packs"][0], {"id": "pack-14", "duration_ms": 14})
        for forbidden in (
            "/private",
            "private prompt",
            "private output",
            "private error",
            "private finding",
            "findings",
            "stdout",
        ):
            self.assertNotIn(forbidden, text)
        self.assertEqual(
            set(records[1]["packs"][0]), {"id", "duration_ms"}
        )

    def test_next_append_rewrites_legacy_records_and_drops_retired_event_families(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / ".governance/telemetry/runs.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text(
                json.dumps(
                    {
                        "event": "run-terminal",
                        "run_id": "old",
                        "status": "passed",
                        "stdout": "secret",
                    }
                )
                + "\n"
                + json.dumps(
                    {
                        "event": "documentation-terminal",
                        "operation": "route",
                        "path": "private/path",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            append(root, {"event": "run-terminal", "run_id": "new", "status": "passed"})
            text = path.read_text(encoding="utf-8")

        self.assertNotIn("secret", text)
        self.assertNotIn("documentation-terminal", text)
        self.assertEqual(
            [json.loads(line)["run_id"] for line in text.splitlines()], ["old", "new"]
        )

    def test_retention_obeys_both_record_and_byte_ceilings(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch(
            "project_governance_runtime.telemetry.MAX_RECORDS", 3
        ), patch("project_governance_runtime.telemetry.MAX_TELEMETRY_BYTES", 520):
            root = Path(directory)
            for index in range(8):
                append(
                    root,
                    {
                        "event": "run-terminal",
                        "run_id": f"run-{index}",
                        "status": "passed",
                        "runtime_version": "version-with-bounded-padding",
                    },
                )
            path = root / ".governance/telemetry/runs.jsonl"
            records = [json.loads(line) for line in path.read_text().splitlines()]

            self.assertLessEqual(len(records), 3)
            self.assertLessEqual(path.stat().st_size, 520)
            self.assertEqual(records[-1]["run_id"], "run-7")

    def test_append_reads_only_the_bounded_tail_of_legacy_telemetry(self) -> None:
        """Keep a stale oversized file from turning one advisory append into a full-file scan."""
        with tempfile.TemporaryDirectory() as directory, patch(
            "project_governance_runtime.telemetry.MAX_TELEMETRY_BYTES", 512
        ):
            root = Path(directory)
            path = root / ".governance/telemetry/runs.jsonl"
            path.parent.mkdir(parents=True)
            prefix = json.dumps(
                {"event": "run-terminal", "run_id": "discarded", "status": "passed"}
            ) + "\n"
            retained = json.dumps(
                {"event": "run-terminal", "run_id": "retained", "status": "passed"}
            ) + "\n"
            path.write_bytes(prefix.encode("utf-8") + b"x" * 700 + b"\n" + retained.encode("utf-8"))

            self.assertTrue(
                append(root, {"event": "run-terminal", "run_id": "new", "status": "passed"})
            )
            records = [json.loads(line) for line in path.read_text().splitlines()]

        self.assertEqual([record["run_id"] for record in records], ["retained", "new"])

    def test_overlapping_process_writers_do_not_lose_events(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            processes = []
            for worker in range(2):
                program = (
                    "import sys; from pathlib import Path; "
                    f"sys.path.insert(0, {str(ROOT / 'src')!r}); "
                    "from project_governance_runtime.telemetry import append; "
                    f"root=Path({str(root)!r}); "
                    f"[append(root, {{'event':'run-terminal','run_id':f'w{worker}-{{i}}',"
                    "'status':'passed'}) for i in range(10)]"
                )
                processes.append(
                    subprocess.Popen(
                        [sys.executable, "-c", program],
                        text=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                    )
                )
            for process in processes:
                _, stderr = process.communicate(timeout=10)
                self.assertEqual(process.returncode, 0, stderr)
            records = (
                root / ".governance/telemetry/runs.jsonl"
            ).read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(records), 20)

    def test_io_failure_never_blocks_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch(
            "project_governance_runtime.telemetry._atomic_write",
            side_effect=OSError("disk unavailable"),
        ):
            self.assertFalse(
                append(
                    Path(directory),
                    {"event": "run-terminal", "run_id": "run", "status": "passed"},
                )
            )

    def test_status_reports_only_efficiency_aggregates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for run_id, stage, duration in (
                ("one", "pre-push", 50),
                ("two", "ci-pr", 70),
            ):
                append(
                    root,
                    {
                        "event": "run-started",
                        "run_id": run_id,
                        "stage": stage,
                        "mode": "impacted",
                        "scope_fingerprint": FINGERPRINT_A,
                        "subject_digest": DIGEST_A,
                    },
                )
                append(
                    root,
                    {
                        "event": "run-terminal",
                        "run_id": run_id,
                        "stage": stage,
                        "mode": "impacted",
                        "status": "passed",
                        "duration_ms": duration,
                        "pack_duration_ms": duration - 5,
                        "scope_fingerprint": FINGERPRINT_A,
                        "subject_digest": DIGEST_A,
                        "packs": [{"id": "tests", "duration_ms": duration - 5}],
                    },
                )
            append(root, {"event": "run-started", "run_id": "unfinished"})
            result = status(root)

        validation = result["validation"]
        self.assertEqual(result["record_count"], 5)
        self.assertEqual(validation["retained_run_count"], 2)
        self.assertEqual(validation["repeated_scope_run_count"], 1)
        self.assertEqual(validation["same_subject_repeat_run_count"], 1)
        self.assertEqual(validation["cross_stage_same_subject_run_count"], 1)
        self.assertEqual(validation["nonterminal_run_count"], 1)
        self.assertEqual(validation["runner_overhead_ms"], 10)
        self.assertEqual(validation["slowest_packs"][0]["id"], "tests")
        self.assertNotIn("documentation", result)
        self.assertNotIn("orchestration", result)
        self.assertNotIn("skills", result)


if __name__ == "__main__":
    unittest.main()
