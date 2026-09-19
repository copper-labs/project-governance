---
id: plan.harness.step-1
title: Step 1 - Find The Recurring Cost
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: A small baseline for one concrete scenario, so the slice that follows has a before-number to beat.
---

> Child of [the master plan](../README.md).

# Step 1 - Baseline One Scenario

## Final State

A before-number for one concrete scenario, measured on the current workflow:

> Investigate one failing check, make a bounded fix, verify it, and resume correctly after an
> interruption.

**Non-goals:** a general cost survey, building anything, calling a provider, or presuming that
classification is the bottleneck.

This is deliberately smaller than a discovery phase. Two inputs disagreed - one wanted the recurring
cost found first, the other wanted a workflow proven and measured as it went. Without a before-number
the slice is unfalsifiable; with a full survey nothing gets built for weeks. Measuring the current
cost of the *one scenario the slice will implement* satisfies both.

## Delivery

- Delivery: local-only

## Batch 1: A representative sample and a cost account

- Depends on: none
- Ownership: ignored local research state; no tracked source changes
- Execution: sequential
- Parallel support: two bounded read-only assignments - one over build and CI history, one over
  recorded task history - both needed before the account is assembled
- Semantic contract: settled
- Model class: diagnosis-review (gpt-5.6-sol, medium; source: default table)
- Fixed decisions: one scenario only; the sample covers both the failing and the all-pass path;
  anything unmeasurable is reported as unknown rather than estimated; the sample draws from every
  candidate repository named in the master plan, weighted toward the movement SDK because its scale
  and its mixed ecosystems make it the case most likely to break a general claim
- Acceptance: for that one scenario, time to an accepted result, total tokens and execution cost,
  repeated investigation and rework, and whether a fresh session can currently continue correctly -
  the four measures the slice will later be judged on; reported per repository as well as in
  aggregate, so one project's profile is not mistaken for the general case
- Development checkpoints: an interim read on a quarter of the sample, to catch a mis-specified
  measure before the whole pass is spent
- Build and integration point: none
- Review boundary: the account and the intervention it recommends
- Proof budget: existing logs and history; no new instrumentation and no provider cost
- Invalidates prior proof when: the workflow or its tooling materially changes
- Proof state: not-run
- Split early or stop when: the largest cost turns out to be something none of this proposal
  addresses, which is a result worth having and is reported as one; or an uninspected repository
  turns out to dominate the cost, in which case it is examined before the intervention is chosen
- Documentation: the cost account is durable
- Acceptance milestone: operator agreement on the selected intervention before Step 2

## Stable-Candidate Proof

None. This step changes no tracked source.

## Rollback

Delete the ignored research state.
