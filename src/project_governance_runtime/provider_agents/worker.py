"""Detached native-provider execution with observable progress and verified cleanup."""

from __future__ import annotations

import json
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from .claude import Claude
from .codex import Codex
from .config import AgentError, TERMINAL, code_digest
from .gemini import Gemini
from .jobs import conflicts, recover
from .processes import cleanup_stage, record, same_process, terminate_owned
from .protocol import artifact_evidence
from .stream import ProviderStream
from .storage import Events, Redactor, Store, atomic_json, read_json, validate_record


def snapshot(workspace):
    """Capture Git evidence without attributing every change to this job."""
    result = {"workspace": workspace}
    for label, args in (("head", ["rev-parse", "HEAD"]), ("status", ["status", "--porcelain=v1", "-z"]),
                        ("diff", ["diff", "--binary", "HEAD"])):
        try:
            value = subprocess.run(["git", "-C", workspace, *args], capture_output=True, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            break
        if value.returncode:
            break
        result[label] = value.stdout.decode(errors="replace")[:1000000]
        result[label + "_truncated"] = len(value.stdout) > 1000000
    return result


class Worker:
    """Own one detached assignment through confirmed process cleanup."""
    def __init__(self, store, job_id):
        self.store, self.path = store, store.job(job_id)
        self.request = validate_record(read_json(self.path / "request.json"))
        self.state = validate_record(read_json(self.path / "status.json"))
        self.events = Events(self.path / "events.jsonl", self.request["provider"])
        self.redactor = Redactor()
        self.last_activity, self.last_heartbeat = time.monotonic(), 0
        self.cancelled, self.proc, self.guardian = False, None, None
        self.protocol = {"gemini": Gemini, "claude": Claude, "codex": Codex}[self.request["provider"]](self.request, self.emit)
        self.before, self.provider_version = {}, None
        self.expected_shutdown = False
        self.environment_fd = os.environ.get("HARNESS_AGENT_ENV_FD")

    def heartbeat(self, force=False):
        """Persist supervisor liveness separately from actual provider activity."""
        now = time.monotonic()
        if force or now - self.last_heartbeat >= 1:
            self.state.update(updated_at=time.time(), heartbeat_at=time.time(),
                              conversation_id=self.protocol.conversation_id)
            atomic_json(self.path / "status.json", self.redactor.clean(self.state))
            self.last_heartbeat = now

    def emit(self, kind, **data):
        """Record public progress and update the current job state."""
        event = self.events.append(kind, **data)
        self.state["last_event"] = event["sequence"]
        if kind in {"tool", "started", "queued", "denied", "diagnostic"}:
            self.state["stage"] = data.get("message", kind)
        if kind == "tool":
            self.state["current_tool"] = data["name"] if data["state"] == "ACTIVE" else None
        if kind == "text":
            self.state["response_tail"] = (self.state.get("response_tail", "") + data["text"])[-1500:]
        self.heartbeat(force=True)

    def interrupted(self):
        """Detect cancellation and configured deadlines without inventing a timeout."""
        if self.cancelled or (self.path / "cancel.json").exists():
            return "cancelled", "Cancellation requested"
        overall, idle = self.request["timeout_seconds"], self.request["idle_timeout_seconds"]
        if overall and time.time() - self.state["created_at"] >= overall:
            return "timed_out", "Overall job deadline exceeded"
        if idle and self.proc and time.monotonic() - self.last_activity >= idle:
            return "timed_out", "Provider inactivity deadline exceeded"
        return None

    def acquire(self):
        """Wait for earlier conflicting jobs without reviving terminal ownership."""
        last = None
        while True:
            if self.interrupted():
                return self.interrupted()
            blockers = []
            with self.store.lock():
                current = validate_record(read_json(self.path / "status.json"))
                if current["state"] in TERMINAL:
                    return current["state"], "Job already reached a terminal state before ownership acquisition"
                blockers = self._blockers()
                if not blockers:
                    self.state.update(state="running", started_at=time.time(), stage="Initializing provider")
                    self.heartbeat(force=True)
                    return None
            if blockers != last:
                self.emit("queued", message="Waiting for workspace or session ownership", blockers=blockers)
                last = blockers
            self.heartbeat()
            time.sleep(.2)

    def _blockers(self):
        blockers = []
        for path, other in self.store.records():
            if path == self.path or other["state"] in TERMINAL:
                continue
            other = recover(path)
            if other["state"] in TERMINAL:
                continue
            prior = validate_record(read_json(path / "request.json"))
            if conflicts(self.request, prior) and (other["state"] == "running" or
                (other["created_at"], other["job_id"]) < (self.state["created_at"], self.path.name)):
                blockers.append(path.name)
        return blockers

    def run(self):
        """Keep startup, native execution, and cleanup within the guardian lifetime."""
        atomic_json(self.path / "worker.json", record(os.getpid()))
        signal.signal(signal.SIGTERM, lambda *_: setattr(self, "cancelled", True))
        signal.signal(signal.SIGINT, lambda *_: setattr(self, "cancelled", True))
        state, completion, error = "failed", {}, None
        try:
            if self.request["runner_digest"] != code_digest():
                raise AgentError("runner code changed between submission and worker startup")
            self._start_guardian()
            issue = self.acquire()
            if not issue:
                issue = self._execute()
            if issue:
                state, error = issue
            else:
                state, completion = self.protocol.finish()
                if self.proc.returncode:
                    state, error = "failed", f"Provider exited {self.proc.returncode}"
        except Exception as exc:
            state, error = self.interrupted() or (
                "blocked" if self.protocol.denied else "failed", f"{type(exc).__name__}: {exc}")
        finally:
            self._finish_after_cleanup(state, completion, error)

    def _start_guardian(self):
        self.guardian = subprocess.Popen([sys.executable, "-m", "project_governance_runtime.provider_agents.guardian", str(self.path)],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True, close_fds=True,
            pass_fds=(int(self.environment_fd),) if self.environment_fd else ())
        end = time.monotonic() + 5
        while not same_process(read_json(self.path / "guardian.json")):
            if time.monotonic() >= end or self.guardian.poll() is not None:
                raise AgentError("process guardian did not start")
            time.sleep(.05)
        self.state["ready_at"] = time.time()
        self.heartbeat(force=True)

    def _execute(self):
        self.before = snapshot(self.request["workspace"])
        version = subprocess.run([self.request["backend"], "--version"], capture_output=True, text=True, timeout=10)
        if version.returncode:
            raise AgentError("provider version probe failed: " + version.stderr[:2000])
        self.provider_version = version.stdout.strip()[:1000]
        if self.interrupted():
            return self.interrupted()
        self._launch_provider()
        return self.pump()

    def _launch_provider(self):
        env = dict(os.environ)
        ancestry = [*self.request["enclosing_jobs"], {"state_root": str(self.store.root), "job_id": self.path.name}]
        env["HARNESS_AGENT_ANCESTRY"] = json.dumps(ancestry)
        gate_read, gate_write = os.pipe()
        try:
            self.proc = subprocess.Popen([
                sys.executable, "-m", "project_governance_runtime.provider_agents.launcher",
                str(gate_read), *self.protocol.command(self.path)], cwd=self.request["workspace"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
                start_new_session=True, close_fds=True, pass_fds=(gate_read,))
            atomic_json(self.path / "provider.json", record(self.proc.pid))
            # Queueing and preflight consume the overall deadline, not provider inactivity.
            self.last_activity = time.monotonic()
            os.write(gate_write, b"1")
        finally:
            os.close(gate_read)
            os.close(gate_write)

    def _finish_after_cleanup(self, state, completion, error):
        cleaned = terminate_owned(self.path, read_json(self.path / "provider.json"), grace=.2)
        if self.proc:
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cleaned = False
        if self.proc and self.proc.returncode and state == "succeeded" and not self.expected_shutdown:
            state, error = "failed", f"Provider exited {self.proc.returncode}"
        self.finish(state, completion, error, cleanup_confirmed=cleaned)
        if not cleaned:
            return
        if self.guardian:
            self.guardian.wait(timeout=5)

    def pump(self):
        """Exchange native frames while preserving supervisor cancellation and liveness."""
        return ProviderStream(self).run()

    def finish(self, state, completion, error, cleanup_confirmed=True):
        """Persist completion evidence even when the guardian must finish cleanup."""
        artifacts = artifact_evidence(completion.get("artifacts", []), self.request["workspace"])
        remaining = [*completion.get("remaining", []), *([error] if error else [])]
        if state == "succeeded" and any(not a["exists"] for a in artifacts):
            state = "blocked"
            remaining.append("A reported artifact does not exist")
        p = self.protocol
        value = dict(protocol_version=self.request["protocol_version"], job_id=self.path.name, state=state,
            provider=self.request["provider"], provider_version=self.provider_version,
            runner_digest=self.request["runner_digest"], answer=completion.get("answer", ""),
            partial_response="".join(p.delta_parts) if not completion else "", error=error, remaining=remaining,
            workspace=self.request["workspace"], role=self.request["role"], requested_model=self.request["model"],
            observed_model=p.observed_model, requested_effort=self.request["effort"], observed_effort=p.observed_effort,
            conversation_id=p.conversation_id, parent_job_id=self.request.get("parent_job_id"),
            capabilities=p.init, artifacts=artifacts, reported_checks=completion.get("checks", []),
            reported_sources=completion.get("sources", []), observed_tools=list(p.tools.values()), denied_actions=p.denied,
            usage=p.usage, provider_exit_code=self.proc.returncode if self.proc else None, cleanup_confirmed=cleanup_confirmed,
            supervisor_closed_server=self.expected_shutdown,
            workspace_before=self.before, workspace_after=snapshot(self.request["workspace"]), finished_at=time.time())
        if not cleanup_confirmed:
            value.update(pending_state=state, state=self.state["state"], finished_at=None)
        atomic_json(self.path / "result.json", self.redactor.clean(value))
        if not cleanup_confirmed:
            # The guardian retains the environment lock; no terminal success is visible yet.
            self.state["stage"] = cleanup_stage(self.path)
            self.heartbeat(force=True)
            return
        self.state.update(state=state, stage=error or state, finished_at=value["finished_at"], current_tool=None)
        self.emit("finished", state=state, message=error or state)


def main():
    """Allow only one worker process to own a job record."""
    os.umask(0o077)
    store = Store()
    path = store.job(sys.argv[1])
    descriptor = os.open(path / "worker.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if read_json(path / "status.json")["state"] not in TERMINAL:
            Worker(store, path.name).run()
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    main()
