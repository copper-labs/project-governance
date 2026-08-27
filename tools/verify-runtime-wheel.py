#!/usr/bin/env python3
"""Prove a built governance wheel works from a clean repository-local installation."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import venv
from pathlib import Path


REPLACEMENT_SCRIPT = """\
import json
import os
from pathlib import Path

packet_path = Path(os.environ.get("PROJECT_GOVERNANCE_CHANGE_PACKET", ""))
run_id = os.environ.get("PROJECT_GOVERNANCE_RUN_ID", "")
pack_id = os.environ.get("PROJECT_GOVERNANCE_PACK_ID", "")
evidence_root = Path(os.environ.get("PROJECT_GOVERNANCE_EVIDENCE_ROOT", ""))
packet = json.loads(packet_path.read_text(encoding="utf-8")) if packet_path.is_absolute() else {}
records = packet.get("records", [])
packet_scope_is_valid = (
    records == []
    if packet.get("scope") == "all"
    else bool(records) and all(
        isinstance(record.get("after_path"), str)
        and Path(record["after_path"]).is_absolute()
        and Path(record["after_path"]).is_file()
        for record in records
    )
)
valid = all((
    packet.get("kind") == "project-governance-change-packet",
    packet.get("version") == 1,
    packet.get("scope") in {"all", "changed"},
    packet.get("mode") == ("all" if packet.get("scope") == "all" else "staged"),
    bool(run_id),
    pack_id == "synthetic-maintainability",
    evidence_root.is_absolute() and evidence_root.is_dir(),
    evidence_root.name == pack_id,
    evidence_root.parent.name == run_id,
    packet_scope_is_valid,
))
finding_count = 0 if valid else 1
print(json.dumps({
    "status": "passed" if valid else "failed",
    "finding_count": finding_count,
    "findings": [] if valid else [{
        "rule_id": "synthetic.runtime-contract",
        "message": "change packet or run-scoped environment contract failed",
    }],
}))
raise SystemExit(0 if valid else 1)
"""

VALID_COMMIT_MESSAGE = """Explain changes before review

Product impact: Contributor workflow — authors see missing context before review.
Nature of change: Unified commit and pull request orientation around one shared narrative.
Code areas impacted: Delivery governance, agent authoring workflows.
Why: Reviewers had to reconstruct purpose and impact from file changes.
"""

VALID_PR_TITLE = "Make change context understandable before review"

VALID_PR_BODY = """## Product impact

- Contributor workflow: Authors see missing product context before review.

## Nature of the change

Unified commit and pull request orientation while keeping editorial judgment with people.

## Code areas impacted

- Delivery governance

## Why

