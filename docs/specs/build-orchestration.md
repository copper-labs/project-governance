---
id: spec.harness.build-orchestration
title: Build Orchestration
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Build identity, workspace locking, and the staged ladder that makes failures arrive sooner.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Build Orchestration

## Purpose

Stop builds colliding and repeating, and make failures surface earlier. Most of this contract needs
no decision model at all, which is why it comes first.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** Adopting repositories already select impacted lanes deterministically in
  CI. Nothing equivalent governs the local inner loop, where the round trips happen.
- **Evidence:** none.
- **Known limits:** This contract decides which invocations to make. It does not change what a
  build tool does inside one.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- Build identity and reuse of a recorded result.
- One build lock per workspace.
- The staged ladder and lane selection.

## Non-Goals

- Duplicating a build tool's cache. The governance runtime deliberately does not, and neither does
  this.
- Replacing existing CI lane selection. The harness brings the same discipline to the local loop.
- Guaranteeing correctness of a build tool's incremental behavior.

## Build Identity

A build identity binds the command and its arguments, the selected lanes, the adapter and
configuration versions, the relevant environment, the toolchain, and the resolved input bytes, as
declared by the ecosystem adapter.

- A request whose identity matches a recorded passing build returns that recorded result.
- A request whose identity matches a build in flight waits for it.
- An identity that cannot be computed completely is not an identity: the build runs.
- **Input drift** between recording and reuse invalidates the recorded result.
- A recorded pass can be valid evidence while an artifact a later consumer wants no longer exists.
  Missing outputs invalidate reuse for that consumer without invalidating the recorded verdict.

Incomplete inputs are the hazard here. An adapter that under-declares inputs produces false reuse,
which is worse than no reuse. Reuse is therefore opt-in per adapter and defaults off until that
adapter's inputs are proven.

## Request Claim

One **request-level** claim, not a blanket workspace lock. The distinction matters because a single
orchestration request legitimately spawns several child tool invocations.

- Commands within a request are serialized by default.
- Parallel lanes are permitted only where the adapter declares independent resources, or where the
  build tool owns the scheduling itself.
- Reclaiming a claim requires checking process identity and cleanup evidence. A dead holder does not
  prove its children or resources are gone.
- The existing test-execution contract already owns workspace and root claims through its cleanup.
  This claim composes with that ownership rather than duplicating it, and composition is proven
  before any collision-prevention statement is made.
- **Limit:** callers that bypass the harness are not protected by this claim. The contract states
  this rather than implying universal protection.

## The Staged Ladder

| Stage | Contents | Chosen by |
| --- | --- | --- |
| A | The adapter's cheap first stage | Deterministic |
| B | The single lane most likely to break for this change | Rule first, decision model later |
| C | Remaining selected lanes, in parallel | Deterministic |

Stage C runs only when A and B pass. The ladder does not make builds faster; it makes failures
arrive sooner, which is the actual cost.

Stage B starts as a static rule derived from the lane map. It becomes a decision only once the
record holds enough history to show the rule is wrong.

## Behavioral Requirements

- Every build is recorded with its identity, selected lanes, stage outcomes, duration, and failure
  class.
- Lane selection widens on uncertainty and narrows only on declared mapping.
- The ladder is skippable by explicit operator request for one run, recorded as such.
- Release and broad-proof boundaries ignore the ladder and run their declared full set.

## Invariants And Constraints

- Narrowing never applies to a release gate.
- A recorded result is reusable only within its adapter's declared input completeness.
- The harness owns no build cache and deletes no build artifacts.
- Cancellation terminates the owned process group and is recorded as cancellation, not failure.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Claim held, holder dead | Reclaimed only after process identity and cleanup are checked |
| Claim held, children alive | Not reclaimed; waits or declines with the reason |
| One of several waiting callers cancels | Remaining waiters unaffected |
| Identity collision suspected | Reuse disabled for that adapter; recorded as a finding |
| Stage B ranking unavailable | Fall back to the static rule |
| Adapter cannot compute inputs | No reuse; build runs |

## Validation Requirements

- Two concurrent identical requests result in one build.
- Overlapping lanes, a holder that dies with a live child, cancellation by one of two waiting
  callers, input drift, and deleted outputs after a recorded pass are each exercised.
- Composition with the existing test-execution claims is tested before any collision-prevention
  claim is made.
- A repeated identical request after a pass performs no work when reuse is enabled and proven.
- A change known to break exactly one lane surfaces in stage A or B for a fixture repository.
- Disabling the ladder produces the same final verdict as running it.

## Open Questions

- Whether reuse should ever be enabled for the KMP adapter, given klib and metadata behavior.
- Whether stage B should be allowed to select more than one lane when confidence is split.

## Change Log

- 2026-09-19: First draft.
