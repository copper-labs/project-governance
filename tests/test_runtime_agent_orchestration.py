#!/usr/bin/env python3
"""Prove deterministic native-host routing and explicit dispatch state."""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from project_governance_runtime.agent_orchestration import (  # noqa: E402
    CONTROL_PATH,
    _canonical_digest,
    empty_control_state,
    finish_dispatch,
    load_control_state,
    start_dispatch,
)
from project_governance_runtime.agent_routing import catalog_digest, route_task  # noqa: E402
from project_governance_runtime.cli import main  # noqa: E402


NOW = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


def worker_entry(
    *, role: str = "implementation-worker", tier: str = "economy", obligation: str = "implementation-write"
) -> dict[str, object]:
    """Return one complete host-side task entry."""
    writer = role == "implementation-worker"
    return {
        "task_id": f"task-{role}",
        "role": role,
        "required_capability_tier": tier,
        "packet_ready": True,
        "specialist_obligation": obligation,
        "objective": "Complete one bounded assignment",
        "governing_refs": ["docs/spec.md"],
        "base_snapshot": "a" * 40,
        "read_scope": ["src/component.py"],
        "write_scope": ["src/component.py"] if writer else [],
        "exclusions": ["src/other.py"],
        "fixed_decisions": ["Keep the API"],
        "acceptance": ["Focused proof passes"],
        "focused_proof": ["python -m unittest tests.test_component"],
        "output_token_ceiling": 1000,
        "escalate_or_stop_when": ["A decision is missing"],
        "permission": "write" if writer else "read-only",
        "privacy": "same-provider",
        "scope_valid": True,
        "assurance_claim": "The named acceptance claim holds" if obligation == "assurance" else "",
        "materialized_context": [],
    }


def task_wave(*entries: dict[str, object], ceiling: int = 3000) -> dict[str, object]:
    """Return one launch-wave input with one shared snapshot and budget."""
    return {
        "base_snapshot": "a" * 40,
        "delegated_token_ceiling": ceiling,
        "entries": list(entries),
    }


def session(*, rank: int = 3) -> dict[str, object]:
    profile_id, model = {
        1: ("economy-high", "economy-model"),
        2: ("balanced-high", "balanced-model"),
        3: ("primary", "primary-model"),
    }[rank]
    return {"provider": "codex", "profile_id": profile_id, "model": model, "tier_rank": rank}


def catalog() -> dict[str, object]:
    value: dict[str, object] = {
        "provider": "codex",
        "profiles": [
            {
                "id": "economy-high",
                "model": "economy-model",
                "tier": "economy",
                "tier_rank": 1,
                "effort": "high",
                "roles": ["implementation-worker", "research-scout", "qa-reviewer"],
                "enabled": True,
            },
            {
                "id": "balanced-high",
                "model": "balanced-model",
                "tier": "balanced",
                "tier_rank": 2,
                "effort": "high",
                "roles": ["implementation-worker", "research-scout", "qa-reviewer"],
                "enabled": True,
            },
            {
                "id": "primary",
                "model": "primary-model",
                "tier": "primary",
                "tier_rank": 3,
                "effort": "high",
                "roles": [],
                "enabled": True,
            },
        ],
    }
    value["digest"] = catalog_digest(value)
    return value


