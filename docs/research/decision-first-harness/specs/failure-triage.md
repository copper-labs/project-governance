---
id: research.harness.failure-triage
title: Failure Triage
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: A shared failure taxonomy, the remedy each class selects, and the bound that stops retry loops.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Failure Triage

## Purpose

Classify a failure instead of reading it. The class then selects a deterministic next action, and
most classes never reach a language model.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none.
- **Evidence:** none.
- **Known limits:** Classification is the first real use of the decision interface, chosen because
  a wrong answer costs one build cycle.
- **Ledger:** [Research index](../../README.md).

## Scope

- The shared taxonomy.
- Remedy mapping and the retry bound.
- What triage hands to a worker when a model is genuinely needed.

## Non-Goals

- Fixing failures. Triage classifies; the worker fixes.
- Ecosystem-specific pattern matching, which belongs to adapters.

## Shared Taxonomy

| Class | Meaning | Remedy | Model |
| --- | --- | --- | --- |
| `source-defect` | The change is wrong | Narrow packet, one worker invocation | Yes |
| `contract-mismatch` | Declarations disagree across units or platforms | Narrow packet naming both sides | Yes |
| `stale-derived-state` | Generated or cached intermediate is out of date | Clean the named state, retry once | No |
| `resource-exhaustion` | Memory, disk, or daemon capacity | Adjust and retry once | No |
| `environment-flake` | Non-deterministic infrastructure | Retry once | No |
| `toolchain-mismatch` | Declared versus installed tooling differs | Report the exact mismatch | No |
| `dependency-resolution` | Dependency cannot be resolved or verified | Report; never install autonomously | No |
| `unknown` | Not confidently classified | Stop, hand over the full output | Human |

Adapters may add named subtypes beneath a class. No adapter may remove or redefine a class.

## Behavioral Requirements

- The decision sees the failing unit, the first error block, and the exception or status signature.
  It does not see the whole log.
- A second question in the same call asks whether this is the same cause as the previous failure
  for this task.
- Retry is bounded at one per class per task. A repeated identical failure is reclassified as
  `source-defect` regardless of the original answer.
- Low confidence resolves to `unknown`, never to the nearest plausible class.
- Every classification and its outcome is recorded, so accuracy is measurable rather than assumed.

## The Retry Bound

The bound is what makes a wrong classification cheap. A misread `stale-derived-state` costs one
cycle, then the repeat rule forces the real path. Without the bound, a confident wrong answer
becomes an unbounded loop, which is the single worst failure mode available here.

## Invariants And Constraints

- Triage never edits source, cleans anything outside a named derived location, or installs packages.
- Triage never marks a run successful.
- A remedy is declared data, not inferred at run time.
- `unknown` is a first-class outcome and is never penalized into a guess by threshold tuning.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Decision provider unavailable | Fallback to `unknown`; hand over the output |
| Class has no declared remedy for this adapter | Treat as `unknown` |
| Retry bound reached | Escalate with the full output and the classification history |
| Conflicting repeat signals | Prefer the stricter interpretation |

## Validation Requirements

- A recorded fixture set of real failures, at least one per class an adapter claims, with expected
  classes.
- Accuracy against that set reported before any threshold change.
- A run with triage disabled behaves as today: full output to a human or a worker.

## Open Questions

- Whether `contract-mismatch` is distinct enough from `source-defect` to earn its own remedy.
- How many fixtures per class are needed before the accuracy figure means anything.

## Change Log

- 2026-09-19: First draft.
