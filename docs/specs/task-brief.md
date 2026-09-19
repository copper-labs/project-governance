---
id: spec.harness.task-brief
title: Task Brief
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: A versioned record of what the user wants, what constrains it, and what has been ruled out, separate from the execution history.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Task Brief

## Purpose

Hold the task's *meaning*. Request identities, subjects and decisions describe what was done; none
of them says what the user asked for or what still constrains the answer.

This is not a modelling nicety. "Investigate this slowdown without changing code" and "apply the fix
now" can name the same source subject. Under a contract that knows only subjects, they inherit the
same permission to write. They must not.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none.
- **Evidence:** none.
- **Known limits:** A brief is only as good as what the operator states. It records intent; it does
  not infer it.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- What a brief holds, and who may change each part.
- Revision semantics when instructions change.
- How requests and actions reference it.

## Non-Goals

- Project management. A brief covers one task, not a backlog.
- Inferring intent the operator did not state.
- Storing conversation transcripts.

## Contents

| Part | Meaning | Who may change it |
| --- | --- | --- |
| Desired outcome | What the operator wants to be true when this is done | Operator |
| Constraints | What must hold, including prohibitions such as "do not change code" | Operator |
| Acceptance evidence | What would establish the outcome was reached | Operator, or policy |
| Scope | The paths, systems and resources this task may touch | Operator and policy |
| Open questions | What is not yet known | Worker may add; operator may resolve |
| Ruled out | Hypotheses tested and rejected, with the evidence | Worker may add |
| Handoff | A short readable summary for the next worker | Worker |

## Provenance Is Part Of The Content

Every item records which of three kinds it is, and the kinds are never merged:

- **Operator instruction** - stated by a person. Authoritative.
- **Observed fact** - produced by a deterministic tool or an executed check, with its receipt.
- **Worker hypothesis** - proposed by a model. Never becomes fact by being restated, and never
  becomes an instruction.

A worker may add hypotheses and observations. It may not edit an operator instruction, widen scope,
or relax a constraint. A proposed change to any of those is reviewable output, not authority.

## Behavioral Requirements

- A brief is versioned. A revision is a new version referencing the prior one; nothing is edited in
  place.
- Requests reference a brief version. Continuity uses the stable task and request identities;
  digests identify immutable revisions.
- **A new instruction revises the brief and invalidates affected pending actions.** It never
  silently rewrites an earlier request, and it never retroactively authorizes work already done.
- Unrevoked constraints survive every revision. Dropping one is an explicit operator act, recorded.
- Ruled-out hypotheses survive into later requests, so a fresh worker does not repeat a dead end
  that was already paid for.
- Equal source bytes do not imply the same task. A changed file does not imply a new task.

## Invariants And Constraints

- A worker cannot grant itself scope, permission, or acceptance through the brief.
- A constraint that prohibits an action is enforced at the action boundary, not by prompting
  alone. See [Action Authority](action-authority.md).
- The brief carries no credentials and no full source content.
- A brief with no stated outcome is incomplete; the task returns needs-input rather than proceeding
  on a guess.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Instruction contradicts a live constraint | Return needs-input naming the conflict; do not choose |
| Worker attempts to edit an operator instruction | Refused and recorded as a proposal |
| Brief version missing for a request | The request does not execute |
| Revision arrives mid-action | Affected pending actions invalidated; completed effects are not rewritten |

## Validation Requirements

- A fresh worker resumes after an operator correction, retains the original unrevoked constraints,
  honors the correction, and does not repeat a recorded failed investigation.
- An investigate-only brief refuses a write at the action boundary, not merely in its instructions.
- A worker-proposed scope widening appears as a proposal and changes nothing.

## Open Questions

- Whether acceptance evidence is always operator-stated or may default from policy per task type.
- How much handoff prose is useful before it becomes another thing to maintain.

## Change Log

- 2026-09-19: First draft, in response to finding A2 of the architecture review.
