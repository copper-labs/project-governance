#!/usr/bin/env python3
"""Prove prose checks stay scoped to the runtime changed-path packet."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RuntimeProseCheckerTests(unittest.TestCase):
    """Keep product edits from triggering a repository-wide prose scan."""

    def test_changed_packet_checks_only_selected_live_markdown(self) -> None:
        """Report one selected marker while ignoring an unrelated documentation file."""
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "docs").mkdir()
            (target / "docs/selected.md").write_text("TODO finish\n", encoding="utf-8")
            (target / "docs/unselected.md").write_text("TBD later\n", encoding="utf-8")
            packet = {
                "kind": "project-governance-change-packet",
                "version": 1,
                "scope": "changed",
                "mode": "changed",
                "base_ref": "fixture",
                "records": [{
                    "status": "added",
                    "path": "docs/selected.md",
                    "previous_path": None,
                    "before_path": None,
                    "after_path": str((target / "docs/selected.md").resolve()),
                    "changed_ranges": [{"start": 1, "end": 1}],
                }],
            }
            packet_path = target / "change-packet.json"
            packet_path.write_text(json.dumps(packet), encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "project_governance_runtime.checkers",
                    "prose",
                    "--changed",
                ],
                cwd=target,
                env={
                    **os.environ,
                    "PYTHONPATH": str(ROOT / "src"),
                    "PROJECT_GOVERNANCE_CHANGE_PACKET": str(packet_path.resolve()),
                },
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "warning")
        self.assertEqual(payload["finding_count"], 1)
        self.assertEqual(payload["findings"][0]["path"], "docs/selected.md")


if __name__ == "__main__":
    unittest.main()
