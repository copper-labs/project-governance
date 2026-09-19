---
id: plan.harness.phase-4
title: Phase 4 - Tighten On Evidence
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Change thresholds, lane maps and check selection only where the recorded history justifies it.
---

> Child of [the master plan](../README.md).

# Phase 4 - Tighten On Evidence

## Final State

Thresholds and selection maps are maintained from the record instead of intuition, and every change
to either carries the evidence that justified it. A second ecosystem adapter exists, which is what
proves the adapter boundary was real.

**Non-goals:** new decisions, new capability, any release work, any substrate change.

## Delivery

- Delivery: local-only

## Batch 1: Calibration reads and a threshold change protocol

- Depends on: Phase 3 complete, with enough recorded history to read
- Ownership: calibration reads over the record; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Decision Record](../../specs/decision-record.md)
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: a threshold may only be loosened against recorded outcomes; the change itself is
  recorded with its evidence; human corrections are the strongest signal; open decisions are
  excluded rather than assumed successful
- Acceptance: per question and version, accuracy, confidence-versus-frequency, fallback rate and
  escalation resolution are readable; a threshold change without supporting evidence is refused
- Development checkpoints: calibration reads return stable values for a fixed fixture set
- Build and integration point: none
- Review boundary: the first real threshold change proposal, reviewed against its evidence
- Proof budget: the existing record; no new collection
- Invalidates prior proof when: a question version changes, which resets its history
- Proof state: not-run
- Split early or stop when: sample sizes are too small for any change to be defensible, in which
  case the phase waits rather than proceeding on thin data
- Documentation: the protocol is durable
- Acceptance milestone: none

## Batch 2: Lane map refinement and a second adapter

- Depends on: Batch 1
- Ownership: adapters and lane maps; one writer
- Execution: parallel with Batch 1 only after Batch 1's reads exist
- Parallel support: one bounded read-only assignment to identify lanes that ran repeatedly without
  ever failing, and paths never covered by any lane, needed at batch start
- Semantic contract: settled by [Ecosystem Adapters](../../specs/ecosystem-adapters.md)
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: maps narrow only where history supports it and widen wherever it does not;
  release and broad-proof boundaries are untouched; the second adapter adds no core change
- Acceptance: narrowing supported by dependency and coverage evidence, never by passing history
  alone; a lane that never failed is prioritized for investigation rather than removed; periodic
  broad comparison retained; a second ecosystem runs the same loop with no core modification;
  uncovered paths named explicitly
- Development checkpoints: fixture changes with expected lanes per adapter
- Build and integration point: real builds in both ecosystems
- Review boundary: the completed refinement against the recorded history it claims to follow
- Proof budget: replay historical changes; compare selected lanes against what actually broke
- Invalidates prior proof when: the module graph or adapter inputs change
- Proof state: not-run
- Split early or stop when: the second adapter requires a core change, which would mean the
  boundary is wrong and should be fixed before more is built on it
- Documentation: consolidate both adapters at batch closeout
- Acceptance milestone: none

## Stable-Candidate Proof

Retain focused adapter and calibration tests, then run one branch-aware impacted sign-off on the
frozen candidate. Refined maps additionally require one explicit broad run, because narrowing
selection is exactly the kind of change that narrow proof cannot validate.

## Rollback

Restore the prior maps and thresholds from the record, which holds both the old values and the
evidence used to change them.
