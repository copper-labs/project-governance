"""Execute prepared validation packs while keeping runner orchestration compact."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
import stat
import subprocess
import tempfile
from pathlib import Path
from time import monotonic
from typing import Any, Iterator
from uuid import uuid4

from .changed_paths import scope_subject_digest, worktree_source
from .checker_scripts.finding_lifecycle import FINDING_STATES
from .evidence_manifest import inspect_evidence_manifest
from .execution_commands import command_argv, normalized_command
from .processes import run_command
from .state_io import path_lock


PACKET_SHA256_ENV = "PROJECT_GOVERNANCE_CHANGE_PACKET_SHA256"
ACTIVE_RUN_MARKER = ".active"


def _pack_directory_name(pack_id: str) -> str:
    """Keep target-controlled pack identities inside one run directory."""
    if (
        pack_id
        and pack_id not in {".", ".."}
        and all(character.isalnum() or character in "-._" for character in pack_id)
    ):
        return pack_id
    digest = hashlib.sha256(pack_id.encode("utf-8")).hexdigest()[:16]
    return f"pack-{digest}"


def _source_bytes(root: Path, source: dict[str, str]) -> bytes:
    """Read one packet source without selecting a new comparison subject."""
    kind = source.get("kind")
    path = source.get("path", "")
    if kind == "worktree":
        content, file_type = worktree_source(root, path)
        if file_type != source.get("file_type"):
            raise ValueError(f"worktree source changed file type for {path}")
        return content
    object_name = source.get("identity")
    if not object_name:
        raise ValueError(f"unbound {kind} content for {path}")
    result = subprocess.run(
        ["git", "cat-file", "blob", object_name],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(detail or f"cannot materialize {kind} content for {path}")
    return result.stdout


def _resolved_source_bytes(
    root: Path, records: list[dict[str, Any]]
) -> dict[tuple[int, str], bytes]:
    """Read every source once and reject mutable content as one stale subject."""
    content: dict[tuple[int, str], bytes] = {}
    stale_paths: set[str] = set()
    for index, record in enumerate(records):
        for side in ("before", "after"):
            source = record.get(side)
            if source is None:
                continue
            try:
                value = _source_bytes(root, source)
            except (OSError, RuntimeError, ValueError):
                stale_paths.add(record["path"])
                continue
            expected = source.get("identity", "")
            if source.get("kind") == "worktree":
                actual = f"sha256:{hashlib.sha256(value).hexdigest()}"
                if not expected or actual != expected:
                    stale_paths.add(record["path"])
                    continue
            content[(index, side)] = value
    if stale_paths:
        joined = ", ".join(sorted(stale_paths))
        raise ValueError(f"change scope is stale; content changed after planning: {joined}")
    return content


def _materialize_source(
    temporary_root: Path,
    record_index: int,
    side: str,
    source: dict[str, str] | None,
    content: dict[tuple[int, str], bytes],
) -> str | None:
    """Write exact comparison bytes to one read-only temporary path."""
    if source is None:
        return None
    relative = Path(source["path"])
    output = temporary_root / side / f"{record_index:04d}" / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(content[(record_index, side)])
    output.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    return str(output.resolve())


def _wire_packet(root: Path, plan: dict[str, Any], temporary_root: Path) -> dict[str, Any]:
    """Materialize the plan's internal source locators into the public packet schema."""
    scope = plan.get("change_scope")
    if not isinstance(scope, dict):
        raise RuntimeError("execution requires a resolved change_scope")
    records = scope.get("records", [])
    digest = scope_subject_digest(scope)
    if scope.get("subject_digest", digest) != digest:
        raise ValueError("change scope subject digest does not match its logical records")
    content = _resolved_source_bytes(root, records)
    wire_records: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        before_path = _materialize_source(
            temporary_root, index, "before", record.get("before"), content
        )
        after_path = _materialize_source(
            temporary_root, index, "after", record.get("after"), content
        )
        wire_records.append({
            "status": record["status"],
            "path": record["path"],
            "previous_path": record.get("previous_path"),
            "before_path": before_path,
            "before_sha256": (
                hashlib.sha256(content[(index, "before")]).hexdigest()
                if before_path is not None else None
            ),
            "before_file_type": (
                record.get("before", {}).get("file_type")
                if record.get("before") is not None else None
            ),
            "after_path": after_path,
            "after_sha256": (
                hashlib.sha256(content[(index, "after")]).hexdigest()
                if after_path is not None else None
            ),
            "after_file_type": (
                record.get("after", {}).get("file_type")
                if record.get("after") is not None else None
            ),
            "changed_ranges": record.get("changed_ranges", []),
        })
    return {
        "kind": "project-governance-change-packet",
        "version": 1,
        "scope": scope["scope"],
        "mode": scope["mode"],
        "base_ref": scope.get("base_ref"),
        "subject_digest": digest,
        "records": wire_records,
    }


