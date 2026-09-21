---
id: research.harness.context-packet
title: Context Packet
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Deterministic candidate generation, cheap narrowing, and the bounded packet handed to a worker.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Context Packet

## Purpose

Produce a small, inspectable, bounded packet so a worker starts with what it needs instead of
discovering it at frontier prices. This is where the token cost of the loop is actually decided.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** The governance runtime already materializes bounded context with explicit
  byte ceilings and skill selection. That is the intended Tier 0 producer.
- **Evidence:** none for the harness layer.
- **Known limits:** Narrowing quality is unmeasured until packet misses are recorded.
- **Ledger:** [Research index](../../README.md).

## Scope

- Candidate generation, which is deterministic.
- Narrowing, which is a decision.
- The packet shape, its budget, and the escape hatch.

## Non-Goals

- Semantic search infrastructure at v0.
- Any packet content produced by a language model.

## Order Of Operations

1. **Generate candidates deterministically.** Impacted paths from the governance runtime, the diff,
   the module graph, owning specs, prior records for the same area. No decision model involved.
2. **Narrow by decision.** Rank candidates, classify what kind of context this task needs, and
   select within budget.
3. **Assemble.** Materialize the selected bytes with explicit ceilings.
4. **Record.** The packet gets an identity; the narrowing decisions reference it.

Candidate generation sets the quality ceiling. A candidate never generated cannot be selected, and
that failure looks exactly like a bad narrowing decision unless the record distinguishes them.

## Behavioral Requirements

- Every packet has a content-addressed identity derived from its selected contents.
- Every packet declares a total byte budget and per-category sub-budgets, and cannot exceed them.
- Every included item states why it was included: which rule or which decision selected it.
- Failure output is reduced to the relevant assertion or error block, never carried whole.
- A packet is inspectable as data before a worker ever sees it.
- The packet records what was considered and rejected, in bounded form, so misses are diagnosable.

## The Escape Hatch

A worker may request something the packet lacks. The request is granted through the same
deterministic generation path, and is recorded as a packet miss against the narrowing decision.

The escape hatch is a feature, not a failure. Removing it would trade a visible, measurable miss
for an invisible wrong answer.

## Invariants And Constraints

- No language model participates in building a packet.
- Selection reads only from the immutable subject the governance runtime resolved, never the live
  checkout, except where that runtime already declares a live exception.
- A packet is immutable once identified. Additions create a new packet that references the prior one.
- Budgets are enforced before materialization, not by truncating afterwards.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Candidate generation incomplete | Widen deterministically and record; never let a decision cover a generation gap |
| Budget exceeded | Drop lowest-ranked items, record what was dropped |
| Narrowing confidence low | Widen rather than narrow; record the escalation |
| Repeated packet misses on one question | Surface as a calibration finding, not a per-run warning |

## Validation Requirements

- A fixed change produces a byte-identical packet across runs.
- Packet misses are recorded and attributable to a specific narrowing decision.
- A run with narrowing disabled still produces a valid, larger packet.

## Open Questions

- Whether prior records for an area should be included by default or only on request.
- How to bound "considered and rejected" without losing diagnostic value.

## Change Log

- 2026-09-19: First draft.
