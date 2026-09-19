---
id: spec.harness.decision-interface
title: Decision Interface
type: spec
status: draft
owner: project-harness
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
- **Ledger:** [Research index](../research/concept.md).

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
  levels, and a boolean judgment. **A provider must support the shapes its enabled consumers
  actually use, not all three.** Required capability is negotiated at registration, and a question
  whose shape a provider does not support is rejected explicitly rather than approximated.
- Questions are declared as catalog data with a stable identifier and a version. Changing a
  question's meaning requires a new version; catalog entries are never edited in place.
- Multiple questions about one state are asked in a single call where the provider supports it,
  and the interface records that they shared a state.
- Every catalog entry declares a typed disposition for an unusable answer. A question with no
  declared disposition is invalid.
- Every answer carries a confidence value and the probabilities behind it, both recorded.
- The interface is synchronous from the loop's perspective and has a bounded timeout. A timeout is
  a fallback, not an error that stops the loop.

## Dispositions

An answer is unusable when the provider fails, the schema is violated, the state exceeds budget, or
confidence falls below the entry's act threshold. Every catalog entry declares which of three
dispositions applies, and every consumer asserts the same one:

| Disposition | Meaning | Example |
| --- | --- | --- |
| `fallback` | Proceed on the declared conservative answer | Lane ranking: fall back to the static rule |
| `widen` | Request bounded additional state and ask again, within a declared attempt and cost bound | Packet narrowing: widen rather than narrow |
| `needs-input` | Return control; the task is not completed autonomously | Failure triage: hand the output to a human |

`widen` declares its maximum attempts and its cost ceiling. Exhausting them resolves to the entry's
terminal disposition, which is `fallback` or `needs-input` and is never another `widen`.

Tier 2 diagnosis is permitted only where a catalog entry names it, and is bounded by that entry.
This is the one exception to the generation-only rule for Tier 2, and it is explicit rather than
implied.

A threshold is not a probability cutoff alone. Each entry declares the **consequence of a wrong
  action** taken on its answer and the **evidence that action requires**. A high-confidence answer
  whose remedy is destructive needs more than confidence to act on; a low-confidence answer whose
  remedy is free may be acted on cheaply.

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
| Provider unreachable, rate limited, or timed out | The entry's declared disposition, recorded with the reason |
| Answer outside the declared schema | Treated as provider failure; the entry's disposition |
| Malformed or degenerate probabilities | Treated as provider failure; the entry's disposition |
| Confidence below the act threshold | The entry's declared disposition |
| State exceeds the provider budget | Reduce deterministically where the entry allows it, otherwise the entry's disposition; never silently truncate meaning |
| `widen` attempts or cost exhausted | The entry's terminal disposition, recorded |

## Validation Requirements

- Every catalog entry has an identifier, version, shape, options or levels, thresholds, and a fallback.
- A recorded suite of states and expected answers exists for each question, and accuracy against it
  is reported before any threshold is loosened.
- One table-driven fixture per disposition, covering provider outage, malformed probabilities,
  budget overflow and low confidence, asserting the same disposition at the interface and at the
  consumer.
- A run with the provider disabled leaves ordinary checks available. Tasks whose entries declare
  `needs-input` return control rather than completing.

## Open Questions

- Whether a second provider implementation is required before Phase 3 or can wait for evidence.
- Whether composite questions should be expressible in the catalog or kept as loop code.

## Change Log

- 2026-09-19: First draft.
