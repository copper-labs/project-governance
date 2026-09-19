---
id: spec.harness.execution
title: Execution
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The seam to the existing execution owner, and three build concerns that must each earn adoption separately.
---

> Child of [Harness Core](harness-core.md).

# Execution

## Purpose

Run declared work without recreating anything that already runs work.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** One adopting repository already owns a dev loop with durable state for
  device bindings, port ownership by process id, and deployment digests. Another owns test-execution
  resource claims and cleanup. Both are referenced, not replaced.
- **Known limits:** That repository is a git worktree of a parent, and its ports and devices are
  **machine-global**, shared across worktrees. A per-workspace claim does not cover them.
- **Ledger:** [Research index](../research/concept.md).

## The Seam

- Ask the governance runtime **what checks and requirements apply**. Do not reimplement selection.
- Use the existing execution owner for **process supervision and resource claims**.
- **Store references to their receipts rather than recreate their state machines.** A receipt
  reference is an Artifact; the state machine stays where it is.
- Where a required public seam is missing, it is proposed upstream. It is never worked around by
  importing private implementation or vendoring code.

Cost worth naming: the governance runtime is Python in a different repository, so depending on it
for claims is a cross-repository, cross-language coupling from the first slice. That is a better
trade than a second owner, but it is a real cost.

## Three Concerns, Adopted Separately

Bundling these was a mistake. They have different prerequisites and different risks, and each must
earn adoption on its own evidence.

**1. Coordination.** Prevent concurrent interference. Start from the existing owner's claims and
cleanup. Reclaim requires process identity and cleanup evidence, not holder death alone. Machine-
global resources — ports, simulators, devices — are claimed at machine scope, not workspace scope.
Callers that bypass the harness are not protected, and the contract says so.

**2. Evidence reuse.** Returning a recorded verdict instead of running is a **verdict cache**.
Storing no artifacts does not remove its completeness and freshness obligations. Off by default.
Identity binds command and arguments, selected units, adapter and configuration versions, relevant
environment, toolchain and resolved input bytes. Source identity alone does not guarantee
reproducible execution: an external service or mutable test device invalidates reuse even when
bytes match. An explicit request to rerun is honored, never answered from history. In-flight
deduplication is a different thing and does not depend on this.

**3. Ordering.** Running a cheap unit first is a **hypothesis**, not a fact. Serializing a
10-second unit before an independent 60-second one makes the all-pass path 70 seconds instead of
60. It pays when early-failure probability or resource savings justify the delay, and "most likely
to fail" ignores duration, shared warm-up, dependencies and contention. Adopted only if the whole
distribution improves: time to first actionable failure, time to complete passing proof, compute
consumed, queue time.

## Invariants

- The harness owns no build cache and deletes no build artifacts; the build tool keeps artifact
  caching.
- Narrowing never applies to a release gate.
- Cancellation is recorded as cancellation, not failure.

## Validation Requirements

- Composition with the existing execution claims is tested before any collision-prevention claim.
- Two concurrent identical requests result in one execution.
- A machine-global resource contended from two worktrees is handled at machine scope.
- Each of the three concerns is measured separately; none is adopted on another's evidence.

## Change Log

- 2026-09-19: Replaces build-orchestration; reframed around the existing execution owner.
