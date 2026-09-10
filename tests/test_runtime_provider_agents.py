"""Prove optional provider jobs through real pipes and deterministic native-protocol fixtures."""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

if sys.platform not in {"darwin", "linux"}:
    raise unittest.SkipTest("optional provider execution requires macOS or Linux")

import fcntl

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.provider_agents import jobs
from project_governance_runtime.provider_agents.config import AgentError, TERMINAL, binding
from project_governance_runtime.provider_agents.processes import collect, record, same_process, signal_record
from project_governance_runtime.provider_agents.storage import Store, atomic_json, events_since, read_json


FIXTURE = ROOT / "tests/fixtures/provider_agent.py"


class ProviderAgentCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.env = patch.dict(os.environ, {
            "HARNESS_AGENT_STATE": str(self.root / "state"),
            "HARNESS_AGENT_ANCESTRY": "[]",
            "PROVIDER_AGENT_FIXTURE_LOG": str(self.root / "logs"),
            "PROVIDER_AGENT_FIXTURE_SCENARIO": "normal", "PYTHONPATH": str(ROOT / "src"),
        })
        self.env.start()
        self.store = Store()

    def tearDown(self):
        for path, value in list(self.store.records()):
            if value["state"] not in TERMINAL:
                jobs.cancel(path.name)
                self.await_result(path.name)
            end = time.monotonic() + 5
            while any(same_process(read_json(path / name)) for name in ("worker.json", "guardian.json")):
                if time.monotonic() >= end:
                    self.fail("worker or guardian outlived terminal cleanup")
                time.sleep(.05)
        self.env.stop()
        self.temporary.cleanup()

    def start(self, provider="gemini", **options):
        return jobs.start("Exercise the native job", str(self.workspace), provider=provider,
                          model="fixture-model", effort="high", executable=str(FIXTURE),
                          required_tools=["command"], **options)

    def await_result(self, job_id, timeout=15):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            result = jobs.result(job_id)
            if result["ready"]:
                return result
            time.sleep(.05)
        self.fail("job did not finish: " + str(jobs.status(job_id)))

    def ready(self):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            if (self.root / "logs/ready").exists():
                return
            time.sleep(.05)
        self.fail("fixture did not reach its running marker")


