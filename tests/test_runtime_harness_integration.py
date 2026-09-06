"""Prove default host routing without overwriting authored instructions or global wrappers."""

import os
import stat
import sys
from pathlib import Path
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from project_governance_runtime.harness_integration import (
    BLOCK, END, RESOURCE, START, harness_routing_status, install_harness_instructions,
)
from project_governance_runtime.installation import initialize, materialize_skills


class HarnessIntegrationTests(unittest.TestCase):
    """Keep adoption automatic while preserving repository and system instruction ownership."""

    def setUp(self):
        """Create one isolated adopting repository for each scenario."""
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)

    def tearDown(self):
        """Remove only this test's temporary repository."""
        self.temporary.cleanup()

    def test_adoption_defaults_all_hosts_without_a_provider_account(self):
        """Install the three named routes without native provider dependencies."""
        initialize(self.root)
        materialize_skills(self.root)
        for name in ("AGENTS.md", "CLAUDE.md", "GEMINI.md"):
            text = (self.root / name).read_text()
            self.assertIn(RESOURCE, text)
            self.assertEqual(text.count(START), 1)
        for provider in ("gemini", "claude", "codex"):
            self.assertTrue((self.root / f".governance/runtime/skills/harness-{provider}-agent/SKILL.md").is_file())
        self.assertFalse((self.root / ".governance/runtime/skills/gemini-agent").exists())
        self.assertEqual(initialize(self.root)["harness_instructions_updated"], [])

    def test_preserves_authored_bytes_and_updates_only_its_marked_section(self):
        """Retain authored line endings, permissions, and idempotent file timestamps."""
        path = self.root / "AGENTS.md"
        original = b"# Project instructions\r\nKeep this exact wording.\r\n"
        path.write_bytes(original)
        path.chmod(0o755)
        install_harness_instructions(self.root)
        self.assertTrue(path.read_bytes().endswith(original))
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o755)
        current = path.read_bytes()
        path.write_bytes(current.replace(BLOCK.encode(), (START + "\nstale pointer\n" + END).encode()))
        install_harness_instructions(self.root)
        self.assertEqual(path.read_bytes(), current)
        before = path.stat().st_mtime_ns
        self.assertEqual(install_harness_instructions(self.root), [])
        self.assertEqual(path.stat().st_mtime_ns, before)

    def test_override_file_receives_the_default_pointer(self):
        """Cover the root instruction file that Codex prefers when present."""
        override = self.root / "AGENTS.override.md"
        override.write_text("Repository override rules\n")
        install_harness_instructions(self.root)
        self.assertIn(BLOCK, override.read_text())
        self.assertTrue(override.read_text().endswith("Repository override rules\n"))

    def test_empty_override_does_not_hide_the_authored_agent_file(self):
        """Keep inactive overrides empty so Codex retains its normal instruction source."""
        override = self.root / "AGENTS.override.md"
        override.write_text(" \n")
        (self.root / "AGENTS.md").write_text("Project rules\n")
        install_harness_instructions(self.root)
        self.assertEqual(override.read_text(), " \n")
        self.assertIn("Project rules", (self.root / "AGENTS.md").read_text())
        issues = harness_routing_status(self.root)["issues"]
        self.assertFalse(any("AGENTS.override.md" in issue for issue in issues))

    @unittest.skipUnless(os.name == "posix", "symlink fixture requires POSIX")
    def test_shared_internal_symlink_keeps_one_instruction_authority(self):
        """Preserve host entry aliases and write their shared target once."""
        (self.root / "AGENTS.md").write_text("Project rules\n")
        (self.root / "CLAUDE.md").symlink_to("AGENTS.md")
        install_harness_instructions(self.root)
        self.assertTrue((self.root / "CLAUDE.md").is_symlink())
        self.assertEqual((self.root / "CLAUDE.md").read_text().count(START), 1)

    @unittest.skipUnless(os.name == "posix", "symlink fixture requires POSIX")
    def test_external_symlink_refuses_before_any_instruction_write(self):
        """Reject global instruction targets before changing any repository entry."""
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "system.md"
            target.write_text("Global wrapper preferences\n")
            (self.root / "AGENTS.md").write_text("Project rules\n")
            (self.root / "CLAUDE.md").symlink_to(target)
            with self.assertRaisesRegex(ValueError, "outside this repository"):
                install_harness_instructions(self.root)
            self.assertEqual(target.read_text(), "Global wrapper preferences\n")
            self.assertEqual((self.root / "AGENTS.md").read_text(), "Project rules\n")
            self.assertFalse((self.root / "GEMINI.md").exists())

    def test_malformed_markers_refuse_before_other_files_change(self):
        """Avoid guessing which authored text belongs to a damaged managed section."""
        (self.root / "GEMINI.md").write_text(START + "\nunclosed\n")
        with self.assertRaisesRegex(ValueError, "Malformed"):
            install_harness_instructions(self.root)
        self.assertFalse((self.root / "AGENTS.md").exists())

    @unittest.skipUnless(os.name == "posix", "symlink fixture requires POSIX")
    def test_replaceable_runtime_cannot_own_authored_entry_instructions(self):
        """Reject replaceable targets and their case-insensitive filesystem aliases."""
        target = self.root / ".governance/runtime/skills/host.md"
        target.parent.mkdir(parents=True)
        target.write_text("Authored instructions\n")
        (self.root / "AGENTS.md").symlink_to(target)
        with self.assertRaisesRegex(Exception, "managed state"):
            materialize_skills(self.root)
        self.assertEqual(target.read_text(), "Authored instructions\n")
        self.assertFalse((self.root / "CLAUDE.md").exists())
        (self.root / "AGENTS.md").unlink()
        alias = self.root / ".GOVERNANCE/runtime/skills/host.md"
        if not alias.exists():
            alias.parent.mkdir(parents=True)
            alias.write_text("Authored instructions\n")
        (self.root / "AGENTS.md").symlink_to(alias)
        with self.assertRaisesRegex(Exception, "managed state"):
            materialize_skills(self.root)
        self.assertEqual(alias.read_text(), "Authored instructions\n")

    def test_existing_bootstrap_materialization_also_installs_host_routing(self):
        """Activate upgraded wheels through the existing bootstrap contract."""
        # Existing published bootstraps call this function after wheel installation.
        materialize_skills(self.root)
        self.assertTrue((self.root / "AGENTS.md").is_file())
        self.assertTrue((self.root / RESOURCE).is_file())
        (self.root / "AGENTS.override.md").write_text("New override\n")
        self.assertTrue(any("AGENTS.override.md" in issue for issue in harness_routing_status(self.root)["issues"]))
        materialize_skills(self.root)
        self.assertIn(BLOCK, (self.root / "AGENTS.override.md").read_text())

    def test_doctor_reports_drift_without_claiming_global_precedence(self):
        """Expose missing route dependencies without certifying arbitrary host instructions."""
        materialize_skills(self.root)
        state = harness_routing_status(self.root)
        self.assertEqual(state["default_route"], "harness")
        self.assertEqual(state["global_instruction_conflicts"], "not automatically certified")
        self.assertTrue(any("executable" in issue for issue in state["issues"]))
        executable = Path(state["executable"])
        executable.parent.mkdir(exist_ok=True)
        executable.write_text("fixture executable; never invoked\n")
        executable.chmod(0o755)
        self.assertEqual(harness_routing_status(self.root)["status"], "ready")
        skill = self.root / ".governance/runtime/skills/harness-gemini-agent/SKILL.md"
        skill.unlink()
        self.assertTrue(any("harness-gemini-agent" in issue for issue in harness_routing_status(self.root)["issues"]))
        materialize_skills(self.root)
        (self.root / "CLAUDE.md").write_text("Missing the routing section\n")
        self.assertEqual(harness_routing_status(self.root)["status"], "needs-attention")
