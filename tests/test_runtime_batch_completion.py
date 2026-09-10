"""Prove completion is deduplicated, separate from test proof, and bound to its caller."""

import json
import os
from pathlib import Path
import signal
import sys
import time
import uuid
from unittest.mock import patch

from test_runtime_provider_agents import ProviderAgentCase
from project_governance_runtime.provider_agents import completion, jobs, test_batches
from project_governance_runtime.provider_agents.config import AgentError
from project_governance_runtime.provider_agents.storage import atomic_json, read_json


class BatchCompletionTests(ProviderAgentCase):
    def setUp(self):
        super().setUp()
        self.thread = str(uuid.uuid4())
        self.queue = self.root / "codex"
        self.calls = self.root / "queue.jsonl"
        self.queue.write_text(f'''#!{sys.executable}
import json,sys
from pathlib import Path
if sys.argv[1:]==['queue','--help']:
    print('--thread --message');sys.exit(0)
with open({str(self.calls)!r}, 'a') as out: out.write(json.dumps(sys.argv[1:])+'\\n')
sys.exit(1 if Path({str(self.root / 'reject')!r}).exists() else 0)
''')
        self.queue.chmod(0o700)
        with patch.dict(os.environ, CODEX_THREAD_ID=self.thread):
            self.target = completion.codex_target(str(self.queue))

    def batch(self, source="print('assertions passed')", **extra):
        request = dict(version=1, workspace=str(self.workspace), idempotency_key=str(uuid.uuid4()),
                       timeout_seconds=15, inputs={"mode": "declared-roots", "roots": [str(self.workspace)]},
                       cases=[dict(id="one", argv=[sys.executable, "-c", source],
                                   timeout_seconds=2, expected_exit_codes=[0])], **extra)
        job = test_batches.start(request, store=self.store, completion=self.target)
        return job, self.store.job(job["job_id"])

    def test_terminal_delivery_targets_original_session_without_log_instructions(self):
        job, path = self.batch("print('UNTRUSTED_LOG_DIRECTIVE');raise SystemExit(3)")
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual(completion.deliver(path)["state"], "queued")
        calls = [json.loads(row) for row in self.calls.read_text().splitlines()]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][:3], ["queue", "--thread", self.thread])
        self.assertIn(test_batches.digest_file(path / "result.json"), calls[0][-1])
        self.assertNotIn("UNTRUSTED_LOG_DIRECTIVE", calls[0][-1])
        self.assertFalse((self.root / "logs").exists(), "no preparation or assessment provider job")

    def test_repeated_observation_and_delivery_do_not_queue_twice(self):
        job, path = self.batch()
        self.await_result(job["job_id"])
        for _ in range(3):
            jobs.status(job["job_id"])
            completion.deliver(path, retry=True)
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_failed_delivery_preserves_test_success_and_explicit_retry_only(self):
        (self.root / "reject").touch()
        job, path = self.batch()
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(completion.deliver(path)["state"], "failed")
        before = (path / "result.json").read_bytes()
        (self.root / "reject").unlink()
        self.assertEqual(completion.deliver(path)["state"], "failed")
        self.assertEqual(completion.deliver(path, retry=True)["state"], "queued")
        self.assertEqual((path / "result.json").read_bytes(), before)
        self.assertEqual(len(self.calls.read_text().splitlines()), 2)

    def test_notification_waits_for_project_cleanup(self):
        job, path = self.batch(cleanup_required=True)
        end = time.monotonic() + 5
        while not (path / "result.json").exists() and time.monotonic() < end:
            time.sleep(.05)
        self.assertEqual(completion.deliver(path)["state"], "queued")
        self.assertFalse((path / "notification.json").exists())
        self.assertIn("needs project/process cleanup", self.calls.read_text())
        atomic_json(path / "resource-cleanup.json", {"batch_id": path.name, "cleanup_confirmed": True})
        self.await_result(job["job_id"])
        self.assertEqual(completion.deliver(path)["state"], "queued")

    def test_guardian_delivers_worker_failure(self):
        job, path = self.batch("import time;time.sleep(20)")
        os.kill(read_json(path / "worker.json")["pid"], signal.SIGKILL)
        result = self.await_result(job["job_id"])
        self.assertEqual(result["state"], "failed")
        self.assertEqual(completion.deliver(path)["state"], "queued")

    def test_uncertain_attempt_is_not_automatically_repeated(self):
        job, path = self.batch("import time;time.sleep(.3)")
        atomic_json(path / "notification.json", {"state": "sending", "attempted_at": time.time()})
        self.await_result(job["job_id"])
        self.assertFalse(self.calls.exists())
        self.assertEqual(completion.deliver(path)["state"], "sending")
        self.assertEqual(completion.deliver(path, retry=True)["state"], "queued")

    def test_host_binding_drift_blocks_notification(self):
        job, path = self.batch("import time;time.sleep(.3)")
        self.queue.write_text(self.queue.read_text() + "\n# changed executable\n")
        self.await_result(job["job_id"])
        self.assertEqual(completion.deliver(path)["state"], "failed")
        self.assertFalse(self.calls.exists())

    def test_missing_initiating_session_fails_before_submission(self):
        with patch.dict(os.environ, CODEX_THREAD_ID=""):
            with self.assertRaisesRegex(AgentError, "initiating CODEX_THREAD_ID"):
                completion.codex_target(str(self.queue))
        self.assertEqual(list(self.store.records()), [])
