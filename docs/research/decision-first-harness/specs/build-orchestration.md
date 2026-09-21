---
id: research.harness.build-orchestration
title: Build Orchestration
type: research
status: draft
owner: project-governance
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
- **Ledger:** [Research index](../../README.md).

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

A build identity is a digest of the resolved inputs for the selected lanes, the toolchain, and the
lock, as declared by the ecosystem adapter.

- A request whose identity matches a recorded passing build returns that recorded result.
- A request whose identity matches a build in flight waits for it.
- An identity that cannot be computed completely is not an identity: the build runs.

Incomplete inputs are the hazard here. An adapter that under-declares inputs produces false reuse,
which is worse than no reuse. Reuse is therefore opt-in per adapter and defaults off until that
adapter's inputs are proven.

## Workspace Lock

One build proceeds per workspace at a time. A second request waits or is declined with a clear
reason. This exists because concurrent invocations of the same toolchain in one workspace fight
over shared caches, which is most of what "builds tripping on themselves" means in practice.

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
| Lock held and holder dead | Stale lock reclaimed with a recorded reason |
| Identity collision suspected | Reuse disabled for that adapter; recorded as a finding |
| Stage B ranking unavailable | Fall back to the static rule |
| Adapter cannot compute inputs | No reuse; build runs |

## Validation Requirements

- Two concurrent identical requests result in one build.
- A repeated identical request after a pass performs no work when reuse is enabled and proven.
- A change known to break exactly one lane surfaces in stage A or B for a fixture repository.
- Disabling the ladder produces the same final verdict as running it.

## Open Questions

- Whether reuse should ever be enabled for the KMP adapter, given klib and metadata behavior.
- Whether stage B should be allowed to select more than one lane when confidence is split.

## Change Log

- 2026-09-19: First draft.
