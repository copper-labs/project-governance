---
id: plan.harness.step-4
title: Step 4 - Bounded Dispatch And Recovery
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Apply results and survive interruption safely, added only when the work actually needs it.
---

> Child of [the master plan](../README.md).

# Step 4 - Bounded Dispatch And Recovery

## Final State

The harness can apply a submitted result and recover from interruption without duplicating an
effect or inventing a clean restart. Added only once Steps 2 and 3 show the work needs it.

**Non-goals:** exactly-once execution, parallel writers, release execution, a second host.

## Delivery

- Delivery: local-only

## Batch 1: Prepared and in-progress states

- Depends on: Step 3 complete
- Ownership: task lifecycle; one writer
- Execution: sequential
- Parallel support: solo; this is the recovery boundary and belongs to one author
- Semantic contract: settled by [Task Lifecycle](../../specs/task-lifecycle.md)
- Model class: deep-reasoning (gpt-5.6-sol, high; source: default table) because a wrong recovery
  rule silently corrupts the working tree
- Fixed decisions: side-effecting actions record expected inputs, intended outputs, action identity
  and their reconciliation method before acting; effects are idempotent or explicitly non-retryable;
  transitions carry an expected revision; no exactly-once claim across files or remote systems
- Acceptance: a crash between two file writes, a crash after an effect but before its receipt, and
  two callers racing to resume each yield an observed outcome or explicit `outcome-unknown`; the
  racing second caller does not act; cancellation shows owned work stopped
- Development checkpoints: fault-injection tests per interruption point
- Build and integration point: real tasks with induced faults
- Review boundary: every recovery path, exercised rather than argued
- Proof budget: fault-injection tests; no production exposure
- Invalidates prior proof when: the effect set or the store's transition support changes
- Proof state: not-run
- Split early or stop when: an effect cannot be made idempotent and cannot be declared
  non-retryable, which means it should not be automated yet
- Documentation: consolidate at batch closeout
- Acceptance milestone: none

## Batch 2: Applying results, and acceptance distinct from verification

- Depends on: Batch 1
- Ownership: application and acceptance; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Task Lifecycle](../../specs/task-lifecycle.md) and
  [Worker Invocation](../../specs/worker-invocation.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: the writer is chosen per mode and each mode is its own acceptance claim; a stale
  result is refused or regenerated, never applied; out-of-scope paths refuse the whole result;
  mandatory acceptance requirements bind to the authorized baseline, not the produced subject; a
  worker's proposed change to those requirements is reviewable output
- Acceptance: one task through host-driven writing and one through applied dispatch, each proven
  separately; a patch deleting a failing assertion does not satisfy that assertion's obligation; a
  prose-only task completes without compilation pretending to verify it; untested claims stay open
- Development checkpoints: focused tests for staleness, scope refusal and duplicate submission
- Build and integration point: real tasks in the TypeScript adopter
- Review boundary: the circularity guard, tested with a deliberately self-serving patch
- Proof budget: focused tests plus real tasks
- Invalidates prior proof when: the brief or authority shape changes
- Proof state: not-run
- Split early or stop when: acceptance cannot be established without a human for every task type,
  which is a finding rather than a failure
- Documentation: consolidate at step closeout
- Acceptance milestone: operator reviews the first applied dispatch

## Stable-Candidate Proof

Retain focused lifecycle and application tests, close declared recovery gaps, and run one
branch-aware impacted sign-off on the frozen candidate.

## Rollback

Return to host-driven writing. The harness stops applying anything and the operator's own workflow
is unchanged.
