"""Explicit job lifecycle, exact continuation, and local workspace coordination."""

from __future__ import annotations

import hashlib
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid

from . import PROTOCOL_VERSION
from .config import AgentError, TERMINAL, binding, code_digest, directory, duration
from .processes import cleanup_stage, record, same_process, terminate_owned
from .storage import Events, Store, atomic_json, events_since, read_json, validate_record


def normalize(task, workspace, *, provider=None, model=None, effort=None, executable=None, config=None,
              context="", role="general", constraints="", additional_roots=None, access="exclusive",
              required_tools=None, timeout_seconds=0, idle_timeout_seconds=0, idempotency_key=None,
              conversation_id=None, parent_job_id=None, enclosing_jobs=None, batch=None, host_binding=None):
    """Validate the assignment and explicit binding before creating durable state."""
    _validate_text(task, context, role, constraints)
    roots, required = additional_roots or [], required_tools or []
    _validate_scope(access, roots, required, idempotency_key)
    if conversation_id:
        try:
            conversation_id = str(uuid.UUID(conversation_id))
        except (ValueError, TypeError) as error:
            raise AgentError("provider session must be an exact UUID") from error
    ancestry = enclosing_jobs if enclosing_jobs is not None else json.loads(os.environ.get("HARNESS_AGENT_ANCESTRY", "[]"))
    if not isinstance(ancestry, list) or len(ancestry) > 32:
        raise AgentError("invalid enclosing job ancestry")
    from .runtime import binding as runtime_binding

    pinned_runtime = runtime_binding(directory(workspace))
    selected = binding(provider, model, effort, executable, config) if batch is None else {
        "kind": "test-batch", "batch": batch, "provider": None, "model": None, "effort": None}
    return dict(protocol_version=PROTOCOL_VERSION if batch is None else 2, **selected, task=task, workspace=directory(workspace),
                context=context, role=role, constraints=constraints,
                access="exclusive" if access == "writer" else access, allow_readers=access == "writer",
                additional_roots=sorted(set(directory(r) for r in roots)), required_tools=required,
                timeout_seconds=duration(timeout_seconds), idle_timeout_seconds=duration(idle_timeout_seconds),
                idempotency_key=idempotency_key, conversation_id=conversation_id, parent_job_id=parent_job_id,
                enclosing_jobs=ancestry, runner_digest=code_digest(), runtime_binding=pinned_runtime,
                host_binding=host_binding)


def _validate_text(task, context, role, constraints):
    if not isinstance(task, str) or not task.strip() or len(task) > 50000:
        raise AgentError("task must contain 1 to 50000 characters")
    for name, value, limit in (("context", context, 100000), ("role", role, 2000), ("constraints", constraints, 50000)):
        if not isinstance(value, str) or len(value) > limit:
            raise AgentError(f"{name} must be text of at most {limit} characters")


def _validate_scope(access, roots, required, idempotency_key):
    if access not in {"exclusive", "shared", "writer"}:
        raise AgentError("access must be exclusive, shared, or writer")
    if not isinstance(roots, list) or len(roots) > 32:
        raise AgentError("additional_roots must be an array of up to 32 directories")
    if not isinstance(required, list) or len(required) > 100 or any(not isinstance(t, str) or not t for t in required):
        raise AgentError("required_tools must be an array of up to 100 tool names or categories")
    if idempotency_key is not None and (not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 256):
        raise AgentError("idempotency key must contain 1 to 256 characters")


def overlap(left, right):
    """Detect ancestor and filesystem-alias overlap between authorized directory roots."""
    for a in map(Path, left):
        for b in map(Path, right):
            if any(a.samefile(p) for p in (b, *b.parents)) or any(b.samefile(p) for p in a.parents):
                return True
    return False


def conflicts(request, other):
    """Allow sibling readers beside one writer while retaining exclusive and session claims."""
    validate_record(request)
    validate_record(other)
    same_session = request.get("conversation_id") and request["provider"] == other["provider"] and request["conversation_id"] == other.get("conversation_id")
    roots = [request["workspace"], *request["additional_roots"]]
    other_roots = [other["workspace"], *other["additional_roots"]]
    # Older protocol-1 runners see an exclusive claim and conservatively serialize it.
    modes = ["writer" if value.get("allow_readers", False) else value["access"] for value in (request, other)]
    serializes = "exclusive" in modes or modes == ["writer", "writer"]
    return bool(same_session or (serializes and overlap(roots, other_roots)))


def recover(path):
    """Reclaim abandoned ownership only after recorded native programs stop."""
    value = validate_record(read_json(path / "status.json"))
    if value["state"] in TERMINAL or time.time() - value["created_at"] < 5:
        return value
    worker = read_json(path / "worker.json") or read_json(path / "launch.json")
    if same_process(worker) or same_process(read_json(path / "guardian.json")):
        return value
    if not terminate_owned(path, read_json(path / "provider.json"), grace=.2):
        return {**value, "stage": cleanup_stage(path)}
    return finish_cleanup(path)


