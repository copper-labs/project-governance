#!/usr/bin/env python3
"""Prove local telemetry is bounded, redacted, and non-authoritative."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.telemetry import (  # noqa: E402
    _telemetry_lock,
    append,
    compact_status,
    scope_fingerprint,
    status,
)


DIGEST_A = "sha256:" + "a" * 64
DIGEST_B = "sha256:" + "b" * 64
FINGERPRINT_A = "sha256:" + "1" * 64
FINGERPRINT_B = "sha256:" + "2" * 64


class RuntimeTelemetryTests(unittest.TestCase):
    """Keep advisory measurements useful without retaining governed content."""

    def test_scope_fingerprint_is_stable_without_exposing_paths(self) -> None:
        """Identify equivalent scopes using only a digest in persisted output."""
        first = scope_fingerprint(
            "pre-commit", "impacted", ["secret/b.py", "a.py"], ["b", "a"]
        )
        second = scope_fingerprint(
            "pre-commit", "impacted", ["a.py", "secret/b.py"], ["a", "b"]
        )
        self.assertEqual(first, second)
        self.assertTrue(first.startswith("sha256:"))
        self.assertNotIn("secret", first)

    def test_append_projects_events_onto_the_redacted_schema(self) -> None:
        """Discard source, process output, paths, prompts, and unknown product data."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            append(
                root,
                {
                    "event": "run-started",
                    "run_id": "run-1",
                    "runtime_version": "1.2.3",
                    "stage": "pre-commit",
                    "mode": "impacted",
                    "changed_path_count": 2,
                    "selected_packs": ["format", "tests"],
                    "scope_fingerprint": FINGERPRINT_A,
                    "subject_digest": DIGEST_A,
                    "absolute_path": "/private/adopter/source.py",
                    "prompt": "private prompt",
                },
            )
            append(
                root,
                {
                    "event": "run-terminal",
                    "run_id": "run-1",
                    "status": "failed",
                    "termination_reason": "exit",
                    "duration_ms": 12.5,
                    "packs": [
                        {
                            "id": "tests",
                            "command_count": 2,
                            "status": "failed",
                            "finding_count": 1,
                            "blocking_finding_count": 1,
                            "advisory_finding_count": 0,
                            "accepted_finding_count": 2,
                            "waived_finding_count": 3,
                            "suppressed_finding_count": 4,
                            "process_failure_count": 1,
                            "integrity_failure_count": 2,
                            "evidence_manifest_count": 1,
                            "valid_evidence_manifest_count": 1,
                            "invalid_evidence_manifest_count": 0,
                            "evidence_claim_count": 5,
                            "evidence_artifact_digest_count": 6,
                            "evidence_status": "private target state",
                            "duration_ms": 10.0,
                            "stdout": "private output",
                            "commands": [{"argv": ["private-tool"]}],
                        }
                    ],
                    "stderr": "private error",
                    "source": "private source",
                },
            )
            text = (root / ".governance/telemetry/runs.jsonl").read_text(encoding="utf-8")
            records = [json.loads(line) for line in text.splitlines()]

        self.assertEqual(records[0]["schema_version"], 1)
        self.assertEqual(records[0]["selected_pack_count"], 2)
        self.assertEqual(records[0]["subject_digest"], DIGEST_A)
        self.assertEqual(records[1]["packs"][0]["command_count"], 2)
        self.assertEqual(records[1]["packs"][0]["blocking_finding_count"], 1)
        self.assertEqual(records[1]["packs"][0]["accepted_finding_count"], 2)
        self.assertEqual(records[1]["packs"][0]["process_failure_count"], 1)
        self.assertEqual(records[1]["packs"][0]["integrity_failure_count"], 2)
        self.assertEqual(records[1]["packs"][0]["evidence_manifest_count"], 1)
        self.assertEqual(records[1]["packs"][0]["evidence_claim_count"], 5)
        for forbidden in (
            "/private",
            "private prompt",
            "private output",
            "private error",
            "private source",
            "argv",
            "private target state",
            "evidence_status",
        ):
            self.assertNotIn(forbidden, text)

        pack = records[1]["packs"][0]
        new_fields = {
            key
            for key in pack
            if key not in {"id", "status", "duration_ms", "command_count", "finding_count"}
        }
        self.assertTrue(new_fields)
        self.assertTrue(all(isinstance(pack[key], int) for key in new_fields))

    def test_append_rewrites_legacy_records_through_the_same_redaction(self) -> None:
        """Do not perpetuate unsafe legacy fields during bounded retention rewrites."""
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
                + "\n",
                encoding="utf-8",
            )
            append(root, {"event": "run-terminal", "run_id": "new", "status": "passed"})
            text = path.read_text(encoding="utf-8")

        self.assertNotIn("secret", text)
        self.assertEqual(len(text.splitlines()), 2)

    def test_retention_keeps_only_the_newest_records(self) -> None:
        """Bound local advisory history without turning it into a durable ledger."""
        with tempfile.TemporaryDirectory() as directory, patch(
            "project_governance_runtime.telemetry.MAX_RECORDS", 3
        ):
            root = Path(directory)
            for index in range(5):
                append(
                    root,
                    {
                        "event": "run-terminal",
                        "run_id": f"run-{index}",
                        "status": "passed",
                    },
                )
            records = [
                json.loads(line)
                for line in (root / ".governance/telemetry/runs.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]

        self.assertEqual([record["run_id"] for record in records], ["run-2", "run-3", "run-4"])

    def test_overlapping_process_writers_are_serialized_without_lost_events(self) -> None:
        """Queue overlapping writers behind one lock and retain both completed events."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / ".governance/telemetry/runs.jsonl"
            path.parent.mkdir(parents=True)
            processes: list[subprocess.Popen[str]] = []
            with _telemetry_lock(path):
                for index in range(2):
                    ready = root / f"ready-{index}"
                    program = (
                        "import sys; from pathlib import Path; "
                        f"sys.path.insert(0, {str(ROOT / 'src')!r}); "
                        "from project_governance_runtime.telemetry import append; "
                        f"Path({str(ready)!r}).write_text('ready'); "
                        f"append(Path({str(root)!r}), "
                        f"{{'event':'run-terminal','run_id':'run-{index}','status':'passed'}})"
                    )
                    processes.append(
                        subprocess.Popen(
                            [sys.executable, "-c", program],
                            text=True,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                        )
                    )
                deadline = time.monotonic() + 2
                ready_paths = [root / "ready-0", root / "ready-1"]
                while not all(item.exists() for item in ready_paths) and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(all(item.exists() for item in ready_paths))
                time.sleep(0.05)
                self.assertTrue(all(process.poll() is None for process in processes))
            for process in processes:
                _, stderr = process.communicate(timeout=3)
                self.assertEqual(process.returncode, 0, stderr)
            records = [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").splitlines()
            ]

        self.assertEqual({record["run_id"] for record in records}, {"run-0", "run-1"})

    def test_telemetry_io_failure_does_not_block_the_check_path(self) -> None:
        """Treat an unavailable telemetry directory as advisory loss only."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "not-a-directory"
            root.write_text("occupied", encoding="utf-8")
            append(root, {"event": "run-started", "run_id": "run-1"})

    def test_orchestration_receipt_is_redacted_and_reports_retained_model_mix(self) -> None:
        """Summarize model share and real reported tokens without retaining task content."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            append(root, {
                "event": "orchestration-terminal",
                "terminal_outcome": "completed",
                "duration_ms": 20,
                "authorization_digest": "do-not-retain",
                "entries": [
                    {
                        "role": "implementation-worker",
                        "profile_id": "economy-high",
                        "model": "economy-model",
                        "outcome": "completed",
                        "duration_ms": 10,
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "proof_result": "passed",
                        "fallback": False,
                        "repair": False,
                        "prompt": "private prompt",
                        "path": "/private/source.py",
                    },
                    {
                        "role": "qa-reviewer",
                        "profile_id": "balanced-high",
                        "model": "balanced-model",
                        "outcome": "completed",
                        "proof_result": "passed",
                    },
                ],
            })
            text = (root / ".governance/telemetry/runs.jsonl").read_text(encoding="utf-8")
            summary = status(root)["orchestration"]
        self.assertNotIn("do-not-retain", text)
        self.assertNotIn("private prompt", text)
        self.assertNotIn("/private", text)
        self.assertEqual(summary["delegated_entry_count"], 2)
        self.assertEqual([item["percentage"] for item in summary["model_mix"]], [50.0, 50.0])
        self.assertEqual(summary["reported_input_tokens"], 100)
        self.assertEqual(summary["reported_output_tokens"], 50)
        self.assertNotIn("reported_input_tokens", summary["model_mix"][0])
        self.assertIn("control-state-only timeouts", summary["excludes"])

    def test_status_skips_malformed_orchestration_records(self) -> None:
        """Keep advisory status fail-open when the retained ledger contains junk."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / ".governance/telemetry/runs.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text("not-json\n" + json.dumps({"event": "unknown"}) + "\n", encoding="utf-8")
            summary = status(root)
        self.assertEqual(summary["status"], "empty")
        self.assertEqual(summary["orchestration"]["delegated_entry_count"], 0)
        self.assertEqual(summary["validation"]["retained_run_count"], 0)
        self.assertEqual(summary["validation"]["repeated_scope_run_count"], 0)

    def test_status_surfaces_repeated_scopes_and_slow_packs_without_scope_identity(self) -> None:
        """Expose bounded efficiency observations without claiming that a repeat was invalid."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for run_id, stage, mode, fingerprint, subject, duration, pack_duration in (
                ("run-1", "pre-commit", "impacted", FINGERPRINT_A, DIGEST_A, 15, 10),
                ("run-2", "pre-push", "impacted", FINGERPRINT_A, DIGEST_A, 25, 20),
                ("run-3", "release", "all", FINGERPRINT_B, None, 40, 30),
            ):
                append(root, {
                    "event": "run-terminal",
                    "run_id": run_id,
                    "stage": stage,
                    "mode": mode,
                    "scope_fingerprint": fingerprint,
                    "subject_digest": subject,
                    "status": "passed",
                    "duration_ms": duration,
                    "packs": [{
                        "id": "tests",
                        "status": "passed",
                        "duration_ms": pack_duration,
                    }],
                })
            append(root, {
                "event": "run-started",
                "run_id": "interrupted-run",
                "stage": "pre-push",
                "mode": "impacted",
                "scope_fingerprint": FINGERPRINT_B,
                "subject_digest": DIGEST_B,
            })
            summary = status(root)["validation"]
            rendered = json.dumps(summary, sort_keys=True)
            compact = compact_status(root)
            full = status(root)

        self.assertEqual(summary["retained_run_count"], 3)
        self.assertEqual(summary["mode_counts"], {"all": 1, "impacted": 2})
        self.assertEqual(summary["broad_run_count"], 1)
        self.assertEqual(summary["repeated_scope_count"], 1)
        self.assertEqual(summary["repeated_scope_run_count"], 1)
        self.assertEqual(summary["most_repeated_scope_run_count"], 2)
        self.assertEqual(summary["total_duration_ms"], 80)
        self.assertEqual(summary["runner_overhead_ms"], 20)
        self.assertEqual(summary["same_subject_repeat_run_count"], 1)
        self.assertEqual(summary["cross_stage_same_subject_run_count"], 1)
        self.assertEqual(summary["nonterminal_run_count"], 1)
        self.assertEqual(summary["slowest_packs"], [{
            "id": "tests",
            "run_count": 3,
            "total_duration_ms": 60,
            "max_duration_ms": 30,
        }])
        self.assertNotIn(DIGEST_A, rendered)
        self.assertIn("not proof", summary["interpretation"])
        self.assertIn("direct commands outside the runtime", summary["excludes"])

        self.assertEqual(compact["validation"]["same_subject_repeat_run_count"], 1)
        self.assertEqual(compact["validation"]["nonterminal_run_count"], 1)
        self.assertNotIn("orchestration", compact)
        self.assertNotIn("documentation", compact)
        self.assertLess(len(json.dumps(compact)), len(json.dumps(full)))

    def test_orchestration_values_cannot_retain_host_free_text(self) -> None:
        """Clamp outcome and proof fields to bounded enums instead of content-bearing strings."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            written = append(root, {
                "event": "orchestration-terminal",
                "terminal_outcome": "/private/source.py",
                "entries": [{
                    "role": "qa-reviewer",
                    "profile_id": "economy-high",
                    "model": "economy-model",
                    "outcome": "private prompt content",
                    "proof_result": "ran /private/test.py",
                }],
            })
            summary = status(root)["orchestration"]
        self.assertFalse(written)
        self.assertEqual(summary["delegated_entry_count"], 0)

    def test_documentation_events_are_bounded_and_summarized_without_content(self) -> None:
        """Measure initialization and routing friction without retaining authoring context."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            append(root, {
                "event": "documentation-terminal",
                "runtime_version": "1.3.0",
                "operation": "init",
                "outcome": "initialized",
                "duration_ms": 12,
                "dry_run": False,
                "created_count": 3,
                "updated_count": 1,
                "unchanged_count": 1,
                "conflict_count": 0,
                "run_id": "private-run-id",
                "scope_fingerprint": "private-fingerprint",
                "path": "/private/docs",
                "prompt": "private prompt",
            })
            append(root, {
                "event": "documentation-terminal",
                "runtime_version": "1.3.0",
                "operation": "route",
                "outcome": "matched",
                "duration_ms": 4,
                "query_kind": "capability",
                "match_count": 1,
                "query": "private-capability",
                "source": "private source",
            })
            path = root / ".governance/telemetry/runs.jsonl"
            text = path.read_text(encoding="utf-8")
            records = [json.loads(line) for line in text.splitlines()]
            summary = status(root)["documentation"]

        for forbidden in (
            "/private",
            "private prompt",
            "private-capability",
            "private source",
            "private-run-id",
            "private-fingerprint",
        ):
            self.assertNotIn(forbidden, text)
        self.assertEqual(summary["retained_operation_count"], 2)
        self.assertEqual(records[0]["runtime_version"], "1.3.0")
        self.assertEqual(summary["operation_counts"], {"init": 1, "route": 1})
        self.assertEqual(summary["outcome_counts"], {"initialized": 1, "matched": 1})
        self.assertEqual(summary["query_kind_counts"], {"capability": 1})
        self.assertEqual(summary["total_duration_ms"], 16)
        self.assertEqual(summary["created_count"], 3)
        self.assertEqual(summary["updated_count"], 1)
        self.assertEqual(summary["match_count"], 1)
        self.assertIn("not a documentation-quality score", summary["interpretation"])

    def test_documentation_events_reject_free_text_enums(self) -> None:
        """Do not retain arbitrary operation, outcome, or query-kind strings."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            written = append(root, {
                "event": "documentation-terminal",
                "operation": "/private/path",
                "outcome": "private outcome",
                "query_kind": "private query",
            })
            summary = status(root)["documentation"]
        self.assertFalse(written)
        self.assertEqual(summary["retained_operation_count"], 0)


if __name__ == "__main__":
    unittest.main()
