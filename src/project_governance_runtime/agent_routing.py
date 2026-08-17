"""Select bounded same-provider specialist profiles without writing or launching."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .agent_contract import AgentContractError, project_worker_packet, validate_routing_input
from .agent_orchestration import (
    AgentOrchestrationError,
    _canonical_digest,
    _instant,
    _parse_timestamp,
    _timestamp,
)


ROUTE_START_WINDOW = timedelta(minutes=30)
ELIGIBLE_ROLES = {"implementation-worker", "research-scout", "qa-reviewer"}


def catalog_digest(catalog: dict[str, Any]) -> str:
    """Identify catalog content without trusting or recursively hashing its digest field."""
    return _canonical_digest({key: value for key, value in catalog.items() if key != "digest"})


def _entries(task: dict[str, Any]) -> list[dict[str, Any]]:
    raw = task.get("entries")
    if raw is None:
        raw = [task]
    if not isinstance(raw, list) or not raw or any(not isinstance(item, dict) for item in raw):
        raise AgentOrchestrationError("task entries must be a non-empty object list")
    return raw


def _active_writer(state: dict[str, Any], now: datetime) -> bool:
    lease = state.get("writer_lease")
    if not isinstance(lease, dict):
        return False
    try:
        return _parse_timestamp(lease.get("deadline"), label="writer lease deadline") > now
    except AgentOrchestrationError:
        return True


def _active_reader_count(state: dict[str, Any]) -> int:
    """Count read-only entries across currently active authorizations."""
    return sum(
        entry.get("permission") == "read-only"
        for authorization in state.get("authorizations", [])
        if isinstance(authorization, dict) and authorization.get("state") == "active"
        for entry in authorization.get("launch_entries", [])
        if isinstance(entry, dict)
    )


def _suspended(state: dict[str, Any], role: str, profile_id: str) -> bool:
    return any(
        isinstance(item, dict)
        and item.get("role") == role
        and item.get("profile_id") == profile_id
        for item in state.get("suspensions", [])
    )


def _solo(now: datetime, reasons: list[str]) -> dict[str, Any]:
    decision = {"status": "solo", "reasons": sorted(set(reasons)), "launch_entries": []}
    request = {
        "kind": "agent-route-request",
        "status": "solo",
        "decision": decision,
        "issued_at": _timestamp(now),
        "start_expires_at": _timestamp(now + ROUTE_START_WINDOW),
    }
    request["request_digest"] = _canonical_digest(request)
    return request


def solo_route(reason: str, *, evaluation_instant: datetime | None = None) -> dict[str, Any]:
    """Expose the fail-closed solo envelope for unavailable read-only state."""
    return _solo(_instant(evaluation_instant), [reason])


def _host_contract(
    session: dict[str, Any], catalog: dict[str, Any]
) -> tuple[str, int, list[dict[str, Any]]]:
    """Validate explicit same-provider identity, catalog digest, and session rank."""
    provider = session.get("provider")
    if provider not in {"codex", "claude"} or catalog.get("provider") != provider:
        raise AgentOrchestrationError("native-session-or-catalog-unavailable")
    session_rank = session.get("tier_rank")
    if isinstance(session_rank, bool) or not isinstance(session_rank, int):
        raise AgentOrchestrationError("primary-tier-rank-unavailable")
    profiles = catalog.get("profiles")
    if not isinstance(profiles, list):
        raise AgentOrchestrationError("catalog-profiles-unavailable")
    digest = catalog.get("digest")
    if not isinstance(digest, str) or len(digest) != 71 or not digest.startswith("sha256:"):
        raise AgentOrchestrationError("catalog-digest-invalid")
    if any(character not in "0123456789abcdef" for character in digest[7:]):
        raise AgentOrchestrationError("catalog-digest-invalid")
    if digest != catalog_digest(catalog):
        raise AgentOrchestrationError("catalog-digest-mismatch")
    session_profile = next(
        (
            profile
            for profile in profiles
            if isinstance(profile, dict) and profile.get("id") == session.get("profile_id")
        ),
        None,
    )
    if session_profile is None or session_profile.get("model") != session.get("model"):
        raise AgentOrchestrationError("current-session-profile-unavailable")
    if session_profile.get("tier_rank") != session_rank:
        raise AgentOrchestrationError("current-session-profile-unavailable")
    return str(provider), session_rank, profiles


def _concurrency_contract(
    entries: list[dict[str, Any]], control_state: dict[str, Any], now: datetime
) -> None:
    """Enforce per-wave and repository-wide reader and writer limits."""
    if len(entries) > 3:
        raise AgentOrchestrationError("launch-wave-cap-exceeded")
    writer_count = sum(item.get("role") == "implementation-worker" for item in entries)
    reader_count = len(entries) - writer_count
    if writer_count > 1 or reader_count > 2:
        raise AgentOrchestrationError("one-writer-two-reader-cap-exceeded")
    if reader_count + _active_reader_count(control_state) > 2:
        raise AgentOrchestrationError("repository-reader-cap-active")
    if writer_count and _active_writer(control_state, now):
        raise AgentOrchestrationError("repository-writer-lease-active")


def _wave_contract(
    task: dict[str, Any], control_state: dict[str, Any], now: datetime
) -> tuple[list[dict[str, Any]], int]:
    """Validate launch-wave identity, concurrency, snapshot, and output ceiling."""
    entries = _entries(task)
    _concurrency_contract(entries, control_state, now)
    task_ids = [item.get("task_id") for item in entries]
    if any(not isinstance(item, str) or not item for item in task_ids):
        raise AgentOrchestrationError("task-id-invalid")
    if len(task_ids) != len(set(task_ids)):
        raise AgentOrchestrationError("duplicate-task-id")
    base_snapshot = task.get("base_snapshot")
    if not isinstance(base_snapshot, str) or not base_snapshot:
        raise AgentOrchestrationError("base-snapshot-invalid")
    if any(item.get("base_snapshot") != base_snapshot for item in entries):
        raise AgentOrchestrationError("base-snapshot-mismatch")
    ceiling = task.get("delegated_token_ceiling")
    if isinstance(ceiling, bool) or not isinstance(ceiling, int) or ceiling <= 0:
        raise AgentOrchestrationError("delegated-token-ceiling-invalid")
    return entries, ceiling


def _scope_contract(entry: dict[str, Any], role: Any) -> str:
    """Validate one role's permission, privacy, and write boundary."""
    permission = "write" if role == "implementation-worker" else "read-only"
    if entry.get("permission") != permission:
        raise AgentOrchestrationError("role-permission-incompatible")
    if entry.get("privacy") != "same-provider" or entry.get("scope_valid") is not True:
        raise AgentOrchestrationError("privacy-or-scope-invalid")
    write_scope = entry.get("write_scope")
    if role == "implementation-worker" and (not isinstance(write_scope, list) or not write_scope):
        raise AgentOrchestrationError("writer-scope-missing")
    if role != "implementation-worker" and write_scope != []:
        raise AgentOrchestrationError("reader-write-scope-present")
    return permission


