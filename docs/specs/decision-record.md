---
id: spec.harness.decision-record
title: Decision Record
type: spec
status: draft
owner: project-harness
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
- **Ledger:** [Research index](../research/concept.md).

## Scope

- The record shape and its identity bindings.
- Outcome attachment after the fact.
- The reads that calibration and audit require.

## Non-Goals

- Replacing governance telemetry, which stays bounded and content-free.
- Storing prompts, transcripts, or source content.
- Scoring people.

## Record Shape

Records are split by criticality. **Execution state** must be durable before the action it covers;
**analytics** is best-effort and its loss never blocks work or changes a verdict.

One record per decision, holding:

- decision identity, the request and task it belongs to *(execution state)*
- the question identifier and version, and the catalog digest
- the policy digest and the effective thresholds in force
- the producer and provider versions, each marked `unknown` when not reported
- the subject and packet references the decision saw, and the digest of the state itself
- the answer, its confidence, and the probability distribution
- the disposition taken - acted, fallback, widen, needs-input - and why
- the tier that answered: deterministic, decision model, or language model
- what the harness did next *(execution state where an action followed)*
- timing and cost as reported by the provider
- whether this record is **identifiable only** or **replayable**

A digest identifies bytes; it cannot reconstruct them. Configuration artifacts needed to restore a
prior state - threshold sets, selection maps, catalog versions - are retained as artifacts, not
referenced by digest alone, or rollback is not possible.

**Three facts are recorded separately and never collapsed:** whether the diagnosis was correct,
what the remedy's observed effect was, and whether the task was finally accepted. A successful
clean-and-retry is evidence of an effect, not proof of the predicted cause - a transient service
recovery produces the same observation. Where cause cannot be established, it is recorded as
**unconfirmed**, never promoted to correct.

Outcomes attach later as separate records referencing the decision: what was observed, whether the
decision proved right, its provenance - how the outcome was established - and any correction a human
made.

**A corrected preference is not a verified wrong answer.** A human may change a decision because
they prefer something else, which is not evidence the classification was factually wrong. The two
are recorded distinctly and calibration uses them differently.

## Behavioral Requirements

- Execution state for an action is durable before that action runs. If it cannot be persisted, the
  action does not run. Analytics may be written after.
- Calibration keeps differently configured cohorts distinct: a provider change, a threshold change, a
  packet-generator change and a policy change are each separable in the record.
- An outcome is attached whenever one becomes known, including much later from a verification stage.
- A human correction is recorded as an outcome with its reason. A correction that establishes a
  classification was factually wrong is strong calibration evidence; a correction that expresses a
  different preference is not, and the two are recorded distinctly.
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
| Analytics write fails | Action proceeds; the gap is noted once |
| Execution-state write fails | The dependent action does not run; control returns with the reason |
| Outcome never arrives | Decision stays open; calibration excludes it rather than assuming success |
| Conflicting outcomes | Both retained; a factual correction wins for calibration, a preference does not |
| Cause not establishable | Recorded as unconfirmed; never counted as correct |

## Validation Requirements

- Every acted-on decision in a test run has a record, and every verification produces an outcome.
- Calibration reads return stable values for a fixed fixture set.
- With analytics recording disabled, ordinary checks remain available and no state-changing action
  runs without its execution state. Behavior is not identical, and the contract no longer claims it.
- Evaluation splits by task or failure episode, so related retries cannot leak between development
  and held-out cases.
- Incomplete evaluation never authorizes a weaker threshold; how much outcome data is missing is
  reported alongside every calibration read.

## Open Questions

- Minimum sample size before a threshold change is defensible.
- Whether packet misses deserve their own question rather than being only an outcome.

## Change Log

- 2026-09-19: First draft.