class RuntimeAgentRoutingTests(unittest.TestCase):
    """Keep the router pure, ordinal, bounded, and fail-solo."""

    def test_routes_one_writer_and_two_readers_with_stable_output(self) -> None:
        """Map preselected tiers without exposing the host envelope to specialists."""
        wave = task_wave(
            worker_entry(),
            worker_entry(role="research-scout", obligation="research"),
            worker_entry(role="qa-reviewer", obligation="assurance"),
        )
        first = route_task(wave, session(), catalog(), empty_control_state(), evaluation_instant=NOW)
        second = route_task(wave, session(), catalog(), empty_control_state(), evaluation_instant=NOW)
        self.assertEqual(first, second)
        self.assertEqual(first["status"], "delegated")
        self.assertEqual(len(first["decision"]["launch_entries"]), 3)
        self.assertNotIn(
            "context_packet_id",
            first["decision"]["launch_entries"][0]["worker_packet"]["brief"],
        )

    def test_primary_missing_readiness_and_cross_provider_return_solo(self) -> None:
        """Reject undecided or mismatched work without writing state or selecting a fallback model."""
        primary = worker_entry(tier="primary")
        self.assertEqual(
            route_task(task_wave(primary), session(), catalog(), empty_control_state(), evaluation_instant=NOW)["status"],
            "solo",
        )
        unready = worker_entry()
        unready["packet_ready"] = False
        self.assertEqual(
            route_task(task_wave(unready), session(), catalog(), empty_control_state(), evaluation_instant=NOW)["status"],
            "solo",
        )
        other_catalog = catalog()
        other_catalog["provider"] = "claude"
        self.assertEqual(
            route_task(task_wave(worker_entry()), session(), other_catalog, empty_control_state(), evaluation_instant=NOW)["status"],
            "solo",
        )

    def test_efficiency_requires_lower_rank_but_assurance_is_exempt(self) -> None:
        """Keep equal-rank work solo except for one named read-only assurance claim."""
        balanced = worker_entry(tier="balanced")
        efficiency = route_task(
            task_wave(balanced), session(rank=2), catalog(), empty_control_state(), evaluation_instant=NOW
        )
        assurance_entry = worker_entry(role="qa-reviewer", tier="balanced", obligation="assurance")
        assurance = route_task(
            task_wave(assurance_entry), session(rank=2), catalog(), empty_control_state(), evaluation_instant=NOW
        )
        self.assertEqual(efficiency["status"], "solo")
        self.assertEqual(assurance["status"], "delegated")

    def test_native_catalogs_route_both_hosts_without_build_agents(self) -> None:
        """Exercise economy, balanced, and primary behavior through both native adapters."""
        for provider, relative in (
            ("codex", ".codex/agent-profiles.json"),
            ("claude", ".claude/agent-profiles.json"),
        ):
            path = ROOT / relative
            native_catalog = json.loads(path.read_text(encoding="utf-8"))
            native_catalog["digest"] = catalog_digest(native_catalog)
            primary = next(item for item in native_catalog["profiles"] if item["tier"] == "primary")
            native_session = {
                "provider": provider,
                "profile_id": primary["id"],
                "model": primary["model"],
                "tier_rank": primary["tier_rank"],
            }
            for tier in ("economy", "balanced"):
                result = route_task(
                    task_wave(worker_entry(tier=tier)),
                    native_session,
                    native_catalog,
                    empty_control_state(),
                    evaluation_instant=NOW,
                )
                self.assertEqual(result["status"], "delegated", provider)
            primary_result = route_task(
                task_wave(worker_entry(tier="primary")),
                native_session,
                native_catalog,
                empty_control_state(),
                evaluation_instant=NOW,
            )
            self.assertEqual(primary_result["status"], "solo")
            self.assertFalse(
                any("build-verifier" in item["roles"] for item in native_catalog["profiles"])
            )

    def test_duplicate_task_ids_and_mixed_snapshots_return_solo(self) -> None:
        """Bind every entry to one unique task identity and immutable source snapshot."""
        first = worker_entry()
        second = worker_entry(role="research-scout", obligation="research")
        second["task_id"] = first["task_id"]
        duplicate = route_task(
            task_wave(first, second), session(), catalog(), empty_control_state(), evaluation_instant=NOW
        )
        second["task_id"] = "task-research"
        second["base_snapshot"] = "b" * 40
        mixed = route_task(
            task_wave(first, second), session(), catalog(), empty_control_state(), evaluation_instant=NOW
        )
        self.assertIn("duplicate-task-id", duplicate["decision"]["reasons"])
        self.assertIn("base-snapshot-mismatch", mixed["decision"]["reasons"])

    def test_worker_brief_and_catalog_profiles_are_schema_validated(self) -> None:
        """Reject malformed model context and incomplete native profiles before routing."""
        malformed = worker_entry()
        malformed["objective"] = {"unexpected": "object"}
        brief_result = route_task(
            task_wave(malformed), session(), catalog(), empty_control_state(), evaluation_instant=NOW
        )
        malformed_catalog = catalog()
        del malformed_catalog["profiles"][0]["model"]
        malformed_catalog["digest"] = catalog_digest(malformed_catalog)
        catalog_result = route_task(
            task_wave(worker_entry()),
            session(),
            malformed_catalog,
            empty_control_state(),
            evaluation_instant=NOW,
        )
        self.assertEqual(brief_result["status"], "solo")
        self.assertEqual(catalog_result["status"], "solo")

    def test_catalog_digest_must_match_canonical_catalog_content(self) -> None:
        """Prevent a stale embedded digest from posing as catalog provenance."""
        changed = catalog()
        changed["profiles"][0]["effort"] = "medium"
        result = route_task(
            task_wave(worker_entry()), session(), changed, empty_control_state(), evaluation_instant=NOW
        )
        self.assertIn("catalog-digest-mismatch", result["decision"]["reasons"])


