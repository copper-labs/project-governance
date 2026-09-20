"""Exercise bundled continuity and the real governance executor from an installed wheel."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess


def invoke(command: Path, root: Path, arguments: list[str], expected: int = 0, **extra) -> dict:
    """Keep owner state local and make source-tree imports unavailable to the installed process."""
    environment = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    environment.update(HARNESS_AGENT_STATE=str(root / "owner"), **extra)
    result = subprocess.run([str(command), "harness", *arguments], cwd=root, env=environment,
                            text=True, capture_output=True, timeout=45, check=False)
    if result.returncode != expected:
        raise RuntimeError(f"Continuity exit {result.returncode}, expected {expected}: {result.stdout}\n{result.stderr}")
    return json.loads(result.stdout)


def verify_continuity(root: Path, command: Path) -> None:
    """Prove package data, generation binding, persisted resume and terminal job observation."""
    target = root / "continuity fixture"
    target.mkdir()
    subprocess.run(["git", "init", "-q", str(target)], check=True)
    doctor = invoke(command, target, ["doctor"])
    assert doctor["governanceVersion"] and doctor["executor"] == "present; not qualified"
    task = invoke(command, target, ["task", "create", "--outcome", "Verify bundled continuity", "--scope", str(target)])
    task_id = task["task"]["taskId"]
    invoke(command, target, ["checkpoint", "--task", task_id, "--summary", "Installed payload reached", "--next", "Observe check"])
    resumed = invoke(command, target, ["resume", "--task", task_id, "--session", "installed-fixture"])
    assert "Installed payload reached" in json.dumps(resumed)
    python = command.parent / "python"
    for exit_code, expected in [(0, 0), (7, 1)]:
        result = invoke(command, target, ["check", "run", "--task", task_id,
            "--authority-ref", "installed-fixture", "--wait", "20", "--", str(python),
            "-c", f"raise SystemExit({exit_code})"], expected)
        assert result["established"] and result["jobId"]
        observed = invoke(command, target, ["check", "result", "--action", result["actionId"]], expected)
        assert observed["jobId"] == result["jobId"]
    missing = subprocess.run([str(command), "harness", "doctor"], cwd=target,
        env={**os.environ, "GOVERNANCE_NODE": str(target / "missing-node")},
        capture_output=True, text=True, timeout=15, check=False)
    assert missing.returncode == 2 and "Node" in missing.stderr
    ordinary = subprocess.run([str(command), "--version"], cwd=target,
        env={**os.environ, "GOVERNANCE_NODE": str(target / "missing-node")},
        capture_output=True, text=True, timeout=15, check=False)
    assert ordinary.returncode == 0
