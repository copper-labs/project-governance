---
id: spec.harness.concurrency
title: Concurrency
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Several conversations in one worktree, and why the answer is awareness rather than a lock.
---

> Child of [Harness Core](harness-core.md).

# Concurrency

## Purpose

Two conversations can share one folder. A host may offer to branch a chat either into a new git
worktree or into the same workspace, and the second is cheap and commonly used. This contract says
what the runtime does about it.

## Current Implementation

- **Posture:** planned. **Evidence:** none in production; covered by focused tests.
- **Known limits:** Detection covers files the runtime has seen. A file an agent reads without
  going through the runtime is invisible to it.
- **Ledger:** [Research index](../research/concept.md).

## The Constraint That Decides The Design

**The runtime does not write to a working tree, so it never sees a write.** It cannot block one.
A lock would be theatre: it would claim a guarantee the runtime is structurally unable to provide.

It would also be the wrong trade. Sharing a workspace is chosen deliberately, to do a few small
things without the cost of a checkout. Making that mode expensive removes the reason it exists.

**So: detect quickly, surface plainly, never block.**

## Two Jobs In One Worktree Do Not Conflict

Separate jobs are separate records. Their constraints, notes, evidence and budgets are independent,
and nothing bleeds between them. Two conversations working two different tasks in one folder is an
ordinary, supported case at the data level.

What collides is **files**, and only when at least one job changes them.

## Modes

A job declares what kind of work it is.

| Mode | Meaning | Overlap warnings |
| --- | --- | --- |
| `implement` | The job will change code. The default. | Raises and receives them |
| `explore` | The job produces understanding, a spec or a plan, and changes nothing | Neither raises nor receives |

An exploring job cannot collide with anything, so warning about it is noise. This removes the main
source of false alarms, because the shared-workspace case is most often one implementing thread and
one exploring one.

## What Is Detected

- **Other sessions active in this worktree**, within a declared window.
- **File overlap**: a path this job has touched that another *active, implementing* session's job
  has also touched.
- **The working tree changed since this session last acted**, and this session did not cause it.

Each conversation identifies itself. The host supplies that identity where it can; otherwise a
per-process value is used, which still separates concurrent threads.

## Behavioral Requirements

- A warning names the file, the other session, and what the risk is. It never merely says "conflict".
- A warning is advisory. No command fails because of one, and no work is prevented.
- Awareness is analytics, not execution state: losing it degrades the warning and never blocks work.
- Paths are recorded as a job touches them, through ordinary retrieval, so the common case costs
  nothing extra.
- Separate worktrees are separate files on disk and never report overlap with each other.

## Invariants And Constraints

- No lock, lease or claim over files. The runtime has no authority there and must not imply it.
- An exploring job never raises an overlap warning, in either direction.
- Detection never reads file contents to compare them; identity and paths are sufficient.

## Known Limits, Stated Plainly

- **Coverage depends on the host.** A file read outside the runtime is not recorded, so overlap on
  it is invisible. This is a false negative by construction.
- **Touched is not written.** Two jobs merely reading one file are reported as overlapping, which is
  a false positive. Modes reduce this; they do not eliminate it.
- **The active window is a guess** until there is usage data to set it from.
- **Nothing here prevents an overwrite.** Only separate worktrees do. The runtime's contribution is
  that a collision becomes visible in seconds instead of being discovered later.

## Guidance The Adapter Carries

Sharing a workspace is fine for exploring and risky for implementing. When implementation is about
to begin in a branched conversation that shares a folder, the host says so and suggests a worktree.

## Validation Requirements

- Another active session in the same worktree is reported; one in a different worktree is not.
- Two implementing jobs touching one file overlap; an exploring job on the same file does not.
- A stale session falls out of the active window.
- Activity is upserted per session and worktree rather than accumulating rows.

## Open Questions

- Whether a job should be able to declare intended paths up front, trading ceremony for an earlier
  warning. Deferred until the passive version shows it is too late to help.
- What the active window should be, once there is data.

## Change Log

- 2026-09-19: First draft, after the shared-workspace case was raised.
