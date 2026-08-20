---
id: exec-plan.temporary-waiver-transitions
title: Temporary-Waiver Transitions
type: exec-plan
status: active
owner: project-governance
created: 2026-08-20
updated: 2026-08-20
summary: Give exact-source temporary waivers one reviewed refresh path and one reviewed resolution exit.
---

# Temporary-Waiver Transitions

## Outcome

A necessary change to actively waived source can pass only through a reviewed replacement bound to
the prior exact fingerprint. Completed remediation exits through an inert `waiver-resolved` record
with the same exact supersession binding. Silent deletion, automatic refresh, ambiguous
replacement, expiry, stale metrics or bytes, and unreviewed weakening remain blocking.

This source fix targets patch release `1.2.6`. It changes no adopter and introduces no receipt,
state store, CLI, migration, or compatibility path.

## Fixed Decisions

1. Add optional `supersedes_source_fingerprint` using the existing exact SHA-256 format.
2. Treat it as a strong transition precondition: it must equal the prior waiver's exact
   `source_fingerprint`.
3. A waiver refresh keeps stable identity or the existing relocation match, preserves
   responsibility, advances to different exact bytes, and carries a reviewer, a non-older valid
   approval date, the current metric, expiry, rationale, and remediation plan. The governed source
   must be present in the immutable change packet so its metric and fingerprint are checked.
4. An unchanged waiver remains valid only when every transition field, including any retained
   supersession marker, is unchanged.
5. A reviewed resolution uses inert `waiver-resolved`, preserves responsibility, names the exact
   waiver fingerprint being resolved, and carries reviewer, non-older approval date, and rationale.
   It never authorizes a future recurrence of the finding.
6. A selected changed source with no remaining matching finding cannot retain or refresh a
   temporary waiver; it must take the reviewed resolution exit.

## Implementation

- Owner: `src/project_governance_runtime/checker_scripts/maintainability_dispositions.py`
- Schema: `src/project_governance_runtime/defaults/schemas/quality-disposition.schema.json`
- Contract: `docs/specs/governance-kernel.md`
- Focused proof: `tests/test_runtime_maintainability_scope.py`

## Proof Budget

1. Run the exact transition tests while implementing.
2. Run `python3 -m unittest tests.test_runtime_maintainability_scope` once on the stable focused
   candidate; this exercises schema validation through the checker.
3. Inspect and validate the changed schema directly once.
4. Because the wheel schema and shared state-machine contract change, run the complete runtime
   suite, build one wheel, and run the clean installed-wheel verifier once before publication.
5. Run one branch-aware affected pre-push sign-off at the publication boundary. Do not repeat broad
   proof after a pass unless the candidate changes in a way that invalidates it.

## Acceptance

- All twelve required refresh, rejection, deletion, ambiguity, expiry, and resolution cases are
  deterministic and passing.
- Version-1 behavior and existing relocation behavior remain unchanged.
- The wheel remains project-neutral and the release lock names exact immutable coordinates.

## Rollback

Revert the schema field, both reviewed transitions, their tests, and the contract wording together.
Do not patch adopters or add a bypass.
