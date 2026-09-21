---
id: research.harness.decision-interface
title: Decision Interface
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: One provider-agnostic contract for typed decisions, with confidence thresholds, escalation, and a deterministic fallback for every question.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Decision Interface

## Purpose

Give every decision in the harness one shape: a state in, a typed answer and a confidence out. The
decision model is an implementation behind this interface, never a dependency of the loop.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none.
- **Evidence:** A local probe exists under ignored runtime state to measure provider routing
  accuracy, latency and cost. It is a measurement, not an implementation.
- **Known limits:** The intended provider is hosted-only, released September 2026, with no
  published calibration evidence.
- **Ledger:** [Research index](../../README.md).

## Scope

- Question shapes and the question catalog.
- Confidence thresholds and the escalation ladder.
- Provider abstraction and fallbacks.

## Non-Goals

- Deciding what the questions are for a given domain. Domains own their own catalog entries.
- Generation of any kind.

## Definitions

- **Question**: a named, versioned, typed request for judgment over a state.
- **Catalog**: the declared set of questions, owned as data, not code.
- **Fallback**: the conservative answer used when no usable decision is available.

## Behavioral Requirements

- Three question shapes are supported: a choice among declared options, a score against ordered
  levels, and a boolean judgment. A provider that cannot express one of these is not usable.
- Questions are declared as catalog data with a stable identifier and a version. Changing a
  question's meaning requires a new version; catalog entries are never edited in place.
- Multiple questions about one state are asked in a single call where the provider supports it,
  and the interface records that they shared a state.
- Every catalog entry declares a fallback answer. A question with no fallback is invalid.
- Every answer carries a confidence value and the probabilities behind it, both recorded.
- The interface is synchronous from the loop's perspective and has a bounded timeout. A timeout is
  a fallback, not an error that stops the loop.

## Escalation Ladder

| Confidence band | Action |
| --- | --- |
| At or above the act threshold | Act on the answer |
| Between escalate and act | Escalate: widen the state, ask a harder question, or use Tier 2 |
| Below the escalate threshold | Stop and ask a human |

Thresholds are per question, declared in the catalog, and start conservative. They may only be
loosened against recorded outcomes, never against intuition. See [Decision Record](decision-record.md).

## Invariants And Constraints

- No answer from this interface may authorize an irreversible action.
- Provider unavailability degrades the loop to its fallbacks; it never blocks work.
- The interface never returns free text, and never asks a provider to explain itself.
- No provider SDK is imported outside a provider implementation module.
- A state handed to a provider is bounded and recorded by digest, never by full content.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Provider unreachable, rate limited, or timed out | Fallback, recorded with the reason |
| Answer outside the declared schema | Treated as provider failure; fallback |
| Confidence below the escalate threshold | Human escalation, recorded |
| State exceeds the provider budget | Reduce deterministically, or fall back; never silently truncate meaning |

## Validation Requirements

- Every catalog entry has an identifier, version, shape, options or levels, thresholds, and a fallback.
- A recorded suite of states and expected answers exists for each question, and accuracy against it
  is reported before any threshold is loosened.
- A run with the provider disabled completes end to end on fallbacks alone.

## Open Questions

- Whether a second provider implementation is required before Phase 3 or can wait for evidence.
- Whether composite questions should be expressible in the catalog or kept as loop code.

## Change Log

- 2026-09-19: First draft.
