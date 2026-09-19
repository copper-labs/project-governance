---
id: plan.harness.phase-5
title: Phase 5 - Release Management Plugin
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The plugin contract and one gated staging promotion, compared against the runbooks it replaces.
---

> Child of [the master plan](../README.md).

# Phase 5 - Release Management Plugin

## Final State

Release work is a declared state machine with gates. One staging promotion runs end to end through
it, evidenced and recorded, and is compared directly against the hand-written runbooks it replaces.
Approval stays exactly where it is today.

**Non-goals:** automating approval, production promotion in this phase, reimplementing deploy
tooling, a plugin ecosystem.

## Delivery

- Delivery: local-only for Batches 1 to 4. Batch 5 requires an explicitly authorized staging
  execution against a real destination, with readback; that authorization is separate from this plan
  and is obtained before the batch starts.

## Batch 1: The plugin host and gate evaluation

- Depends on: Phase 4 complete
- Ownership: plugin host and gate evaluation in the core; one writer
- Execution: sequential
- Parallel support: solo; the invariant is the point of the batch
- Semantic contract: settled by [Plugin Contract](../../specs/plugin-contract.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: a plugin declares states, gates, commands and records and nothing else; a plugin
  may raise a gate and never lower one; enforced at load **and** at evaluation, since load-time
  validation cannot prove a live gate fact; an unavailable fact is never a satisfied gate
- Acceptance: a plugin attempting to lower a gate fails to load with one clear reason; two plugins
  claiming one transition fail to load; removing a plugin restores prior core behavior exactly
- Development checkpoints: focused tests for each refusal path
- Build and integration point: none beyond the harness
- Review boundary: the gate invariant and its enforcement, because everything after it depends on
  the invariant holding
- Proof budget: focused tests only
- Invalidates prior proof when: the declaration shape changes
- Proof state: not-run
- Split early or stop when: a real gate cannot be expressed in the four declarations
- Documentation: update the spec if the shape moves
- Acceptance milestone: none

## Batch 2: The release evidence packet fills itself

- Depends on: Batch 1
- Ownership: release plugin packet assembly; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to enumerate the live facts currently left for
  an operator and where each is obtainable, needed at batch start
- Semantic contract: settled by [Release Management](../../specs/release-management.md)
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: no decision model participates; the packet wraps the existing builder rather
  than replacing it; an unavailable fact is reported as unavailable, never inferred
- Acceptance: the fields previously filled by hand are populated automatically; the packet is
  current rather than a template; unavailable facts are explicit
- Development checkpoints: focused tests per source, with recorded fixtures for external systems
- Build and integration point: one real assembly against staging
- Review boundary: a generated packet compared field by field against a recent hand-filled one
- Proof budget: one real assembly plus fixtures; this is the batch with the clearest measurable
  saving, so record the elapsed time it replaces
- Invalidates prior proof when: an external interface or credential scope changes
- Proof state: not-run
- Split early or stop when: a required fact has no programmatic source
- Documentation: consolidate at batch closeout
- Acceptance milestone: operator confirms the generated packet is trustworthy before it feeds a gate

## Batch 3: The evidence catalog replaces per-release checkers

- Depends on: Batch 2
- Ownership: evidence catalog and its single evaluator; one writer
- Execution: sequential
- Parallel support: two bounded read-only assignments: one to inventory what each existing checker
  actually proves, one to identify checkers bound to shipped versions; both needed at batch start
- Semantic contract: settled
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: existing checkers are harvested, not deleted; each encodes a real lesson; a
  version-pinned checker for a shipped release is retired explicitly and recorded; a new concern
  adds a catalog entry rather than a script
- Acceptance: the mandatory evidence set is computed from policy and change facts, never selected
  by a decision; a forced wrong decision that omits a mandatory type still leaves the gate blocked;
  catalog entries reproduce the verdicts of the checkers they replace; retired checkers are named
  with their reason; checkers whose behavior resists declaration stay as code and are recorded as
  exceptions
- Development checkpoints: each harvested entry replayed against the history that produced it
- Build and integration point: evaluator run against recorded subjects
- Review boundary: the complete catalog against the original checker set, verdict for verdict
- Proof budget: historical replay only; no new evidence is produced for old releases
- Invalidates prior proof when: an entry's requirement or validity window changes
- Proof state: not-run
- Split early or stop when: a checker's behavior cannot be expressed declaratively, which means it
  stays as code and the catalog records that exception
- Documentation: the catalog is durable and owned by the adopting repository
- Acceptance milestone: none

## Batch 4: The promotion plan is generated

- Depends on: Batch 3
- Ownership: plan generation; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: the plan is prose over the packet's known content; no fact originates in the
  language model; the generated plan is reviewed, never auto-approved
- Acceptance: a generated plan reviewed against a prior hand-written one covers the same ground,
  with any omission named
- Development checkpoints: generation against two historical packets
- Build and integration point: none
- Review boundary: the side-by-side comparison
- Proof budget: two comparisons; record the authoring time replaced
- Invalidates prior proof when: the packet shape changes
- Proof state: not-run
- Split early or stop when: the packet lacks content the plans depend on, which is a packet defect
- Documentation: consolidate at batch closeout
- Acceptance milestone: operator accepts a generated plan for a real promotion

## Batch 5: One gated staging transition, end to end

- Depends on: Batch 4
- Ownership: the staging transition; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: existing environment approval settings are inherited untouched; the transition
  wraps existing deploy tooling; rollback triggers are declared thresholds, not decisions; no
  production transition in this phase
- Acceptance: one real staging promotion runs through the gate, with evidence bound to the exact
  subject, decisions recorded, and the outcome attached; a gate with a missing fact blocks
- Development checkpoints: a dry run with a deliberately missing fact before the real run
- Build and integration point: the real staging promotion
- Review boundary: the completed promotion compared against the hand-written staging runbooks
- Proof budget: one real promotion; the baseline already exists in the repository's history
- Invalidates prior proof when: gate declarations, environment settings, or deploy tooling change
- Proof state: not-run
- Split early or stop when: the gate would require relaxing an existing approval, which is out of
  contract and ends the batch
- Documentation: consolidate the plugin and its catalog at phase closeout
- Acceptance milestone: attended operator review of the first real gated promotion

## Stable-Candidate Proof

Retain focused plugin, catalog and packet tests, then run the adopting repository's declared broad
proof. A release-path change is explicitly one of the situations that requires broad rather than
narrow proof, and the ladder does not apply here.

## Rollback

Remove the plugin. The state machine disappears, the existing checkers and runbook practice remain
intact because they were harvested rather than deleted, and the environment approval settings were
never modified.