class RuntimeAgentDispatchTests(unittest.TestCase):
    """Keep authorization explicit and repository writer state cross-session safe."""

    def _request(self, at: datetime = NOW) -> dict[str, object]:
        return route_task(
            task_wave(worker_entry()), session(), catalog(), empty_control_state(), evaluation_instant=at
        )

    def test_start_acquires_writer_lease_and_finish_releases_it_once(self) -> None:
        """Persist one active wave, then close it and call one terminal hook."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = self._request()
            started = start_dispatch(root, request, evaluation_instant=NOW + timedelta(minutes=1))
            state = load_control_state(root)
            self.assertEqual(started["status"], "authorized")
            self.assertIsNotNone(state["writer_lease"])
            events: list[dict[str, object]] = []
            finished = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"duration_ms": 10, "entries": [{"task_id": "task-implementation-worker", "status": "completed"}]},
                evaluation_instant=NOW + timedelta(minutes=2),
                terminal_hook=lambda _root, event: events.append(event),
            )
            state = load_control_state(root)
        self.assertEqual(finished["terminal_reason"], "completed")
        self.assertIsNone(state["writer_lease"])
        self.assertEqual(len(events), 1)

    def test_writer_contention_and_late_finish_are_fail_solo_without_receipt(self) -> None:
        """Treat active leases as exclusive and expired results as control-state-only timeouts."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = self._request()
            started = start_dispatch(root, request, evaluation_instant=NOW)
            second_writer = worker_entry()
            second_writer["task_id"] = "task-second-writer"
            distinct_request = route_task(
                task_wave(second_writer),
                session(),
                catalog(),
                empty_control_state(),
                evaluation_instant=NOW + timedelta(seconds=1),
            )
            blocked = start_dispatch(
                root, distinct_request, evaluation_instant=NOW + timedelta(minutes=1)
            )
            events: list[dict[str, object]] = []
            late = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"entries": [{"task_id": "task-implementation-worker", "status": "completed"}]},
                evaluation_instant=NOW + timedelta(hours=2, seconds=1),
                terminal_hook=lambda _root, event: events.append(event),
            )
            state = load_control_state(root)
        self.assertEqual(blocked["status"], "solo")
        self.assertEqual(blocked["reason"], "repository-writer-lease-active")
        self.assertEqual(late["status"], "timed-out")
        self.assertEqual(events, [])
        self.assertIsNone(state["writer_lease"])

    def test_unknown_finish_is_no_op_and_critical_violation_suspends_pair(self) -> None:
        """Reject unknown results and persist only critical role/profile suspensions."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unknown = finish_dispatch(root, "sha256:" + "0" * 64, {}, evaluation_instant=NOW)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"entries": [{"task_id": "task-implementation-worker", "status": "failed", "violation": "scope"}]},
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            state = load_control_state(root)
        self.assertEqual(
            unknown,
            {
                "status": "invalid-authorization",
                "changed": False,
                "telemetry_written": False,
            },
        )
        self.assertEqual(state["suspensions"][0]["reason"], "scope")

    def test_terminal_authorization_is_pruned_only_by_next_successful_start(self) -> None:
        """Retain terminal evidence for one subsequent start transaction."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = start_dispatch(root, self._request(), evaluation_instant=NOW)
            finish_dispatch(
                root,
                str(first["authorization_digest"]),
                {"entries": [{"task_id": "task-implementation-worker", "status": "completed"}]},
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            self.assertEqual(len(load_control_state(root)["authorizations"]), 1)
            second = start_dispatch(
                root,
                self._request(NOW + timedelta(minutes=2)),
                evaluation_instant=NOW + timedelta(minutes=2),
            )
            state = load_control_state(root)
        self.assertEqual(second["status"], "authorized")
        self.assertEqual(len(state["authorizations"]), 1)
        self.assertEqual(state["authorizations"][0]["authorization_digest"], second["authorization_digest"])

    def test_unreadable_control_state_disables_dispatch(self) -> None:
        """Leave solo work available when ignored control state cannot be trusted."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / CONTROL_PATH
            path.parent.mkdir(parents=True)
            path.write_text("not-json", encoding="utf-8")
            result = start_dispatch(root, self._request(), evaluation_instant=NOW)
        self.assertEqual(result["status"], "solo")
        self.assertEqual(result["reason"], "control-state-unavailable")

    def test_start_revalidates_suspension_and_malformed_launch_structure(self) -> None:
        """Fail closed when state changes after routing or a request is hand-authored badly."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = empty_control_state()
            state["suspensions"].append({
                "role": "implementation-worker",
                "profile_id": "economy-high",
                "reason": "credential",
            })
            path = root / CONTROL_PATH
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(state), encoding="utf-8")
            suspended = start_dispatch(root, self._request(), evaluation_instant=NOW)
            state["suspensions"] = []
            path.write_text(json.dumps(state), encoding="utf-8")
            malformed = self._request(NOW + timedelta(minutes=1))
            malformed["decision"]["launch_entries"][0]["worker_packet"] = "invalid"
            decision_body = {
                key: value
                for key, value in malformed["decision"].items()
                if key != "decision_digest"
            }
            malformed["decision"]["decision_digest"] = _canonical_digest(decision_body)
            request_body = {key: value for key, value in malformed.items() if key != "request_digest"}
            malformed["request_digest"] = _canonical_digest(request_body)
            structural = start_dispatch(
                root, malformed, evaluation_instant=NOW + timedelta(minutes=1)
            )
            final_state = load_control_state(root)
        self.assertEqual(suspended["reason"], "role-profile-suspended")
        self.assertEqual(structural["reason"], "worker-packet-invalid")
        self.assertIsNone(final_state["writer_lease"])

    def test_start_cross_checks_model_brief_identity_and_permission_scope(self) -> None:
        """Prevent a validly shaped brief from contradicting its trusted launch entry."""
        cases = (
            (
                worker_entry(role="research-scout", obligation="research"),
                "write_scope",
                ["src/"],
                "reader-write-scope-present",
            ),
            (worker_entry(), "task_id", "wrong-task", "worker-brief-identity-mismatch"),
            (worker_entry(), "write_scope", [], "writer-scope-missing"),
        )
        for entry, field, value, expected in cases:
            request = route_task(
                task_wave(entry),
                session(),
                catalog(),
                empty_control_state(),
                evaluation_instant=NOW,
            )
            launch = request["decision"]["launch_entries"][0]
            launch["worker_packet"]["brief"][field] = value
            decision_body = {
                key: value
                for key, value in request["decision"].items()
                if key != "decision_digest"
            }
            request["decision"]["decision_digest"] = _canonical_digest(decision_body)
            request_body = {
                key: value for key, value in request.items() if key != "request_digest"
            }
            request["request_digest"] = _canonical_digest(request_body)
            with tempfile.TemporaryDirectory() as directory:
                result = start_dispatch(Path(directory), request, evaluation_instant=NOW)
            self.assertEqual(result["reason"], expected)

    def test_route_request_is_single_use_and_reader_cap_is_repository_wide(self) -> None:
        """Prevent request replay and more than two active readers across native sessions."""
        reader = worker_entry(role="research-scout", obligation="research")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            request = route_task(
                task_wave(reader), session(), catalog(), empty_control_state(), evaluation_instant=NOW
            )
            first = start_dispatch(root, request, evaluation_instant=NOW)
            replay = start_dispatch(root, request, evaluation_instant=NOW + timedelta(seconds=1))
            second_reader = worker_entry(role="qa-reviewer", obligation="assurance")
            two_reader_request = route_task(
                task_wave(reader, second_reader),
                session(),
                catalog(),
                load_control_state(root),
                evaluation_instant=NOW + timedelta(minutes=1),
            )
        self.assertEqual(first["status"], "authorized")
        self.assertEqual(replay["reason"], "route-request-already-consumed")
        self.assertEqual(two_reader_request["status"], "solo")
        self.assertIn("repository-reader-cap-active", two_reader_request["decision"]["reasons"])

    def test_incomplete_or_malformed_results_fail_without_permanent_suspension(self) -> None:
        """Fail malformed host envelopes without disabling an otherwise safe role/profile."""
        for results in (
            {"termination_reason": "completed"},
            {
                "entries": [{
                    "task_id": "task-implementation-worker",
                    "status": "completed",
                    "output_tokens": "1000",
                }]
            },
        ):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                started = start_dispatch(root, self._request(), evaluation_instant=NOW)
                finished = finish_dispatch(
                    root,
                    str(started["authorization_digest"]),
                    results,
                    evaluation_instant=NOW + timedelta(minutes=1),
                )
                state = load_control_state(root)
            self.assertEqual(finished["terminal_reason"], "failed")
            self.assertEqual(state["suspensions"], [])

    def test_null_usage_is_omitted_and_contradictory_completion_suspends(self) -> None:
        """Handle absent usage safely and reject a completed claim that conflicts with entries."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            completed = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {
                    "entries": [{
                        "task_id": "task-implementation-worker",
                        "status": "completed",
                        "output_tokens": None,
                    }]
                },
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            completed_state = load_control_state(root)
        self.assertEqual(completed["terminal_reason"], "completed")
        self.assertIsNone(completed_state["writer_lease"])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            contradicted = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {
                    "termination_reason": "completed",
                    "entries": [{
                        "task_id": "task-implementation-worker",
                        "status": "failed",
                    }],
                },
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            state = load_control_state(root)
        self.assertEqual(contradicted["terminal_reason"], "failed")
        self.assertEqual(state["suspensions"][0]["reason"], "result-integrity")

    def test_mismatched_result_identity_remains_a_critical_suspension(self) -> None:
        """Distinguish a safety-relevant identity mismatch from mere host formatting errors."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            finished = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"entries": [{
                    "task_id": "wrong-task",
                    "status": "completed",
                    "output_tokens": 5000,
                }]},
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            state = load_control_state(root)
        self.assertEqual(finished["terminal_reason"], "failed")
        self.assertEqual(state["suspensions"][0]["reason"], "result-integrity")

    def test_non_mapping_results_fail_and_release_the_writer_lease(self) -> None:
        """Keep the library finish boundary fail-closed for non-object host results."""
        for results in (None, [], "text"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                started = start_dispatch(root, self._request(), evaluation_instant=NOW)
                finished = finish_dispatch(
                    root,
                    str(started["authorization_digest"]),
                    results,
                    evaluation_instant=NOW + timedelta(minutes=1),
                )
                state = load_control_state(root)
            self.assertEqual(finished["terminal_reason"], "failed")
            self.assertIsNone(state["writer_lease"])
            self.assertEqual(state["suspensions"], [])

    def test_explicit_violation_suspends_only_the_offending_entry(self) -> None:
        """Do not disable clean readers when one writer reports a critical violation."""
        reader = worker_entry(role="research-scout", obligation="research")
        request = route_task(
            task_wave(worker_entry(), reader),
            session(),
            catalog(),
            empty_control_state(),
            evaluation_instant=NOW,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, request, evaluation_instant=NOW)
            finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"entries": [
                    {
                        "task_id": "task-implementation-worker",
                        "status": "failed",
                        "violation": "scope",
                    },
                    {"task_id": "task-research-scout", "status": "completed"},
                ]},
                evaluation_instant=NOW + timedelta(minutes=1),
            )
            suspensions = load_control_state(root)["suspensions"]
        self.assertEqual(
            suspensions,
            [{
                "role": "implementation-worker",
                "profile_id": "economy-high",
                "reason": "scope",
            }],
        )

    def test_legitimate_over_ceiling_result_is_budget_exhausted(self) -> None:
        """Retain budget exhaustion only for identity-valid host results."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            finished = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                {"entries": [{
                    "task_id": "task-implementation-worker",
                    "status": "completed",
                    "output_tokens": 3001,
                }]},
                evaluation_instant=NOW + timedelta(minutes=1),
            )
        self.assertEqual(finished["terminal_reason"], "budget-exhausted")

    def test_version_one_empty_state_without_consumed_requests_is_tolerated(self) -> None:
        """Keep unreleased Version 1 empty control state compatible across the hardening patch."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / CONTROL_PATH
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({
                "version": 1,
                "authorizations": [],
                "writer_lease": None,
                "suspensions": [],
            }), encoding="utf-8")
            state = load_control_state(root)
        self.assertEqual(state["consumed_requests"], [])

    def test_unknown_finish_never_creates_or_expires_control_state(self) -> None:
        """Keep an invalid authorization finish a true state and telemetry no-op."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            unknown = finish_dispatch(root, "sha256:" + "0" * 64, {}, evaluation_instant=NOW)
            self.assertFalse((root / CONTROL_PATH).exists())
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            active_before = load_control_state(root)["authorizations"][0].copy()
            late_unknown = finish_dispatch(
                root,
                "sha256:" + "1" * 64,
                {},
                evaluation_instant=NOW + timedelta(hours=3),
            )
            active_after = load_control_state(root)["authorizations"][0]
        self.assertFalse(unknown["changed"])
        self.assertFalse(late_unknown["changed"])
        self.assertEqual(active_before, active_after)
        self.assertEqual(active_after["authorization_digest"], started["authorization_digest"])

    def test_telemetry_success_is_observed_and_hook_failure_is_fail_open(self) -> None:
        """Report receipt success only when the terminal hook confirms its write."""
        results = {
            "entries": [{"task_id": "task-implementation-worker", "status": "completed"}]
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            started = start_dispatch(root, self._request(), evaluation_instant=NOW)
            failed_hook = finish_dispatch(
                root,
                str(started["authorization_digest"]),
                results,
                evaluation_instant=NOW + timedelta(minutes=1),
                terminal_hook=lambda _root, _event: False,
            )
        self.assertFalse(failed_hook["telemetry_written"])

    def test_cli_routes_starts_and_finishes_without_a_provider_client(self) -> None:
        """Expose the three JSON interfaces and append exactly one terminal receipt."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            task_path = root / "task.json"
            session_path = root / "session.json"
            catalog_path = root / "catalog.json"
            request_path = root / "request.json"
            results_path = root / "results.json"
            task_path.write_text(json.dumps(task_wave(worker_entry())), encoding="utf-8")
            session_path.write_text(json.dumps(session()), encoding="utf-8")
            catalog_path.write_text(json.dumps(catalog()), encoding="utf-8")
            output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys,
                "argv",
                [
                    "project-governance",
                    "agent-route",
                    "--task",
                    str(task_path),
                    "--session",
                    str(session_path),
                    "--catalog",
                    str(catalog_path),
                    "--json",
                ],
            ), contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            request = json.loads(output.getvalue())
            request_path.write_text(json.dumps(request), encoding="utf-8")
            output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys,
                "argv",
                ["project-governance", "agent-dispatch", "start", "--request", str(request_path), "--json"],
            ), contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            started = json.loads(output.getvalue())
            task_id = started["launch_entries"][0]["task_id"]
            results_path.write_text(
                json.dumps({"entries": [{"task_id": task_id, "status": "completed", "input_tokens": 20}]}),
                encoding="utf-8",
            )
            output = io.StringIO()
            with patch("project_governance_runtime.cli._root", return_value=root), patch.object(
                sys,
                "argv",
                [
                    "project-governance",
                    "agent-dispatch",
                    "finish",
                    "--authorization",
                    started["authorization_digest"],
                    "--results",
                    str(results_path),
                    "--json",
                ],
            ), contextlib.redirect_stdout(output):
                self.assertEqual(main(), 0)
            records = (root / ".governance/telemetry/runs.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(records), 1)
        self.assertEqual(json.loads(records[0])["event"], "orchestration-terminal")


class RuntimeAgentConcurrencyTests(unittest.TestCase):
    """Protect repository-wide concurrency at the authoritative start boundary."""

    def test_start_enforces_repository_wide_reader_cap(self) -> None:
        """Keep the authoritative write boundary at no more than two active readers."""
        first_wave = task_wave(
            worker_entry(role="research-scout", obligation="research"),
            worker_entry(role="qa-reviewer", obligation="assurance"),
        )
        third_reader = worker_entry(role="research-scout", obligation="research")
        third_reader["task_id"] = "task-third-reader"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            active_request = route_task(
                first_wave,
                session(),
                catalog(),
                empty_control_state(),
                evaluation_instant=NOW,
            )
            start_dispatch(root, active_request, evaluation_instant=NOW)
            independent_request = route_task(
                task_wave(third_reader),
                session(),
                catalog(),
                empty_control_state(),
                evaluation_instant=NOW + timedelta(seconds=1),
            )
            blocked = start_dispatch(
                root,
                independent_request,
                evaluation_instant=NOW + timedelta(minutes=1),
            )
        self.assertEqual(blocked["status"], "solo")
        self.assertEqual(blocked["reason"], "repository-reader-cap-active")


if __name__ == "__main__":
    unittest.main()
