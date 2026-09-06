"""Prepare exact candidate environments without replacing the working installation."""

from __future__ import annotations

import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import time
import zipfile
from email.parser import Parser
from importlib.resources import files

from .installation import RUNTIME_LAUNCHERS
from .startup_releases import Client, asset_bytes
from .startup_state import StartupError, digest, read_json, state_root, write_json


def integration_digest() -> str:
    """Detect shipped startup or launcher changes that require deliberate adoption."""
    from .harness_integration import BLOCK

    resources = files("project_governance_runtime").joinpath("assets")
    values = [BLOCK.encode()]
    for relative in (*RUNTIME_LAUNCHERS, "tools/governance-startup.py"):
        values.append(resources.joinpath(*relative.split("/")).read_bytes())
    return digest(b"\0".join(values))


def environment_parent(root: Path) -> Path:
    """Keep immutable environment generations inside an ordinary owned directory."""
    root = root.resolve()
    state_root(root)
    parent = root / ".governance/runtimes"
    if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
        raise StartupError("Runtime generations require an ordinary repository-local directory")
    parent.mkdir(mode=0o700, exist_ok=True)
    return parent


def active_environment(root: Path) -> Path:
    """Accept only a deliberately enabled runtime pointer into this worktree's generations."""
    root = root.resolve()
    path = root / ".governance/runtime"
    if not path.is_symlink():
        raise StartupError("Enable startup updates deliberately before automatic installation")
    resolved = path.resolve()
    if resolved.parent != environment_parent(root) or not resolved.is_dir():
        raise StartupError("Active runtime pointer is outside the owned environment generations")
    return resolved


def activate(root: Path, destination: Path) -> None:
    """Switch one owned runtime pointer without moving an installed Python environment."""
    if destination.is_symlink():
        raise StartupError("Runtime generation cannot be a symbolic link")
    root, destination = root.resolve(), destination.resolve()
    if destination.parent != environment_parent(root) or destination.is_symlink() or not destination.is_dir():
        raise StartupError("Candidate runtime destination is not an owned environment")
    path = root / ".governance/runtime"
    if path.exists() and not path.is_symlink():
        raise StartupError("Runtime pointer changed unexpectedly", "recovery-required")
    temporary = path.parent / (".runtime-" + str(os.getpid()))
    if temporary.exists() or temporary.is_symlink():
        raise StartupError("Runtime pointer temporary path is already occupied")
    try:
        temporary.symlink_to(destination.relative_to(path.parent), target_is_directory=True)
        os.replace(temporary, path)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


def _run(args: list[str], root: Path, deadline: float, *, env=None) -> bytes:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise StartupError("Candidate installation deadline expired")
    process = subprocess.Popen(args, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env=env, start_new_session=True)
    try:
        stdout, _ = process.communicate(timeout=remaining)
    except subprocess.TimeoutExpired as error:
        # The installation owns this new process group, including pip build subprocesses.
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise StartupError("Candidate installation or validation deadline expired") from error
    if process.returncode:
        raise StartupError("Candidate installation or validation failed; retain the working runtime")
    return stdout


def describe(root: Path) -> dict:
    """Preview target configuration from the candidate without changing live instructions."""
    from . import __version__
    from .cli import _doctor

    status = _doctor(root)
    findings = [item for item in status["findings"] if not item.startswith("installed runtime version ")]
    return {"version": __version__, "integration": integration_digest(), "findings": findings}


def prepare(root: Path, candidate: dict, settings: dict) -> Path:
    """Install verified wheel bytes at their final path and prove target compatibility."""
    lock = json.loads(candidate["lock_text"])
    deadline = time.monotonic() + settings["install_seconds"]
    destination = environment_parent(root) / (lock["version"] + "-" + lock["sha256"])
    if destination.is_symlink():
        raise StartupError("Candidate environment is an unsafe symbolic link")
    marker = destination / ".governance-install.json"
    expected = {"lock_sha256": digest(candidate["lock_text"].encode()), "wheel_sha256": lock["sha256"]}
    if destination.exists() and read_json(marker) != expected:
        raise StartupError("An incomplete candidate environment needs deliberate cleanup before retry")
    if not destination.exists():
        client = Client(lock["release_base_url"], settings["install_seconds"])
        raw = asset_bytes(candidate["wheel"], client, 67108864)
        if digest(raw) != lock["sha256"]:
            raise StartupError("Candidate wheel differs from the exact runtime lock")
        wheel = state_root(root) / lock["wheel"]
        if wheel.is_symlink():
            raise StartupError("Wheel preparation path is unsafe")
        wheel.write_bytes(raw)
        with zipfile.ZipFile(wheel) as archive:
            names = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
            if len(names) != 1:
                raise StartupError("Candidate wheel metadata is ambiguous")
            identity = Parser().parsestr(archive.read(names[0]).decode())
        if identity["Name"] != lock["package"] or identity["Version"] != lock["version"]:
            raise StartupError("Candidate wheel identity does not match its lock")
        _run([str(Path(sys._base_executable).resolve()), "-m", "venv", str(destination)], root, deadline)
        python = str(destination / "bin/python")
        _run([python, "-m", "pip", "install", "--disable-pip-version-check", str(wheel)], root, deadline)
        _run([python, "-c", "from pathlib import Path; import sys; from project_governance_runtime.installation import materialize_skills; materialize_skills(Path.cwd(), destination=Path(sys.prefix)/'skills', refresh_instructions=False)"], root, deadline)
        write_json(marker, expected)
    python = str(destination / "bin/python")
    _run([python, "-m", "pip", "check"], root, deadline)
    description = json.loads(_run([python, "-c", "import json; from pathlib import Path; from project_governance_runtime.startup_installation import describe; print(json.dumps(describe(Path.cwd())))"], root, deadline))
    if description["version"] != lock["version"] or description["findings"]:
        raise StartupError("Candidate runtime is incompatible with the target configuration")
    if description["integration"] != integration_digest():
        raise StartupError("Release changes startup instructions or launchers; adopt it deliberately", "approval-required")
    return destination
