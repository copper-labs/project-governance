---
id: research.harness.state-store
title: State Store
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Where task and decision state lives, with a file-based first implementation and a deliberately deferred substrate.
---

> Child of [Decision-First Harness Core](harness-core.md).

# State Store

## Purpose

Hold the state that makes the harness possible. The loop exists because state lives outside the
model; this contract says where it lives and behind what boundary.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none.
- **Evidence:** none.
- **Known limits:** The file implementation is single-workspace and offers no cross-machine view.
- **Ledger:** [Research index](../../README.md).

## Scope

- The task record and its lifecycle.
- The storage boundary, and the file-based first implementation.
- What a later substrate would have to satisfy.

## Non-Goals

- A database, a service, or a daemon at v0.
- Cross-machine or multi-user state at v0.
- Adopting Mnemos at v0. See the deliberate deferral below.

## The v0 Store Is Files

JSON for records that are read back by code. Markdown for prose that people read. Both under an
ignored directory in the workspace, alongside existing runtime state.

The reasons are deliberate:

- A baseline has to be measurable before a substrate can be judged against it.
- Files are inspectable by hand, which matters while thresholds and taxonomies are still wrong.
- Coupling the harness to a substrate on day one couples two hard problems and delays both.

## Deliberate Deferral Of A Richer Substrate

A richer substrate is reevaluated only after the harness is tuned and running on files, and only
against the recorded baseline. This is a scheduled decision, not an omission, and the boundary
below exists so that decision stays cheap.

When it is taken, the questions are: does the store boundary still fit, does the record shape
survive unchanged, and does the substrate earn the coupling.

## Behavioral Requirements

- All persistence passes through one narrow store interface: append a record, read records by
  task, read records by question, attach an outcome to a prior record.
- The interface is content-addressed where identity matters: tasks, packets, and subjects are
  referred to by digest.
- Writes are append-only. Correction is a new record that supersedes, never an edit in place.
- The store is safe against concurrent writers in one workspace, and detects rather than merges
  external modification.
- Records are bounded. Large artifacts are referenced by path and digest, never inlined.
- The store never holds credentials, tokens, or full source content.

## Invariants And Constraints

- No component outside the store implementation touches the filesystem layout.
- The store cannot approve, weaken, or block a check; it observes.
- A corrupted or unreadable store is rebuilt rather than becoming a permanent blocker, and the
  rebuild is itself recorded.
- Retention is bounded by count and bytes, declared, and enforced by the store.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Store unwritable | Loop continues, degraded, and says so once |
| Concurrent writer detected | Second writer waits or declines; never interleaves |
| Corrupted record | Quarantine that record, rebuild the index, record the event |
| Retention limit reached | Oldest bounded records drop; identities and outcomes survive longest |

## Validation Requirements

- The loop completes with the store disabled, losing only the record.
- Append, read-by-task, read-by-question, and outcome attachment each have focused tests.
- A retention run preserves identity and outcome fields in preference to detail.

## Open Questions

- Whether prose records and JSON records share one directory or separate ones.
- What the minimum useful retention window is before calibration becomes unreliable.

## Change Log

- 2026-09-19: First draft, with the file-based v0 and the deferred substrate recorded as decisions.
