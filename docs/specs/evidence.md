---
id: spec.harness.evidence
title: Evidence
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: What an observation establishes about an artifact or a requirement, and why that is not the same as acceptance.
---

> Child of [Harness Core](harness-core.md).

# Evidence

## Purpose

An observation, and what it establishes. Decisions are annotations here, not a separate object.

## Current Implementation

- **Posture:** planned. **Evidence:** none.
- **Current boundary:** The governance runtime's telemetry is deliberately content-free and is not
  this. Existing checkers already emit receipts, which are referenced rather than copied.
- **Known limits:** Calibration needs volume; early readings are noisy.
- **Ledger:** [Research index](../research/concept.md).

## Shape

Each Evidence record names the **claim** being checked, the exact **Artifact or requirement** it
concerns, what was **observed**, and what that observation **establishes** — which is often less
than it appears to.

Execution-critical fields are durable before the Action they cover. Analytics fields are
best-effort and their loss never blocks work or changes a verdict.

## Three Facts, Never Collapsed

- **Diagnosis correctness** — was the predicted cause right?
- **Remedy outcome** — what did the remedy actually do?
- **Task acceptance** — were the Task's criteria satisfied?

A clean-and-retry that passes is evidence of an **effect**, not proof of the predicted **cause**: a
transient service recovering produces the same observation. Where cause cannot be independently
established it is recorded **unconfirmed**, and unconfirmed never counts toward accuracy.

## Verification Is Not Acceptance

Checks passing says the declared checks passed on that subject. A test suite can deterministically
pass a change that solved the wrong problem, and documentation, architecture and nonfunctional
requirements may need review or external evidence.

**Guard against circularity.** A worker can change the implementation, its tests, and the policy
selecting which checks run. Mandatory acceptance requirements bind to the **authorized baseline**,
not to the subject the worker produced. A worker's proposed change to those requirements is
reviewable output, never authority for accepting the same work. Untested claims stay explicitly
open rather than closed by a partial run.

## Decision Annotations

A decision annotation records the question and its version, the catalog and policy digests, the
effective thresholds, the producer and provider versions (`unknown` where unreported), the answer
with its confidence and distribution, the disposition taken, and the tier that answered.

**Question confidence and action safety are different quantities.** A 95% confident diagnosis is
not a 95% probability its remedy is appropriate.

A digest identifies bytes; it cannot reconstruct them. Configuration needed to restore a prior
state is retained as an artifact, not referenced by digest alone.

## Calibration

Per question and version: observed accuracy against established outcomes, whether stated confidence
matches observed frequency, disposition rates, and how much outcome data is **missing**.

- Evaluation splits by task or failure episode, so related retries cannot leak between development
  and held-out cases.
- Selection creates missing evidence: an excluded lane or file cannot reveal its value through a
  normal run, so a bounded sample of broader comparison inspects omissions.
- **Incomplete evaluation never authorizes a weaker threshold.**
- A factual correction is strong calibration evidence; a changed preference is not, and the two are
  recorded distinctly.
- A provider upgrade requires a replay check and a working disable path, not just a version field.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Analytics write fails | Work proceeds; the gap is noted once |
| Execution-critical write fails | The dependent Action does not run |
| Outcome never arrives | The decision stays open; calibration excludes rather than assumes success |
| Cause not establishable | Recorded unconfirmed |

## Validation Requirements

- A retry that succeeds for a cause unrelated to the proposed remedy does not become evidence the
  diagnosis was right.
- An omitted lane that later finds a defect is visible in the evaluation.
- A patch deleting a failing assertion does not satisfy that assertion's obligation.

## Change Log

- 2026-09-19: Replaces the decision-record contract; decisions become annotations here.
