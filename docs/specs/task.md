---
id: spec.harness.task
title: Task
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: What the operator wants, what constrains it, what would establish it is done, and how far along it is.
---

> Child of [Harness Core](harness-core.md).

# Task

## Purpose

Hold the objective. Without it the runtime knows what it did and not what it was for, and cannot
tell "investigate this slowdown without changing code" from "apply the fix now" — which name the
same source and must not carry the same permission to write.

## Current Implementation

- **Posture:** planned. **Evidence:** none.
- **Known limits:** A Task records stated intent; it does not infer unstated intent.
- **Ledger:** [Research index](../research/concept.md).

## Mode

A job declares whether it will change code. `implement` is the default; `explore` means the job
produces understanding, a spec or a plan and changes nothing. The distinction is used by
[Concurrency](concurrency.md): a job that changes nothing cannot collide with one that does.

## Lineage

A job may be **forked**, as when a conversation is branched into another worktree. The child
inherits the operator's constraints, the declared scope, the acceptance criteria and the ruled-out
findings — the expensive knowledge — and starts its own progress. Session-specific handoff notes do
not carry.

The child records its parent. Git deliberately keeps no relationship between a branch and the
branch it came from, so lineage between jobs is the runtime's to hold or it is lost.

Scope is rewritten to the forking worktree. Inheriting the parent's path would refuse every action
the child takes in its own checkout.

## Contents

| Part | Meaning | Who may change it |
| --- | --- | --- |
| Desired outcome | What should be true when this is done | Operator |
| Constraints | What must hold, including prohibitions | Operator |
| Acceptance criteria | What would establish the outcome was reached | Operator, or policy |
| Scope | Paths, systems and resources this task may touch | Operator and policy |
| Progress | Open questions, ruled-out hypotheses, a readable handoff | Worker adds; operator resolves |

## Provenance Is Part Of The Content

Every item is one of three kinds, never merged:

- **Operator instruction** — stated by a person. Authoritative.
- **Observed fact** — produced by a tool or executed check, carrying its receipt.
- **Worker hypothesis** — proposed by a model. Never becomes fact by restatement, never becomes an
  instruction.

A worker may add hypotheses and observations. It may not edit an operator instruction, widen scope,
or relax a constraint; a proposed change to any of those is reviewable output.

## Behavioral Requirements

- Tasks are versioned. A revision references its predecessor; nothing is edited in place.
- Actions reference a Task version. Continuity uses stable task and action identities; digests
  identify immutable revisions.
- **A new instruction revises the Task and invalidates affected pending Actions.** It never
  retroactively authorizes work already done.
- Unrevoked constraints survive every revision. Dropping one is an explicit operator act, recorded.
- Ruled-out hypotheses survive into later Actions, so a fresh worker does not repeat a paid-for dead
  end.
- Equal source bytes do not imply the same Task; a changed file does not imply a new one.
- A Task records the worktree and branch it was started from. One repository's jobs share one store,
  so a job is legible about where it belongs.
- Forking produces a separate Task. Closing one does not close the other.
- A Task reaches **accepted** when its acceptance criteria are satisfied — automatically where the
  criteria are fully covered by evidence, and by review where they are not.

## Invariants

- A worker cannot grant itself scope, permission or acceptance through the Task.
- A prohibition is enforced at the action boundary, not by instruction alone. See [Action](action.md).
- No credentials and no full source content live here.
- A Task with no stated outcome returns needs-input rather than proceeding on a guess.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Instruction contradicts a live constraint | Return needs-input naming the conflict |
| Worker attempts to edit an operator instruction | Refused, recorded as a proposal |
| Revision arrives mid-action | Affected pending Actions invalidated; completed effects are not rewritten |
| Acceptance criteria unmet but checks pass | Task stays open; checks passing is not acceptance |

## Validation Requirements

- A fresh worker resumes after an operator correction, keeps the unrevoked constraints, honors the
  correction, and does not repeat a recorded failed investigation.
- An investigate-only Task refuses a write at the action boundary, not merely in its wording.
- A prose-only Task reaches acceptance without compilation pretending to verify its content.

## Open Questions

- Whether acceptance criteria may default from policy per task type, or are always stated.

## Change Log

- 2026-09-19: Replaces the separate task brief and lifecycle-state contracts.