Reviewers had to reconstruct purpose and impact from file changes.
"""


def run(
    arguments: list[str], *, root: Path, expected: int
) -> subprocess.CompletedProcess[str]:
    """Run one bounded subprocess and retain enough output to diagnose a failed seam."""
    result = subprocess.run(arguments, cwd=root, text=True, capture_output=True, check=False)
    if result.returncode != expected:
        raise RuntimeError(
            f"expected exit {expected}, received {result.returncode}: {' '.join(arguments)}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def runtime_python(environment: Path) -> Path:
    """Return the executable path for the isolated environment on the current host."""
    return environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")


def runtime_lock(wheel: Path, release_base: Path) -> dict[str, object]:
    """Describe the exact local artifact so doctor can validate the child integration surface."""
    return {
        "schema_version": 1,
        "package": "project-governance-runtime",
        "version": "source-ci",
        "wheel": wheel.name,
        "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest(),
        "source_commit": "0" * 40,
        "python": ">=3.9,<4",
        "configuration_schema": 2,
        "release_base_url": release_base.as_uri(),
    }


def write_synthetic_packs(root: Path, python: Path) -> None:
    """Add deterministic target packs, including one explicit built-in replacement."""
    directory = root / "config/validation/packs"
    directory.mkdir(parents=True, exist_ok=True)

    def manifest(identifier: str, path: str, status: str) -> dict[str, object]:
        """Return one JSON-compatible YAML extension with a deterministic checker result."""
        result = {"status": status, "findings": []}
        if status == "failed":
            result["findings"] = [
                {"rule_id": "synthetic.failure", "message": "expected failure"}
            ]
        return {
            "id": identifier,
            "enforcement": "blocking",
            "stages": ["pre-commit"],
            "path_globs": [path],
            "depends_on": [],
            "commands": [[str(python), "-c", f"import json; print({json.dumps(result)!r})"]],
        }

    # JSON is valid YAML, which avoids adding a serializer dependency to this smoke proof.
    for identifier, path, status in (
        ("synthetic-pass", "synthetic/pass.txt", "passed"),
        ("synthetic-fail", "synthetic/fail.txt", "failed"),
    ):
        (directory / f"{identifier}.yaml").write_text(
            json.dumps(manifest(identifier, path, status), indent=2) + "\n",
            encoding="utf-8",
        )

    replacement = {
        "id": "synthetic-maintainability",
        "implementation_status": "active",
        "enforcement": "blocking",
        "stages": ["pre-commit", "pre-push", "pre-pr", "ci-pr"],
        "run_when": "matched",
        "path_globs": [
            "**/*.py",
            "**/*.kt",
            "**/*.kts",
            "**/*.swift",
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs",
            "**/*.cts",
            "**/*.mts",
            "**/*.dart",
            "**/*.sh",
            "synthetic/**",
        ],
        "depends_on": [],
        "commands": [[str(python), "-c", REPLACEMENT_SCRIPT]],
        "replaces_builtin_packs": ["maintainability"],
        "change_packet_contract": 1,
    }
    (directory / "synthetic-maintainability.yaml").write_text(
        json.dumps(replacement, indent=2) + "\n",
        encoding="utf-8",
    )


def stage_only(root: Path, relative: str) -> None:
    """Stage exactly one synthetic change against the committed target baseline."""
    run(["git", "reset", "-q"], root=root, expected=0)
    run(["git", "add", "--", relative], root=root, expected=0)


def initialize_target(root: Path, wheel: Path) -> tuple[Path, Path]:
    """Install the wheel and commit the initialized target as the comparison baseline."""
    run(["git", "init", "-q"], root=root, expected=0)
    environment = root / ".venv"
    venv.EnvBuilder(with_pip=True, clear=True).create(environment)
    python = runtime_python(environment)
    run([str(python), "-m", "pip", "install", str(wheel)], root=root, expected=0)
    executable = "Scripts/project-governance.exe" if sys.platform == "win32" else "bin/project-governance"
    command = environment / executable
    run([str(command), "init"], root=root, expected=0)
    run(
        [
            str(python),
            "-c",
            "from pathlib import Path; "
            "from project_governance_runtime.installation import materialize_skills; "
            "materialize_skills(Path.cwd())",
        ],
        root=root,
        expected=0,
    )
    for relative in (
        ".governance/runtime/skills/catalog.yaml",
        ".governance/runtime/skills/resources/reader-first-authoring.md",
        ".governance/runtime/skills/resources/change-narrative.md",
        ".governance/runtime/skills/kmp-implementation/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/manifest.yaml",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-sharing-and-architecture/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-source-sets-and-platform-boundaries/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-build-and-compatibility/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-coroutines-and-concurrency/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-api-and-artifact-boundaries/SKILL.md",
        ".governance/runtime/skills/stack-packs/kmp/core/"
        "kmp-test-and-evidence/SKILL.md",
    ):
        if not (root / relative).is_file():
            raise RuntimeError(f"installed wheel did not materialize {relative}")
    release_base = root.parent / "release-assets"
    release_version = release_base / "source-ci"
    release_version.mkdir(parents=True)
    (release_version / wheel.name).write_bytes(wheel.read_bytes())
    lock_path = root / "config/governance/runtime.lock.yaml"
    lock_path.write_text(
        json.dumps(runtime_lock(wheel, release_base), indent=2) + "\n",
        encoding="utf-8",
    )
    run(
        [sys.executable, str(root / "tools/governance-bootstrap.py")],
        root=root,
        expected=0,
    )
    run([str(command), "doctor"], root=root, expected=0)
    run(["git", "config", "user.email", "runtime@example.invalid"], root=root, expected=0)
    run(["git", "config", "user.name", "Runtime Wheel Verification"], root=root, expected=0)
    run(["git", "add", "-A"], root=root, expected=0)
    run(["git", "commit", "-qm", "synthetic baseline"], root=root, expected=0)
    return python, command


def git_metadata_path(root: Path, name: str) -> Path:
    """Resolve one target-local Git metadata path without assuming a dot-git directory."""
    raw = run(
        ["git", "rev-parse", "--git-path", name], root=root, expected=0
    ).stdout.strip()
    path = Path(raw)
    return path if path.is_absolute() else (root / path).resolve()


def verify_change_narratives(root: Path, command: Path) -> None:
    """Prove the installed wheel rejects empty input and accepts both authored narratives."""
    commit_path = git_metadata_path(root, "COMMIT_EDITMSG")
    pr_path = git_metadata_path(root, "PR_DESCRIPTION.md")
    pr_title_path = git_metadata_path(root, "PR_TITLE")
    pre_pr_hook = (root / ".githooks/pre-pr").read_text(encoding="utf-8")
    if "--pack pr-description --stage pre-pr --mode all" not in pre_pr_hook:
        raise RuntimeError("installed pre-PR hook is not narrative-only")

    commit_path.write_text("short\n", encoding="utf-8")
    run(
        [
            str(command),
            "check",
            "--pack",
            "commit-message",
            "--base-ref",
            "HEAD",
            "--commit-message-file",
            str(commit_path),
        ],
        root=root,
        expected=1,
    )
    commit_path.write_text(VALID_COMMIT_MESSAGE, encoding="utf-8")
    run(
        [
            str(command),
            "check",
            "--pack",
            "commit-message",
            "--base-ref",
            "HEAD",
            "--commit-message-file",
            str(commit_path),
        ],
        root=root,
        expected=0,
    )

    pr_title_path.write_text(VALID_PR_TITLE + "\n", encoding="utf-8")
    pr_path.write_text("", encoding="utf-8")
    empty_pr = run([str(root / ".githooks/pre-pr")], root=root, expected=1)
    if "pr-description.empty-body" not in empty_pr.stdout:
        raise RuntimeError("installed pre-PR proof did not reject the empty body")
    pr_path.write_text(VALID_PR_BODY, encoding="utf-8")
    pr_title_path.write_text("short\n", encoding="utf-8")
    short_title = run([str(root / ".githooks/pre-pr")], root=root, expected=1)
    if "pr-description.title-short" not in short_title.stdout:
        raise RuntimeError("installed pre-PR proof did not reject the short title")
    pr_title_path.write_text(VALID_PR_TITLE + "\n", encoding="utf-8")
    run([str(root / ".githooks/pre-pr")], root=root, expected=0)


def write_synthetic_changes(root: Path) -> None:
    """Create four independent target changes for pass, source, fail, and unmapped proof."""
    (root / "synthetic").mkdir()
    (root / "synthetic/pass.txt").write_text("pass\n", encoding="utf-8")
    (root / "synthetic/fail.txt").write_text("fail\n", encoding="utf-8")
    (root / "synthetic/example.py").write_text(
        '"""Exercise installed source check dependencies."""\n\n'
        "def example() -> None:\n"
        '    """Provide a minimal governed declaration."""\n',
        encoding="utf-8",
    )
    (root / "unmapped").mkdir()
    (root / "unmapped/input.bin").write_bytes(b"unmapped\n")


def verify_replacement_plan(root: Path, command: Path) -> None:
    """Prove all-mode transfers maintainability ownership exactly once."""
    result = run(
        [str(command), "plan", "--stage", "pre-commit", "--mode", "all", "--json"],
        root=root,
        expected=0,
    )
    selected = json.loads(result.stdout)["selected_packs"]
    if selected.count("synthetic-maintainability") != 1 or "maintainability" in selected:
        raise RuntimeError(
            "all-mode did not select the target replacement exactly once without its built-in"
        )


def verify_staged_outcomes(root: Path, command: Path) -> None:
    """Prove four isolated staged outcomes through installed-wheel execution."""
    for path, expected in (
        ("synthetic/pass.txt", 0),
        ("synthetic/example.py", 0),
        ("synthetic/fail.txt", 1),
        ("unmapped/input.bin", 1),
    ):
        stage_only(root, path)
        run(
            [str(command), "check", "--stage", "pre-commit", "--mode", "impacted", "--staged"],
            root=root,
            expected=expected,
        )


def verify_documentation_system(root: Path, command: Path) -> None:
    """Prove installed initialization, exact routes, and validation."""
    preview = json.loads(
        run([str(command), "docs", "init", "--dry-run"], root=root, expected=0).stdout
    )
    if preview.get("status") != "dry-run" or (root / "docs/developer").exists():
        raise RuntimeError("documentation dry-run mutated the clean adopter")
    initialized = json.loads(
        run([str(command), "docs", "init"], root=root, expected=0).stdout
    )
    if initialized.get("status") != "initialized":
        raise RuntimeError("documentation initialization did not report initialized")

    profile_path = root / "config/governance/profile.yaml"
    profile_text = profile_path.read_text(encoding="utf-8")
    profile_path.write_text(
        profile_text.replace("research: allowed", "research: disabled"),
        encoding="utf-8",
    )
    catalog_path = root / "docs/developer/catalog.yaml"
    catalog_path.write_text(
        json.dumps(
            {
                "version": 1,
                "capabilities": [
                    {
                        "id": "installed-runtime",
                        "title": "Installed Runtime",
                        "reference": "docs/developer/index.md",
                        "aliases": ["governed-check"],
                        "symbols": ["project-governance"],
                        "sources": ["config/governance/profile.yaml"],
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    for flag, query in (
        ("--capability", "installed-runtime"),
        ("--capability", "governed-check"),
        ("--symbol", "project-governance"),
    ):
        routed = json.loads(
            run(
                [str(command), "docs", "route", flag, query, "--json"],
                root=root,
                expected=0,
            ).stdout
        )
        if routed.get("status") != "matched" or routed.get("research") != "disabled":
            raise RuntimeError(f"installed documentation route did not match {flag}")
    repeated = json.loads(
        run([str(command), "docs", "init"], root=root, expected=0).stdout
    )
    if repeated.get("status") != "unchanged":
        raise RuntimeError("repeated documentation initialization was not idempotent")
    run(
        [str(command), "check", "--pack", "documentation", "--base-ref", "HEAD"],
        root=root,
        expected=0,
    )


def verify_custom_documentation_root(root: Path, command: Path) -> None:
    """Prove the installed command resolves a profile-owned non-default root."""
    custom_root = root / "custom-documentation-adopter"
    custom_root.mkdir()
    run([str(command), "init"], root=custom_root, expected=0)
    custom_profile = custom_root / "config/governance/profile.yaml"
    custom_profile.write_text(
        custom_profile.read_text(encoding="utf-8")
        + "documentation:\n"
        + "  enabled: true\n"
        + "  root: knowledge/developer\n"
        + "  research: disabled\n",
        encoding="utf-8",
    )
    custom = json.loads(
        run([str(command), "docs", "init"], root=custom_root, expected=0).stdout
    )
    if custom.get("status") != "initialized" or not (
        custom_root / "knowledge/developer/catalog.yaml"
    ).is_file():
        raise RuntimeError("installed documentation init ignored the configured root")


def verify_documentation_conflict(root: Path, command: Path) -> None:
    """Prove an installed conflict neither activates nor claims a profile mutation."""
    conflict_root = root / "conflicting-documentation-adopter"
    target = conflict_root / "docs/developer"
    target.parent.mkdir(parents=True)
    target.write_text("not a directory\n", encoding="utf-8")
    conflict = json.loads(
        run([str(command), "docs", "init"], root=conflict_root, expected=1).stdout
    )
    if (
        conflict.get("status") != "failed"
        or conflict.get("created")
        or conflict.get("updated")
        or (conflict_root / "config/governance/profile.yaml").exists()
    ):
        raise RuntimeError("installed documentation conflict reported or wrote profile changes")


def verify_context_cache_boundary(root: Path, command: Path) -> None:
    """Prove the installed context command bounds packets and removes interrupted staging."""
    guide = root / "docs/governance/context-guide.md"
    guide.parent.mkdir(parents=True, exist_ok=True)
    guide.write_text("Installed context guide\n", encoding="utf-8")
    profile_path = root / "config/governance/profile.yaml"
    profile = {
        "schema_version": 1,
        "project_extensions": [],
        "context_router": {
            "default_context": [],
            "default_skills": ["work"],
            "routes": [
                {
                    "id": "governance",
                    "match": {"prompt_terms": ["governance"]},
                    "primary_context": ["docs/governance/context-guide.md"],
                    "token_budget": {
                        "primary_context_tokens": 100,
                        "active_plan_context_tokens": 100,
                        "expansion_context_tokens": 100,
                        "total_context_tokens": 1000,
                    },
                }
            ],
        },
    }
    profile_path.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    resolved = json.loads(
        run(
            [str(command), "context", "--task", "governance", "--json"],
            root=root,
            expected=0,
        ).stdout
    )
    if resolved["materialization"]["byte_limits"]["combined"] > 256 * 1024:
        raise RuntimeError("installed context packet exceeded its runtime-owned byte ceiling")
    runtime_root = root / ".governance/runtime/context"
    abandoned = runtime_root / ".context-interrupted"
    abandoned.mkdir()
    (abandoned / "partial").write_text("partial\n", encoding="utf-8")
    run(
        [str(command), "context", "--task", "governance", "--json"],
        root=root,
        expected=0,
    )
    if abandoned.exists():
        raise RuntimeError("installed context command retained interrupted staging")
    profile["context_router"]["routes"][0]["token_budget"][
        "total_context_tokens"
    ] = 70_000
    profile_path.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    rejected = json.loads(
        run(
            [str(command), "context", "--task", "governance", "--json"],
            root=root,
            expected=1,
        ).stdout
    )
    if "packet ceiling" not in str(rejected.get("error", "")):
        raise RuntimeError("installed context command did not explain the packet ceiling")


def main() -> int:
    """Install the supplied wheel and prove its target-facing seams."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wheel", type=Path)
    wheel = parser.parse_args().wheel.resolve()
    if not wheel.is_file():
        raise SystemExit(f"wheel is missing: {wheel}")
    with tempfile.TemporaryDirectory(prefix="project-governance-wheel-") as temporary:
        root = Path(temporary) / "target"
        root.mkdir()
        python, command = initialize_target(root, wheel)
        verify_change_narratives(root, command)
        write_synthetic_packs(root, python)
        write_synthetic_changes(root)
        verify_replacement_plan(root, command)
        verify_staged_outcomes(root, command)
        verify_documentation_system(root, command)
        verify_custom_documentation_root(root, command)
        verify_documentation_conflict(root, command)
        verify_context_cache_boundary(root, command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
