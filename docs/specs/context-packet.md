---
id: spec.harness.context-packet
title: Context Packet
type: spec
status: draft
owner: project-harness
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
- **Current boundary:** The governance runtime materializes bounded context with explicit byte
  ceilings and skill selection, but it reads route files and content through a supplied filesystem
  root. That is **not** the same as being bound to the immutable check subject: a dirty worktree can
  supply different bytes from the selected staged or branch subject. A bridge from subject to
  materialization is required work, not an available property.
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

- A named bridge binds the immutable subject to materialization. Until it exists, packet
  attribution is a blocker, not an assumption, and the contract does not claim subject-bound bytes.
- Every packet has a content-addressed identity derived from its selected contents.
- **Mandatory items** - the owning authority, the constraints a change must satisfy, and the exact
  changed bytes - are named per route and cannot be dropped by narrowing or by budget pressure.
- A packet must include a route for **new work with no diff**. Impacted-change selection cannot
  locate an edit that does not exist yet, so a task with no changed paths selects by declared target
  rather than by change.
- Every packet declares a total byte budget and per-category sub-budgets, and cannot exceed them.
- Every included item states why it was included: which rule or which decision selected it.
- Failure output is reduced to the relevant assertion or error block, never carried whole.
- A packet is inspectable as data before a worker ever sees it.
- The packet records what was considered and rejected, in bounded form, so misses are diagnosable.

## The Escape Hatch

A worker may request something the packet lacks. The request is granted through the same
deterministic generation path, and is recorded as a packet miss.

Misses are split by cause, because they are not all narrowing's fault:

| Cause | Meaning |
| --- | --- |
| `generation` | The item was never a candidate |
| `ranking` | It was a candidate and was ranked out |
| `budget` | It was selected and did not fit |

**Miss rate is a diagnostic, not a quality measure.** A worker can miss an essential constraint
without ever asking for it, so a falling request rate does not establish better packets. Quality is
measured by accepted task results, later-detected defects, rework, and total time and cost against
the existing workflow.

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
| Budget exceeded, optional items | Drop lowest-ranked, record what was dropped |
| Budget exceeded, mandatory items | Return a budget blocker or a bounded expansion request; never drop |
| Narrowing confidence low | The entry's `widen` disposition, within its declared attempt and cost bound |
| Repeated packet misses on one question | Surface as a calibration finding, not a per-run warning |

## Validation Requirements

- Determinism is scoped: a frozen subject, catalog, history snapshot, budget and recorded
  selection produce a byte-identical packet. Live provider choices and accumulating history are
  inputs, so determinism is not claimed outside that frozen scope.
- Staged and worktree bytes made to differ, proving which one the packet carried.
- Mandatory context overflowed, proving a blocker rather than a silent drop.
- A task submitted in a clean checkout with no diff, proving the no-diff route.
- Packet misses are recorded and attributable to a specific narrowing decision.
- A run with narrowing disabled still produces a valid, larger packet.

## Open Questions

- Whether prior records for an area should be included by default or only on request.
- How to bound "considered and rejected" without losing diagnostic value.

## Change Log

- 2026-09-19: First draft.
