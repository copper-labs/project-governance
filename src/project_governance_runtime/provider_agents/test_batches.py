"""Execute project-declared assertions without a provider process or a second lifecycle."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import uuid

from .config import AgentError, directory, duration
from .processes import collect, record, terminate_owned
from .storage import atomic_json, read_json


def digest_file(path):
    """Hash bytes incrementally; never retain input or executable contents in a receipt."""
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fingerprint(value):
    """Bind an exact canonical request or result independently of its file location."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _keys(value, required, optional=()):
    if not isinstance(value, dict) or set(value) - set(required) - set(optional) or set(required) - set(value):
        raise AgentError("test batch object has missing or unknown fields: " + ", ".join(required))


def _identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", value):
        raise AgentError("case ID must be a simple identifier of at most 80 characters")
    return value


def normalize(value):
    """Turn malformed caller shapes into bounded errors before admission."""
    try:
        return _normalize(value)
    except AgentError:
        raise
    except (TypeError, ValueError, AttributeError, OSError) as error:
        raise AgentError("invalid test batch input: " + type(error).__name__) from error


def _normalize(value):
    """Accept only bounded, explicit test contracts before any job can acquire resources."""
    if len(json.dumps(value, allow_nan=False).encode()) > 262144:
        raise AgentError("test batch exceeds 256 KiB")
    _keys(value, ("version", "workspace", "idempotency_key", "timeout_seconds", "inputs", "cases"),
          ("output_roots", "cleanup_required", "host"))
    if type(value["version"]) is not int or value["version"] != 1:
        raise AgentError("unsupported test batch version")
    key = value["idempotency_key"]
    if not isinstance(key, str) or not 1 <= len(key) <= 256:
        raise AgentError("batch idempotency_key must contain 1 to 256 characters")
    inputs = _normalize_inputs(value["inputs"])
    cases = _normalize_cases(value["cases"])
    timeout = duration(value["timeout_seconds"])
    host, cleanup = value.get("host", "unknown"), value.get("cleanup_required", False)
    if not timeout or host not in {"codex", "claude", "unknown"} or type(cleanup) is not bool:
        raise AgentError("batch needs a positive deadline, known host enum and boolean cleanup_required")
    result = dict(version=1, workspace=directory(value["workspace"]), idempotency_key=key,
                  timeout_seconds=timeout, inputs=inputs,
                  cases=cases, output_roots=_roots(value.get("output_roots", [])), cleanup_required=cleanup, host=host)
    verify_inputs(result)
    return result


def _normalize_inputs(inputs):
    """Validate the declared input scope and optional manifest membership."""
    _keys(inputs, ("mode", "roots"), ("files",))
    if inputs["mode"] not in {"declared-roots", "manifest"}:
        raise AgentError("inputs mode must be declared-roots or manifest")
    roots = _roots(inputs["roots"])
    if not roots:
        raise AgentError("declare at least one input root")
    files = inputs.get("files", [])
    if not isinstance(files, list) or len(files) > 2000 or (inputs["mode"] == "manifest" and not files):
        raise AgentError("manifest requires 1 to 2000 file identities")
    if inputs["mode"] == "declared-roots" and files:
        raise AgentError("use manifest mode when supplying file identities")
    manifest, seen = [], set()
    for item in files:
        member = _manifest_member(item, roots)
        if member["path"] in seen:
            raise AgentError("duplicate manifest member")
        seen.add(member["path"])
        manifest.append(member)
    return {"mode": inputs["mode"], "roots": roots, "files": manifest}


def _normalize_cases(cases):
    """Preserve ordered case identity without introducing a dependency scheduler."""
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        raise AgentError("batch requires 1 to 100 cases")
    normalized, seen = [], set()
    for case in cases:
        normalized.append(_normalize_case(case, seen))
        seen.add(case["id"])
    return normalized