def finish_cleanup(path):
    """Publish retained completion after abandoned-process cleanup is confirmed."""
    fd = os.open(path / "completion.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        value = validate_record(read_json(path / "status.json"))
        if value["state"] in TERMINAL:
            return value
        from .test_batches import cleanup_confirmed

        if not cleanup_confirmed(path):
            stage = "Awaiting project resource cleanup acknowledgment"
            if value.get("stage") != stage:
                value.update(stage=stage)
                atomic_json(path / "status.json", value)
            return value
        partial = read_json(path / "result.json", {})
        if value.get("kind") == "test-batch":
            from .test_batches import recover_result

            partial = recover_result(path, partial)
        pending = partial.get("pending_state")
        state = pending if pending in TERMINAL else "failed"
        error = partial.get("error") if pending in TERMINAL else "Worker exited without a terminal result; partial work is preserved"
        if (path / "cancel.json").exists():
            state, error = "cancelled", "Cancellation requested"
        remaining = list(partial.get("remaining", []))
        if error and error not in remaining:
            remaining.append(error)
        finished_at = time.time()
        partial.pop("pending_state", None)
        if value.get("kind") == "test-batch":
            from .test_batches import terminal_protocol

            value["protocol_version"] = terminal_protocol(path)
        atomic_json(path / "result.json", {**partial, "protocol_version": value["protocol_version"],
                    "job_id": path.name, "state": state, "answer": partial.get("answer", ""),
                    "error": error, "remaining": remaining, "cleanup_confirmed": True, "finished_at": finished_at})
        events = Events(path / "events.jsonl", value["provider"])
        events.sequence = value.get("last_event", 0)
        event = events.append("finished", state=state, message=error or state)
        value.update(state=state, stage=error or state, finished_at=finished_at,
                     last_event=event["sequence"], current_tool=None)
        atomic_json(path / "status.json", value)
        if value.get("kind") == "test-batch":
            from .test_batches import terminal_telemetry

            terminal_telemetry(path)
        return value
    finally:
        os.close(fd)


def start(task, workspace, *, store=None, environment_fd=None, **options):
    """Create or deduplicate a job, then release its worker after durable publication."""
    store = store or Store()
    request = normalize(task, workspace, **options)
    if request.get("runtime_binding") and environment_fd is None:
        raise AgentError("Startup-managed jobs require the guarded installed harness-agent entry")
    fingerprint = hashlib.sha256(json.dumps({k: v for k, v in request.items() if k != "idempotency_key"}, sort_keys=True).encode()).hexdigest()
    with store.lock():
        prior = _deduplicate(store, request, fingerprint)
        if prior:
            return prior
        _check_ancestors(request)
        request["request_fingerprint"] = fingerprint
        job_id, path = store.create(request)
        _launch_worker(store, job_id, path, environment_fd)
    end = time.monotonic() + 10
    while time.monotonic() < end:
        value = status(job_id, store=store)
        if value.get("ready_at") or value["state"] in TERMINAL:
            return value
        time.sleep(.05)
    cancel(job_id, store=store)
    raise AgentError(f"worker startup did not acknowledge readiness; cancellation requested for {job_id}")


def _deduplicate(store, request, fingerprint):
    for path, _ in store.records():
        prior = validate_record(read_json(path / "request.json"))
        if request["idempotency_key"] and prior.get("idempotency_key") == request["idempotency_key"]:
            if prior.get("request_fingerprint") != fingerprint:
                raise AgentError("idempotency key was used for a different request")
            return {**recover(path), "deduplicated": True}


def _check_ancestors(request):
    for ancestor in request["enclosing_jobs"]:
        if not isinstance(ancestor, dict) or set(ancestor) != {"state_root", "job_id"}:
            raise AgentError("invalid enclosing job ancestry")
        parent_store = Store(ancestor["state_root"])
        path = parent_store.job(ancestor["job_id"])
        value = validate_record(read_json(path / "status.json"))
        prior = validate_record(read_json(path / "request.json"))
        if value["state"] in TERMINAL:
            continue
        roots = [request["workspace"], *request["additional_roots"]]
        prior_roots = [prior["workspace"], *prior["additional_roots"]]
        # A queued exclusive sibling could otherwise strand a child behind its waiting parent.
        writer_overlap = (request.get("allow_readers") or prior.get("allow_readers")) and overlap(roots, prior_roots)
        if conflicts(request, prior) or writer_overlap:
            raise AgentError("nested job conflicts with an enclosing job's workspace or session; dispatch cooperating siblings from the primary or use a separately authorized workspace")


def _launch_worker(store, job_id, path, environment_fd):
    env = dict(os.environ, HARNESS_AGENT_STATE=str(store.root), PYTHONUNBUFFERED="1")
    fds = () if environment_fd is None else (environment_fd,)
    env["HARNESS_AGENT_ENV_FD"] = str(environment_fd) if environment_fd is not None else ""
    gate_read, gate_write = os.pipe()
    child, launch_error = None, None
    try:
        with (path / "worker.log").open("ab") as log:
            os.chmod(log.name, 0o600)
            child = subprocess.Popen([sys.executable, "-m", "project_governance_runtime.provider_agents.launcher",
                str(gate_read), sys.executable, "-m", "project_governance_runtime.provider_agents.worker", job_id],
                stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=env, start_new_session=True,
                close_fds=True, pass_fds=(*fds, gate_read))
        atomic_json(path / "launch.json", record(child.pid))
        os.write(gate_write, b"1")
    except OSError as error:
        launch_error = f"could not start provider worker: {error}"
    finally:
        os.close(gate_read)
        os.close(gate_write)
    if launch_error:
        if child:
            child.wait(timeout=10)
        value = read_json(path / "status.json")
        result = {"protocol_version": value["protocol_version"], "job_id": job_id, "state": "failed",
                  "answer": "", "error": launch_error, "remaining": [launch_error], "cleanup_confirmed": True}
        if value.get("kind") == "test-batch":
            from .test_batches import recover_result, terminal_protocol

            result = recover_result(path, result)
            value["protocol_version"] = result["protocol_version"] = terminal_protocol(path)
        atomic_json(path / "result.json", result)
        atomic_json(path / "status.json", {**value, "state": "failed", "finished_at": time.time(), "error": launch_error})
    else:
        threading.Thread(target=child.wait, daemon=True).start()


def status(job_id, *, store=None):
    """Recover abandoned work and return current state without launching a provider."""
    store = store or Store()
    with store.lock():
        path = store.job(job_id)
        value = recover(path)
    return {**value, "elapsed_seconds": round((value.get("finished_at") or time.time()) - value["created_at"], 2),
            "paths": {"events": str(path / "events.jsonl"), "result": str(path / "result.json")}}


def result(job_id, *, store=None):
    """Expose a terminal receipt only after lifecycle cleanup has completed."""
    store = store or Store()
    current = status(job_id, store=store)
    if current["state"] not in TERMINAL:
        return {"job_id": job_id, "state": current["state"], "ready": False}
    value = validate_record(read_json(store.job(job_id) / "result.json"))
    return {**value, "state": current["state"], "ready": True, "paths": current["paths"]}


def events(job_id, after=0, limit=100, *, store=None):
    """Read bounded public progress using a reconnectable byte cursor."""
    store = store or Store()
    current = status(job_id, store=store)
    return {**events_since(store.job(job_id) / "events.jsonl", after, limit),
            "job_id": job_id, "state": current["state"]}


def wait(job_id, after=0, timeout_seconds=30, *, store=None):
    """Wait briefly for public events without imposing a job deadline."""
    end = time.monotonic() + duration(timeout_seconds, "wait", maximum=60)
    while True:
        value = events(job_id, after, store=store)
        if value["events"] or value["state"] in TERMINAL or time.monotonic() >= end:
            return value
        time.sleep(.2)


def cancel(job_id, *, store=None):
    """Request cancellation while preserving partial work and the job receipt."""
    store = store or Store()
    with store.lock():
        path = store.job(job_id)
        current = recover(path)
        if current["state"] not in TERMINAL or current.get("kind") == "test-batch":
            atomic_json(path / "cancel.json", {"requested_at": time.time()})
        children = [p.name for p, _ in store.records()
                    if read_json(p / "request.json", {}).get("idempotency_key", "") == "assessment:" + job_id]
    for child in children:
        cancel(child, store=store)
    return status(job_id, store=store)


def follow_up(job_id, task, *, store=None, environment_fd=None, timeout_seconds=None, idempotency_key=None):
    """Resume the exact recorded session with its binding and authority constraints."""
    store = store or Store()
    current = status(job_id, store=store)
    if current["state"] not in TERMINAL or not current.get("conversation_id"):
        raise AgentError("follow-up needs a terminal job with an exact provider session")
    prior = validate_record(read_json(store.job(job_id) / "request.json"))
    from .runtime import validate

    validate(prior)
    keys = ("provider", "model", "effort", "role", "constraints", "additional_roots", "access", "required_tools", "idle_timeout_seconds")
    options = {key: prior[key] for key in keys}
    if prior.get("allow_readers", False):
        options["access"] = "writer"
    return start(task, prior["workspace"], store=store, environment_fd=environment_fd,
                 **options, executable=prior["backend"],
                 timeout_seconds=prior["timeout_seconds"] if timeout_seconds is None else timeout_seconds,
                 conversation_id=current["conversation_id"], parent_job_id=job_id,
                 idempotency_key=idempotency_key, host_binding=prior.get("host_binding"))
