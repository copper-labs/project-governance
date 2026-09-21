---
id: research.harness.phase-0
title: Phase 0 - Measure
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Measure decision accuracy and calibration on our own decisions before building anything.
---

> Child of [the master plan](README.md).

# Phase 0 - Measure

## Final State

A recorded answer to one question: is a decision model accurate and calibrated enough, on the
decisions we actually make, to be worth building around. The phase ends in a go or no-go, and a
no-go is a successful outcome that costs two weeks.

**Non-goals:** any harness component, any change to existing tooling, any production use.

## Delivery

- Delivery: local-only

## Batch 1: A probe and fixture sets exist for real decisions

- Depends on: none
- Ownership: ignored local research state only; no tracked source changes
- Execution: sequential
- Parallel support: one bounded read-only assignment to collect real failure samples from existing
  build and CI logs across both candidate repositories, needed before the triage fixture set
- Semantic contract: settled
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: probe lives in ignored state; no tracked file changes; the provider key is read
  from ignored local configuration and never committed
- Acceptance: probes exist for intent routing and failure triage; each has a fixture set with
  expected answers drawn from real history, not invented examples
- Development checkpoints: probe runs end to end against the provider and prints per-case answers,
  confidence, latency and cost
- Build and integration point: none; this batch touches no build
- Review boundary: fixture sets reviewed for realism before any accuracy claim is made
- Proof budget: the probe run itself; no additional proof
- Invalidates prior proof when: the fixture set changes or the provider version changes
- Proof state: not-run
- Split early or stop when: fixtures cannot be drawn from real history, which would make every
  later number meaningless
- Documentation: consolidate at phase closeout
- Acceptance milestone: none

## Batch 2: Shadow the decisions we already make

- Depends on: Batch 1
- Ownership: ignored local research state
- Execution: sequential
- Parallel support: solo; the work is one measurement pass and splitting it would fragment the data
- Semantic contract: settled
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: the decision model decides nothing in this phase; it observes the same state and
  its answer is recorded beside the real one
- Acceptance: per question, an agreement rate against the real decision, a calibration curve
  comparing stated confidence to observed correctness, and measured latency and cost on our work
- Development checkpoints: an interim read after the first quarter of samples, to catch a broken
  question before the whole run is wasted
- Build and integration point: none
- Review boundary: the calibration report and the go or no-go recommendation
- Proof budget: provider cost for the sample set, expected to be negligible; the real cost is
  elapsed time
- Invalidates prior proof when: questions are reworded, thresholds change, or the provider updates
- Proof state: not-run
- Split early or stop when: agreement is poor and uncorrelated with confidence, which is a no-go
  rather than a tuning problem
- Documentation: a calibration report and a recommendation, both durable
- Acceptance milestone: operator review of the go or no-go before Phase 1 starts

## Stable-Candidate Proof

None. This phase changes no tracked source and produces evidence, not a candidate.

## Rollback

Delete the ignored research state. Nothing else was touched.
