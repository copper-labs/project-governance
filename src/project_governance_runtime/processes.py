"""Run bounded child commands for validation pack execution."""

from __future__ import annotations

import os
import signal
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandResult:
    """Describe one completed, failed, timed-out, or interrupted command."""

    argv: list[str]
    exit_code: int
    stdout: str
    stderr: str
    termination_reason: str


def _terminate(process: subprocess.Popen[str]) -> None:
    """Terminate the complete owned process group and reap it."""
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=1)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def run_command(
    argv: list[str], *, root: Path, timeout_seconds: float, environment: dict[str, str]
) -> CommandResult:
    """Run one shell-free command with a deadline and owned child cleanup."""
    process = subprocess.Popen(
        argv,
        cwd=root,
        env=environment,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
        return CommandResult(
            argv=argv,
            exit_code=int(process.returncode or 0),
            stdout=stdout,
            stderr=stderr,
            termination_reason="completed",
        )
    except subprocess.TimeoutExpired:
        _terminate(process)
        stdout, stderr = process.communicate()
        return CommandResult(argv, 124, stdout, stderr, "timeout")
    except KeyboardInterrupt:
        _terminate(process)
        stdout, stderr = process.communicate()
        return CommandResult(argv, 130, stdout, stderr, "cancelled")