@contextmanager
def execution_environment(
    root: Path, plan: dict[str, Any], *, run_id: str | None = None
) -> Iterator[dict[str, str]]:
    """Provide one read-only materialized change packet to every child command."""
    resolved_run_id = run_id or str(uuid4())
    runs_root = root / ".governance/runtime/runs"
    run_root = runs_root / resolved_run_id
    active = run_root / ACTIVE_RUN_MARKER
    runs_state = root / ".governance/runtime/.runs-state"
    with path_lock(runs_state, timeout_seconds=None):
        run_root.mkdir(parents=True, exist_ok=True)
        active.touch(exist_ok=False)
        _prune_empty_evidence_scaffolding(runs_root)
    try:
        with tempfile.TemporaryDirectory(prefix="project-governance-change-") as directory:
            temporary_root = Path(directory)
            packet = _wire_packet(root, plan, temporary_root)
            packet_path = temporary_root / "change-packet.json"
            packet_path.write_text(
                json.dumps(packet, sort_keys=True, separators=(",", ":")),
                encoding="utf-8",
            )
            packet_path.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            environment = dict(os.environ)
            environment["PROJECT_GOVERNANCE_ROOT"] = str(root)
            environment["PROJECT_GOVERNANCE_CHANGE_PACKET"] = str(packet_path.resolve())
            environment[PACKET_SHA256_ENV] = hashlib.sha256(packet_path.read_bytes()).hexdigest()
            if packet["subject_digest"] is not None:
                environment["PROJECT_GOVERNANCE_SUBJECT_DIGEST"] = packet["subject_digest"]
            else:
                environment.pop("PROJECT_GOVERNANCE_SUBJECT_DIGEST", None)
            environment["PROJECT_GOVERNANCE_RUN_ID"] = resolved_run_id
            yield environment
    finally:
        with path_lock(runs_state, timeout_seconds=None):
            active.unlink(missing_ok=True)
            _prune_empty_evidence_scaffolding(runs_root)


def execute_packs(
    root: Path,
    packs: dict[str, dict[str, Any]],
    plan: dict[str, Any],
    *,
    timeout_seconds: float | None,
    environment: dict[str, str],
    command_arguments: dict[str, str],
) -> tuple[list[dict[str, Any]], str, str]:
    """Run selected packs in order and stop only at a blocking failed pack."""
    evidence: list[dict[str, Any]] = []
    overall = "passed"
    termination = "completed"
    for pack_id in plan["execution_order"]:
        item, pack_termination = execute_pack(
            root,
            pack_id,
            packs[pack_id],
            plan,
            timeout_seconds=timeout_seconds,
            environment=environment,
            command_arguments=command_arguments,
        )
        evidence.append(item)
        if pack_termination is not None:
            termination = pack_termination
        if item["evidence_manifest"]["status"] == "invalid":
            return evidence, "failed", termination
        if item["process_failure_count"]:
            return evidence, "failed", termination
        if item["integrity_failure_count"]:
            return evidence, "failed", termination
        if item["status"] == "failed" and packs[pack_id].get("enforcement") == "blocking":
            return evidence, "failed", termination
        if item["status"] in {"failed", "warning"} and overall == "passed":
            overall = "warning"
    return evidence, overall, termination


