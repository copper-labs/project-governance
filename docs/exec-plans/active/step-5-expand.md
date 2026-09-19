---
id: plan.harness.step-5
title: Step 5 - Expand From Demonstrated Reuse
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Add a second host or ecosystem to test whether the seams are real, and adopt build coordination, reuse and ordering separately.
---

> Child of [the master plan](../README.md).

# Step 5 - Expand From Demonstrated Reuse

## Final State

A second real consumer exercises a seam that has so far only been asserted. Build coordination,
evidence reuse and lane ordering are adopted independently, each on its own evidence.

**Non-goals:** three-host equivalence, universal ecosystem support, learned lane ordering, release
execution.

## Delivery

- Delivery: local-only

## Batch 1: A second seam

- Depends on: Step 4 complete
- Ownership: one additional host adapter or one additional ecosystem adapter; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment inventorying what the second consumer needs,
  before anything is written
- Semantic contract: settled by [Ecosystem Adapters](../../specs/ecosystem-adapters.md) and
  [Host Integration](../../specs/host-integration.md)
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: only one new seam, not both; support is a demonstrated capability, never a
  consequence of shared instruction text; a mode whose capabilities an adapter cannot demonstrate is
  reported unsupported
- Acceptance: the second consumer runs the same loop with no core modification; any core change
  required is itself the finding and stops the batch
- Development checkpoints: fixture tests per declared capability
- Build and integration point: real use by the second consumer
- Review boundary: whether the core changed, which is the whole question
- Proof budget: real use; no separate benchmark
- Invalidates prior proof when: the adapter contract changes
- Proof state: not-run
- Split early or stop when: the core needs changing, which means the boundary was wrong and is
  fixed before more is built on it
- Documentation: consolidate at batch closeout
- Acceptance milestone: none

## Batch 2: Build coordination, reuse and ordering, adopted separately

- Depends on: Batch 1
- Ownership: build orchestration; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Build Orchestration](../../specs/execution.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: coordination uses the existing execution owner's claims and cleanup rather than a
  second owner; in-flight deduplication is separate from reuse across completed runs; reuse is a
  verdict cache with freshness obligations and stays off by default; an explicit request to rerun is
  honored rather than answered from history; the build tool keeps artifact caching
- Acceptance: each of the three adopted only on its own measurement - coordination on interference
  prevented, reuse on correctness under input drift and missing outputs, ordering on the whole
  distribution of time to first actionable failure, time to complete passing proof, compute and
  queue time
- Development checkpoints: measurements per concern, not one combined number
- Build and integration point: real builds in the TypeScript adopter
- Review boundary: the three measurements, reviewed separately
- Proof budget: existing build history supplies the baseline
- Invalidates prior proof when: the lane map, toolchain or external dependencies change
- Proof state: not-run
- Split early or stop when: ordering does not improve the distribution, in which case it is not
  adopted and the other two stand on their own
- Documentation: consolidate at step closeout
- Acceptance milestone: operator review of each measurement

## Stable-Candidate Proof

Retain focused adapter and orchestration tests, then run one branch-aware impacted sign-off. A
change to lane selection additionally requires one explicit broad run, because narrowing is exactly
what narrow proof cannot validate.

## Rollback

Remove the second adapter and any adopted concern independently; none depends on another.