def _entry_contract(entry: dict[str, Any]) -> tuple[str, str, str, bool]:
    """Validate one specialist obligation, readiness, tier, and assurance claim."""
    role = entry.get("role")
    tier = entry.get("required_capability_tier")
    obligation = entry.get("specialist_obligation")
    if role not in ELIGIBLE_ROLES or not isinstance(obligation, str) or not obligation.strip():
        raise AgentOrchestrationError("specialist-obligation-invalid")
    if entry.get("packet_ready") not in {True, "yes"}:
        raise AgentOrchestrationError("packet-not-ready")
    if tier == "primary":
        raise AgentOrchestrationError("primary-tier-routes-solo")
    permission = _scope_contract(entry, role)
    assurance = obligation == "assurance" or role == "qa-reviewer"
    if assurance and not str(entry.get("assurance_claim", "")).strip():
        raise AgentOrchestrationError("assurance-claim-missing")
    return str(role), str(tier), permission, assurance


def _profile_contract(
    profiles: list[dict[str, Any]], role: str, tier: str, session_rank: int, assurance: bool
) -> dict[str, Any]:
    """Select the first deterministic profile that also satisfies ordinal efficiency."""
    candidates = sorted(
        (
            profile
            for profile in profiles
            if isinstance(profile, dict)
            and profile.get("enabled") is True
            and profile.get("tier") == tier
            and role in (profile.get("roles") or [])
            and (assurance or profile.get("tier_rank") < session_rank)
        ),
        key=lambda profile: str(profile.get("id", "")),
    )
    if not candidates:
        raise AgentOrchestrationError("eligible-profile-unavailable")
    profile = candidates[0]
    return profile


