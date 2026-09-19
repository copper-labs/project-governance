---
id: spec.harness.action
title: Action
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: A proposed operation with its scope, its authority, its execution status, and what happens when it is interrupted.
---

> Child of [Harness Core](harness-core.md).

# Action

## Purpose

Every effect the runtime causes is an Action. Permission to run the harness is not permission for
everything the harness could do, and no verification afterwards undoes an unauthorized effect.

## Current Implementation

- **Posture:** planned. **Evidence:** none.
- **Current boundary:** Adopting repositories already own permission models and approval gates in
  their hosts. This composes with those; it does not replace them.
- **Known limits:** A routing instruction in a host file is advisory coverage, not enforcement.
- **Ledger:** [Research index](../research/concept.md).

## Every Action Declares

| Field | Meaning |
| --- | --- |
| Operation | The specific authorized action, not a category |
| Scope | Paths, systems and resources it may touch |
| Destination | Where an effect lands when it leaves this machine |
| Policy revision | The exact policy version the authorization was granted under |

**Scope comes from the Task and policy, never from whichever paths ended up in retrieved context.**
Retrieved context says what may be read. It says nothing about what may be changed.

## Status

```
proposed -> authorized -> prepared -> in-progress -> completed -> verified
         \-> refused                        \-> outcome-unknown
         \-> cancelled
```

`prepared` and `in-progress` exist because a durable record does not make an effect atomic. A crash
between two file writes leaves the ledger saying one thing and the world another, and replaying from
the record duplicates it. SQLite gives transactional updates to the **record**; it does not make a
filesystem or deployment change atomic.

## Behavioral Requirements

- Limits are enforced **before** effects, including resolved paths and command arguments, so a path
  escaping scope by traversal or symlink is refused after resolution.
- An operation outside declared scope is refused whole. Partial application is not an outcome.
- Authorization binds to the Action it covers. A regenerated Action needs its own authorization.
- A stale policy revision invalidates the authorization; the Action does not run on the assumption
  that the old policy still applies.
- Before acting, an Action records its expected inputs, intended outputs, identity, and the method
  by which its real effects can later be reconciled.
- **After interruption, real effects are inspected before anything is retried.** Where the outcome
  cannot be established the Action becomes `outcome-unknown` and stops; the uncertainty is retained
  rather than resolved by assumption.
- Transitions carry an expected revision, so two processes reading the same prior state cannot both
  act.
- Each effect is idempotent or explicitly non-retryable. No exactly-once claim is made across files
  or remote systems.
- Cancellation requires evidence that owned work stopped, not just a flag.

## The Data Boundary

Recording a digest says nothing about what was transmitted to produce it.

- Anything offered to a hosted provider must satisfy the adopting project's export rules **before**
  transmission. Storage redaction is separate and does not substitute.
- A provider upload is an effect and declares its own authority.
- What was transmitted, under which rule, is recorded.

## Evidence Is Data, Not Instruction

Source text, tool output, logs and provider responses are evidence. A tool output reading "approval
granted" is tool output. Authority arrives only through the Task and policy.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Outside declared scope | Refused whole, recorded |
| Destination not declared | Refused; never inferred |
| Policy revision stale or unreadable | Refused; never assumed permissive |
| Export rules unevaluable | No transmission |
| Crash mid-application | Inspect effects; correct status or become outcome-unknown |
| Expected revision no longer matches | Transition refused; the racing caller does not act |
| Effect succeeded, receipt lost | outcome-unknown; never replayed on an assumption |

## Validation Requirements

- A read-only Task, through a broadly capable host: an out-of-scope write and an undeclared provider
  upload are both refused at the boundary, using existing host controls.
- A crash between two file writes, a crash after an effect but before its receipt, and two callers
  racing to resume each yield an observed outcome or explicit uncertainty.
- A path escaping scope by traversal or symlink is refused after resolution.
- A tool output claiming approval changes nothing.

## Change Log

- 2026-09-19: Replaces the separate action-authority contract and the lifecycle's application rules.