class ProviderAgentTests(ProviderAgentCase):
    def test_three_native_protocols_complete_and_resume_exactly(self):
        for provider in ("gemini", "claude", "codex"):
            with self.subTest(provider=provider):
                first = self.start(provider)
                result = self.await_result(first["job_id"])
                self.assertEqual(result["state"], "succeeded", result)
                self.assertEqual(result["observed_model"], "fixture-model")
                self.assertTrue(result["cleanup_confirmed"])
                self.assertEqual(result["observed_effort"], "high" if provider == "codex" else None)
                events = jobs.events(first["job_id"])["events"]
                self.assertLess(next(i for i, e in enumerate(events) if e["type"] == "text"),
                                next(i for i, e in enumerate(events) if e["type"] == "finished"))
                follow = jobs.follow_up(first["job_id"], "Continue that exact conversation")
                again = self.await_result(follow["job_id"])
                self.assertEqual(again["state"], "succeeded", again)
                self.assertEqual(again["conversation_id"], result["conversation_id"])
                self.assertEqual(again["parent_job_id"], first["job_id"])

    def test_failures_cannot_become_successful_results(self):
        cases = {"wrong_model": "failed", "wrong_permissions": "failed", "startup_error": "failed",
                 "malformed": "failed", "truncated": "failed", "missing_result": "failed",
                 "session_drift": "failed", "invalid_completion": "failed", "blocked": "blocked",
                 "remaining": "blocked", "denied": "blocked", "no_tools": "blocked", "missing_artifact": "blocked"}
        for provider in ("gemini", "claude", "codex"):
            for scenario, expected in cases.items():
                with self.subTest(provider=provider, scenario=scenario):
                    os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = scenario
                    result = self.await_result(self.start(provider)["job_id"])
                    self.assertEqual(result["state"], expected, result)
                    self.assertTrue(result["cleanup_confirmed"])

    def test_fallback_is_rejected(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "fallback"
        for provider in ("claude", "codex"):
            result = self.await_result(self.start(provider)["job_id"])
            self.assertEqual(result["state"], "failed", result)

    def test_gemini_cannot_credit_another_sessions_tool_evidence(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "intermediate_session_drift"
        value = self.await_result(self.start("gemini")["job_id"])
        self.assertEqual(value["state"], "failed", value)
        self.assertEqual(value["observed_tools"], [])

    def test_bidirectional_codex_requests_receive_responses_and_cleanup(self):
        for scenario in ("callback_init", "callback_turn"):
            os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = scenario
            log = self.root / "logs/input.jsonl"
            log.unlink(missing_ok=True)
            value = self.await_result(self.start("codex")["job_id"])
            self.assertEqual(value["state"], "blocked", value)
            self.assertTrue(value["denied_actions"])
            messages = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertTrue(any(m.get("id") == 90 and "result" in m for m in messages), messages)

    def test_nonzero_exit_and_headless_provider_that_never_exits(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "nonzero"
        for provider in ("gemini", "claude", "codex"):
            value = self.await_result(self.start(provider)["job_id"])
            self.assertEqual(value["state"], "failed", value)
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "no_exit"
        for provider in ("gemini", "claude"):
            value = self.await_result(self.start(provider, timeout_seconds=1)["job_id"])
            self.assertEqual(value["state"], "timed_out", value)

    def test_queue_idempotency_and_cancel_before_launch(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        first = self.start(idempotency_key="one")
        self.ready()
        self.assertEqual(self.start(idempotency_key="one")["job_id"], first["job_id"])
        second = self.start()
        self.assertEqual(second["state"], "queued")
        jobs.cancel(second["job_id"])
        self.assertEqual(self.await_result(second["job_id"])["state"], "cancelled")
        self.assertEqual(len(list((self.root / "logs").glob("*.argv.json"))), 1)
        with self.assertRaisesRegex(AgentError, "different request"):
            self.start(idempotency_key="one", role="architecture")

    def test_cancellation_and_guardian_stop_detached_children(self):
        for kill_worker in (False, True):
            os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "detached_child"
            marker = self.root / "logs/ready"
            marker.unlink(missing_ok=True)
            first = self.start()
            self.ready()
            path = self.store.job(first["job_id"])
            child = read_json(self.root / "logs/child.json")
            identity = record(child["pid"])
            time.sleep(.4)
            if kill_worker:
                os.kill(read_json(path / "worker.json")["pid"], signal.SIGKILL)
            else:
                jobs.cancel(first["job_id"])
            value = self.await_result(first["job_id"])
            self.assertEqual(value["state"], "failed" if kill_worker else "cancelled", value)
            self.assertFalse(same_process(identity))

    def test_explicit_deadline_and_missing_provider(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        value = self.await_result(self.start(timeout_seconds=1)["job_id"])
        self.assertEqual(value["state"], "timed_out", value)
        with self.assertRaises(AgentError):
            binding("codex", "fixture-model", "high", "/missing/provider")
        with self.assertRaises(AgentError):
            binding("codex")

    def test_expired_preflight_never_launches_provider_work(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "slow_version"
        value = self.await_result(self.start(timeout_seconds=.3)["job_id"])
        self.assertEqual(value["state"], "timed_out", value)
        self.assertEqual(list((self.root / "logs").glob("*.argv.json")), [])

    def test_nested_ancestry_conflict_fails_before_queue(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        ancestor = self.start()
        self.ready()
        ancestry = [{"state_root": str(self.store.root), "job_id": ancestor["job_id"]}]
        with self.assertRaisesRegex(AgentError, "enclosing job"):
            self.start(enclosing_jobs=ancestry)
        separate = self.root / "separate"
        separate.mkdir()
        second = jobs.start("A separate nested assignment", str(separate), provider="gemini", model="fixture-model",
                            effort="high", executable=str(FIXTURE), enclosing_jobs=ancestry)
        ancestry.append({"state_root": str(self.store.root), "job_id": second["job_id"]})
        with self.assertRaisesRegex(AgentError, "enclosing job"):
            self.start(enclosing_jobs=ancestry)

    def test_host_configuration_and_explicit_override_have_no_model_default(self):
        path = self.root / "providers.json"
        path.write_text(json.dumps({"version": 1, "providers": {"codex": {
            "model": "host-model", "effort": "high", "executable": str(FIXTURE)}}}))
        self.assertEqual(binding("codex", config=path)["model"], "host-model")
        self.assertEqual(binding("codex", model="user-model", effort="xhigh", config=path)["effort"], "xhigh")
        with self.assertRaises(AgentError):
            binding("claude", config=path)

    def test_full_capabilities_are_not_restricted_by_review_role(self):
        from project_governance_runtime.provider_agents.claude import Claude
        from project_governance_runtime.provider_agents.codex import Codex
        from project_governance_runtime.provider_agents.gemini import Gemini

        for provider, adapter in (("gemini", Gemini), ("claude", Claude), ("codex", Codex)):
            qa = jobs.normalize("Review", str(self.workspace), provider=provider, model="fixture-model", effort="high",
                                executable=str(FIXTURE), role="qa")
            dev = {**qa, "role": "code"}
            self.assertEqual(adapter(qa, lambda *_a, **_k: None).command(self.root),
                             adapter(dev, lambda *_a, **_k: None).command(self.root))

    def test_exec_does_not_change_owned_process_identity(self):
        child = subprocess.Popen([sys.executable, "-c", "import os,time; time.sleep(.3); os.execlp('sleep','sleep','5')"])
        try:
            initial = record(child.pid)
            time.sleep(.5)
            self.assertTrue(same_process(initial))
        finally:
            child.terminate()
            child.wait(timeout=5)

    def test_launch_failure_retains_a_readable_terminal_receipt(self):
        with patch("project_governance_runtime.provider_agents.jobs.subprocess.Popen", side_effect=OSError("fixture launch failure")):
            job = self.start()
        result = jobs.result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertIn("fixture launch failure", result["error"])
        self.assertTrue(result["cleanup_confirmed"])

    def test_worker_record_failure_never_releases_the_startup_gate(self):
        original = atomic_json

        def fail_publication(path, value):
            if path.name == "launch.json":
                raise OSError("fixture launch record failure")
            original(path, value)

        with patch("project_governance_runtime.provider_agents.jobs.atomic_json", side_effect=fail_publication):
            job = self.start()
        result = jobs.result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertIn("launch record failure", result["error"])
        self.assertTrue(result["cleanup_confirmed"])
        path = self.store.job(job["job_id"])
        self.assertFalse((path / "worker.json").exists())
        self.assertFalse((path / "provider.json").exists())
        self.assertEqual(list((self.root / "logs").glob("*.argv.json")), [])

    def test_worker_death_before_process_record_cannot_start_native_work(self):
        request = jobs.normalize("Exercise launch boundary", str(self.workspace), provider="gemini",
                                 model="fixture-model", effort="high", executable=str(FIXTURE))
        job_id, path = self.store.create(request)
        script = """
import time
from project_governance_runtime.provider_agents import worker
original = worker.atomic_json
def delayed(path, value):
    if path.name == 'provider.json':
        original(path.parent / 'gated-child.json', value)
        time.sleep(120)
    original(path, value)
worker.atomic_json = delayed
worker.main()
"""
        child = subprocess.Popen([sys.executable, "-c", script, job_id],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            end = time.monotonic() + 10
            while not (path / "gated-child.json").exists():
                if time.monotonic() >= end:
                    self.fail("worker did not reach the process publication boundary")
                time.sleep(.05)
            launched = read_json(path / "gated-child.json")
            child.kill()
            child.wait(timeout=5)
            result = self.await_result(job_id)
            self.assertEqual(result["state"], "failed")
            self.assertTrue(result["cleanup_confirmed"])
            end = time.monotonic() + 5
            while same_process(launched) and time.monotonic() < end:
                time.sleep(.05)
            self.assertFalse(same_process(launched))
            self.assertEqual(list((self.root / "logs").glob("*.argv.json")), [])
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)

    def test_resolved_tool_denial_preserves_history_without_blocking_success(self):
        from project_governance_runtime.provider_agents.protocol import Protocol

        protocol = Protocol({"model": "fixture-model", "effort": "high", "required_tools": ["command"]}, lambda *_a, **_k: None)
        protocol.initialize("fixture-model", "session", "full", "full")
        protocol.tool("one", "command", "command", "ERROR", error="Access denied")
        protocol.tool("one", "command", "command", "DONE", output="Success after retry")
        protocol.complete("", {"outcome": "completed", "answer": "Done", "artifacts": [], "checks": [], "sources": [], "remaining": []})
        self.assertEqual(protocol.finish()[0], "succeeded")
        self.assertTrue(protocol.denied[0]["resolved"])
        protocol.denied.append({"request": "required human input"})
        self.assertEqual(protocol.finish()[0], "blocked")

    def test_worker_and_guardian_cannot_overwrite_each_others_descendants(self):
        entered, release = threading.Event(), threading.Event()
        calls, errors = [], []

        def scan(*_args, **_kwargs):
            calls.append(True)
            entered.set()
            release.wait(5)
            return subprocess.CompletedProcess([], 0, "")

        def collect_once():
            try:
                collect(self.root, {"pid": 2, "identity": "fixture"})
            except Exception as error:
                errors.append(error)

        with patch("project_governance_runtime.provider_agents.processes.subprocess.run", side_effect=scan), patch(
                "project_governance_runtime.provider_agents.processes.same_process", return_value=False):
            first = threading.Thread(target=collect_once)
            second = threading.Thread(target=collect_once)
            first.start()
            self.assertTrue(entered.wait(5))
            second.start()
            try:
                time.sleep(.1)
                self.assertEqual(len(calls), 1)
            finally:
                release.set()
                first.join(5)
                second.join(5)
        self.assertEqual(errors, [])
        self.assertEqual(len(calls), 2)

    def test_unknown_state_blocks_every_reader_and_new_ownership(self):
        job = self.start()
        self.await_result(job["job_id"])
        path = self.store.job(job["job_id"])
        # Wait for the matching guardian before deliberately changing the fixture's schema.
        end = time.monotonic() + 5
        while same_process(read_json(path / "guardian.json")) and time.monotonic() < end:
            time.sleep(.05)
        original = read_json(path / "status.json")
        atomic_json(path / "status.json", {**original, "protocol_version": 99})
        try:
            for operation in (jobs.status, jobs.result, jobs.cancel, jobs.events):
                with self.assertRaises(AgentError):
                    operation(job["job_id"])
            with self.assertRaises(AgentError):
                self.start()
        finally:
            atomic_json(path / "status.json", original)

    def test_cursor_boundaries_and_pid_reuse(self):
        path = self.root / "events"
        path.write_bytes(b'{"type":"one"}\n{"torn":')
        value = events_since(path)
        self.assertEqual(value["events"], [{"type": "one"}])
        self.assertEqual(events_since(path, value["cursor"])["events"], [])
        with self.assertRaises(AgentError):
            events_since(path, 2)
        with patch("os.kill") as kill:
            signal_record({"pid": os.getpid(), "identity": "wrong"}, signal.SIGTERM)
            kill.assert_not_called()

    def test_bootstrap_excludes_active_environment_users(self):
        source = ROOT / "src/project_governance_runtime/assets/tools/governance-bootstrap.py"
        spec = importlib.util.spec_from_file_location("bootstrap_provider_test", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.RUNTIME_ROOT = self.root / ".governance/runtime"
        module.RUNTIME_ROOT.parent.mkdir()
        fd = os.open(module.RUNTIME_ROOT.parent / "runtime-use.lock", os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_SH)
            with self.assertRaisesRegex(SystemExit, "environment is in use"):
                with module.environment_replacement_lock():
                    self.fail("replacement lock was incorrectly acquired")
        finally:
            os.close(fd)
        with module.environment_replacement_lock():
            pass

    def test_detached_worker_and_guardian_retain_environment_lock(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        path = self.root / "runtime-use.lock"
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
        fcntl.flock(fd, fcntl.LOCK_SH)
        first = self.start(environment_fd=fd)
        second = self.start(environment_fd=fd)
        os.close(fd)
        check_fd = os.open(path, os.O_RDWR)
        try:
            with self.assertRaises(BlockingIOError):
                fcntl.flock(check_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            jobs.cancel(first["job_id"])
            self.await_result(first["job_id"])
            with self.assertRaises(BlockingIOError):
                fcntl.flock(check_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            jobs.cancel(second["job_id"])
            self.await_result(second["job_id"])
            end = time.monotonic() + 5
            while True:
                try:
                    fcntl.flock(check_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= end:
                        self.fail("environment lock remained after process cleanup")
                    time.sleep(.05)
        finally:
            os.close(check_fd)



class ProviderAgentRepairTests(ProviderAgentCase):
    def test_idle_deadline_starts_at_launch_and_still_stops_inactive_provider(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        first = self.start()
        self.ready()
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "normal"
        second = self.start(idle_timeout_seconds=1)
        self.assertEqual(second["state"], "queued")
        time.sleep(1.2)
        jobs.cancel(first["job_id"])
        self.assertEqual(self.await_result(second["job_id"])["state"], "succeeded")
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        value = self.await_result(self.start(idle_timeout_seconds=.5)["job_id"])
        self.assertEqual(value["state"], "timed_out")
        self.assertEqual(value["error"], "Provider inactivity deadline exceeded")

    def test_claude_mixed_output_is_not_a_denial_but_native_denials_block(self):
        from project_governance_runtime.provider_agents.claude import Claude

        for content in ('Exit code 1\nerror = "Permission denied"\n(eval):1: ==== not found',
                        [{"type": "text", "text": 'Exit code 1\nprint("Access denied")'}]):
            protocol = Claude({"model": "fixture-model", "effort": "high", "required_tools": ["command"]}, lambda *_a, **_k: None)
            protocol.initialize("fixture-model", "session", "full", "full")
            protocol.tool("one", "Bash", "command", "ACTIVE")
            protocol.accept({"type": "user", "message": {"content": [{"type": "tool_result",
                "tool_use_id": "one", "is_error": True, "content": content}]}})
            protocol.tool("retry", "Bash", "command", "DONE", output="OK")
            final = {"type": "result", "subtype": "success", "is_error": False, "structured_output": {
                "outcome": "completed", "answer": "Done", "artifacts": [], "checks": [], "sources": [], "remaining": []}}
            protocol.accept(final)
            self.assertEqual(protocol.finish()[0], "succeeded")
            self.assertEqual(protocol.denied, [])
            # Native permission_denials remain authoritative even with successful tools.
            protocol.done = False
            protocol.accept({**final, "permission_denials": [{"tool_name": "Read", "tool_use_id": "denied"}]})
            self.assertEqual(protocol.finish()[0], "blocked")

    def test_cleanup_pending_preserves_completion_for_guardian_and_recovery(self):
        for mode in ("guardian", "recovery", "cancel"):
            with self.subTest(mode=mode):
                request = jobs.normalize("Exercise delayed cleanup", str(self.workspace), provider="claude",
                                         model="fixture-model", effort="high", executable=str(FIXTURE))
                job_id, path = self.store.create(request)
                script = """
import sys,time
from project_governance_runtime.provider_agents import worker
worker.terminate_owned = lambda *a, **k: False
original = worker.Worker.finish
def pause(self, *args, **kwargs):
    original(self, *args, **kwargs)
    (self.path / 'pending-ready').touch()
    end = time.monotonic() + 10
    while not (self.path / 'release-cleanup').exists() and time.monotonic() < end:
        time.sleep(.05)
worker.Worker.finish = pause
if sys.argv[2] == 'recovery':
    worker.Worker._start_guardian = lambda self: None
worker.main()
"""
                child = subprocess.Popen([sys.executable, "-c", script, job_id, mode])
                try:
                    end = time.monotonic() + 10
                    while not (path / "pending-ready").exists() and time.monotonic() < end:
                        time.sleep(.05)
                    self.assertTrue((path / "pending-ready").exists())
                    self.assertFalse(jobs.result(job_id)["ready"])
                    pending = read_json(path / "result.json")
                    self.assertFalse(pending["cleanup_confirmed"])
                    self.assertEqual(pending["pending_state"], "succeeded")
                    if mode == "cancel":
                        jobs.cancel(job_id)
                    (path / "release-cleanup").touch()
                    child.wait(timeout=5)
                    result = self.await_result(job_id)
                    self.assertEqual(result["state"], "cancelled" if mode == "cancel" else "succeeded")
                    self.assertTrue(result["cleanup_confirmed"])
                    for key in ("answer", "observed_tools", "observed_model", "conversation_id", "usage", "workspace_before", "workspace_after"):
                        self.assertTrue(result[key])
                        self.assertEqual(result[key], pending[key])
                    self.assertNotIn("pending_state", result)
                    self.assertEqual(sum(e["type"] == "finished" for e in jobs.events(job_id)["events"]), 1)
                finally:
                    (path / "release-cleanup").touch()
                    if child.poll() is None:
                        child.kill()
                    child.wait(timeout=5)

    def test_signal_permission_failure_keeps_readers_and_unrelated_jobs_usable(self):
        request = jobs.normalize("Exercise orphan cleanup", str(self.workspace), provider="claude",
                                 model="fixture-model", effort="high", executable=str(FIXTURE))
        job_id, path = self.store.create(request)
        atomic_json(path / "status.json", {**read_json(path / "status.json"), "state": "running", "created_at": time.time() - 10})
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(90)"])
        atomic_json(path / "provider.json", record(child.pid))
        original_kill = os.kill
        def deny(pid, sig):
            if pid == child.pid:
                raise PermissionError("Synthetic signaling denial")
            return original_kill(pid, sig)
        try:
            with patch("project_governance_runtime.provider_agents.processes.os.kill", side_effect=deny):
                self.assertIn("permission denied", jobs.status(job_id)["stage"])
                self.assertEqual(jobs.events(job_id)["state"], "running")
                self.assertFalse(jobs.result(job_id)["ready"])
                self.assertEqual(jobs.cancel(job_id)["state"], "running")
                self.assertTrue((path / "cancel.json").exists())
                self.assertTrue(same_process(read_json(path / "provider.json")))
                # Exercise the actual blocker scan under the same fault, without spawning
                # a worker that could signal this synthetic orphan outside the mock.
                from project_governance_runtime.provider_agents.worker import Worker
                separate = self.root / "separate"
                separate.mkdir()
                other_id, other_path = self.store.create({**request, "workspace": str(separate)})
                self.assertEqual(Worker(self.store, other_id)._blockers(), [])
                atomic_json(other_path / "cancel.json", {"requested_at": time.time()})
        finally:
            child.terminate()
            child.wait(timeout=5)
        result = self.await_result(job_id)
        self.assertEqual(result["state"], "cancelled")
        self.assertTrue(result["cleanup_confirmed"])

    def test_credential_text_is_redacted_in_events_and_terminal_receipts(self):
        from project_governance_runtime.provider_agents.worker import Worker
        from project_governance_runtime.provider_agents.storage import Redactor

        request = jobs.normalize("Check public projections", str(self.workspace), provider="claude",
                                 model="fixture-model", effort="high", executable=str(FIXTURE))
        job_id, path = self.store.create(request)
        worker = Worker(self.store, job_id)
        worker.protocol.initialize("fixture-model", "session", "full", "full")
        tokens = ["synthetic-json-token", "synthetic-python-token", "synthetic-spaced-token with spaces", "synthetic-bare-token",
                  "synthetic-prefixed-key", "synthetic-prefixed-password", "synthetic-prefixed-secret"]
        output = [json.dumps({"access_token": tokens[0]}), str({"api-key": tokens[1]}),
                  json.dumps({"password": tokens[2]}), "secret=" + tokens[3],
                  "export OPENAI_API_KEY=" + tokens[4], "DB_PASSWORD=" + tokens[5], "CLIENT_SECRET=" + tokens[6]]
        worker.protocol.tool("one", "Bash", "command", "DONE", parameters={"nested": {"access_token": tokens[0]}}, output=output)
        worker.finish("succeeded", {"answer": "Done", "remaining": [], "artifacts": []}, None)
        for name in ("events.jsonl", "result.json", "status.json"):
            public = (path / name).read_text()
            for token in tokens:
                self.assertNotIn(token, public)
        self.assertIn("[REDACTED]", (path / "events.jsonl").read_text())
        redactor = Redactor()
        for raw in [*output, json.dumps({"password": 'synthetic-escaped-"quote\\slash'}),
                    '{"access_token":"synthetic-truncated-token', "{'secret': 'synthetic-truncated-token"]:
            cleaned = redactor.clean(raw)
            self.assertNotIn("synthetic-", cleaned)
            self.assertEqual(redactor.clean(cleaned), cleaned)



if __name__ == "__main__":
    unittest.main()
