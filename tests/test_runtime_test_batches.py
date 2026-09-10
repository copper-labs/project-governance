"""Exercise real deterministic jobs and fake native hosts at their shared lifecycle boundary."""

import json
import os
from pathlib import Path
import signal
import sys
import time
import uuid
from unittest.mock import patch

from test_runtime_provider_agents import ProviderAgentCase, FIXTURE
from project_governance_runtime import telemetry, skill_telemetry
from project_governance_runtime.provider_agents import jobs, test_batches
from project_governance_runtime.provider_agents.config import AgentError, TERMINAL
from project_governance_runtime.provider_agents.processes import same_process
from project_governance_runtime.provider_agents.storage import atomic_json, read_json


class TestBatchTests(ProviderAgentCase):
    def case(self, name="one", source="print('assertions passed')", **extra):
        return dict(id=name, argv=[sys.executable, "-c", source], timeout_seconds=5,
                    expected_exit_codes=[0], **extra)

    def request(self, cases=None, **extra):
        return dict(version=1, workspace=str(self.workspace), idempotency_key=str(uuid.uuid4()),
                    timeout_seconds=15, inputs={"mode": "declared-roots", "roots": [str(self.workspace)]},
                    cases=cases or [self.case()], **extra)

    def batch(self, request=None):
        return test_batches.start(self.request() if request is None else request, store=self.store)

    def wait_for(self, predicate, timeout=10):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if predicate():
                return
            time.sleep(.05)
        self.fail("condition not observed before fixture deadline")

    def tearDown(self):
        for path, state in self.store.records():
            request = read_json(path / "request.json")
            if request.get("batch", {}).get("cleanup_required") and state["state"] not in TERMINAL:
                jobs.cancel(path.name)
                atomic_json(path / "resource-cleanup.json", {"batch_id": path.name, "cleanup_confirmed": True})
        super().tearDown()

    def test_assertions_dependencies_and_expected_negatives_preserve_inventory(self):
        cases = [self.case("failure", "raise SystemExit(3)"), self.case("dependent", depends_on=["failure"]),
                 {**self.case("negative", "raise SystemExit(7)"), "expected_exit_codes": [7]}, self.case("independent")]
        job = self.batch(self.request(cases))
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual([c["outcome"] for c in result["cases"]], ["failed", "not-run", "passed", "passed"])
        self.assertEqual(result["cases"][2]["exit_code"], 7)
        self.assertEqual(result["input_validity"], "declared-scope-only")
        self.assertFalse((self.root / "logs").exists(), "batch must never launch a provider")
        self.assertIn("assertions passed", Path(result["cases"][3]["stdout"]).read_text())

    def test_idempotency_is_atomic_and_is_not_changed_input_authority(self):
        request = self.request([self.case(source="from pathlib import Path; Path('count').write_text('once')")])
        first = self.batch(request)
        second = self.batch(request)
        self.assertEqual(first["job_id"], second["job_id"])
        self.await_result(first["job_id"])
        request["cases"][0]["argv"][-1] = "print('changed')"
        with self.assertRaisesRegex(AgentError, "different request"):
            self.batch(request)
        # Proof is published before advisory telemetry; assert observations after worker closeout.
        self.wait_for(lambda: not same_process(read_json(self.store.job(first["job_id"]) / "worker.json")))
        report = telemetry.status(self.workspace)["test_execution"]
        self.assertEqual(report["reported_uses"], 1)
        self.assertEqual(report["observed_batches"], 1)

    def test_output_claim_serializes_different_workspaces(self):
        shared = self.root / "output"
        shared.mkdir()
        first = self.batch(self.request([self.case(source="import time; time.sleep(2)")], output_roots=[str(shared)]))
        other = self.root / "other"
        other.mkdir()
        request = self.request(output_roots=[str(shared)])
        request.update(workspace=str(other), inputs={"mode": "declared-roots", "roots": [str(other)]})
        second = self.batch(request)
        self.assertEqual(jobs.status(second["job_id"])["state"], "queued")
        self.assertEqual(self.await_result(first["job_id"])["state"], "succeeded")
        self.assertEqual(self.await_result(second["job_id"])["state"], "succeeded")

    def test_manifest_drift_stops_remaining_cases(self):
        source = self.workspace / "untracked"
        source.write_text("before")
        request = self.request([self.case(source="from pathlib import Path; Path('untracked').write_text('after')"), self.case("later")])
        request["inputs"] = {"mode": "manifest", "roots": [str(self.workspace)],
                             "files": [{"path": str(source), "sha256": test_batches.digest_file(source)}]}
        result = self.await_result(self.batch(request)["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["input_validity"], "invalid-or-unverified")
        self.assertEqual(result["cases"][1]["outcome"], "not-run")
        self.assertFalse(result["assessment_allowed"])

    def test_missing_result_receipt_is_not_exit_zero_success(self):
        result = self.await_result(self.batch(self.request([self.case(result_receipt=True)]))["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertFalse(result["assessment_allowed"])

    def test_receipt_binds_exact_batch_and_case(self):
        source = "import os,json; from pathlib import Path; Path(os.environ['HARNESS_CASE_DIR'],'result.json').write_text(json.dumps({'batch_id':os.environ['HARNESS_BATCH_ID'],'case_id':os.environ['HARNESS_CASE_ID'],'outcome':'passed'}))"
        result = self.await_result(self.batch(self.request([self.case(source=source, result_receipt=True)]))["job_id"])
        self.assertEqual(result["state"], "succeeded")

    def test_timeout_kills_owned_detached_descendant_and_stops_later_case(self):
        source = "import subprocess,sys,time,json; from pathlib import Path; p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(90)'],start_new_session=True); Path('child').write_text(str(p.pid)); time.sleep(90)"
        request = self.request([{**self.case(source=source), "timeout_seconds": .5}, self.case("later")])
        job = self.batch(request)
        self.wait_for(lambda: (self.workspace / "child").exists())
        from project_governance_runtime.provider_agents.processes import record
        child = record(int((self.workspace / "child").read_text()))
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "timed_out")
        self.assertTrue(result["cleanup_confirmed"])
        self.assertFalse(same_process(child))
        self.assertEqual(result["cases"][1]["outcome"], "not-run")

    def test_guardian_preserves_inventory_after_worker_hard_death(self):
        job = self.batch(self.request([self.case(source="import time; time.sleep(90)")]))
        path = self.store.job(job["job_id"])
        self.wait_for(lambda: (path / "provider.json").exists())
        os.kill(read_json(path / "worker.json")["pid"], signal.SIGKILL)
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual([c["id"] for c in result["cases"]], ["one"])
        self.assertFalse(result["assessment_allowed"])
        self.assertFalse(same_process(read_json(path / "provider.json")))

    def test_uncertain_project_cleanup_retains_claim_until_acknowledged(self):
        job = self.batch(self.request(cleanup_required=True))
        path = self.store.job(job["job_id"])
        self.wait_for(lambda: "Awaiting" in jobs.status(job["job_id"])["stage"])
        self.assertFalse(jobs.result(job["job_id"])["ready"])
        self.assertEqual(read_json(path / "status.json")["protocol_version"], 2)
        second = self.batch()
        self.assertEqual(jobs.status(second["job_id"])["state"], "queued")
        atomic_json(path / "resource-cleanup.json", {"batch_id": "wrong", "cleanup_confirmed": True})
        self.assertFalse(jobs.result(job["job_id"])["ready"])
        atomic_json(path / "resource-cleanup.json", {"batch_id": path.name, "cleanup_confirmed": True})
        self.assertEqual(self.await_result(job["job_id"])["state"], "succeeded")
        for name in ("request.json", "status.json", "result.json"):
            self.assertEqual(read_json(path / name)["protocol_version"], 1)
        self.assertEqual(self.await_result(second["job_id"])["state"], "succeeded")

    def test_cancel_preserves_partial_case_result(self):
        job = self.batch(self.request([self.case(source="import time;time.sleep(90)")]))
        jobs.cancel(job["job_id"])
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "cancelled")
        self.assertEqual(len(result["cases"]), 1)

    def test_enclosing_owner_cannot_wait_on_conflicting_batch(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        owner = self.start("claude")
        os.environ["HARNESS_AGENT_ANCESTRY"] = json.dumps([{"state_root": str(self.store.root), "job_id": owner["job_id"]}])
        with self.assertRaisesRegex(AgentError, "nested job conflicts"):
            self.batch()





    def test_terminal_transition_retains_guard_until_last_publication(self):
        request = jobs.normalize("Execute tests", str(self.workspace), batch=test_batches.normalize(self.request()))
        job_id, path = self.store.create(request)
        test_batches.terminal_protocol(path)
        self.assertEqual(read_json(path / "request.json")["protocol_version"], 1)
        self.assertEqual(read_json(path / "status.json")["protocol_version"], 2)
        jobs.finish_cleanup(path)
        for name in ("request.json", "status.json", "result.json"):
            self.assertEqual(read_json(path / name)["protocol_version"], 1)
        self.assertEqual(jobs.status(job_id)["state"], "failed")

    def test_launcher_failure_cannot_pass_as_an_expected_negative_exit(self):
        executable = self.workspace / "negative"
        executable.write_text("#!/bin/sh\nexit 127\n")
        executable.chmod(0o755)
        change = self.case("change", source="from pathlib import Path; Path('negative').chmod(0o644)")
        negative = {**self.case("negative"), "argv": [str(executable)], "expected_exit_codes": [1, 126, 127]}
        result = self.await_result(self.batch(self.request([change, negative, self.case("later")]))["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertLess(result["cases"][1]["exit_code"], 0)
        self.assertEqual(result["cases"][2]["outcome"], "not-run")

    def test_telemetry_is_content_free_bounded_and_fail_open(self):
        identity = str(uuid.uuid4())
        event = dict(event="skill-decision", skill="test-execution", decision_id=identity,
                     runtime_version="fixture", host="codex", choice="direct", reason="quick-check",
                     prompt="SECRET", command="SECRET", path="SECRET", model="SECRET")
        self.assertTrue(telemetry.append(self.workspace, event))
        self.assertNotIn("SECRET", (self.workspace / ".governance/telemetry/runs.jsonl").read_text())
        self.assertEqual(telemetry.status(self.workspace, runtime_version="missing")["selected_record_count"], 0)
        with patch("project_governance_runtime.telemetry._atomic_write", side_effect=OSError("disk full")):
            self.assertFalse(skill_telemetry.record_use(self.workspace, identity, "direct", "codex", "quick-check"))

    def test_spawn_failure_preserves_case_inventory(self):
        with patch("project_governance_runtime.provider_agents.jobs.subprocess.Popen", side_effect=OSError("fixture spawn failure")):
            job = self.batch()
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual([c["outcome"] for c in result["cases"]], ["not-run"])
        self.assertFalse(result["assessment_allowed"])
        for name in ("request.json", "status.json", "result.json"):
            self.assertEqual(read_json(self.store.job(job["job_id"]) / name)["protocol_version"], 1)

    def test_virtual_environment_interpreter_keeps_its_invocation_identity(self):
        import venv

        environment = self.root / "isolated-python"
        venv.EnvBuilder(with_pip=False).create(environment)
        case = self.case()
        case["argv"] = [str(environment / "bin/python"), "-c", "import sys;print(sys.prefix)"]
        result = self.await_result(self.batch(self.request([case]))["job_id"])
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(Path(Path(result["cases"][0]["stdout"]).read_text().strip()).resolve(), environment.resolve())

    def test_malformed_requests_never_create_jobs(self):
        for value in ([], {"version": 1}, {**self.request(), "inputs": {"mode": [], "roots": []}},
                      {**self.request(), "unexpected": "value"}):
            with self.subTest(value=type(value).__name__), self.assertRaises(AgentError):
                self.batch(value)
        self.assertEqual(len(list(self.store.records())), 0)