def execute_pack(
    root: Path,
    pack_id: str,
    pack: dict[str, Any],
    plan: dict[str, Any],
    *,
    timeout_seconds: float | None,
    environment: dict[str, str],
    command_arguments: dict[str, str],
) -> tuple[dict[str, Any], str | None]:
    """Run one pack's applicable commands and retain their complete evidence."""
    started = monotonic()
    pack_environment = dict(environment)
    pack_environment["PROJECT_GOVERNANCE_PACK_ID"] = pack_id
    if _pack_reads_live_checkout(pack, plan):
        pack_environment.pop("PROJECT_GOVERNANCE_SUBJECT_DIGEST", None)
    evidence_root = root / ".governance" / "runtime" / "runs"
    evidence_root /= environment["PROJECT_GOVERNANCE_RUN_ID"]
    evidence_root /= _pack_directory_name(pack_id)
    evidence_root.mkdir(parents=True, exist_ok=True)
    pack_environment["PROJECT_GOVERNANCE_EVIDENCE_ROOT"] = str(evidence_root.resolve())
    commands: list[dict[str, Any]] = []
    status = "passed"
    termination: str | None = None
    for entry in pack["commands"]:
        command, command_status, command_termination = execute_command(
            root,
            entry,
            plan,
            timeout_seconds=timeout_seconds,
            environment=pack_environment,
            command_arguments=command_arguments,
        )
        if command is None:
            continue
        commands.append(command)
        if command_status == "failed":
            status = "failed"
            termination = command_termination
            if bool(pack.get("fail_fast", True)):
                break
        if command_status == "warning" and status == "passed":
            status = "warning"
    applicability_findings = []
    if not commands:
        status = "failed"
        applicability_findings.append({
            "rule_id": "pack.no-applicable-command",
            "severity": (
                "blocking" if pack.get("enforcement") == "blocking" else "advisory"
            ),
            "pack_id": pack_id,
            "message": "selected pack resolved no runnable commands",
        })
    manifest = inspect_evidence_manifest(
        evidence_root,
        pack_environment.get("PROJECT_GOVERNANCE_SUBJECT_DIGEST"),
    )
    _remove_empty_evidence_directories(evidence_root)
    manifest_findings = [
        {**finding, "pack_id": pack_id} for finding in manifest["findings"]
    ]
    pack_findings = applicability_findings + manifest_findings
    if pack_findings:
        status = "failed"
    finding_counts = {
        state: sum(
            command["finding_counts"].get(state, 0) for command in commands
        )
        + sum(finding.get("severity") == state for finding in pack_findings)
        for state in FINDING_STATES
    }
    process_failure_count = sum(command["process_failure"] for command in commands)
    integrity_failure_count = sum(command["integrity_failure"] for command in commands)
    manifest = {**manifest, "findings": manifest_findings}
    return {
        "pack_id": pack_id,
        "status": status,
        "duration_ms": round((monotonic() - started) * 1000, 3),
        "finding_count": sum(finding_counts.values()),
        "finding_counts": finding_counts,
        "process_failure_count": process_failure_count,
        "integrity_failure_count": integrity_failure_count,
        "subject_digest": pack_environment.get("PROJECT_GOVERNANCE_SUBJECT_DIGEST"),
        "findings": pack_findings,
        "evidence_manifest": manifest,
        "evidence_manifest_count": int(manifest["status"] != "absent"),
        "valid_evidence_manifest_count": int(manifest["status"] == "valid"),
        "invalid_evidence_manifest_count": int(manifest["status"] == "invalid"),
        "evidence_claim_count": manifest["claim_count"],
        "evidence_artifact_digest_count": manifest["artifact_digest_count"],
        "commands": commands,
    }, termination


def _remove_empty_evidence_directories(evidence_root: Path) -> None:
    """Prune only empty directories created for this pack and run."""
    try:
        evidence_root.rmdir()
    except OSError:
        return
    try:
        evidence_root.parent.rmdir()
    except OSError:
        pass


def _prune_empty_evidence_scaffolding(runs_root: Path) -> None:
    """Reclaim only inactive empty run and pack directories owned by the runtime."""
    try:
        run_roots = list(runs_root.iterdir())
    except OSError:
        return
    for run_root in run_roots:
        if (
            run_root.is_symlink()
            or not run_root.is_dir()
            or (run_root / ACTIVE_RUN_MARKER).exists()
        ):
            continue
        try:
            pack_roots = list(run_root.iterdir())
        except OSError:
            continue
        for pack_root in pack_roots:
            if pack_root.is_symlink() or not pack_root.is_dir():
                continue
            try:
                pack_root.rmdir()
            except OSError:
                pass
        try:
            run_root.rmdir()
        except OSError:
            pass
    try:
        runs_root.rmdir()
    except OSError:
        pass


