#!/usr/bin/env python3
"""Exercise packet-selected live Markdown through the packaged documentation checker."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-doc-governance.py"


def run_checker(root: Path, path: str, *, expected: int) -> dict[str, object]:
    """Run one packet-selected document and decode the required JSON envelope."""
    packet_path = root / "change-packet.json"
    packet_path.write_text(json.dumps({
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": "changed",
        "mode": "changed",
        "base_ref": "fixture",
        "records": [{
            "status": "added",
            "path": path,
            "previous_path": None,
            "before_path": None,
            "after_path": str((root / path).resolve()),
            "changed_ranges": [{"start": 1, "end": 1}],
        }],
    }), encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(CHECKER), "--changed"],
        cwd=root,
        env={
            **os.environ,
            "PYTHONPATH": os.pathsep.join([str(ROOT / "src"), str(CHECKER.parent)]),
            "PROJECT_GOVERNANCE_CHANGE_PACKET": str(packet_path.resolve()),
        },
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != expected:
        raise AssertionError(result.stdout + result.stderr)
    return json.loads(result.stdout)


class RuntimeDocumentationCheckerTests(unittest.TestCase):
    """Protect lock-free changed-document validation and normalized failure reporting."""

    def test_changed_markdown_needs_no_generated_files_lock(self) -> None:
        """Validate a live document and expose both normalized terminal states without a ledger."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            document = root / "docs" / "live.md"
            document.parent.mkdir()
            document.write_text(
                "---\n"
                "id: docs.live\n"
                "title: Live Document\n"
                "type: guide\n"
                "status: current\n"
                "owner: governance\n"
                "created: 2026-08-11\n"
                "updated: 2026-08-11\n"
                "summary: Proves lock-free changed-document validation.\n"
                "---\n\n"
                "# Live Document\n",
                encoding="utf-8",
            )
            self.assertFalse((root / "config/governance/runtime-ownership.yaml").exists())
            passed = run_checker(root, "docs/live.md", expected=0)
            document.write_text("# Missing Frontmatter\n", encoding="utf-8")
            failed = run_checker(root, "docs/live.md", expected=1)
        self.assertEqual(passed["status"], "passed")
        self.assertEqual(passed["findings"], [])
        self.assertEqual(failed["status"], "failed")
        self.assertGreaterEqual(failed["finding_count"], 1)
        self.assertEqual(failed["findings"][0]["rule_id"], "documentation.governance")

    def test_root_instruction_markdown_does_not_require_governed_doc_frontmatter(self) -> None:
        """Keep normal README and agent instruction files compatible with the docs pack."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            readme = root / "README.md"
            readme.write_text("# Project\n", encoding="utf-8")
            result = run_checker(root, "README.md", expected=0)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["findings"], [])

    def test_doc_type_accepts_target_owned_vocabulary(self) -> None:
        """Accept target-owned document types without teaching the generic runtime their names."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            document = root / "docs" / "contract.md"
            document.parent.mkdir()
            document.write_text(
                "---\n"
                "id: docs.contract\n"
                "title: Contract\n"
                "doc_type: execution_plan\n"
                "status: current\n"
                "owner: governance\n"
                "created: 2026-08-11\n"
                "updated: 2026-08-11\n"
                "summary: Uses the alternate generic document type field.\n"
                "---\n\n"
                "# Contract\n",
                encoding="utf-8",
            )
            result = run_checker(root, "docs/contract.md", expected=0)
        self.assertEqual(result["status"], "passed")

    def test_active_execution_plan_requires_exec_plan_type_and_index_entry(self) -> None:
        """Keep active-plan lifecycle and discoverability explicit."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "docs/exec-plans/active/work.md"
            plan.parent.mkdir(parents=True)
            index = root / "docs/exec-plans/README.md"
            index.parent.mkdir(parents=True, exist_ok=True)
            index.write_text("# Plans\n", encoding="utf-8")
            plan.write_text(
                "---\n"
                "id: exec-plan.work\n"
                "title: Work\n"
                "type: plan\n"
                "status: active\n"
                "owner: governance\n"
                "created: 2026-08-16\n"
                "updated: 2026-08-16\n"
                "summary: Execute bounded work.\n"
                "---\n\n# Work\n",
                encoding="utf-8",
            )
            wrong_type = run_checker(root, "docs/exec-plans/active/work.md", expected=1)
            self.assertTrue(any("type must be exec-plan" in item["message"] for item in wrong_type["findings"]))
            plan.write_text(plan.read_text(encoding="utf-8").replace("type: plan", "type: exec-plan"), encoding="utf-8")
            unindexed = run_checker(root, "docs/exec-plans/active/work.md", expected=1)
            self.assertTrue(any("not linked" in item["message"] for item in unindexed["findings"]))
            index.write_text("# Plans\n\n- [Work](./active/work.md)\n", encoding="utf-8")
            passed = run_checker(root, "docs/exec-plans/active/work.md", expected=0)
        self.assertEqual(passed["status"], "passed")

    def test_enabled_module_uses_the_existing_documentation_checker(self) -> None:
        """Validate catalog routes without registering a second documentation pack."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "config/governance/profile.yaml"
            profile.parent.mkdir(parents=True)
            profile.write_text(
                "schema_version: 1\n"
                "project_extensions: []\n"
                "documentation:\n"
                "  enabled: true\n"
                "  root: docs/developer\n"
                "  research: allowed\n",
                encoding="utf-8",
            )
            docs = root / "docs/developer"
            docs.mkdir(parents=True)
            index = docs / "index.md"
            index.write_text(
                "---\n"
                "id: developer.index\n"
                "title: Developer Documentation\n"
                "type: guide\n"
                "status: current\n"
                "owner: repository\n"
                "created: 2026-08-21\n"
                "updated: 2026-08-21\n"
                "summary: Routes developer documentation.\n"
                "---\n\n# Developer Documentation\n",
                encoding="utf-8",
            )
            (docs / "catalog.yaml").write_text(
                "version: 1\ncapabilities: []\n", encoding="utf-8"
            )
            passed = run_checker(root, "config/governance/profile.yaml", expected=0)
            (docs / "catalog.yaml").write_text("version: 2\ncapabilities: []\n", encoding="utf-8")
            failed = run_checker(root, "config/governance/profile.yaml", expected=1)
        self.assertEqual(passed["status"], "passed")
        self.assertTrue(any("version must be 1" in item["message"] for item in failed["findings"]))


if __name__ == "__main__":
    unittest.main()
