---
id: exec-plan.temporary-waiver-transitions
title: Temporary-Waiver Transitions
type: exec-plan
status: completed
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

## Completed Proof

- All 30 focused maintainability-scope tests passed, including the required refresh, rejection,
  deletion, ambiguity, expiry, and resolution cases.
- The schema was directly validated with legacy, temporary-waiver, valid resolution, and forbidden
  resolution-field cases.
- The broad runtime run passed 233 tests and skipped one. Its sole dirty-checkout wheel precondition
  was satisfied by the clean checkpoint, after which that exact reproducibility test passed.
- The clean checkout built `project_governance_runtime-1.2.6.dev1+gc927fdbfe839` and the installed-
  wheel verifier passed.
- The affected pre-commit sign-off passed all eight selected packs after the implementation was
  simplified into a dedicated waiver-transition helper and test class.

## Migration Note

Existing version-2 records remain valid. A reviewed refresh or resolution must name the prior
waiver's exact `source_fingerprint` in `supersedes_source_fingerprint`, preserve responsibility,
and include the governed source and registry in the same change packet. A refresh supplies the new
metric, fingerprint, expiry, and remediation plan. A resolution uses `waiver-resolved` and omits
those active-waiver fields.

## Rollback

Revert the schema field, both reviewed transitions, their tests, and the contract wording together.
Do not patch adopters or add a bypass.
