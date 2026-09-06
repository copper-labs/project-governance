"""Install stable opt-in host launchers while preserving authored configuration."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
from importlib.resources import files

from .installation import LOCK_PATH
from .startup_installation import _run, activate, active_environment, environment_parent
from .startup_state import StartupError, digest, exclusive, policy, read_json, state_root, write_json
from .state_io import atomic_write_text


START = "<!-- governance-startup:start -->"
END = "<!-- governance-startup:end -->"
RESOURCE = ".governance/runtime/skills/resources/startup-runtime-updates.md"
BLOCK = START + "\nAt top-level task entry, follow `" + RESOURCE + "`. Minor work may already be underway.\nSubagents inherit the parent runtime and never check for or initiate updates.\n" + END
SUPPORTED = {"codex"}
HOOK_COMMAND = 'python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" {provider}'
HOOK_TIMEOUTS = {"SessionStart": 90, "SubagentStart": 90, "SessionEnd": 3}


def _safe(root: Path, relative: str) -> Path:
    path = root / relative
    current = path
    while current != root:
        if current.is_symlink():
            raise StartupError("Startup integration must not replace symbolic links: " + relative)
        current = current.parent
    if path.exists() and not path.is_file():
        raise StartupError("Startup integration destination is not a file: " + relative)
    return path


def _merge_block(content: str) -> str:
    if START not in content and END not in content:
        return BLOCK + "\n\n" + content
    if content.count(START) != 1 or content.count(END) != 1 or content.index(END) < content.index(START):
        raise StartupError("Repair malformed governance startup instruction markers first")
    return content[:content.index(START)] + BLOCK + content[content.index(END) + len(END):]


def hook_config(root: Path, provider: str) -> tuple[Path, str]:
    """Merge only our stable command definitions without replacing other hook handlers."""
    relative = ".codex/hooks.json" if provider == "codex" else ".claude/settings.json"
    path = _safe(root, relative)
    value = read_json(path, {})
    if not isinstance(value, dict) or not isinstance(value.get("hooks", {}), dict):
        raise StartupError("Host hook configuration is not an object")
    events = value.setdefault("hooks", {})
    command = HOOK_COMMAND.format(provider=provider)
    for event, timeout in HOOK_TIMEOUTS.items():
        groups = events.setdefault(event, [])
        if not isinstance(groups, list):
            raise StartupError("Host hook event must contain an array of handlers")
        if any(not isinstance(group, dict) or not isinstance(group.get("hooks", []), list)
               or any(not isinstance(item, dict) for item in group.get("hooks", [])) for group in groups):
            raise StartupError("Host hook handlers are malformed")
        existing = [handler for group in groups for handler in group.get("hooks", [])
                    if "tools/governance-startup.py" in str(handler.get("command", ""))]
        expected = {"type": "command", "command": command, "timeout": timeout}
        if existing and existing != [expected]:
            raise StartupError("Existing startup hook differs; reconcile its configuration deliberately")
        if not existing:
            groups.append({"hooks": [expected]})
    return path, json.dumps(value, indent=2) + "\n"


def _integration_changes(root: Path, provider: str, settings: dict) -> dict:
    """Prepare tracked opt-in changes while preserving authored configuration."""
    changes = {}
    path, content = hook_config(root, provider)
    changes[path] = content
    launcher = _safe(root, "tools/governance-startup.py")
    expected = files("project_governance_runtime").joinpath("assets/tools/governance-startup.py").read_text()
    if launcher.exists() and launcher.read_text() != expected:
        raise StartupError("Existing startup launcher is customized; reconcile it before enabling")
    changes[launcher] = expected
    for name in ("AGENTS.md", "AGENTS.override.md") if provider == "codex" else ("CLAUDE.md",):
        entry = _safe(root, name)
        old = entry.read_text() if entry.exists() else ""
        if name == "AGENTS.override.md" and not old.strip():
            continue
        changes[entry] = _merge_block(old)
    profile = _safe(root, "config/governance/profile.yaml")
    current = profile.read_text()
    if settings["policy"] != "compatible":
        from .configuration import load_yaml

        if "runtime_updates" in load_yaml(profile):
            raise StartupError("Set the existing runtime_updates.policy to compatible before enabling", "approval-required")
        changes[profile] = current.rstrip() + "\n\nruntime_updates:\n  policy: compatible\n"
    if provider == "codex":
        anchor = _safe(root, ".codex/config.toml")
        if not anchor.exists():
            changes[anchor] = "# Repository-local governance startup hooks live in hooks.json.\n"
    return changes


def enable(root: Path, provider: str) -> dict:
    """Perform the one-time authorized integration and real-directory environment conversion."""
    if provider not in SUPPORTED:
        raise StartupError("This provider has no certified startup adapter; automatic updates remain disabled", "approval-required")
    state = state_root(root)
    with exclusive(state / "update.lock"), exclusive(root / ".governance/runtime-use.lock"):
        if (state / "transaction.json").exists() or (state / "enable.json").exists():
            raise StartupError("Recover the interrupted update before enabling integration", "recovery-required")
        settings = policy(root)
        changes = _integration_changes(root, provider, settings)
        runtime = root / ".governance/runtime"
        if not runtime.exists():
            raise StartupError("Bootstrap the installed runtime before enabling startup updates")
        original = {path: path.read_bytes() if path.exists() else None for path in changes}
        modes = {path: path.stat().st_mode & 0o777 if path.exists() else 0o644 for path in changes}
        destination = None
        if not runtime.is_symlink():
            destination = environment_parent(root) / ("enabled-" + uuid.uuid4().hex)
            script = files("project_governance_runtime").joinpath("assets/tools/governance-bootstrap.py").read_text()
            # The exact wheel is reinstalled at its final path; virtualenv shebangs are absolute.
            program = script.split('if __name__ == "__main__":')[0]
            program += "\nraise SystemExit(install_locked(Path(" + repr(str(destination)) + "), isolated=True))\n"
            program = program.replace('ROOT = Path(__file__).resolve().parents[1]', 'ROOT = Path(' + repr(str(root)) + ')')
            _run([str(Path(sys._base_executable).resolve()), "-c", program], root, time.monotonic() + settings["install_seconds"])
        else:
            active_environment(root)
        for path, content in changes.items():
            atomic_write_text(path, content)
            path.chmod(modes[path])
        if destination is not None:
            previous = environment_parent(root) / ("before-enable-" + uuid.uuid4().hex)
            info = runtime.stat()
            write_json(state / "enable.json", {"previous": str(previous), "candidate": str(destination),
                       "lock_digest": digest((root / LOCK_PATH).read_bytes()),
                       "original_device": info.st_dev, "original_inode": info.st_ino})
            runtime.rename(previous)
            activate(root, destination)
            (state / "enable.json").unlink()
        return {"status": "enabled", "provider": provider,
                "changed_paths": [path.relative_to(root).as_posix() for path, content in changes.items()
                                  if original[path] != content.encode()],
                "next": "Review and commit the integration, trust the native hooks, then start a fresh top-level task"}


def recover_enable(root: Path) -> dict:
    """Complete a verified one-time switch, or leave the original directory in place."""
    state = state_root(root)
    path = state / "enable.json"
    value = read_json(path)
    parent = environment_parent(root)
    previous, candidate = Path(value["previous"]), Path(value["candidate"])
    if any(p.parent != parent or p.is_symlink() for p in (previous, candidate)) or not candidate.is_dir():
        raise StartupError("Enable recovery paths require inspection", "recovery-required")
    runtime = root / ".governance/runtime"
    if digest((root / LOCK_PATH).read_bytes()) != value["lock_digest"]:
        raise StartupError("Runtime lock changed during enablement", "recovery-required")
    if runtime.is_dir() and not runtime.is_symlink() and not previous.exists():
        info = runtime.stat()
        if (info.st_dev, info.st_ino) != (value["original_device"], value["original_inode"]):
            raise StartupError("Original runtime changed during enablement", "recovery-required")
        path.unlink()
        return {"status": "deferred", "reason": "Original runtime is intact; review and retry startup enable"}
    if runtime.is_symlink() and active_environment(root) == candidate:
        path.unlink()
        return {"status": "enabled", "reason": "Completed the interrupted startup integration"}
    raise StartupError("Restore the missing runtime with python3 tools/governance-bootstrap.py --recover-startup-enable", "recovery-required")
