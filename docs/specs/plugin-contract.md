---
id: spec.harness.plugin-contract
title: Plugin Contract
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: How optional capability attaches to the harness by declaring states, gates, commands, and records.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Plugin Contract

## Purpose

Record how domain behavior stays domain-owned, and what it may never do.

**A general plugin engine is deferred.** One release use case is not evidence for an extension
framework, and building one now would be a framework in search of consumers. Domain behavior lives
with its domain until several real consumers justify a shared primitive. What survives without the
framework is the part that was actually load-bearing: the gate invariant.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** The governance runtime already separates a generic core from target-owned
  packs, including an explicit contract for a pack that takes ownership of built-in behavior. That
  separation is the model being copied.
- **Evidence:** none.
- **Known limits:** One plugin instance is planned. One instance is not enough to prove an
  extension contract.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- What a plugin declares.
- What the core keeps.
- The gate invariant.

## Non-Goals

- A plugin marketplace, versioned plugin API, or dynamic loading at v0.
- Plugins that add orchestration, tiers, or question shapes.

## What A Plugin Declares

| Declaration | Contents |
| --- | --- |
| States | Named states and the transitions allowed between them |
| Gates | Per transition: required deterministic facts, decision questions, thresholds, and who approves |
| Commands | How a transition is executed, delegated to existing tooling |
| Records | What the transition writes to the decision record |

These four are what a domain **must** express to be gated by the core. They are not a ceiling.

An earlier draft said any need beyond them described a gap the core should fill. That is backwards:
it would pull domain-specific behavior into a shared engine on the evidence of a single consumer.
Domain code may do more than these four things, in its own repository, with its own tests. It comes
to the core only when a second and third consumer want the same primitive.

## The Gate Invariant

This survives the framework's deferral, and applies to any domain code, plugin or not.

**A domain may raise a gate. No domain may lower one.**

Specifically, a plugin cannot grant itself automatic approval for an irreversible action, reduce a
threshold below the core's floor, remove a required approver, or mark its own transition verified.
If that were a plugin choice, the system's safety would equal that of its least careful plugin.

Enforcement happens at **both** ends, because neither alone is sufficient:

- **At load**, structural validation refuses a declaration that removes an approver, drops below a
  core threshold floor, or marks its own transition verified.
- **At evaluation**, the gate binds the policy version in force at that moment. Load-time validation
  cannot prove a live gate fact, and a policy changed after load must either be honored or cause the
  evaluation to be rejected as stale.

An earlier draft claimed load-time enforcement was enough. It is not: a gate whose requirements are
computed at evaluation time can be weakened without any declaration changing.

## Behavioral Requirements

- Plugins are declared as data with a thin command surface, and are optional in every sense: absent
  plugins change no core behavior.
- A transition's gate is evaluated by the core, using the core's decision interface and record.
- A plugin's commands wrap existing tooling. Reimplementing what a repository already runs is out
  of contract.
- Plugin states and gates are versioned. A changed gate is a new version, recorded.
- Two plugins may not claim the same transition.

## Invariants And Constraints

- The core owns the loop, the decision interface, the packet, and the record. A plugin owns none.
- Plugin declarations contain no thresholds below core floors and no approver removals.
- A plugin cannot call a worker directly; generation goes through worker invocation.
- A plugin's failure is contained: it blocks its own transition and nothing else.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Declaration weakens a gate | Refuse to load, name the offending declaration |
| Two plugins claim one transition | Refuse to load both, name the conflict |
| Command missing or failing | Transition blocked, recorded, nothing else affected |
| Gate facts unavailable | Transition blocked; unavailable is never treated as satisfied |

## Validation Requirements

- A plugin that attempts to lower a gate fails to load in a focused test.
- A policy changed after plugin load is honored at evaluation, or the evaluation is rejected as
  stale, proven by a live test rather than by load-time validation.
- Removing a plugin restores exactly the prior core behavior.
- A transition blocked by missing facts is distinguishable in the record from one blocked by a
  failed check.

## Open Questions

- Whether gates should be expressible in an existing policy language rather than a bespoke shape.
- Whether plugins need a read-only view of the record, or only write access.

## Change Log

- 2026-09-19: First draft.
