---
id: plan.harness.step-3
title: Step 3 - One Optional Decision
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Add a single classifier, hold everything else fixed, and measure whether accepted work improves.
---

> Child of [the master plan](../README.md).

# Step 3 - One Optional Decision

## Final State

One decision enters the loop, chosen by Step 1's evidence rather than by assumption. If Step 1
points at build and test failures, the candidate is the classification in
[Failure Triage](../../specs/failure-triage.md); if it points elsewhere, the candidate follows the
evidence instead. The entry is not chosen before Step 1 reports. Everything else
is held fixed so the measurement means something. A negative result disables the feature and leaves
Step 2's tool intact.

**Non-goals:** a catalog of decisions, a second provider, threshold tuning beyond the declared
protocol, autonomous dispatch.

## Delivery

- Delivery: local-only

## Batch 1: The decision interface and one catalog entry

- Depends on: Step 2 complete and positive
- Ownership: decision interface and a single entry; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Decision Interface](../../specs/decision-interface.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: one entry, not a catalog; a typed disposition per entry; provider capability is
  negotiated rather than assumed; thresholds carry the consequence of a wrong action and its
  evidence requirement, not a probability alone; no provider SDK outside a provider module
- Acceptance: with the provider disabled, ordinary checks remain available and entries declaring
  needs-input return control; one table-driven fixture per disposition covering outage, malformed
  probabilities, budget overflow and low confidence, asserting the same disposition at interface and
  consumer
- Development checkpoints: focused tests per disposition
- Build and integration point: none
- Review boundary: the interface and the threshold's safety reasoning
- Proof budget: focused tests plus one live call per shape used
- Invalidates prior proof when: the entry's meaning changes, requiring a new version
- Proof state: not-run
- Split early or stop when: the chosen decision cannot be expressed as a bounded question
- Documentation: update the spec if the catalog shape moves
- Acceptance milestone: none

## Batch 2: Measure the intervention, not the classifier

- Depends on: Batch 1
- Ownership: the evaluation; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment labelling outcomes for the held-out split
- Semantic contract: settled by [Decision Record](../../specs/evidence.md)
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: three variants compared - current workflow, deterministic assistance, assistance
  plus this decision; labels are outcome-based; the split is held out from question design and
  threshold tuning; splitting is by task or failure episode so retries cannot leak; diagnosis
  correctness, remedy outcome and task acceptance are separate facts; an unestablished cause is
  recorded unconfirmed
- Acceptance: accepted work, rework, elapsed time and total cost per accepted task across the three
  variants; abstentions, unresolved outcomes and missing-outcome volume all reported; a bounded
  sample of broader comparison inspecting what selection omitted
- Development checkpoints: a dry run on the design split before the held-out split is spent
- Build and integration point: real tasks
- Review boundary: the results and a keep-or-remove recommendation
- Proof budget: provider cost is small; elapsed time is the real cost
- Invalidates prior proof when: any frozen version changes; a provider upgrade requires a replay
  check and a working disable path
- Proof state: not-run
- Split early or stop when: the held-out split is exhausted; it is not re-run with adjusted wording
- Documentation: the results are durable
- Acceptance milestone: operator decision to keep or remove the feature

## Stable-Candidate Proof

Retain focused interface and disposition tests and run one branch-aware impacted sign-off on the
frozen candidate.

## Rollback

Disable the provider. The entry falls back, and the loop behaves exactly as it did at the end of
Step 2.