def _launch_entry(
    entry: dict[str, Any],
    profiles: list[dict[str, Any]],
    session_rank: int,
    control_state: dict[str, Any],
) -> dict[str, Any]:
    """Project one validated task entry into one trusted native launch instruction."""
    role, tier, permission, assurance = _entry_contract(entry)
    profile = _profile_contract(profiles, role, tier, session_rank, assurance)
    profile_id = str(profile.get("id", ""))
    if _suspended(control_state, role, profile_id):
        raise AgentOrchestrationError("role-profile-suspended")
    try:
        worker_packet = project_worker_packet(
            entry, {"materialization": {"items": entry.get("materialized_context", [])}}
        )
    except AgentContractError as error:
        raise AgentOrchestrationError(str(error)) from error
    return {
        "task_id": entry["task_id"],
        "role": role,
        "profile_id": profile_id,
        "model": profile.get("model"),
        "tier": tier,
        "tier_rank": profile.get("tier_rank"),
        "effort": profile.get("effort"),
        "permission": permission,
        "assurance": assurance,
        "worker_packet": worker_packet,
    }


def route_task(
    task: dict[str, Any],
    session: dict[str, Any],
    catalog: dict[str, Any],
    control_state: dict[str, Any],
    *,
    evaluation_instant: datetime | None = None,
) -> dict[str, Any]:
    """Return a deterministic same-provider launch request or a solo decision."""
    now = _instant(evaluation_instant)
    try:
        validate_routing_input(task, session, catalog, control_state)
        provider, session_rank, profiles = _host_contract(session, catalog)
        entries, delegated_ceiling = _wave_contract(task, control_state, now)
    except (AgentContractError, AgentOrchestrationError) as error:
        return _solo(now, [str(error)])
    launch_entries: list[dict[str, Any]] = []
    reasons: list[str] = []
    for entry in entries:
        try:
            launch_entries.append(_launch_entry(entry, profiles, session_rank, control_state))
        except AgentOrchestrationError as error:
            reasons.append(str(error))
    if reasons or len(launch_entries) != len(entries):
        return _solo(now, reasons or ["launch-entry-invalid"])
    entry_ceiling = sum(
        int(item["worker_packet"]["brief"]["output_token_ceiling"])
        for item in launch_entries
    )
    if entry_ceiling > delegated_ceiling:
        return _solo(now, ["entry-token-ceilings-exceed-wave-ceiling"])
    decision: dict[str, Any] = {
        "status": "delegated",
        "provider": provider,
        "base_snapshot": task["base_snapshot"],
        "catalog_digest": catalog.get("digest"),
        "session_tier_rank": session_rank,
        "delegated_token_ceiling": delegated_ceiling,
        "launch_entries": launch_entries,
        "reasons": [],
    }
    decision["decision_digest"] = _canonical_digest(decision)
    request = {
        "kind": "agent-route-request",
        "status": "delegated",
        "decision": decision,
        "issued_at": _timestamp(now),
        "start_expires_at": _timestamp(now + ROUTE_START_WINDOW),
    }
    request["request_digest"] = _canonical_digest(request)
    return request
