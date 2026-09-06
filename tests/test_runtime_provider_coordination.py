"""Prove cooperating writer ownership through the existing durable job lifecycle."""

import contextlib
import io
import os
import time
import uuid

from project_governance_runtime.provider_agents import jobs
from project_governance_runtime.provider_agents.cli import parser
from project_governance_runtime.provider_agents.config import AgentError
from project_governance_runtime.provider_agents.protocol import prompt
from project_governance_runtime.provider_agents.storage import atomic_json, read_json, validate_record
from test_runtime_provider_agents import FIXTURE, ProviderAgentCase


class ProviderCoordinationTests(ProviderAgentCase):
    def request(self, access, workspace=None, **options):
        return jobs.normalize("Inspect the bounded assignment", str(workspace or self.workspace),
                              provider="codex", model="fixture-model", effort="high",
                              executable=str(FIXTURE), access=access, **options)

    def test_access_matrix_includes_aliases_roots_and_exact_sessions(self):
        expected = {
            ("exclusive", "exclusive"): True, ("exclusive", "writer"): True,
            ("exclusive", "shared"): True, ("writer", "exclusive"): True,
            ("writer", "writer"): True, ("writer", "shared"): False,
            ("shared", "exclusive"): True, ("shared", "writer"): False,
            ("shared", "shared"): False,
        }
        for modes, conflict in expected.items():
            with self.subTest(modes=modes):
                self.assertEqual(jobs.conflicts(*(self.request(mode) for mode in modes)), conflict)
        other = self.root / "other"
        other.mkdir()
        writer = self.request("writer")
        unrelated = self.request("writer", other)
        self.assertFalse(jobs.conflicts(writer, unrelated))
        alias = self.root / "alias"
        alias.symlink_to(self.workspace, target_is_directory=True)
        nested = self.workspace / "nested"
        nested.mkdir()
        for target in (alias, nested):
            linked = self.request("writer", other, additional_roots=[str(target)])
            self.assertTrue(jobs.conflicts(writer, linked))
            self.assertTrue(jobs.conflicts(linked, writer))
        session = str(uuid.uuid4())
        for mode in ("shared", "writer"):
            same = {**self.request(mode, other), "conversation_id": session}
            self.assertTrue(jobs.conflicts({**writer, "conversation_id": session}, same))

    def test_writer_is_exclusive_to_legacy_readers_and_flags_are_strict(self):
        writer = self.request("writer")
        self.assertEqual(writer["access"], "exclusive")
        self.assertIs(writer["allow_readers"], True)
        # Protocol 1 before 2.6.0 recognizes only exclusive/shared and ignores new fields.
        for mode in ("exclusive", "shared"):
            legacy = self.request(mode)
            legacy.pop("allow_readers")
            validate_record(legacy)
            legacy_conflict = "exclusive" in {legacy["access"], writer["access"]}
            self.assertTrue(legacy_conflict)
            self.assertEqual(jobs.conflicts(writer, legacy), mode == "exclusive")
            self.assertEqual(jobs.conflicts(legacy, writer), mode == "exclusive")
        for malformed in ({"access": "writer"}, {"allow_readers": "true"},
                          {"allow_readers": 1}, {"access": "shared", "allow_readers": True}):
            with self.subTest(malformed=malformed), self.assertRaises(AgentError):
                jobs.conflicts({**writer, **malformed}, self.request("shared"))
        for flag in (True, False, "true", 1, None):
            malformed = {key: value for key, value in writer.items() if key != "access"}
            malformed["allow_readers"] = flag
            with self.subTest(missing_access=flag), self.assertRaises(AgentError):
                jobs.conflicts(malformed, self.request("shared"))

    def test_cli_modes_are_explicit_and_mutually_exclusive(self):
        arguments = ["start", "--provider", "codex", "--workspace", str(self.workspace), "--task", "Inspect"]
        for flag in (None, "--writer", "--shared"):
            value = parser().parse_args(arguments + ([flag] if flag else []))
            self.assertEqual(value.writer, flag == "--writer")
            self.assertEqual(value.shared, flag == "--shared")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser().parse_args(arguments + ["--writer", "--shared"])
        reader_prompt = prompt(self.request("shared"))
        self.assertIn("delegate writes", reader_prompt)
        self.assertIn("mutate shared outputs", reader_prompt)
        self.assertIn("provisional", reader_prompt)

    def test_writer_and_two_readers_overlap_without_admitting_another_writer(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        writer = self.start(access="writer")
        readers = [self.start(access="shared"), self.start(access="shared")]
        deadline = time.monotonic() + 5
        while len(list((self.root / "logs").glob("*.argv.json"))) != 3:
            if time.monotonic() >= deadline:
                self.fail("writer and both readers did not reach their native providers concurrently")
            time.sleep(.05)
        self.assertTrue(all(jobs.status(job["job_id"])["state"] == "running" for job in [writer, *readers]))
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "normal"
        next_writer = self.start(access="writer")
        exclusive = self.start()
        late_reader = self.start(access="shared")
        self.assertTrue(all(job["state"] == "queued" for job in (next_writer, exclusive, late_reader)))
        jobs.cancel(writer["job_id"])
        self.assertEqual(self.await_result(writer["job_id"])["state"], "cancelled")
        self.assertEqual(self.await_result(next_writer["job_id"])["state"], "succeeded")
        self.assertEqual(jobs.status(exclusive["job_id"])["state"], "queued")
        for reader in readers:
            jobs.cancel(reader["job_id"])
            self.assertTrue(self.await_result(reader["job_id"])["cleanup_confirmed"])
        self.assertEqual(self.await_result(exclusive["job_id"])["state"], "succeeded")
        self.assertEqual(self.await_result(late_reader["job_id"])["state"], "succeeded")

    def test_nested_writer_overlap_is_rejected_before_a_queue_deadlock(self):
        os.environ["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        writer = self.start(access="writer")
        exclusive = self.start()
        self.assertEqual(exclusive["state"], "queued")
        ancestry = [{"state_root": str(self.store.root), "job_id": writer["job_id"]}]
        before = len(list(self.store.records()))
        with self.assertRaisesRegex(AgentError, "enclosing job"):
            self.start(access="shared", enclosing_jobs=ancestry)
        self.assertEqual(len(list(self.store.records())), before)
        for job in (writer, exclusive):
            jobs.cancel(job["job_id"])
            self.await_result(job["job_id"])
        reader = self.start(access="shared")
        ancestry[0]["job_id"] = reader["job_id"]
        before = len(list(self.store.records()))
        with self.assertRaisesRegex(AgentError, "enclosing job"):
            self.start(access="writer", enclosing_jobs=ancestry)
        self.assertEqual(len(list(self.store.records())), before)

    def test_follow_up_preserves_writer_and_legacy_exclusive_authority(self):
        for mode in ("writer", "exclusive", "shared"):
            with self.subTest(mode=mode):
                first = self.start(access=mode)
                self.await_result(first["job_id"])
                path = self.store.job(first["job_id"]) / "request.json"
                prior = read_json(path)
                if mode != "writer":
                    prior.pop("allow_readers")
                    atomic_json(path, prior)
                follow = jobs.follow_up(first["job_id"], "Inspect the next bounded question")
                self.assertEqual(self.await_result(follow["job_id"])["state"], "succeeded")
                request = read_json(self.store.job(follow["job_id"]) / "request.json")
                self.assertEqual(request["access"], "shared" if mode == "shared" else "exclusive")
                self.assertEqual(request["allow_readers"], mode == "writer")
