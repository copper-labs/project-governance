---
id: plan.harness.phase-0
title: Phase 0 - Measure
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: An evaluation with declared labels, a held-out split and an inconclusive option, answering whether a decision model is good enough on our decisions.
---

> Child of [the master plan](../README.md). Rebuilt in response to finding R7.

# Phase 0 - Measure

## Final State

A defensible answer to one question: is a decision model accurate and calibrated enough, on our own
decisions, to be worth adopting. Three outcomes are possible and all three are successes: go,
no-go, or **inconclusive for insufficient evidence**.

**Non-goals:** any harness component, any change to existing tooling, any production use.

**Independence:** a no-go here stops *model adoption*. It does not cancel Phase 1, which is
deterministic build hygiene justified on its own terms.

## Delivery

- Delivery: local-only

## Evaluation Design, Declared Before The Run

An earlier draft measured agreement with whatever the previous actor decided. Agreement is not
correctness, so the design below replaces it. Every item here is fixed before any provider call.

- **Labels are outcome-based.** A case is labelled by what was subsequently established - the fix
  that actually worked, the lane that actually broke - not by what an agent or a person chose at the
  time.
- **Held-out split.** Cases are partitioned before question design. The evaluation split is never
  used for wording questions, choosing options, or tuning thresholds.
- **Per-class coverage.** A minimum case count per class is declared. A class below it is reported
  as uncovered rather than scored.
- **Harmful-error tolerance.** Errors are not symmetric. A declared maximum rate is set for errors
  that would cause an unsafe action, separately from errors that merely waste a cycle.
- **Abstention is an outcome.** Cases the model declines or answers below threshold are reported as
  abstentions, never dropped.
- **Unresolved outcomes are reported**, not excluded. They are exactly the cases where correctness
  could not be established, and hiding them flatters the result.
- **Two comparators.** Every question is scored against a deterministic rule and against the
  existing workflow. A question that cannot beat a rule does not need a model.
- **Frozen versions.** Question, provider, threshold and fixture versions are pinned per comparison
  and recorded in an evaluation manifest.
- **Cost is per accepted task**, including repairs and human intervention, not per call.

## Batch 1: An evaluation manifest and a labelled corpus

- Depends on: none
- Ownership: ignored local research state only; no tracked source changes
- Execution: sequential
- Parallel support: two bounded read-only assignments - one harvesting real failures from existing
  build and CI history across the candidate repositories, one harvesting real task intents from
  recorded history; both needed before labelling starts
- Semantic contract: settled
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: cases come from real history, never invented; labels come from established
  outcomes; the split is drawn before questions are written; the provider key is read from ignored
  local configuration and never committed
- Acceptance: a manifest declaring labels, split, per-class minimums, harmful-error tolerance, the
  inconclusive criterion and both comparators; a labelled corpus meeting or explicitly missing its
  per-class minimums
- Development checkpoints: an inter-labeller check on a sample, because a corpus one person labelled
  alone cannot detect its own bias
- Build and integration point: none
- Review boundary: the manifest and the corpus, reviewed before any provider call is made
- Proof budget: labelling effort only; no provider cost in this batch
- Invalidates prior proof when: the corpus, labels or split change
- Proof state: not-run
- Split early or stop when: outcomes cannot be established for enough cases to meet the per-class
  minimums, which is itself the inconclusive result and is reported as one
- Documentation: the manifest is durable
- Acceptance milestone: none

## Batch 2: Run the evaluation and report it honestly

- Depends on: Batch 1
- Ownership: ignored local research state
- Execution: sequential
- Parallel support: solo; splitting one measurement pass fragments its data
- Semantic contract: settled
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: the model decides nothing; the evaluation split is touched exactly once; no
  threshold is changed to improve a result
- Acceptance: on held-out cases, per-class accuracy and errors, harmful-error rate against its
  tolerance, calibration with its uncertainty, abstention rate, unresolved-outcome count, latency,
  and total cost per accepted task - each reported against both comparators
- Development checkpoints: a dry run on the design split only, to catch a broken question before
  the held-out split is spent
- Build and integration point: none
- Review boundary: the results and the go, no-go or inconclusive recommendation
- Proof budget: provider cost for the corpus, expected to be small; elapsed time is the real cost
- Invalidates prior proof when: any frozen version changes
- Proof state: not-run
- Split early or stop when: the held-out split is exhausted; it is not re-run with adjusted
  questions, because that converts an evaluation into tuning
- Documentation: a results report and a recommendation, both durable
- Acceptance milestone: operator review of the recommendation before any model adoption

## Stable-Candidate Proof

None. This phase changes no tracked source and produces evidence, not a candidate.

## Rollback

Delete the ignored research state. Nothing else was touched.
