---
id: spec.harness.evidence
title: Evidence and Measurement
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Evidence and Measurement

## Claims

Evidence separates a claim, observation, what it establishes, confirmation and original artifact
or action. Confirmation is confirmed, refuted or unconfirmed. Execution-critical evidence is
transactional; analytics is best-effort. Action transitions and reconciliation are durable ledger
records. Existing records are not rewritten when inputs or operator intent change.

A passing declared check establishes its assertion under the owner's reported input posture. It
is not task acceptance. Interruption, invalid inputs or missing cleanup cannot establish a pass.
A successful retry is an observed effect, not proof that a hypothesized cause was correct.

## Measurement

Record native incremental usage with stable source and measurement IDs. Duplicate observations
are not added twice. Input/output counts, cached input, reasoning subset, duration and cost are
nullable. Cached input is a subset of total input; reasoning is a subset of output. Never sum
these subsets again. The source adapter must normalize provider semantics to that convention.

Totals are known subtotals with measured/missing coverage and source names. Unknown is not zero.
Cumulative native counters must be converted to incremental observations before submission. Byte
budgets, command count and execution time are proxies and cannot be labelled token savings.

## Evaluation

Compare existing host + governance against host + governance + harness. Keep model settings,
acceptance and task mix stable; account for cache warmth, familiarity, all child/provider usage,
retries and rework. Track accepted tasks, later defects, operator intervention, resume time,
time to actionable failure, total elapsed time, test compute and harness overhead.

Historical repeated-source telemetry is a signal for investigation, not proof of redundant work.
The original baseline has unresolved event/run denominator ambiguity. No realized token-saving
percentage is currently established. Shadow decisions do not save tokens if the full host path
still runs.

## Provenance and portability

Imported history is inert and may contain untrusted text. A content hash checks integrity, not
source trust. Exact source equality does not import authority or make an old environment current.
Export selected records only; the host controls sharing, credentials, privacy and retention.

## Accepted measurement expansion

[Bounded telemetry and qualification](measurement-and-qualification.md) defines retention, the
lightweight laboratory, pilot design and explicitly hypothetical first-release benefit assumptions.
These additions are planned. Governance-only versus governance with continuity is the comparison;
there is no standalone harness arm. Device compute and model coordination cost remain separate.
