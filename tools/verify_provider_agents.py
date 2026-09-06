"""Prove the installed optional command without provider accounts or native binaries."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def verify_provider_agents(root):
    """Exercise installed entry points, detached jobs, and bootstrap exclusion."""
    if sys.platform not in {"darwin", "linux"}:
        return
    with tempfile.TemporaryDirectory(prefix="provider-wheel-proof-") as temporary:
        proof = _InstalledProviderProof(root, Path(temporary))
        proof.absent_provider()
        proof.native_protocols()
        proof.upgrade_exclusion()
        proof.released_environment()


class _InstalledProviderProof:
    """Keep one installed-wheel fixture isolated from native accounts and caller state."""

    def __init__(self, root, scratch):
        self.root, self.scratch = root, scratch
        self.runtime = root / ".governance/runtime"
        self.agent = self.runtime / "bin/project-governance-agent"
        self.core = self.runtime / "bin/project-governance"
        self.python = self.runtime / "bin/python"
        self.workspace = scratch / "workspace"
        self.workspace.mkdir()
        fixture = Path(__file__).resolve().parents[1] / "tests/fixtures/provider_agent.py"
        self.native = scratch / "provider-fixture"
        self.native.write_text(f"#!{self.python}\n" + fixture.read_text().split("\n", 1)[1])
        self.native.chmod(0o700)
        self.environment = {**os.environ, "PROJECT_GOVERNANCE_AGENT_STATE": str(scratch / "state"),
                           "PROJECT_GOVERNANCE_AGENT_ANCESTRY": "[]",
                           "PROVIDER_AGENT_FIXTURE_LOG": str(scratch / "logs"),
                           "PROVIDER_AGENT_FIXTURE_SCENARIO": "normal"}
        self.environment.pop("PYTHONPATH", None)
        self.environment.pop("PROJECT_GOVERNANCE_AGENT_ENV_FD", None)

    def invoke(self, command, *arguments, expected=0, env=None):
        """Run only the installed command and keep its diagnostic output bounded."""
        result = subprocess.run([str(command), *map(str, arguments)], cwd=self.root,
                                env=env or self.environment, capture_output=True, text=True, timeout=30)
        if result.returncode != expected:
            raise RuntimeError(f"installed provider seam failed: {result.stdout}\n{result.stderr}")
        return result.stdout

    def completed(self, job_id):
        """Read the terminal receipt through the installed public interface."""
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            value = json.loads(self.invoke(self.agent, "result", job_id))
            if value.get("ready"):
                return value
            time.sleep(.05)
        raise RuntimeError("installed provider job did not finish")

    def launch(self, provider):
        """Use the same explicit binding and fixture for every native protocol."""
        return json.loads(self.invoke(self.agent, "start", "--provider", provider, "--model", "fixture-model",
            "--effort", "high", "--workspace", self.workspace, "--task", "Exercise installed provider",
            "--executable", self.native, "--require-tool", "command"))["job_id"]

    def absent_provider(self):
        """Keep ordinary governance usable when no native provider binary is discoverable."""
        absent = {**self.environment, "PATH": str(self.scratch / "empty-path")}
        self.invoke(self.core, "doctor", env=absent)
        missing = json.loads(self.invoke(self.agent, "doctor", "--provider", "gemini", expected=1, env=absent))
        if missing["available"]:
            raise RuntimeError("missing provider was incorrectly reported available")

    def native_protocols(self):
        """Require the installed skills and successful execution through all three adapters."""
        for provider in ("gemini", "claude", "codex"):
            if not (self.runtime / "skills" / f"{provider}-agent/SKILL.md").is_file():
                raise RuntimeError(f"installed provider skill is missing: {provider}")
            value = self.completed(self.launch(provider))
            if value["state"] != "succeeded" or not value["cleanup_confirmed"]:
                raise RuntimeError(f"installed provider failed: {value}")

    def upgrade_exclusion(self):
        """Refuse actual bootstrap replacement while running and queued workers hold the environment."""
        self.environment["PROVIDER_AGENT_FIXTURE_SCENARIO"] = "sleep"
        jobs = []
        try:
            for _ in range(2):
                jobs.append(self.launch("gemini"))
            if json.loads(self.invoke(self.agent, "status", jobs[1]))["state"] != "queued":
                raise RuntimeError("overlapping installed job did not queue")
            refusal = subprocess.run([str(self.python), str(self.root / "tools/governance-bootstrap.py")],
                cwd=self.root, env=self.environment, capture_output=True, text=True, timeout=10)
            if refusal.returncode == 0 or "environment is in use" not in refusal.stderr:
                raise RuntimeError("bootstrap did not refuse replacement during installed jobs")
            self.invoke(self.core, "--version")
        finally:
            self.cancel_jobs(jobs)

    def cancel_jobs(self, jobs):
        """Stop every test job before releasing its temporary workspace."""
        for job_id in jobs:
            self.invoke(self.agent, "cancel", job_id)
        for job_id in jobs:
            if self.completed(job_id)["state"] != "cancelled":
                raise RuntimeError("installed cancellation did not complete")

    def released_environment(self):
        """Verify that cleanup guardians release the installed environment lock."""
        import fcntl

        fd = os.open(self.root / ".governance/runtime-use.lock", os.O_RDWR)
        try:
            deadline = time.monotonic() + 5
            while True:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError("installed environment lock outlived job cleanup")
                    time.sleep(.05)
        finally:
            os.close(fd)
