"""Prove startup update boundaries, compatibility, and preservation of existing project work."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from project_governance_runtime.installation import LOCK_PATH
from project_governance_runtime.runtime_access import installation_root, runtime_reader
from project_governance_runtime.startup import handle_event
from project_governance_runtime.startup_git import assert_unchanged, snapshot
from project_governance_runtime.startup_installation import active_environment
from project_governance_runtime.startup_releases import _discover, eligible, version
from project_governance_runtime.startup_state import StartupError, digest, exclusive, git, read_json, state_root, task_path, write_json
from project_governance_runtime.startup_transaction import apply, recover


class Adopter:
    """Create an ordinary Git repository with a disposable installed-runtime identity."""

    def __init__(self, root):
        self.root = root
        subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)
        git(root, "config", "user.email", "fixture@example.invalid")
        git(root, "config", "user.name", "Fixture")
        git(root, "config", "commit.gpgsign", "false")
        (root / "config/governance").mkdir(parents=True)
        (root / ".gitignore").write_text(".governance/\n")
        (root / "config/governance/profile.yaml").write_text("schema_version: 1\nruntime_updates:\n  policy: compatible\n")
        self.old = self.lock("2.5.0", "a" * 64)
        (root / LOCK_PATH).write_text(json.dumps(self.old, indent=2) + "\n")
        (root / "source.txt").write_text("original\n")
        git(root, "add", ".")
        git(root, "commit", "-qm", "Initialize fixture")
        self.previous = self.environment("initial", "2.5.0")
        (root / ".governance/runtime").symlink_to("runtimes/initial", target_is_directory=True)
        self.destination = self.environment("candidate", "2.5.1")
        self.new = self.lock("2.5.1", "b" * 64)
        raw = json.dumps(self.new, indent=2) + "\n"
        self.metadata = {"schema_version": 1, "version": "2.5.1", "lock_sha256": digest(raw.encode()),
                         "startup_contract": 1, "automatic": True, "from_version": "2.5.0",
                         "before_version": "3.0.0", "configuration_schema": 2, "integration_change": False}
        self.candidate = {"status": "available", "reason": "fixture", "version": "2.5.1", "lock_text": raw,
                          "metadata": self.metadata, "wheel": {}}
        self.task_id = "c" * 64
        self.session = os.environ.get("CODEX_THREAD_ID") or "fixture-root"
        write_json(task_path(root, self.task_id), {"task_id": self.task_id, "provider": "codex",
                   "session_id": self.session, "root": str(root), "state": "open",
                   "lock_digest": digest((root / LOCK_PATH).read_bytes()), "version": "2.5.0", "result": self.candidate})

    def lock(self, selected, sha):
        return {"schema_version": 1, "package": "project-governance-runtime", "version": selected,
                "wheel": "project_governance_runtime-" + selected + "-py3-none-any.whl", "sha256": sha,
                "source_commit": "a" * 40, "python": ">=3.9,<4", "configuration_schema": 2,
                "release_base_url": "https://github.com/example/governance/releases/download"}

    def environment(self, name, selected):
        directory = self.root / ".governance/runtimes" / name
        (directory / "bin").mkdir(parents=True)
        (directory / "bin/python").symlink_to(sys.executable)
        command = directory / "bin/project-governance"
        command.write_text("#!" + sys.executable + "\nimport json\nprint(json.dumps(" + repr({"status": "passed", "runtime_version": selected}) + "))\n")
        command.chmod(0o755)
        return directory

    def run(self, state="minor"):
        with patch("project_governance_runtime.startup_transaction.prepare", return_value=self.destination):
            return apply(self.root, self.task_id, state, "Only an isolated small change is underway")


class StartupBoundaryTests(unittest.TestCase):
    """Exclude all delegated and continuation paths before attempting release discovery."""

    def test_child_and_unknown_events_do_not_discover_or_create_state(self):
        with tempfile.TemporaryDirectory() as directory, patch("project_governance_runtime.startup_releases.discover") as discover:
            root = Path(directory).resolve()
            for event in ({"hook_event_name": "SubagentStart"}, {"hook_event_name": "SessionStart", "agent_id": "child"}, {}):
                self.assertEqual(handle_event(root, "codex", event)["status"], "deferred")
            with patch.dict(os.environ, {"HARNESS_AGENT_ANCESTRY": "malformed-but-delegated"}):
                self.assertEqual(handle_event(root, "codex", {"hook_event_name": "SessionStart"})["status"], "deferred")
            discover.assert_not_called()
            self.assertFalse((root / ".governance").exists())

    def test_continuations_and_duplicate_startup_make_no_new_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch("project_governance_runtime.startup_releases.discover", return_value={"status": "current", "reason": "fixture"}) as discover, patch("project_governance_runtime.startup.host_owner", return_value=None):
                for source in ("resume", "fork", "compact", "clear"):
                    answer = handle_event(f.root, "codex", {"hook_event_name": "SessionStart", "session_id": source, "source": source})
                    self.assertEqual(answer["status"], "deferred")
                discover.assert_not_called()
                event = {"hook_event_name": "SessionStart", "session_id": "fresh", "source": "startup"}
                first = handle_event(f.root, "codex", event)
                self.assertEqual(handle_event(f.root, "codex", event), first)
                self.assertEqual(discover.call_count, 1)

    def test_unapproved_policy_and_unsupported_provider_do_not_discover(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            event = {"hook_event_name": "SessionStart", "session_id": "new", "source": "startup"}
            with patch("project_governance_runtime.startup_releases.discover") as discover:
                self.assertEqual(handle_event(f.root, "gemini", event)["status"], "deferred")
                (f.root / "config/governance/profile.yaml").write_text("runtime_updates:\n  policy: compatible\n")
                self.assertEqual(handle_event(f.root, "codex", event)["status"], "deferred")
                discover.assert_not_called()


class StartupCompatibilityTests(unittest.TestCase):
    """Require both semantic compatibility and exact published artifact identity."""

    def test_semantic_order_and_prerelease_exclusion(self):
        self.assertGreater(version("2.10.0"), version("2.9.99"))
        for value in ("02.1.0", "2.1.0-rc.1", "2.1", "v2.1.0"):
            with self.assertRaises(StartupError):
                version(value)

    def test_manifest_binds_source_range_schema_and_exact_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            raw = f.candidate["lock_text"].encode()
            self.assertEqual(eligible(f.old, raw, f.metadata), f.new)
            for change in ({"lock_sha256": "0" * 64}, {"from_version": "2.5.1"}, {"automatic": False},
                           {"configuration_schema": 3}, {"integration_change": True}, {"startup_contract": 2}):
                with self.assertRaises(StartupError):
                    eligible(f.old, raw, {**f.metadata, **change})
            for change in ({"version": "3.0.0"}, {"python": ">=3.12,<4"}, {"release_base_url": "https://github.com/other/repo/releases/download"}):
                modified = json.dumps({**f.new, **change}).encode()
                with self.assertRaises(StartupError):
                    eligible(f.old, modified, {**f.metadata, "lock_sha256": digest(modified)})

    def test_incomplete_release_listing_does_not_claim_current(self):
        class Listing:
            api = "https://api.github.com/repos/example/governance"

            def json(self, url):
                return [{"tag_name": "3.0.0", "draft": False, "prerelease": False}] * 100

        with self.assertRaises(StartupError):
            _discover({"version": "2.5.0"}, Listing())


class StartupTransactionTests(unittest.TestCase):
    """Exercise real Git commits, hook failures, concurrent ownership, and crash recovery."""

    def setUp(self):
        """Provide the native root identity for synthetic top-level transaction calls."""
        environment = patch.dict(os.environ, {"CODEX_THREAD_ID": "fixture-root"})
        environment.start()
        self.addCleanup(environment.stop)

    def test_minor_work_and_unrelated_index_survive_the_isolated_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            (f.root / "source.txt").write_text("staged minor fix\n")
            git(f.root, "add", "source.txt")
            staged = git(f.root, "show", ":source.txt")
            (f.root / "source.txt").write_text("staged minor fix\nadditional unstaged edit\n")
            (f.root / "a[1]\nnotes.txt").write_text("unrelated untracked work\n")
            hook = f.root / ".git/hooks/pre-commit"
            hook.write_text("#!/bin/sh\nset -eu\n[ \"$(git diff --cached --name-only)\" = config/governance/runtime.lock.yaml ]\n")
            hook.chmod(0o755)
            before = snapshot(f.root)
            answer = f.run()
            self.assertEqual(answer["status"], "updated")
            self.assertEqual(git(f.root, "show", ":source.txt"), staged)
            self.assertEqual(active_environment(f.root), f.destination)
            assert_unchanged(f.root, before, committed=True)
            self.assertFalse((state_root(f.root) / "transaction.json").exists())

    def test_substantial_plan_review_and_read_only_never_prepare(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch("project_governance_runtime.startup_transaction.prepare") as prepare:
                for state in ("substantial-plan", "review", "read-only"):
                    self.assertEqual(apply(f.root, f.task_id, state, "Current work needs its rules")["status"], "deferred")
                prepare.assert_not_called()

    def test_minor_commit_during_preparation_refreshes_the_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())

            def prepare(*args):
                (f.root / "source.txt").write_text("small completed correction\n")
                git(f.root, "add", "source.txt")
                git(f.root, "commit", "-qm", "Finish minor correction")
                return f.destination

            with patch("project_governance_runtime.startup_transaction.prepare", side_effect=prepare):
                self.assertEqual(apply(f.root, f.task_id, "minor", "Independent minor work")["status"], "updated")
            self.assertEqual(git(f.root, "show", "HEAD:source.txt"), b"small completed correction\n")

    def test_hook_cannot_substitute_the_verified_lock(self):
        """Keep the prepared artifact identity authoritative even when a hook rewrites the lock."""
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            hook = f.root / ".git/hooks/pre-commit"
            hook.write_text("#!/bin/sh\n" + sys.executable + " -c 'import json; from pathlib import Path; p=Path(\"config/governance/runtime.lock.yaml\"); v=json.loads(p.read_text()); v[\"sha256\"]=\"f\"*64; p.write_text(json.dumps(v))'\ngit add config/governance/runtime.lock.yaml\n")
            hook.chmod(0o755)
            with self.assertRaises(StartupError) as raised:
                f.run()
            self.assertEqual(raised.exception.status, "recovery-required")
            self.assertTrue((state_root(f.root) / "transaction.json").exists())
            self.assertEqual(json.loads((f.root / LOCK_PATH).read_text())["sha256"], "f" * 64)

    def test_failed_commit_hook_restores_the_previous_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            head = git(f.root, "rev-parse", "HEAD")
            original = (f.root / LOCK_PATH).read_bytes()
            hook = f.root / ".git/hooks/pre-commit"
            hook.write_text("#!/bin/sh\nexit 1\n")
            hook.chmod(0o755)
            with self.assertRaises(StartupError):
                f.run()
            self.assertEqual(git(f.root, "rev-parse", "HEAD"), head)
            self.assertEqual((f.root / LOCK_PATH).read_bytes(), original)
            self.assertEqual(active_environment(f.root), f.previous)
            self.assertFalse((state_root(f.root) / "transaction.json").exists())

    def test_external_mutation_is_preserved_and_requires_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            hook = f.root / ".git/hooks/pre-commit"
            hook.write_text("#!/bin/sh\necho independent > source.txt\nexit 1\n")
            hook.chmod(0o755)
            with self.assertRaises(StartupError) as raised:
                f.run()
            self.assertEqual(raised.exception.status, "recovery-required")
            self.assertEqual((f.root / "source.txt").read_text(), "independent\n")
            self.assertTrue((state_root(f.root) / "transaction.json").exists())

    def test_runtime_readers_and_other_tasks_prevent_replacement(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with runtime_reader(f.root):
                with self.assertRaises(StartupError):
                    f.run()
            write_json(task_path(f.root, "d" * 64), {"state": "open", "owner": None})
            with self.assertRaises(StartupError):
                f.run()
            self.assertEqual(active_environment(f.root), f.previous)

    def test_child_cannot_use_the_parent_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch.dict(os.environ, {"CODEX_THREAD_ID": "different-child"}):
                with self.assertRaises(StartupError):
                    f.run()
            with patch.dict(os.environ, {"HARNESS_AGENT_ANCESTRY": "[]"}):
                with self.assertRaises(StartupError):
                    f.run()

    def test_interruption_after_activation_is_recoverable(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch("project_governance_runtime.startup_transaction._run", side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):
                    f.run()
            self.assertTrue((state_root(f.root) / "transaction.json").exists())
            self.assertEqual(recover(f.root)["status"], "deferred")
            self.assertEqual(active_environment(f.root), f.previous)

    def test_generational_runtime_uses_the_same_repository_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.assertEqual(installation_root(root / ".governance/runtimes/exact"), root)
            self.assertEqual(installation_root(root / ".governance/runtime"), root)
            self.assertIsNone(installation_root(root / "external-env"))


class StartupAdditionalSafetyTests(unittest.TestCase):
    """Cover approval and recovery boundaries that are independent of the happy path."""

    def test_resuming_available_task_revokes_its_application_opportunity(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            event = dict(hook_event_name="SessionStart", source="startup", session_id="native-resume")
            with patch("project_governance_runtime.startup_releases.discover", return_value=f.candidate):
                started = handle_event(f.root, "codex", event)
            event["source"] = "resume"
            resumed = handle_event(f.root, "codex", event)
            self.assertEqual(resumed["status"], "deferred")
            self.assertEqual(read_json(task_path(f.root, started["task_id"]))["result"]["status"], "deferred")

    def test_staged_authority_with_restored_worktree_is_not_eligible(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            path = f.root / LOCK_PATH
            original = path.read_bytes()
            path.write_text(f.candidate["lock_text"])
            git(f.root, "add", LOCK_PATH.as_posix())
            path.write_bytes(original)
            with self.assertRaises(StartupError):
                snapshot(f.root)

    def test_policy_commit_during_preparation_defers_without_replacing_runtime(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"CODEX_THREAD_ID": "fixture-root"}):
            f = Adopter(Path(directory).resolve())
            def prepare(*args):
                profile = f.root / "config/governance/profile.yaml"
                profile.write_text(profile.read_text().replace("compatible", "manual"))
                git(f.root, "add", "config/governance/profile.yaml")
                git(f.root, "commit", "-qm", "Change fixture policy")
                return f.destination
            with patch("project_governance_runtime.startup_transaction.prepare", side_effect=prepare):
                with self.assertRaises(StartupError):
                    apply(f.root, f.task_id, "minor", "Only a minor fix is underway")
            self.assertEqual(active_environment(f.root), f.previous)

    def test_unknown_resume_and_lock_busy_startup_reserve_before_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with exclusive(state_root(f.root) / "update.lock"), patch("project_governance_runtime.startup_releases.discover") as discovery:
                answers = [handle_event(f.root, "codex", dict(hook_event_name="SessionStart", source=source, session_id=source))
                           for source in ("resume", "startup")]
            discovery.assert_not_called()
            for answer in answers:
                self.assertEqual(read_json(task_path(f.root, answer["task_id"]))["state"], "open")
            with self.assertRaises(StartupError):
                f.run()

    def test_enable_interruption_before_rename_recovers_intact_original(self):
        from project_governance_runtime.startup_integration import recover_enable
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            runtime = f.root / ".governance/runtime"
            runtime.unlink()
            runtime.mkdir()
            info = runtime.stat()
            state = state_root(f.root)
            write_json(state / "enable.json", {"previous": str(f.previous.parent / "not-moved"),
                       "candidate": str(f.destination), "lock_digest": digest((f.root / LOCK_PATH).read_bytes()),
                       "original_device": info.st_dev, "original_inode": info.st_ino})
            self.assertEqual(recover_enable(f.root)["status"], "deferred")
            self.assertTrue(runtime.is_dir())
            self.assertFalse((state / "enable.json").exists())

    def test_worker_returns_cross_worktree_and_changed_lock_to_parent(self):
        from project_governance_runtime.provider_agents.config import AgentError
        from project_governance_runtime.provider_agents.runtime import binding, validate
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch("project_governance_runtime.provider_agents.runtime.installation_root", return_value=f.root):
                pin = binding(str(f.root))
                self.assertEqual(pin["lock_digest"], digest((f.root / LOCK_PATH).read_bytes()))
                with self.assertRaises(AgentError):
                    validate({"workspace": str(f.root), "runtime_binding": {**pin, "version": "wrong"}})
                with tempfile.TemporaryDirectory() as other:
                    with self.assertRaises(AgentError):
                        binding(other)
            with patch("project_governance_runtime.provider_agents.runtime.installation_root", return_value=None):
                with self.assertRaises(AgentError):
                    binding(str(f.root))

    def test_nested_worker_cannot_discard_its_inherited_runtime(self):
        from project_governance_runtime.provider_agents.config import AgentError
        from project_governance_runtime.provider_agents.runtime import binding
        with tempfile.TemporaryDirectory() as directory:
            f = Adopter(Path(directory).resolve())
            with patch("project_governance_runtime.provider_agents.runtime.installation_root", return_value=f.root), patch.dict(os.environ, {"GOVERNANCE_PARENT_TASK": "parent", "GOVERNANCE_PARENT_LOCK_DIGEST": "d" * 64}):
                with self.assertRaises(AgentError):
                    binding(str(f.root))
                with self.assertRaises(AgentError):
                    binding("/tmp")

    def test_mutated_native_hook_config_is_rejected_without_overwrite(self):
        from project_governance_runtime.startup_integration import hook_config
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / ".codex").mkdir()
            target = root / ".codex/hooks.json"
            target.write_text('{"hooks":{"SessionStart":[false]}}')
            with self.assertRaises(StartupError):
                hook_config(root, "codex")
            self.assertEqual(target.read_text(), '{"hooks":{"SessionStart":[false]}}')


if __name__ == "__main__":
    unittest.main()
