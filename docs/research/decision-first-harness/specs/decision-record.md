---
id: research.harness.decision-record
title: Decision Record
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: What the harness records about every decision and outcome, so the same ledger serves audit and calibration.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Decision Record

## Purpose

Record every decision that influenced an action, and attach what actually happened. Read forward it
explains the loop. Read backward it is evidence. Read sideways it is the only honest basis for
tuning thresholds.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none. The governance runtime's telemetry is deliberately content-free and
  is not this record.
- **Evidence:** none.
- **Known limits:** Calibration needs volume; early readings will be noisy.
- **Ledger:** [Research index](../../README.md).

## Scope

- The record shape and its identity bindings.
- Outcome attachment after the fact.
- The reads that calibration and audit require.

## Non-Goals

- Replacing governance telemetry, which stays bounded and content-free.
- Storing prompts, transcripts, or source content.
- Scoring people.

## Record Shape

One record per decision, holding:

- decision identity, and the task it belongs to
- the question identifier and version
- the digest of the state the decision saw, never the state itself
- the answer, its confidence, and the probability distribution
- whether it was acted on, escalated, or fell back, and why
- the tier that answered: deterministic, decision model, or language model
- what the harness did next
- timing and cost as reported by the provider

Outcomes attach later as separate records referencing the decision: what was observed, whether the
decision proved right, and any correction a human made.

## Behavioral Requirements

- A decision is recorded before the action it influenced runs, never after.
- An outcome is attached whenever one becomes known, including much later from a verification stage.
- A human correction is recorded as an outcome with its reason, and is the strongest signal
  available for calibration.
- A packet miss, where a worker asked for something the packet lacked, is an outcome against the
  narrowing decision that produced the packet.
- Records reference artifacts by path and digest. They never inline them.
- Any record may be superseded; nothing is edited in place.

## Calibration Reads

The record must answer, per question and version:

- observed accuracy against attached outcomes
- whether stated confidence matches observed frequency
- how often the fallback was taken, and why
- how often escalation happened, and what resolved it

A threshold may only be loosened when these reads support it, and the change itself is recorded
with the evidence that justified it.

## Invariants And Constraints

- The record cannot approve an action, weaken a check, or authorize a release.
- No credentials, tokens, secrets, or full source content are recorded.
- Identity is content-addressed so a record can be matched to the exact subject it saw.
- Retention preserves identity and outcome in preference to detail.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Record write fails | Action proceeds; the gap is itself noted once |
| Outcome never arrives | Decision stays open; calibration excludes it rather than assuming success |
| Conflicting outcomes | Both retained; the human correction wins for calibration |

## Validation Requirements

- Every acted-on decision in a test run has a record, and every verification produces an outcome.
- Calibration reads return stable values for a fixed fixture set.
- A run with recording disabled behaves identically apart from the missing record.

## Open Questions

- Minimum sample size before a threshold change is defensible.
- Whether packet misses deserve their own question rather than being only an outcome.

## Change Log

- 2026-09-19: First draft.
