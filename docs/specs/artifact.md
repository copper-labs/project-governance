---
id: spec.harness.artifact
title: Artifact
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Versioned inputs and outputs, bound to the right source version, retrieved progressively within a budget.
---

> Child of [Harness Core](harness-core.md).

# Artifact

## Purpose

A versioned input or output: a source snapshot, a patch, a document, a log. The valuable
abstraction is **reliable access to the right source version within a budget** — not predicting a
perfect context payload before work starts.

## Current Implementation

- **Posture:** planned. **Evidence:** none.
- **Current boundary:** The governance runtime materializes bounded context with byte ceilings, but
  reads through a supplied filesystem root. That is **not** the same as binding to the immutable
  check subject: a dirty worktree can supply different bytes from the selected staged or branch
  subject. A bridge is required work, not an available property.
- **Known limits:** Subject binding is the hard part; ranking is not.
- **Ledger:** [Research index](../research/concept.md).

## What Changed From The Earlier Draft

An earlier contract specified candidate generation, a narrowing decision, mandatory-item protection,
budget arbitration and a miss-cause taxonomy. Most of that was a ranking pipeline built to predict
the perfect payload. It is cut.

What remains is the part that carries the value: every Artifact is bound to an exact version, and
retrieval is progressive and bounded.

## Behavioral Requirements

- Every Artifact has a content-addressed identity and names the subject it came from.
- **Subject binding is explicit.** An Artifact drawn from a staged or branch subject is not
  satisfied by live worktree bytes, and the difference is detectable rather than assumed.
- A Task starts with its brief, its mandatory instructions, its relevant source references and the
  most useful existing evidence. It does not start with everything.
- A worker requests more through bounded reads. The runtime materializes those deterministically;
  the worker never reaches around the runtime to read for itself.
- Budgets bind to the **Task**, not to a single request. A new request does not reset them.
- A previously authored, provenance-labelled handoff may be carried as content. It is marked a
  hypothesis, never a fact.
- Large artifacts live as ordinary files and are referenced, never inlined into records.
- A Task with no diff routes by declared target. Impacted-change selection cannot locate an edit
  that does not exist yet.

## Invariants

- No model selects what an Artifact contains. A worker may propose the query; materialization stays
  deterministic.
- An Artifact is immutable once identified. A revision is a new Artifact referencing the prior one.
- Budget exhaustion returns a blocker or a bounded expansion request. It never silently drops
  something the Task required.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Subject bridge unavailable | Blocker; the contract does not claim subject-bound bytes without it |
| Requested read outside Task scope | Refused; scope is not widened by asking |
| Task budget exhausted | Return control with what is established so far |
| Retrieval cannot establish a version | No Artifact; the uncertainty is reported |

## Validation Requirements

- Staged and worktree bytes made to differ, proving which the Artifact carried.
- A task whose decisive evidence is two reads away, compared against full preassembly: accepted
  results and total context consumed, including repeated prefixes and retries.
- A task needing a new experiment rather than a larger selection, showing that retrieval alone
  cannot substitute.
- A clean checkout with no diff routing by declared target.

## Change Log

- 2026-09-19: Replaces the context-packet contract; the ranking pipeline is removed.
