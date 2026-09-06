"""Prove enabled startup installation and upgrade using real installed fixture wheels."""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


def fixture_wheel(wheel: Path, destination: Path, selected: str) -> Path:
    """Reidentify the exact supplied code solely for an unpublished two-version upgrade fixture."""
    name = "project_governance_runtime-" + selected
    output = destination / (name + "-py3-none-any.whl")
    entries = {}
    with zipfile.ZipFile(wheel) as archive:
        for item in archive.namelist():
            if item.endswith(".dist-info/RECORD"):
                continue
            data = archive.read(item)
            if ".dist-info/" in item:
                item = name + ".dist-info/" + item.split(".dist-info/", 1)[1]
                if item.endswith("/METADATA"):
                    lines = data.decode().splitlines(True)
                    data = "".join("Version: " + selected + "\n" if line.startswith("Version: ") else line for line in lines).encode()
            entries[item] = data
    record = io.StringIO()
    writer = csv.writer(record, lineterminator="\n")
    for path, data in entries.items():
        sha = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        writer.writerow([path, "sha256=" + sha, len(data)])
    record_path = name + ".dist-info/RECORD"
    writer.writerow([record_path, "", ""])
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for path, data in entries.items():
            archive.writestr(path, data)
        archive.writestr(record_path, record.getvalue())
    return output


def verify_startup_updates(wheel: Path, initialize_target, run) -> None:
    """Keep real installation, ordinary hook execution, and lock-only readback in one seam."""
    if os.name != "posix":
        return
    with tempfile.TemporaryDirectory(prefix="governance-startup-wheel-") as directory:
        temporary = Path(directory).resolve()
        old = fixture_wheel(wheel, temporary, "2.5.0")
        new = fixture_wheel(wheel, temporary, "2.5.1")
        root = temporary / "target"
        root.mkdir()
        initialize_target(root, old)
        runtime = root / ".governance/runtime"
        command = runtime / "bin/project-governance"
        run([str(command), "startup", "enable", "--provider", "codex"], root=root, expected=0)
        if not runtime.is_symlink():
            raise RuntimeError("Startup enable did not create an installed generation pointer")
        run([str(command), "doctor"], root=root, expected=0)
        run(["git", "add", "."], root=root, expected=0)
        run(["git", "commit", "-qm", "Enable startup governance\n\nAuthorize compatible runtime adoption before substantial implementation."], root=root, expected=0)
        # Initial wheel bootstrap uses a file transport. Selection remains owner-bound HTTPS.
        lock_path = root / "config/governance/runtime.lock.yaml"
        lock = json.loads(lock_path.read_text())
        lock["release_base_url"] = "https://github.com/example/governance/releases/download"
        lock.pop("wheel_url", None)
        lock_path.write_text(json.dumps(lock, indent=2) + "\n")
        run(["git", "add", "config/governance/runtime.lock.yaml"], root=root, expected=0)
        run(["git", "commit", "-qm", "Select fixture release owner\n\nExercise production compatibility against a synthetic distribution identity."], root=root, expected=0)
        source = root / "minor.txt"
        source.write_text("staged work\n")
        run(["git", "add", "minor.txt"], root=root, expected=0)
        source.write_text("additional unstaged work\n")
        hooks = root / ".git/hooks"
        hook = hooks / "pre-commit"
        hook.write_text('#!/bin/sh\nexec "$(git rev-parse --show-toplevel)/.governance/runtime/bin/project-governance" doctor\n')
        hook.chmod(0o755)
        program = r'''
import json, os
from pathlib import Path
from unittest.mock import patch
from project_governance_runtime.startup import handle_event
from project_governance_runtime.startup_state import digest
from project_governance_runtime.startup_transaction import apply
root = Path.cwd()
wheel = Path(os.environ["STARTUP_FIXTURE_WHEEL"])
lock = json.loads((root / "config/governance/runtime.lock.yaml").read_text())
lock.update(version="2.5.1", wheel=wheel.name, sha256=digest(wheel.read_bytes()))
raw = json.dumps(lock, indent=2) + "\n"
metadata = dict(schema_version=1, version="2.5.1", lock_sha256=digest(raw.encode()), startup_contract=1,
                automatic=True, from_version="2.5.0", before_version="3.0.0", configuration_schema=2,
                integration_change=False)
candidate = dict(status="available", reason="fixture", lock_text=raw, metadata=metadata,
                 version="2.5.1", wheel={"url":"fixture", "digest":"sha256:"+lock["sha256"]})
with patch("project_governance_runtime.startup_releases.discover", return_value=candidate):
    answer = handle_event(root, "codex", dict(hook_event_name="SessionStart", source="startup", session_id=os.environ["CODEX_THREAD_ID"]))
with patch("project_governance_runtime.startup_releases.Client.read", return_value=wheel.read_bytes()):
    print(json.dumps(apply(root, answer["task_id"], "minor", "Only an isolated minor edit is underway")))
'''
        env = dict(os.environ, CODEX_THREAD_ID="startup-wheel-fixture", STARTUP_FIXTURE_WHEEL=str(new))
        completed = subprocess.run([str(runtime / "bin/python"), "-c", program], cwd=root, env=env,
                                   capture_output=True, text=True, timeout=240, check=False)
        if completed.returncode or json.loads(completed.stdout)["status"] != "updated":
            raise RuntimeError("Installed startup upgrade failed: " + completed.stdout + completed.stderr)
        run([str(command), "doctor"], root=root, expected=0)
        if "2.5.1" not in run([str(command), "--version"], root=root, expected=0).stdout:
            raise RuntimeError("Updated stable runtime did not report the candidate version")
        paths = run(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], root=root, expected=0).stdout
        staged = run(["git", "show", ":minor.txt"], root=root, expected=0).stdout
        if paths.strip() != "config/governance/runtime.lock.yaml" or staged != "staged work\n" or source.read_text() != "additional unstaged work\n":
            raise RuntimeError("Startup upgrade failed to isolate the lock from existing work")