def _normalize_case(case, seen):
    """Bind one canonical native assertion, its deadline and earlier dependencies."""
    _keys(case, ("id", "argv", "timeout_seconds", "expected_exit_codes"), ("depends_on", "result_receipt"))
    name = _identifier(case["id"])
    argv, expected, dependencies = case["argv"], case["expected_exit_codes"], case.get("depends_on", [])
    if name in seen or not isinstance(dependencies, list) or any(d not in seen for d in dependencies):
        raise AgentError("case dependencies must identify earlier unique cases")
    command = _canonical_command(argv)
    expected = _expected_exits(expected)
    limit = duration(case["timeout_seconds"])
    if not limit or type(case.get("result_receipt", False)) is not bool:
        raise AgentError("each case needs a positive deadline and a boolean result_receipt")
    return dict(id=name, argv=command, executable_sha256=digest_file(command[0]),
                           timeout_seconds=limit, expected_exit_codes=sorted(set(expected)),
                           depends_on=dependencies, result_receipt=case.get("result_receipt", False))


def _manifest_member(item, roots):
    """Resolve one file within the declared authority and validate its expected identity."""
    _keys(item, ("path", "sha256"))
    path = Path(item["path"])
    if not path.is_absolute() or not path.is_file():
        raise AgentError("manifest files must be absolute existing files")
    path = path.resolve()
    if not any(path.is_relative_to(r) for r in map(Path, roots)):
        raise AgentError("manifest member lies outside declared input roots")
    if not isinstance(item["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
        raise AgentError("invalid manifest SHA256")
    return {"path": str(path), "sha256": item["sha256"]}


def _canonical_command(argv):
    """Resolve exactly one executable while keeping argument data out of a shell parser."""
    if not isinstance(argv, list) or not 1 <= len(argv) <= 200:
        raise AgentError("case argv must contain 1 to 200 arguments")
    if any(not isinstance(a, str) or len(a) > 32000 or "\0" in a for a in argv):
        raise AgentError("case argv must contain bounded string arguments")
    executable = shutil.which(argv[0])
    if not executable:
        raise AgentError("case executable is unavailable")
    # Python virtual environments use the invoked symlink path to select their environment.
    return [str(Path(executable).absolute()), *argv[1:]]


def _expected_exits(expected):
    """Require an explicit project-owned assertion contract, including expected negatives."""
    if not isinstance(expected, list) or not 1 <= len(expected) <= 16:
        raise AgentError("expected_exit_codes requires 1 to 16 exit codes")
    if any(type(e) is not int or not 0 <= e <= 255 for e in expected):
        raise AgentError("expected_exit_codes must contain exit codes between 0 and 255")
    return sorted(set(expected))


def _roots(value):
    if not isinstance(value, list) or len(value) > 16:
        raise AgentError("roots must be an array of at most 16 directories")
    return sorted(set(directory(r) for r in value))


def verify_inputs(batch):
    """Verify declared manifest bytes without certifying membership completeness."""
    for item in batch["inputs"]["files"]:
        if digest_file(item["path"]) != item["sha256"]:
            raise AgentError("test input changed: manifest digest mismatch")


def start(value, *, store=None, environment_fd=None):
    """Submit a deterministic job through the shared registry and startup guard."""
    from . import jobs

    batch = normalize(value)
    roots = sorted(set(batch["inputs"]["roots"] + batch["output_roots"]))
    result = jobs.start("Execute the declared test batch", batch["workspace"], batch=batch,
                        additional_roots=roots, timeout_seconds=batch["timeout_seconds"],
                        idempotency_key=batch["idempotency_key"], store=store, environment_fd=environment_fd)
    from ..skill_telemetry import record_use

    record_use(Path(batch["workspace"]), result["job_id"], "external", batch["host"], "long-batch")
    return result


def execute(worker):
    """Run canonical commands sequentially; only their declared assertions can pass."""
    batch = worker.request["batch"]
    cases = [{"id": c["id"], "outcome": "not-run"} for c in batch["cases"]]
    worker.batch_result = {"cases": cases, "input_binding": batch["inputs"]["mode"],
                           "input_fingerprint": fingerprint(batch["inputs"]), "input_validity": "unchecked",
                           "assessment_allowed": False}
    atomic_json(worker.path / "batch-progress.json", worker.batch_result)
    verify_inputs(batch)
    worker.batch_result["assessment_allowed"] = True
    worker.batch_result["input_validity"] = "manifest-verified" if batch["inputs"]["mode"] == "manifest" else "declared-scope-only"
    outcomes, failed = {}, False
    for index, case in enumerate(batch["cases"]):
        if any(outcomes.get(name) != "passed" for name in case["depends_on"]):
            cases[index].update(outcome="not-run", reason="dependency did not pass")
            continue
        issue = worker.interrupted()
        if issue:
            return issue
        try:
            verify_inputs(batch)
            if digest_file(case["argv"][0]) != case["executable_sha256"]:
                raise AgentError("test executable changed after submission")
            issue = _run_case(worker, case, cases[index])
            verify_inputs(batch)
        except (OSError, ValueError) as error:
            worker.batch_result["input_validity"] = "invalid-or-unverified"
            worker.batch_result["assessment_allowed"] = False
            cases[index].update(outcome="failed", reason=str(error))
            return "failed", str(error)
        outcomes[case["id"]] = cases[index]["outcome"]
        failed |= outcomes[case["id"]] != "passed"
        atomic_json(worker.path / "batch-progress.json", worker.batch_result)
        if issue:
            return issue
    return ("failed", "One or more declared test assertions failed") if failed else None


def _run_case(worker, case, result):
    path = worker.path / ("case-" + case["id"])
    path.mkdir(mode=0o700)
    start_time = time.monotonic()
    env = {"HARNESS_BATCH_ID": worker.path.name, "HARNESS_BATCH_DIR": str(worker.path),
           "HARNESS_CASE_ID": case["id"], "HARNESS_CASE_DIR": str(path)}
    issue = None
    with (path / "stdout.log").open("xb") as stdout, (path / "stderr.log").open("xb") as stderr:
        if worker.request["batch"]["cleanup_required"]:
            (worker.path / "resource-cleanup.json").unlink(missing_ok=True)
        worker.launch_command(case["argv"], stdout=stdout, stderr=stderr, stdin=subprocess.DEVNULL, extra_env=env)
        worker.emit("case-started", message=case["id"])
        issue = _wait_case(worker, case, start_time)
    result.update(exit_code=worker.proc.returncode, duration_ms=round((time.monotonic() - start_time) * 1000, 3),
                  stdout=str(path / "stdout.log"), stderr=str(path / "stderr.log"),
                  outcome="passed" if not issue and worker.proc.returncode in case["expected_exit_codes"] else "failed")
    if case["result_receipt"] and not issue:
        issue = _case_receipt(worker, case, path, result)
    if issue:
        result["reason"] = issue[1]
    worker.emit("case-finished", message=case["id"], outcome=result["outcome"])
    return issue


def _wait_case(worker, case, start_time):
    """Enforce execution deadlines and confirm the owned process tree has stopped."""
    issue = None
    last_collect = 0
    while worker.proc.poll() is None:
        if time.monotonic() - last_collect >= 1:
            collect(worker.path, record(worker.proc.pid))
            last_collect = time.monotonic()
        worker.heartbeat()
        issue = worker.interrupted()
        if not issue and time.monotonic() - start_time >= case["timeout_seconds"]:
            issue = "timed_out", "Case deadline exceeded"
        if issue:
            break
        time.sleep(.05)
    cleaned = terminate_owned(worker.path, read_json(worker.path / "provider.json"), grace=.2)
    try:
        worker.proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        cleaned = False
    if not cleaned:
        issue = "failed", "Process cleanup remains unconfirmed"
    elif worker.proc.returncode is not None and worker.proc.returncode < 0 and not issue:
        issue = "failed", "Canonical command or launcher terminated by signal; remaining cases stopped"
    return issue


def _case_receipt(worker, case, path, result):
    """Validate fresh project evidence separately from the native exit contract."""
    issue = None
    receipt = read_json(path / "result.json", {})
    if (not isinstance(receipt, dict) or receipt.get("batch_id") != worker.path.name or receipt.get("case_id") != case["id"]
            or receipt.get("outcome") not in {"passed", "failed", "blocked"}):
        issue = "failed", "Missing or invalid case result receipt"
        worker.batch_result["assessment_allowed"] = False
        result.update(outcome="failed")
    elif result["outcome"] == "passed":
        result["outcome"] = receipt["outcome"]
    return issue


def cleanup_confirmed(path):
    """Do not release device/output claims on the assumption that process exit cleaned them."""
    request = read_json(path / "request.json", {})
    if request.get("kind") != "test-batch" or not request["batch"]["cleanup_required"] or not (path / "provider.json").exists():
        return True
    try:
        value = read_json(path / "resource-cleanup.json", {})
        return value.get("batch_id") == path.name and value.get("cleanup_confirmed") is True
    except (OSError, ValueError, AttributeError):
        return False


def finish(worker, state, error, cleaned):
    """Preserve case evidence while the existing guardian retains uncertain ownership."""
    batch = worker.request["batch"]
    value = dict(protocol_version=worker.request["protocol_version"], kind="test-batch", job_id=worker.path.name,
                 state=state, error=error, remaining=[error] if error else [], workspace=batch["workspace"],
                 cases=[{"id": c["id"], "outcome": "not-run"} for c in batch["cases"]],
                 **{k: v for k, v in worker.batch_result.items() if k != "cases"},
                 cleanup_confirmed=cleaned, finished_at=time.time(), started_at=worker.state.get("started_at"))
    value["cases"] = worker.batch_result.get("cases", value["cases"])
    value["summary"] = {outcome: sum(c["outcome"] == outcome for c in value["cases"])
                        for outcome in ("passed", "failed", "blocked", "not-run")}
    if not cleaned:
        value.update(pending_state=state, state=worker.state["state"], finished_at=None)
    else:
        value["protocol_version"] = terminal_protocol(worker.path)
        worker.state["protocol_version"] = value["protocol_version"]
    atomic_json(worker.path / "result.json", worker.redactor.clean(value))
    if not cleaned:
        worker.state["stage"] = "Awaiting confirmed process/project cleanup"
        worker.heartbeat(force=True)
        return
    worker.state.update(state=state, stage=error or state, finished_at=value["finished_at"])
    worker.emit("finished", state=state, message=error or state)
    terminal_telemetry(worker.path)


def terminal_protocol(path):
    """Retire the live ownership guard only after cleanup, publishing terminal status last."""
    request = read_json(path / "request.json")
    request["protocol_version"] = 1
    atomic_json(path / "request.json", request)
    # Until terminal status is published, its version-2 guard still excludes old recovery code.
    return 1


def recover_result(path, partial):
    """A dead worker preserves inventory but cannot attest its final input verification."""
    if partial.get("pending_state"):
        return partial
    request = read_json(path / "request.json")
    progress = read_json(path / "batch-progress.json", {})
    return {**progress, **partial, "kind": "test-batch", "workspace": request["workspace"],
            "cases": progress.get("cases", [{"id": c["id"], "outcome": "not-run"} for c in request["batch"]["cases"]]),
            "input_validity": "invalid-or-unverified", "assessment_allowed": False}


def terminal_telemetry(path):
    """Project only allowed aggregate facts, never private request or result contents."""
    from ..skill_telemetry import record_terminal

    request, result = read_json(path / "request.json", {}), read_json(path / "result.json", {})
    batch = request.get("batch")
    if batch and result.get("cleanup_confirmed") and result.get("finished_at"):
        status = read_json(path / "status.json", {})
        record_terminal(Path(batch["workspace"]), path.name, batch["host"], result["state"],
                        max(0, (result["finished_at"] - status["created_at"]) * 1000), True)
