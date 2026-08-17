"""Persist explicit native-host dispatch authorization and terminal state."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from .agent_contract import AgentContractError, validate_control_state, validate_worker_brief
from .state_io import path_lock, read_json_mapping, write_json_mapping


CONTROL_PATH = Path(".governance/state/agent-control.json")
ACTIVE_LEASE_WINDOW = timedelta(hours=2)
CRITICAL_VIOLATIONS = {"scope", "permission", "privacy", "credential", "result-integrity"}
TERMINAL_REASONS = {
    "completed",
    "failed",
    "cancelled",
    "timed-out",
    "budget-exhausted",
    "needs-primary-decision",
}
PROOF_RESULTS = {"passed", "failed", "not-run", "unavailable"}
ELIGIBLE_ROLES = {"implementation-worker", "research-scout", "qa-reviewer"}
ELIGIBLE_EFFORTS = {"low", "medium", "high", "xhigh", "max", "ultra"}


class AgentOrchestrationError(ValueError):
    """Report malformed routing or dispatch input without launching work."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _instant(value: datetime | None) -> datetime:
    result = value or _utc_now()
    if result.tzinfo is None:
        raise AgentOrchestrationError("evaluation instant must include a timezone")
    return result.astimezone(timezone.utc)


def _timestamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any, *, label: str) -> datetime:
    if not isinstance(value, str):
        raise AgentOrchestrationError(f"{label} must be an ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise AgentOrchestrationError(f"{label} must be an ISO timestamp") from error
    return _instant(parsed)


def _canonical_digest(value: Any) -> str:
    body = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()


def _authorization_payload(value: dict[str, Any]) -> dict[str, Any]:
    """Return only the immutable fields bound by an authorization digest."""
    keys = (
        "base_snapshot",
        "launch_entries",
        "delegated_token_ceiling",
        "start_expires_at",
        "lease_deadline",
    )
    payload = {key: value.get(key) for key in keys}
    if "request_digest" in value:
        payload["request_digest"] = value["request_digest"]
    return payload


def empty_control_state() -> dict[str, Any]:
    """Return the only valid empty repository orchestration state."""
    return {
        "version": 1,
        "authorizations": [],
        "consumed_requests": [],
        "writer_lease": None,
        "suspensions": [],
    }


def load_control_state(root: Path) -> dict[str, Any]:
    """Read and minimally validate ignored control state without repairing it."""
    state = read_json_mapping(root / CONTROL_PATH, default=empty_control_state())
    state.setdefault("consumed_requests", [])
    if state.get("version") != 1:
        raise AgentOrchestrationError("agent control state version must be 1")
    if not isinstance(state.get("authorizations"), list):
        raise AgentOrchestrationError("agent control authorizations must be a list")
    if not isinstance(state.get("consumed_requests"), list):
        raise AgentOrchestrationError("agent control consumed_requests must be a list")
    if not isinstance(state.get("suspensions"), list):
        raise AgentOrchestrationError("agent control suspensions must be a list")
    if state.get("writer_lease") is not None and not isinstance(state["writer_lease"], dict):
        raise AgentOrchestrationError("agent control writer_lease must be null or an object")
    for authorization in state["authorizations"]:
        if not isinstance(authorization, dict) or authorization.get(
            "authorization_digest"
        ) != _canonical_digest(_authorization_payload(authorization)):
            raise AgentOrchestrationError("agent control authorization digest mismatch")
    try:
        validate_control_state(state)
    except AgentContractError as error:
        raise AgentOrchestrationError(str(error)) from error
    return state


def _active_writer(state: dict[str, Any], now: datetime) -> bool:
    """Treat a malformed active lease as blocking until a write boundary repairs state."""
    lease = state.get("writer_lease")
    if not isinstance(lease, dict):
        return False
    try:
        return _parse_timestamp(lease.get("deadline"), label="writer lease deadline") > now
    except AgentOrchestrationError:
        return True


def _expire_active(state: dict[str, Any], now: datetime) -> set[str]:
    """Make expired active authorizations terminal and release their writer lease."""
    expired: set[str] = set()
    for authorization in state["authorizations"]:
        if not isinstance(authorization, dict) or authorization.get("state") != "active":
            continue
        try:
            is_expired = _parse_timestamp(
                authorization.get("lease_deadline"), label="lease deadline"
            ) <= now
        except AgentOrchestrationError:
            is_expired = True
        if is_expired:
            authorization["state"] = "terminal"
            authorization["terminal_reason"] = "timed-out"
            authorization["terminal_at"] = _timestamp(now)
            expired.add(str(authorization.get("authorization_digest", "")))
    lease = state.get("writer_lease")
    if isinstance(lease, dict) and lease.get("authorization_digest") in expired:
        state["writer_lease"] = None
    return expired


def _prune_consumed(state: dict[str, Any], now: datetime) -> None:
    """Retain replay protection only while the corresponding route request is startable."""
    retained = []
    for item in state["consumed_requests"]:
        if not isinstance(item, dict):
            continue
        try:
            if _parse_timestamp(item.get("start_expires_at"), label="consumed expiry") > now:
                retained.append(item)
        except AgentOrchestrationError:
            continue
    state["consumed_requests"] = retained


def _active_reader_count(state: dict[str, Any]) -> int:
    """Count read-only entries across active delegated waves."""
    return sum(
        entry.get("permission") == "read-only"
        for authorization in state["authorizations"]
        if isinstance(authorization, dict) and authorization.get("state") == "active"
        for entry in authorization.get("launch_entries", [])
        if isinstance(entry, dict)
    )


def _is_suspended(state: dict[str, Any], entry: dict[str, Any]) -> bool:
    """Re-check current critical suspension state at the write boundary."""
    return any(
        isinstance(item, dict)
        and item.get("role") == entry.get("role")
        and item.get("profile_id") == entry.get("profile_id")
        for item in state["suspensions"]
    )


def _launch_identity_contract(entry: Any) -> tuple[dict[str, Any], str]:
    """Validate one launch entry's bounded identity and role permission."""
    if not isinstance(entry, dict):
        raise AgentOrchestrationError("launch-entry-invalid")
    required_text = ("task_id", "role", "profile_id", "model", "tier", "effort")
    if any(not isinstance(entry.get(key), str) or not entry[key] for key in required_text):
        raise AgentOrchestrationError("launch-entry-identity-invalid")
    role = entry["role"]
    permission = entry.get("permission")
    if role not in ELIGIBLE_ROLES or permission not in {"write", "read-only"}:
        raise AgentOrchestrationError("launch-entry-role-invalid")
    expected_permission = "write" if role == "implementation-worker" else "read-only"
    if permission != expected_permission:
        raise AgentOrchestrationError("launch-entry-permission-invalid")
    return entry, str(permission)


def _launch_profile_contract(entry: dict[str, Any], session_rank: int) -> None:
    """Validate one launch entry's selected capability profile."""
    if entry["tier"] not in {"economy", "balanced"} or entry["effort"] not in ELIGIBLE_EFFORTS:
        raise AgentOrchestrationError("launch-entry-profile-invalid")
    rank = entry.get("tier_rank")
    assurance = entry.get("assurance")
    if isinstance(rank, bool) or not isinstance(rank, int) or not isinstance(assurance, bool):
        raise AgentOrchestrationError("launch-entry-profile-invalid")
    if not assurance and rank >= session_rank:
        raise AgentOrchestrationError("specialist-not-lower-tier")


def _launch_packet_contract(entry: dict[str, Any], base_snapshot: str) -> None:
    """Validate one launch entry's compact packet and immutable snapshot."""
    packet = entry.get("worker_packet")
    if not isinstance(packet, dict) or not isinstance(packet.get("brief"), dict):
        raise AgentOrchestrationError("worker-packet-invalid")
    try:
        validate_worker_brief(packet["brief"])
    except AgentContractError as error:
        raise AgentOrchestrationError(str(error)) from error
    if packet["brief"].get("base_snapshot") != base_snapshot:
        raise AgentOrchestrationError("base-snapshot-mismatch")
    brief = packet["brief"]
    if (
        brief.get("task_id") != entry.get("task_id")
        or brief.get("role") != entry.get("role")
        or brief.get("required_capability_tier") != entry.get("tier")
    ):
        raise AgentOrchestrationError("worker-brief-identity-mismatch")
    write_scope = brief.get("write_scope")
    if entry.get("permission") == "read-only" and write_scope != []:
        raise AgentOrchestrationError("reader-write-scope-present")
    if entry.get("permission") == "write" and not write_scope:
        raise AgentOrchestrationError("writer-scope-missing")
    if not isinstance(packet.get("materialized_context"), list):
        raise AgentOrchestrationError("worker-context-invalid")


def _launch_entry_contract(
    entry: Any, *, base_snapshot: str, session_rank: int
) -> str:
    """Validate one exact native launch instruction without trusting its digest alone."""
    validated, permission = _launch_identity_contract(entry)
    _launch_profile_contract(validated, session_rank)
    _launch_packet_contract(validated, base_snapshot)
    return permission


def _decision_identity(decision: dict[str, Any]) -> tuple[str, int, int]:
    """Validate the provider, snapshot, catalog, rank, and delegated ceiling."""
    provider = decision.get("provider")
    base_snapshot = decision.get("base_snapshot")
    catalog_digest = decision.get("catalog_digest")
    session_rank = decision.get("session_tier_rank")
    ceiling = decision.get("delegated_token_ceiling")
    if provider not in {"codex", "claude"}:
        raise AgentOrchestrationError("route-provider-invalid")
    if not isinstance(base_snapshot, str) or not base_snapshot:
        raise AgentOrchestrationError("base-snapshot-invalid")
    if (
        not isinstance(catalog_digest, str)
        or len(catalog_digest) != 71
        or not catalog_digest.startswith("sha256:")
        or any(character not in "0123456789abcdef" for character in catalog_digest[7:])
    ):
        raise AgentOrchestrationError("catalog-digest-invalid")
    if isinstance(session_rank, bool) or not isinstance(session_rank, int):
        raise AgentOrchestrationError("primary-tier-rank-unavailable")
    if isinstance(ceiling, bool) or not isinstance(ceiling, int) or ceiling <= 0:
        raise AgentOrchestrationError("delegated-token-ceiling-invalid")
    return base_snapshot, session_rank, ceiling


def _wave_contract(
    entries: Any, *, base_snapshot: str, session_rank: int
) -> tuple[list[dict[str, Any]], list[str]]:
    """Validate every entry plus unique identity and per-wave concurrency caps."""
    if not isinstance(entries, list) or not entries or len(entries) > 3:
        raise AgentOrchestrationError("launch-wave-cap-invalid")
    permissions = [
        _launch_entry_contract(item, base_snapshot=base_snapshot, session_rank=session_rank)
        for item in entries
    ]
    task_ids = [str(item["task_id"]) for item in entries]
    if len(task_ids) != len(set(task_ids)):
        raise AgentOrchestrationError("duplicate-task-id")
    if permissions.count("write") > 1 or permissions.count("read-only") > 2:
        raise AgentOrchestrationError("launch-wave-cap-invalid")
    return entries, permissions


def _active_wave_contract(
    entries: list[dict[str, Any]], permissions: list[str], state: dict[str, Any], now: datetime
) -> None:
    """Validate repository-wide concurrency and current critical suspension state."""
    if permissions.count("read-only") + _active_reader_count(state) > 2:
        raise AgentOrchestrationError("repository-reader-cap-active")
    if "write" in permissions and _active_writer(state, now):
        raise AgentOrchestrationError("repository-writer-lease-active")
    if any(_is_suspended(state, entry) for entry in entries):
        raise AgentOrchestrationError("role-profile-suspended")


def _decision_contract(
    decision: dict[str, Any], state: dict[str, Any], now: datetime
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Validate decision identity, structure, safety, budgets, replay, and wave caps."""
    base_snapshot, session_rank, ceiling = _decision_identity(decision)
    entries, permissions = _wave_contract(
        decision.get("launch_entries"),
        base_snapshot=base_snapshot,
        session_rank=session_rank,
    )
    writers = [entry for entry, permission in zip(entries, permissions) if permission == "write"]
    _active_wave_contract(entries, permissions, state, now)
    entry_ceiling = sum(
        entry["worker_packet"]["brief"]["output_token_ceiling"] for entry in entries
    )
    if entry_ceiling > ceiling:
        raise AgentOrchestrationError("entry-token-ceilings-exceed-wave-ceiling")
    return entries, writers[0] if writers else None


def _validated_start(
    request: dict[str, Any], state: dict[str, Any], now: datetime
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any] | None]:
    """Validate one route request again at the state-writing boundary."""
    if request.get("status") != "delegated" or request.get("kind") != "agent-route-request":
        raise AgentOrchestrationError("route-request-not-delegated")
    request_digest = request.get("request_digest")
    request_body = {key: value for key, value in request.items() if key != "request_digest"}
    if request_digest != _canonical_digest(request_body):
        raise AgentOrchestrationError("route-request-digest-mismatch")
    if any(
        item.get("request_digest") == request_digest
        for item in state["consumed_requests"]
        if isinstance(item, dict)
    ):
        raise AgentOrchestrationError("route-request-already-consumed")
    if _parse_timestamp(request.get("start_expires_at"), label="start_expires_at") <= now:
        raise AgentOrchestrationError("route-request-expired")
    decision = request.get("decision")
    if not isinstance(decision, dict):
        raise AgentOrchestrationError("route-decision-invalid")
    declared_digest = decision.get("decision_digest")
    decision_body = {key: value for key, value in decision.items() if key != "decision_digest"}
    if declared_digest != _canonical_digest(decision_body):
        raise AgentOrchestrationError("route-decision-digest-mismatch")
    entries, writer = _decision_contract(decision, state, now)
    return decision, entries, writer


def _new_authorization(
    decision: dict[str, Any], request: dict[str, Any], now: datetime
) -> dict[str, Any]:
    """Bind the exact launch entries and deadlines into one authorization digest."""
    payload: dict[str, Any] = {
        "base_snapshot": decision.get("base_snapshot"),
        "launch_entries": decision["launch_entries"],
        "delegated_token_ceiling": decision.get("delegated_token_ceiling"),
        "request_digest": request.get("request_digest"),
        "start_expires_at": request.get("start_expires_at"),
        "lease_deadline": _timestamp(now + ACTIVE_LEASE_WINDOW),
    }
    return {
        **payload,
        "authorization_digest": _canonical_digest(payload),
        "state": "active",
    }


def _activate_authorization(
    state: dict[str, Any],
    authorization: dict[str, Any],
    writer: dict[str, Any] | None,
    old_terminal: set[str],
) -> None:
    """Prune only older terminals, append the new wave, and acquire its writer lease."""
    state["authorizations"] = [
        item
        for item in state["authorizations"]
        if not (isinstance(item, dict) and item.get("authorization_digest") in old_terminal)
    ]
    state["authorizations"].append(authorization)
    state["consumed_requests"].append({
        "request_digest": authorization["request_digest"],
        "start_expires_at": authorization["start_expires_at"],
    })
    if writer:
        state["writer_lease"] = {
            "authorization_digest": authorization["authorization_digest"],
            "deadline": authorization["lease_deadline"],
        }


def start_dispatch(
    root: Path,
    request: dict[str, Any],
    *,
    evaluation_instant: datetime | None = None,
) -> dict[str, Any]:
    """Record one explicitly started launch wave and return native launch entries."""
    now = _instant(evaluation_instant)
    path = root / CONTROL_PATH
    try:
        with path_lock(path):
            state = load_control_state(root)
            _prune_consumed(state, now)
            old_terminal = {
                str(item.get("authorization_digest"))
                for item in state["authorizations"]
                if isinstance(item, dict) and item.get("state") == "terminal"
            }
            _expire_active(state, now)
            try:
                decision, entries, writer = _validated_start(request, state, now)
            except AgentOrchestrationError as error:
                write_json_mapping(path, state)
                return {"status": "solo", "reason": str(error)}
            authorization = _new_authorization(decision, request, now)
            _activate_authorization(state, authorization, writer, old_terminal)
            write_json_mapping(path, state)
    except (OSError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        return {"status": "solo", "reason": "control-state-unavailable", "error": str(error)}
    return {
        "status": "authorized",
        "authorization_digest": authorization["authorization_digest"],
        "lease_deadline": authorization["lease_deadline"],
        "launch_entries": entries,
    }


def _non_negative_number(value: Any) -> bool:
    """Recognize finite non-negative host measurements without accepting booleans."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        return False
    return not isinstance(value, float) or (
        value == value and value not in {float("inf"), float("-inf")}
    )


def _result_usage_valid(entry: dict[str, Any]) -> bool:
    """Validate optional reported usage and duration measurements."""
    for key in ("input_tokens", "output_tokens"):
        value = entry.get(key)
        if value is not None and (
            isinstance(value, bool) or not isinstance(value, int) or value < 0
        ):
            return False
    duration = entry.get("duration_ms")
    return duration is None or _non_negative_number(duration)


def _result_labels_valid(entry: dict[str, Any]) -> bool:
    """Validate optional enumerated proof, violation, and boolean labels."""
    proof = entry.get("proof_result")
    violation = entry.get("violation")
    if proof is not None and proof not in PROOF_RESULTS:
        return False
    if violation is not None and violation not in CRITICAL_VIOLATIONS:
        return False
    return all(
        entry.get(key) is None or isinstance(entry[key], bool)
        for key in ("fallback", "repair")
    )


def _result_entry_valid(entry: Any) -> bool:
    """Accept only bounded terminal result values that cannot carry arbitrary text."""
    if not isinstance(entry, dict):
        return False
    if not isinstance(entry.get("task_id"), str) or not entry["task_id"]:
        return False
    if entry.get("status") not in TERMINAL_REASONS:
        return False
    return _result_usage_valid(entry) and _result_labels_valid(entry)


def _result_contract(
    authorization: dict[str, Any], results: dict[str, Any]
) -> tuple[list[dict[str, Any]], bool, bool]:
    """Require one well-formed, uniquely identified terminal result for every entry."""
    declared = results.get("termination_reason")
    duration = results.get("duration_ms")
    if declared is not None and declared not in TERMINAL_REASONS:
        return [], False, False
    if duration is not None and not _non_negative_number(duration):
        return [], False, False
    entries = results.get("entries")
    if not isinstance(entries, list) or not entries or not all(_result_entry_valid(item) for item in entries):
        return [], False, False
    result_entries = [item for item in entries if isinstance(item, dict)]
    result_ids = [str(item["task_id"]) for item in result_entries]
    authorized_ids = [
        str(item.get("task_id"))
        for item in authorization.get("launch_entries", [])
        if isinstance(item, dict)
    ]
    return result_entries, True, (
        len(result_ids) == len(set(result_ids))
        and len(authorized_ids) == len(set(authorized_ids))
        and set(result_ids) == set(authorized_ids)
    )


def _terminal_reason(
    results: dict[str, Any], entries: list[dict[str, Any]]
) -> tuple[str, bool]:
    """Resolve one bounded terminal reason only after result identity is trusted."""
    declared = results.get("termination_reason")
    statuses = {entry["status"] for entry in entries}
    if declared is not None:
        if declared == "completed" and statuses != {"completed"}:
            return "failed", False
        return str(declared), True
    return ("completed" if statuses == {"completed"} else "failed"), True


def _authorization_for_finish(
    state: dict[str, Any], authorization_digest: str
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Resolve an active authorization or its stable no-op response."""
    authorization = next(
        (
            item
            for item in state["authorizations"]
            if isinstance(item, dict) and item.get("authorization_digest") == authorization_digest
        ),
        None,
    )
    if authorization is None:
        return None, {
            "status": "invalid-authorization",
            "changed": False,
            "telemetry_written": False,
        }
    if authorization.get("state") != "active":
        if authorization.get("terminal_reason") == "timed-out":
            return None, {"status": "timed-out", "changed": False, "telemetry_written": False}
        return None, {"status": "invalid-authorization", "changed": False, "telemetry_written": False}
    return authorization, None


def _evaluated_results(
    authorization: dict[str, Any], results: dict[str, Any]
) -> tuple[str, list[dict[str, Any]], dict[str, str]]:
    """Validate result identity, terminal reason, budget, and critical violations."""
    result_entries, shape_valid, identity_valid = _result_contract(authorization, results)
    if not shape_valid:
        return "failed", [], {}
    reason, outcome_consistent = (
        _terminal_reason(results, result_entries) if identity_valid
        else ("failed", True)
    )
    suspensions = {
        str(entry["task_id"]): str(entry["violation"])
        for entry in result_entries
        if entry.get("violation") in CRITICAL_VIOLATIONS
    }
    if not identity_valid or not outcome_consistent:
        suspensions = {
            str(entry.get("task_id")): "result-integrity"
            for entry in authorization.get("launch_entries", [])
            if isinstance(entry, dict)
        }
        return "failed", [], suspensions
    if suspensions:
        return "failed", result_entries, suspensions
    reported_output = sum((entry.get("output_tokens") or 0) for entry in result_entries)
    ceiling = authorization.get("delegated_token_ceiling")
    if isinstance(ceiling, int) and reported_output > ceiling:
        reason = "budget-exhausted"
    return reason, result_entries, suspensions


def _close_authorization(
    state: dict[str, Any],
    authorization: dict[str, Any],
    authorization_digest: str,
    reason: str,
    suspensions: dict[str, str],
    now: datetime,
) -> None:
    """Apply one terminal transition, release its lease, and persist critical suspensions."""
    authorization.update(
        {"state": "terminal", "terminal_reason": reason, "terminal_at": _timestamp(now)}
    )
    lease = state.get("writer_lease")
    if isinstance(lease, dict) and lease.get("authorization_digest") == authorization_digest:
        state["writer_lease"] = None
    if not suspensions:
        return
    for entry in authorization.get("launch_entries", []):
        task_id = str(entry.get("task_id"))
        if task_id not in suspensions:
            continue
        suspension = {
            "role": entry.get("role"),
            "profile_id": entry.get("profile_id"),
            "reason": suspensions[task_id],
        }
        if suspension not in state["suspensions"]:
            state["suspensions"].append(suspension)


def _terminal_event(
    authorization: dict[str, Any],
    authorization_digest: str,
    reason: str,
    result_entries: list[dict[str, Any]],
    duration_ms: Any,
) -> dict[str, Any]:
    """Combine trusted launch identity with only bounded host-reported terminal fields."""
    reported_by_task = {
        str(entry.get("task_id")): entry
        for entry in result_entries
        if entry.get("task_id") is not None
    }
    entries = []
    for launch_entry in authorization.get("launch_entries", []):
        reported = reported_by_task.get(str(launch_entry.get("task_id")), {})
        entries.append({
            "role": launch_entry.get("role"),
            "profile_id": launch_entry.get("profile_id"),
            "model": launch_entry.get("model"),
            "outcome": reported.get("status", reason),
            "duration_ms": reported.get("duration_ms"),
            "input_tokens": reported.get("input_tokens"),
            "output_tokens": reported.get("output_tokens"),
            "proof_result": reported.get("proof_result"),
            "fallback": reported.get("fallback"),
            "repair": reported.get("repair"),
        })
    return {
        "event": "orchestration-terminal",
        "authorization_digest": authorization_digest,
        "terminal_outcome": reason,
        "duration_ms": duration_ms,
        "entries": entries,
    }


def _write_scopes(authorization: dict[str, Any]) -> list[list[str]]:
    """Return only schema-validated writer scopes from trusted authorization state."""
    scopes: list[list[str]] = []
    for entry in authorization.get("launch_entries", []):
        if not isinstance(entry, dict) or entry.get("permission") != "write":
            continue
        packet = entry.get("worker_packet")
        brief = packet.get("brief") if isinstance(packet, dict) else None
        scope = brief.get("write_scope") if isinstance(brief, dict) else None
        if isinstance(scope, list) and all(isinstance(item, str) for item in scope):
            scopes.append(scope)
    return scopes


def _append_terminal(
    root: Path,
    event: dict[str, Any] | None,
    hook: Callable[[Path, dict[str, Any]], Any] | None,
) -> bool:
    """Observe telemetry success without allowing advisory failures to reopen state."""
    if event is None or hook is None:
        return False
    try:
        return hook(root, event) is True
    except Exception:  # Telemetry is advisory and state is already terminal.
        return False


def finish_dispatch(
    root: Path,
    authorization_digest: str,
    results: Any,
    *,
    evaluation_instant: datetime | None = None,
    terminal_hook: Callable[[Path, dict[str, Any]], Any] | None = None,
) -> dict[str, Any]:
    """Close one active authorization and invoke at most one terminal telemetry hook."""
    now = _instant(evaluation_instant)
    bounded_results = results if isinstance(results, dict) else {}
    path = root / CONTROL_PATH
    terminal_event: dict[str, Any] | None = None
    try:
        with path_lock(path):
            state = load_control_state(root)
            authorization, early_result = _authorization_for_finish(state, authorization_digest)
            if early_result is not None or authorization is None:
                return early_result or {"status": "invalid-authorization", "changed": False}
            expired = _expire_active(state, now)
            if authorization_digest in expired:
                write_json_mapping(path, state)
                return {"status": "timed-out", "changed": True, "telemetry_written": False}
            reason, result_entries, suspensions = _evaluated_results(
                authorization, bounded_results
            )
            _close_authorization(
                state, authorization, authorization_digest, reason, suspensions, now
            )
            write_json_mapping(path, state)
            terminal_event = _terminal_event(
                authorization,
                authorization_digest,
                reason,
                result_entries,
                bounded_results.get("duration_ms"),
            )
    except (OSError, TimeoutError, ValueError, json.JSONDecodeError) as error:
        return {"status": "solo", "reason": "control-state-unavailable", "error": str(error)}
    telemetry_written = _append_terminal(root, terminal_event, terminal_hook)
    return {
        "status": "terminal",
        "terminal_reason": authorization["terminal_reason"],
        "authorized_write_scopes": _write_scopes(authorization),
        "changed": True,
        "telemetry_written": telemetry_written,
    }
