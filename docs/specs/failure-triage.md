---
id: spec.harness.failure-triage
title: Failure Triage
type: spec
status: draft
owner: project-harness
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
- **Ledger:** [Research index](../research/concept.md).

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
- Remedies are bounded per **failure episode**, not per class. Rotating classifications cannot
  multiply attempts.
- When the episode's remedy allowance is exhausted, the observed class is **preserved** and
  `remedy-exhausted` is attached. The failure escalates with its evidence and its classification
  history. It is never reclassified into a diagnosis nobody established.
- Low confidence resolves to `unknown`, never to the nearest plausible class.
- Every classification and its outcome is recorded, so accuracy is measurable rather than assumed.

## The Remedy Bound

The bound is what makes a wrong classification cheap. A misread `stale-derived-state` costs one
cycle, then the episode allowance is spent and the failure escalates with everything observed.

An earlier draft forced a repeated failure to `source-defect`. That was wrong: a persistent disk
shortage, a dependency outage, or a toolchain mismatch repeats identically and is not a source
defect, and acting on that label would send a worker to change correct code. Repetition bounds the
remedy; it does not manufacture a diagnosis.

**Remedies need authority, not just a label.** Cleaning and resource adjustment act on declared,
authorized scopes with exclusive ownership of them. A class label alone authorizes nothing. This is
what reconciles remedies with the build contract's rule that the harness deletes no build
artifacts: a remedy may clear only a derived location its adapter has declared and the request
owns.

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
| Episode remedy allowance exhausted | Preserve the observed class, attach `remedy-exhausted`, escalate with full output and classification history |
| Remedy scope not declared or not owned | Remedy refused; escalate |
| Conflicting repeat signals | Prefer the stricter interpretation |

## Validation Requirements

- A recorded fixture set of real failures, at least one per class an adapter claims, with expected
  classes.
- Accuracy against that set reported before any threshold change.
- A run with triage disabled behaves as today: full output to a human or a worker.
- A repeated resource failure, and a failure whose predicted class alternates, each exercised:
  neither may trigger an unsupported source edit or exceed the episode's remedy allowance.

## Open Questions

- Whether `contract-mismatch` is distinct enough from `source-defect` to earn its own remedy.
- How many fixtures per class are needed before the accuracy figure means anything.

## Change Log

- 2026-09-19: First draft.
