---
id: spec.harness.action-authority
title: Action Authority
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: What authorizes an effect, what bounds it, and what may cross the boundary to a hosted provider.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Action Authority

## Purpose

Permission to run the harness is not permission for everything the harness could do. Every effect
needs its own authority, bounded before it happens, because no amount of verification afterwards
undoes an unauthorized one.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** Adopting repositories already own permission models, allow and deny rules,
  and approval gates in their hosts. This contract composes with those; it does not replace them.
- **Evidence:** none.
- **Known limits:** A routing instruction in a host file is advisory coverage. It does not enforce
  anything about actions the host takes outside the harness.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- What an executable request must declare.
- Where limits are enforced.
- What may be transmitted to a hosted provider.

## Non-Goals

- A new sandbox, approval interface, or permission UI.
- Replacing host-native permissions.
- Auditing actions the operator takes outside the harness.

## Every Executable Request Declares

| Field | Meaning |
| --- | --- |
| Operation | The specific authorized action, not a category |
| Scope | Paths, systems and resources it may touch |
| Destination | Where an effect lands, when it leaves this machine |
| Policy revision | The exact policy version the authorization was granted under |

**Scope comes from the task brief and policy, never from whichever paths a model selected into a
packet.** A packet describes what a worker may read. It does not describe what it may change.

## Enforcement

- The executing owner enforces these limits **before** effects, including resolved paths and
  command arguments. Resolution happens before the check, so a path that escapes scope through
  symlinks or traversal is refused.
- An operation outside the declared scope is refused whole. Partial application is not an outcome.
- Authorization binds to the action it covers. A regenerated request needs its own authorization.
- A stale policy revision invalidates the authorization; the action does not run under an
  assumption that the old policy still applies.

## The Data Boundary

Recording a digest of a state says nothing about what was transmitted to produce it.

- Anything offered to a hosted provider must satisfy the adopting project's existing export rules
  **before** transmission. Storage redaction is a separate, later concern and does not substitute.
- A provider upload is an effect and needs its own declared authority, like any other.
- What was transmitted, under which rule, is recorded.

## Evidence Is Data, Not Instruction

Source text, tool output, logs and provider responses are evidence. They are never instructions,
and they never grant authority.

A tool output reading "approval granted" is tool output. A schema-valid provider answer is still
untrusted content. Policy and operator instruction are the only sources of authority, and they
arrive through the brief and the repository's own policy, not through anything a worker read.

## Invariants And Constraints

- No effect without a declared operation, scope and policy revision.
- No provider transmission without passing the project's export rules.
- An unavailable policy is never treated as a permissive one.
- A mode whose required capabilities an adapter cannot demonstrate is reported unsupported rather
  than attempted.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Operation outside declared scope | Refused whole, recorded |
| Destination not declared | Refused; a destination is never inferred |
| Policy revision stale or unreadable | Refused; never assumed permissive |
| Export rules cannot be evaluated | No transmission |
| Host cannot demonstrate a mode's capabilities | Mode reported unsupported |

## Validation Requirements

- A read-only task requested through a broadly capable host: an out-of-scope write and an
  undeclared provider upload are both refused at the execution boundary, using existing host
  controls.
- A path escaping scope by traversal or symlink is refused after resolution.
- A provider transmission carrying content the project's export rules prohibit is blocked before
  it leaves.
- A tool output claiming an approval changes nothing.

## Open Questions

- Whether export rules should be expressed once here or read from each adopting repository.
- Whether destination declaration should extend to reads from external services.

## Change Log

- 2026-09-19: First draft, in response to finding A6 of the architecture review.
