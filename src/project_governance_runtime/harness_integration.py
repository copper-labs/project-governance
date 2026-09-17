"""Install thin host entry instructions for the wheel-owned cross-model delegation default."""

from pathlib import Path
import os
import stat
import sys

from .state_io import atomic_write_text


START = "<!-- harness-delegation:start -->"
END = "<!-- harness-delegation:end -->"
RESOURCE = ".governance/runtime/skills/resources/harness-delegation.md"
BLOCK = f"""{START}
Cross-model work defaults to the provided harness skills. Before selecting a system wrapper,
read `{RESOURCE}`. If missing, bootstrap; do not fall back.
Before substantial builds or test batches, read `.governance/runtime/skills/test-execution/SKILL.md` and choose the cheapest reliable proof path.
{END}"""


def _entry_paths(root):
    paths = [root / name for name in ("AGENTS.md", "CLAUDE.md", "GEMINI.md")]
    override = root / "AGENTS.override.md"
    if override.exists() or override.is_symlink():
        paths.append(override)
    return paths


def _read_entry(root, path):
    target = path.resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f"Harness entry points outside this repository: {path.name}")
    relative = target.relative_to(root.resolve())
    if relative.parts and relative.parts[0].casefold() in {".governance", ".git"}:
        raise ValueError(f"Harness entry points into managed state: {path.name}")
    if target.exists() and (not target.is_file() or target.stat().st_size > 1048576):
        raise ValueError(f"Harness entry must be a regular file below 1 MiB: {path.name}")
    return target, target.read_bytes().decode("utf-8") if target.exists() else ""


def _merged(content):
    if START not in content and END not in content:
        return BLOCK + ("\n\n" + content if content else "\n")
    if content.count(START) != 1 or content.count(END) != 1 or content.index(END) < content.index(START):
        raise ValueError("Malformed harness delegation markers; repair the managed section before setup")
    first, last = content.index(START), content.index(END) + len(END)
    return content[:first] + BLOCK + content[last:]


def _uses_section(path, content):
    # Codex skips empty overrides; populating one would hide the authored AGENTS.md.
    return path.name != "AGENTS.override.md" or bool(content.strip())


def install_harness_instructions(root: Path) -> list[str]:
    """Add or refresh only managed pointers while preserving authored host instructions."""
    if (root / "src/project_governance_runtime/cli.py").is_file():
        return []
    changes = {}
    # Validate every destination before writing; shared in-repository symlinks stay intact.
    entries = [(path, *_read_entry(root, path)) for path in _entry_paths(root)]
    inactive = {target for path, target, current in entries if not _uses_section(path, current)}
    for path, target, current in entries:
        if not _uses_section(path, current):
            continue
        if target.exists() and any(target.samefile(override) for override in inactive):
            raise ValueError(f"Harness entry would activate an empty override: {path.name}")
        expected = _merged(current)
        if current != expected:
            changes[target] = expected
    for target, content in changes.items():
        mode = stat.S_IMODE(target.stat().st_mode) if target.exists() else 0o644
        atomic_write_text(target, content)
        target.chmod(mode)
    return [path.relative_to(root.resolve()).as_posix() for path in changes]


def harness_routing_status(root: Path) -> dict:
    """Report installed default routing without launching a provider or certifying model behavior."""
    issues, entries = [], []
    for path in _entry_paths(root):
        relative = path.relative_to(root).as_posix()
        entries.append(relative)
        try:
            _, content = _read_entry(root, path)
            if _uses_section(path, content) and content != _merged(content):
                issues.append(f"Missing or outdated harness routing section: {relative}")
        except (OSError, ValueError, RuntimeError) as error:
            issues.append(str(error))
    executable = root / ".governance/runtime" / (
        "Scripts/harness-agent.exe" if sys.platform == "win32" else "bin/harness-agent")
    required = [RESOURCE, ".governance/runtime/skills/resources/harness-agent-operation.md"]
    required += [".governance/runtime/skills/test-execution/SKILL.md", ".governance/runtime/skills/resources/test-batch-contract.md"]
    required.extend(f".governance/runtime/skills/harness-{p}-agent/SKILL.md" for p in ("gemini", "claude", "codex"))
    for relative in required:
        if not (root / relative).is_file():
            issues.append(f"Missing harness resource: {relative}; bootstrap the pinned runtime")
    if not executable.is_file() or not os.access(executable, os.X_OK):
        issues.append("The pinned harness-agent executable is missing; bootstrap the pinned runtime")
    return {"default_route": "harness", "status": "ready" if not issues else "needs-attention",
            "instruction_files": entries, "resource": RESOURCE, "executable": str(executable.resolve()),
            "skills": {p: f"harness-{p}-agent" for p in ("gemini", "claude", "codex")},
            "test_execution": {"skill": "test-execution", "batch": "available" if not issues else "needs-setup",
                               "completion": "Codex queue or Claude native Monitor; qualify the active host"},
            "issues": issues, "global_instruction_conflicts": "not automatically certified"}
