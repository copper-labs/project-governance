---
id: plan.harness.step-1
title: Step 1 - Find The Recurring Cost
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Measure where time, tokens, rework and human intervention actually go, and pick one intervention on evidence.
---

> Child of [the master plan](../README.md).

# Step 1 - Find The Recurring Cost

## Final State

A measured account of where the current loop spends time and tokens, across both failure and
all-pass paths, and one selected intervention chosen from that evidence rather than assumed.

**Non-goals:** building anything, calling a provider, or presuming that classification is the
bottleneck.

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
- Fixed decisions: the sample covers both failing and all-pass paths; anything unmeasurable is
  reported as unknown rather than estimated; the sample draws from every candidate repository named
  in the master plan, including `coaching-intelligence-sdk-parallel-development`, which the operator
  identifies as a major source of recurring cost and which has not yet been inspected
- Acceptance: a cost account naming repeated discovery, log reading, duplicate execution, rework
  and human intervention, each with its share of elapsed time and tokens, and its uncertainty; the
  account reports per repository as well as in aggregate, so one project's profile cannot be
  mistaken for the general case
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
