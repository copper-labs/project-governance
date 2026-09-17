#!/usr/bin/env python3
"""Verify the packaged Apple dependency checker retains its schema extension seam."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "src/project_governance_runtime/checker_scripts/check-apple-dependencies.py"


class RuntimeAppleDependencyCheckerTests(unittest.TestCase):
    """Protect the direct checker contract that package dispatch forwards unchanged."""

    def test_plans_require_approval_only_for_cocoapods(self) -> None:
        """Keep SwiftPM discoverable while restricting the approval gate to CocoaPods."""
        cases = (
            ("Implement a microphone test.", False),
            ("Package this framework with SwiftPM.", False),
            ("Use Swift Package Manager.", False),
            ("Use CocoaPods for dependencies.", True),
            ("Add a Podfile.", True),
            ("Publish a framework.podspec.", True),
            ("Use SwiftPM and CocoaPods.", True),
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "docs/exec-plans/active/plan.md"
            plan.parent.mkdir(parents=True)
            exceptions = root / "exceptions.yaml"
            exceptions.write_text("version: 1\nowner: fixture\nexceptions: []\n", encoding="utf-8")
            for content, blocked in cases:
                for work_id in ("", "planned-work"):
                    with self.subTest(content=content, work_id=work_id):
                        plan.write_text(content, encoding="utf-8")
                        completed = subprocess.run(
                            [sys.executable, str(CHECKER), "--path",
                             "docs/exec-plans/active/plan.md", "--exceptions", str(exceptions),
                             "--exceptions-schema", str(ROOT / "src/project_governance_runtime/defaults/schemas/apple-dependency-exception.schema.json"),
                             "--work-id", work_id],
                            cwd=root, text=True, capture_output=True, check=False,
                        )
                        report = json.loads(completed.stdout)
                        self.assertEqual(completed.returncode, int(blocked), report)
                        self.assertEqual(
                            any(item["rule_id"] == "apple.cocoapods-planning-approval"
                                for item in report["findings"]), blocked,
                        )
                        if "Swift" in content and not blocked:
                            self.assertEqual(report["status"], "passed")

    def test_custom_exception_schema_preserves_approved_cocoapods_path(self) -> None:
        """Use the selected schema when validating a current path-bound exception."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs/exec-plans").mkdir(parents=True)
            (root / "docs/exec-plans/plan.md").write_text("Use CocoaPods.\n", encoding="utf-8")
            (root / "Podfile").write_text("platform :ios, '17.0'\n", encoding="utf-8")
            exceptions = root / "exceptions.yaml"
            exceptions.write_text(
                yaml.safe_dump(
                    {
                        "exceptions": [
                            {
                                "path_globs": ["Podfile"],
                                "status": "approved",
                                "operator": "governance operator",
                                "approved_on": "2026-08-11",
                                "rationale": "The upstream bridge currently requires CocoaPods.",
                                "reason": "migration-bridge",
                                "work_id": "apple-bridge",
                                "expires": "2099-01-01",
                            }
                        ]
                    },
                    sort_keys=False,
                ),
                encoding="utf-8",
            )
            schema = root / "exception-extension.schema.json"
            schema.write_text(
                json.dumps(
                    {
                        "type": "object",
                        "required": ["exceptions"],
                        "properties": {"exceptions": {"type": "array"}},
                    }
                ),
                encoding="utf-8",
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(CHECKER),
                    "--path",
                    "Podfile",
                    "--path",
                    "docs/exec-plans/plan.md",
                    "--exceptions",
                    str(exceptions),
                    "--exceptions-schema",
                    str(schema),
                    "--work-id",
                    "apple-bridge",
                ],
                cwd=root,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["finding_count"], 0)


if __name__ == "__main__":
    unittest.main()