def execute_command(
    root: Path,
    entry: Any,
    plan: dict[str, Any],
    *,
    timeout_seconds: float | None,
    environment: dict[str, str],
    command_arguments: dict[str, str],
) -> tuple[dict[str, Any] | None, str | None, str | None]:
    """Execute one applicable manifest command and normalize its process result."""
    argv = command_argv(
        entry,
        stage=plan.get("stage"),
        mode=plan["mode"],
        command_arguments=command_arguments,
    )
    if argv is None:
        return None, None, None
    try:
        _verify_materialized_packet(environment)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        command = _packet_integrity_command(argv, str(error))
        return command, "failed", "packet-integrity"
    result = run_command(
        argv,
        root=root,
        timeout_seconds=timeout_seconds,
        environment=environment,
    )
    command, status = normalized_command(result, argv)
    try:
        _verify_materialized_packet(environment)
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        _add_packet_integrity_failure(command, str(error))
        return command, "failed", "packet-integrity"
    return command, status, result.termination_reason


def _pack_reads_live_checkout(pack: dict[str, Any], plan: dict[str, Any]) -> bool:
    """Identify the declared later-stage exhaustive secret surface."""
    if plan.get("stage") not in {"pre-push", "pre-pr", "ci-pr", "release"}:
        return False
    return any(
        isinstance(entry, dict)
        and entry.get("builtin") == "secrets"
        and (
            not entry.get("stages")
            or plan.get("stage") in entry.get("stages", [])
        )
        for entry in pack["commands"]
    )


def _regular_materialized_bytes(path: Path) -> bytes:
    """Read one packet-owned regular file without following a replacement symlink."""
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError("change packet materialization is not a regular file")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError("change packet materialization changed file type")
        return handle.read()


def _verify_materialized_packet(environment: dict[str, str]) -> None:
    """Re-prove the parent-owned packet and every materialized image around commands."""
    packet_path = Path(environment["PROJECT_GOVERNANCE_CHANGE_PACKET"])
    packet_bytes = _regular_materialized_bytes(packet_path)
    if hashlib.sha256(packet_bytes).hexdigest() != environment[PACKET_SHA256_ENV]:
        raise ValueError("change packet envelope changed after materialization")
    packet = json.loads(packet_bytes)
    for record in packet.get("records", []):
        for side in ("before", "after"):
            path = record.get(f"{side}_path")
            expected = record.get(f"{side}_sha256")
            if path is None and expected is None:
                continue
            if not isinstance(path, str) or not isinstance(expected, str):
                raise ValueError("change packet materialization identity is incomplete")
            actual = hashlib.sha256(_regular_materialized_bytes(Path(path))).hexdigest()
            if actual != expected:
                raise ValueError("change packet materialized bytes changed during execution")


def _packet_integrity_command(argv: list[str], message: str) -> dict[str, Any]:
    """Return one normalized blocker when packet verification fails before execution."""
    finding = {
        "rule_id": "packet.materialization-changed",
        "severity": "blocking",
        "message": message,
    }
    return {
        "argv": argv,
        "status": "failed",
        "exit_code": 1,
        "termination_reason": "packet-integrity",
        "stdout": "",
        "stderr": "",
        "finding_count": 1,
        "finding_counts": {
            state: int(state == "blocking") for state in FINDING_STATES
        },
        "process_failure": False,
        "integrity_failure": True,
        "failure_kind": "integrity",
        "findings": [finding],
    }


def _add_packet_integrity_failure(command: dict[str, Any], message: str) -> None:
    """Promote a completed command when it changed the shared immutable packet."""
    command["findings"].append({
        "rule_id": "packet.materialization-changed",
        "severity": "blocking",
        "message": message,
    })
    command["status"] = "failed"
    command["termination_reason"] = "packet-integrity"
    command["finding_count"] += 1
    command["finding_counts"]["blocking"] += 1
    command["integrity_failure"] = True
    command["failure_kind"] = "integrity"
