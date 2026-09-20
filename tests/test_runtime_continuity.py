"""Verify continuity launch ownership without requiring a provider or a source runtime install."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from project_governance_runtime import continuity


class ContinuityLaunchTests(unittest.TestCase):
    """Keep the installed module bound to its own executable generation and runtime lease."""

    def test_missing_node_is_actionable_before_launch(self):
        with patch.object(continuity.shutil, "which", return_value=None):
            self.assertEqual(continuity.main(["doctor"]), 2)

    def test_command_pins_generation_and_preserves_arguments(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = root / "assets/harness/src"
            payload.mkdir(parents=True)
            (payload / "cli.ts").write_text("// fixture\n")
            for name in ("python", "harness-agent", "project-governance"):
                (root / name).touch()
            with patch.object(continuity, "files", return_value=root), \
                 patch.object(continuity.sys, "executable", str(root / "python")), \
                 patch.object(continuity.shutil, "which", return_value="/qualified/node"), \
                 patch.object(continuity.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)), \
                 patch.dict(os.environ, {"GOVERNANCE_CONTINUITY_EXECUTOR": "/wrong/owner"}):
                argv, environment = continuity.command(["task", "create", "--outcome", "two words"])
            self.assertEqual(argv[-4:], ["task", "create", "--outcome", "two words"])
            self.assertEqual(environment["GOVERNANCE_CONTINUITY_EXECUTOR"], str(root / "harness-agent"))
            self.assertEqual(environment["GOVERNANCE_CONTINUITY_COMMAND"], str(root / "project-governance"))

    def test_invalid_node_features_are_refused(self):
        with patch.object(continuity.shutil, "which", return_value="/node"), \
             patch.object(continuity.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)):
            self.assertEqual(continuity.main(["doctor"]), 2)

    def test_signal_exit_retains_failure(self):
        with patch.object(continuity, "command", return_value=(["node"], {})), \
             patch.object(continuity.subprocess, "run", return_value=subprocess.CompletedProcess([], -15)):
            self.assertEqual(continuity.main([]), 143)

    def test_main_help_advertises_continuity(self):
        from project_governance_runtime.cli import _parser

        self.assertIn("harness", _parser().format_help())
        self.assertEqual(_parser().parse_args(["harness", "task", "list"]).arguments, ["task", "list"])
