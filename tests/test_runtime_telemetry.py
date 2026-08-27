#!/usr/bin/env python3
"""Prove local validation telemetry is small, redacted, and advisory."""

from __future__ import annotations

import json
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
)


DIGEST_A = "sha256:" + "a" * 64
FINGERPRINT_A = "sha256:" + "1" * 64


class RuntimeTelemetryTests(unittest.TestCase):
    """Keep advisory measurements useful without retaining governed content."""

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

        self.assertEqual(records[0]["schema_version"], 2)
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
