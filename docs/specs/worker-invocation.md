---
id: spec.harness.worker-invocation
title: Worker Invocation
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The stateless worker contract and how a model tier is chosen for a bounded generation job.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Worker Invocation

## Purpose

Call a language model once, for a bounded job, with a packet. Take back a result. Expect it to
remember nothing.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** The governance runtime ships Markdown model recommendations with six work
  classes that a coordinator interprets. Those classes are the intended vocabulary here.
- **Evidence:** none.
- **Known limits:** In the first step the host owns the model actually running the conversation;
  the harness selects only for work it dispatches.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- The worker contract: input, output, and statelessness.
- Tier and work-class selection for dispatched work.
- What stays host-owned.

## Non-Goals

- Replacing the host's own model or its permissions.
- A provider cascade or automatic retry ladder.
- Multi-agent collaboration. Read-only fan-out is a separate concern owned by the loop.

## Two Worker Patterns

Both sit behind the same action boundary and the same authority declaration.

| Pattern | Does | Bound by |
| --- | --- | --- |
| **Transform** | A bounded change over known inputs | One packet, one result |
| **Investigation** | Follows evidence: may request further reads or approved experiments | Total task cost, iteration count, and no-progress behavior |

An investigation exists because deterministic widening cannot find a concept the generation path
does not already know how to look for. When the decisive evidence is a trace that does not exist
yet, no amount of re-selecting existing files produces it.

**Bounds are per task, not per request.** A new request does not reset the budget; otherwise the
loop is unbounded by construction. Control returns when the next step needs greater authority or
genuinely new operator input - not merely because the first packet was incomplete.

## The Worker Contract

- Input is a request identity, a packet identity, and a bounded instruction. Never a transcript.
- Output is a result naming its request and the starting subject it was generated against, plus any
  escape-hatch requests. Who applies it is decided by mode in [Task Lifecycle](task-lifecycle.md);
  this contract applies nothing itself.
- The worker holds no state between invocations, and the harness sends none.
- The same packet and instruction may be sent to a different provider without change.

Stateless means **no required hidden provider session**. It does not prohibit an explicit,
inspectable handoff. A labelled note from a previous worker, carried in the packet with its
provenance, is deterministic input like any other file; what is prohibited is a provider-side
conversation the harness cannot see, reproduce, or move to another provider.

Statelessness in that sense is the property that makes providers interchangeable.

## Selection

- Work classes come from the existing model-selection policy: routine, difficult-implementation,
  ambiguous-integration, diagnosis-review, deep-reasoning, major-planning.
- A decision may recommend a class. The recommendation is advisory and is recorded.
- The operator's explicit choice wins, then the adopting repository's policy, then defaults.
- The selected class, model, effort, and the source of that selection are recorded with the
  invocation.
- A model or effort that is unavailable is reported, never silently substituted.

## Invariants And Constraints

- A worker is called only when something must be written.
- A worker never approves its own output; verification is separate and deterministic.
- The harness does not fragment coherent work to reach a cheaper class.
- Parallel workers are permitted only for independent, read-only work, and never for concurrent
  writes to the same files.
- Worker output is treated as untrusted input until verification runs.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Provider or effort unavailable | Report the failed choice; obtain an explicit alternative |
| Worker returns nothing usable | Record, escalate a tier or to a human; do not silently retry at cost |
| Escape-hatch request | Serve deterministically, record as a packet miss, re-invoke once |
| Output fails verification | Ordinary failure path; triage owns what happens next |

## Validation Requirements

- The same packet dispatched to two providers produces results that both pass verification for one
  fixture task. A failure here is investigated; it does not by itself prove statelessness was lost.
- Selection, including its source, appears in the record for every invocation.
- A run with dispatch disabled halts cleanly at the generation step rather than guessing.

## Open Questions

- Whether the harness should ever dispatch to a second provider for comparison, and at what cost.
- Whether read-only fan-out belongs here or in the loop contract.

## Change Log

- 2026-09-19: First draft.
