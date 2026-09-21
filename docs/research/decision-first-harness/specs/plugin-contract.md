---
id: research.harness.plugin-contract
title: Plugin Contract
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: How optional capability attaches to the harness by declaring states, gates, commands, and records.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Plugin Contract

## Purpose

Let optional capability attach without growing the core and without weakening what the core
guarantees. A plugin declares a domain. It does not orchestrate.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** The governance runtime already separates a generic core from target-owned
  packs, including an explicit contract for a pack that takes ownership of built-in behavior. That
  separation is the model being copied.
- **Evidence:** none.
- **Known limits:** One plugin instance is planned. One instance is not enough to prove an
  extension contract.
- **Ledger:** [Research index](../../README.md).

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

Nothing else. A plugin that needs to declare anything beyond these four is describing a gap in the
core, and the core is what should change.

## The Gate Invariant

**A plugin may raise a gate. No plugin may lower one.**

Specifically, a plugin cannot grant itself automatic approval for an irreversible action, reduce a
threshold below the core's floor, remove a required approver, or mark its own transition verified.
If that were a plugin choice, the system's safety would equal that of its least careful plugin.

The core enforces this at load, not at run time. A plugin declaring a weakened gate fails to load
with one clear reason.

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
- Removing a plugin restores exactly the prior core behavior.
- A transition blocked by missing facts is distinguishable in the record from one blocked by a
  failed check.

## Open Questions

- Whether gates should be expressible in an existing policy language rather than a bespoke shape.
- Whether plugins need a read-only view of the record, or only write access.

## Change Log

- 2026-09-19: First draft.
