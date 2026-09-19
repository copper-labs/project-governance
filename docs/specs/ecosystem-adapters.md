---
id: spec.harness.ecosystem-adapters
title: Ecosystem Adapters
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The boundary that keeps Gradle, npm, and Python specifics out of the harness core.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Ecosystem Adapters

## Purpose

The projects this harness must serve do not share a toolchain. One is Kotlin Multiplatform on
Gradle, one is TypeScript on npm, one is Python. The core cannot contain any of that, and each
adapter must not need to reimplement the loop.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** Both candidate repositories already own deterministic change-to-lane
  selection in their own vocabulary. Those selectors are the shape an adapter wraps.
- **Evidence:** none for the adapter layer.
- **Known limits:** Three ecosystems are enough to find the wrong abstraction, not enough to be
  confident of the right one. A fourth candidate repository,
  `coaching-intelligence-sdk-parallel-development`, has not been inspected; its ecosystem and build
  shape are unknown and this contract is not yet designed against them.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- What an adapter must supply.
- What the core guarantees in return.
- How an adapter is selected and validated.

## Non-Goals

- A universal build abstraction. The adapter supplies commands; it does not model build systems.
- Outsmarting a build tool's own incrementality.

## What An Adapter Supplies

| Capability | Meaning |
| --- | --- |
| Unit map | Source path to buildable or testable unit, in the ecosystem's own terms |
| Lane map | Unit to the lanes or targets that can break because of it |
| Commands | How to build, test, and check a lane, with arguments the core passes through |
| Inputs | What contributes to a build identity: sources, lockfiles, toolchain versions |
| Signatures | Ecosystem-specific failure patterns mapped to the shared taxonomy |
| Cheap first stage | The fastest lane worth running as the canary's floor |

Everything else — identity, locking, ordering, decisions, records — belongs to the core and is the
same for every ecosystem.

## Behavioral Requirements

- An adapter is declared as data plus a thin command surface. It contains no decision logic,
  taxonomy, or threshold.
- The core never parses ecosystem-specific output. An adapter normalizes failures into the shared
  taxonomy defined by [Failure Triage](failure-triage.md).
- An adapter may extend the taxonomy with named subtypes; it may not remove or redefine a shared
  class.
- An adapter declares the inputs that make a build identity meaningful, and is responsible for
  their completeness.
- One repository may register more than one adapter. Units name their adapter explicitly.

## Invariants And Constraints

- No ecosystem name appears in the core.
- An adapter cannot alter budgets, thresholds, retry bounds, or gates.
- An adapter's failure to answer is a widened selection, never a silent narrowing.
- Adapters are replaceable without changing any record shape.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Unit not covered by the unit map | One clear blocker, as the governance runtime already does for unmapped paths |
| Lane map incomplete | Widen to the declared safe superset, record the gap |
| Unknown failure signature | Falls through to the shared taxonomy's unknown class |
| Adapter command missing | Blocking configuration error, not a skipped lane |

## Validation Requirements

- Each adapter proves its unit map against a known change set with expected lanes.
- Each adapter proves at least one real failure per shared taxonomy class it claims to detect.
- A core test suite runs against a fixture adapter with no real toolchain present.

## Open Questions

- Whether the unit and lane maps should be authored or derived from the build tool, per ecosystem.
- Whether the TypeScript and Python adapters are thin enough to start with one shared
  implementation.

## Change Log

- 2026-09-19: First draft, prompted by the multi-ecosystem constraint.
