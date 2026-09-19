---
id: plan.harness.phase-2
title: Phase 2 - Decision Interface And First Decision
type: exec-plan
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: The provider-agnostic decision interface with fallbacks, proven on failure triage where a wrong answer costs one cycle.
---

> Child of [the master plan](README.md).

# Phase 2 - Decision Interface And First Decision

## Final State

One interface for every decision, with a deterministic fallback per question, and one real
consumer: failure triage. Triage accuracy is measured against recorded outcomes, and most failure
classes resolve without reaching a language model.

**Non-goals:** intent routing, packet assembly, any release decision, any second provider.

## Delivery

- Delivery: local-only

## Batch 1: The decision interface and its catalog

- Depends on: Phase 1 complete
- Ownership: decision interface and question catalog; one writer
- Execution: sequential
- Parallel support: solo; the contract is the point and a second reader would not reduce its risk
- Semantic contract: settled by [Decision Interface](../specs/decision-interface.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: three question shapes; catalog entries are versioned data; every entry declares
  a fallback; no provider SDK outside a provider module; a timeout is a fallback, not an error
- Acceptance: a full run completes with the provider disabled, on fallbacks alone; answers outside
  the declared schema are treated as provider failure; every answer and its confidence is recorded
- Development checkpoints: focused tests for fallback, timeout, schema violation and threshold bands
- Build and integration point: none beyond the harness itself
- Review boundary: the interface and the catalog shape, because both are expensive to change later
- Proof budget: focused tests plus one live provider call per shape
- Invalidates prior proof when: a question's meaning changes, which requires a new version
- Proof state: not-run
- Split early or stop when: a question cannot be expressed in the three shapes
- Documentation: update the spec if the catalog shape moves
- Acceptance milestone: none

## Batch 2: The failure taxonomy and its remedies

- Depends on: Batch 1
- Ownership: triage taxonomy and remedy mapping; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to classify the Phase 0 failure samples by
  hand, needed as the accuracy baseline
- Semantic contract: settled by [Failure Triage](../specs/failure-triage.md)
- Model class: deep-reasoning (gpt-5.6-sol, high; source: default table) for the taxonomy and
  remedy mapping, because a wrong class here becomes a wrong action everywhere downstream
- Fixed decisions: eight shared classes; adapters may add subtypes but never remove or redefine a
  class; remedies are declared data; retry bounded at one per class per task; a repeat is
  reclassified as a source defect; low confidence resolves to unknown
- Acceptance: every class has a declared remedy for at least one adapter; unknown is reachable and
  never tuned away; the retry bound holds under a forced repeat
- Development checkpoints: focused tests per class and for the repeat rule
- Build and integration point: none
- Review boundary: the taxonomy itself, reviewed against the hand-classified samples
- Proof budget: the hand-classified sample set; no new data collection
- Invalidates prior proof when: a class is added, removed, or redefined
- Proof state: not-run
- Split early or stop when: two classes cannot be distinguished from the evidence a decision is
  allowed to see
- Documentation: the taxonomy is durable; consolidate at batch closeout
- Acceptance milestone: none

## Batch 3: Triage in the loop, with accuracy reported

- Depends on: Batch 2
- Ownership: the ladder's failure path; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: triage never edits source, installs packages, or marks a run successful; the
  decision sees a signature, never a whole log
- Acceptance: classifications and outcomes recorded for every failure; measured accuracy per class;
  most classes resolving without a language model; a run with triage disabled behaves as today
- Development checkpoints: focused tests, then a period of real use before any accuracy claim
- Build and integration point: real failing builds across both repositories
- Review boundary: the accuracy report and whether any threshold should move
- Proof budget: existing build logs supply the baseline; no separate benchmark is constructed
- Invalidates prior proof when: the taxonomy, thresholds, or adapter signatures change
- Proof state: not-run
- Split early or stop when: accuracy is below the hand-classified baseline, in which case triage
  stays advisory and selects no remedy
- Documentation: consolidate the accuracy report at batch closeout
- Acceptance milestone: operator review of the accuracy report before Phase 3

## Stable-Candidate Proof

Retain the focused interface, taxonomy and triage tests, close the adapter signature gaps declared
in Batch 3, and run one branch-aware impacted sign-off on the frozen candidate.

## Rollback

Disable the provider. The interface falls back on every question, triage resolves everything to
unknown, and the loop behaves exactly as it did at the end of Phase 1.
