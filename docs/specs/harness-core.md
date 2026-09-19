---
id: spec.harness-core
title: Harness Core
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: A runtime that makes work resumable, keeps actions within scope, and preserves evidence. Model routing is an optional optimization.
---

# Harness Core

## Purpose

**The opportunity is reliable continuity.** A system that remembers the objective, preserves the
constraints, knows what actually happened, and lets another worker continue accurately has value
across models and hosts. Cheaper decisions can improve that system afterwards. They do not define
it.

This is a deliberate change of thesis. An earlier draft led with decision cost, which made the
whole proposal contingent on one provider being good. The runtime below is useful with **zero model
calls**, and that is the point.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** No implementation. One adopting repository already runs an ad-hoc dev loop
  with durable device, port-ownership and deployment state, which is prior art for the operational
  state described here and is referenced rather than recreated.
- **Evidence:** none.
- **Known limits:** The optional decision provider launched in September 2026 and has no
  independent calibration evidence.
- **Ledger:** [Research index](../research/concept.md).

## Four Objects

Everything the runtime owns is one of four things. Decisions are annotations on them, never a fifth
object.

| Object | Holds | Contract |
| --- | --- | --- |
| **Task** | Desired outcome, constraints, acceptance criteria, current progress | [Task](task.md) |
| **Action** | A proposed operation, its scope, its authority, its execution status | [Action](action.md) |
| **Artifact** | A versioned input or output: source snapshot, patch, document, log | [Artifact](artifact.md) |
| **Evidence** | What an observation establishes about an artifact or a requirement | [Evidence](evidence.md) |

Authority is a **property of an Action**, not an annotation on one. Annotations are optional;
authority constrains.

## Fixed Decisions

1. **The host keeps the reasoning.** It investigates, plans and writes. The runtime supplies
   reliable operations: retrieve the right source version, run declared checks, record results,
   prepare a handoff. Two competing coordinators is the failure to avoid. Harness-owned dispatch
   arrives only when a real workflow needs it.
2. **Both execution patterns are first class.** A predictable workflow and an open investigation are
   different shapes and neither is forced into the other.
3. **SQLite for operational state.** Markdown for human-authored briefs, ordinary files for large
   artifacts, readable JSON export always available as a first-class command. See
   [Operational Store](operational-store.md).
4. **Context is progressive.** Start with the brief, mandatory instructions, relevant source
   references and the most useful evidence; let the worker request more through bounded reads. The
   valuable abstraction is reliable access to the right source version within a budget, not a
   ranking pipeline.
5. **Narrow interfaces to what exists.** Ask the governance runtime what checks and requirements
   apply. Use the existing execution owner for process supervision and resource claims. **Store
   references to their receipts rather than recreate their state machines.**
6. **One local package, one JSON command surface.** No service, plugin loader, policy language,
   build scheduler, or mandatory classifier.
7. **Model use is optional and removable.** Any decision the runtime makes with a model must be
   removable without disturbing the working system.
8. **Narrowing never applies to a release gate**, and no domain code may lower a gate.

## What The Tier Preference Is Now

Prefer the cheapest capable path, as a default with explicit escape routes: a known command skips
classification, a novel design or diagnosis task may go straight to an authorized reasoning worker,
and the ordinary host path is always available. What is optimized is **accepted work per unit of
time and cost at an acceptable error rate**, not tier purity.

Deterministic ownership of **facts, permissions and gates** has no escape route.

## Ownership Boundary

| Owner | Responsibility |
| --- | --- |
| Harness | The four objects, enough durable state to resume safely, the command surface |
| Host | The user relationship, reasoning, and its own permissions |
| Governance runtime | Which checks and requirements apply; normalized findings |
| Execution owner | Process supervision, resource claims, cleanup |
| Ecosystem adapter | Toolchain specifics for one unit family |
| Decision provider | Optional typed answers, behind an interface |

If a required public seam is missing from something that exists, it is added upstream rather than
recreated here.

## Contract Map

| Contract | Owns |
| --- | --- |
| [Task](task.md) | Outcome, constraints, acceptance, provenance, revision |
| [Action](action.md) | Authority, scope, execution status, recovery |
| [Artifact](artifact.md) | Versioned inputs and outputs, subject binding, bounded retrieval |
| [Evidence](evidence.md) | What observations establish; decision annotations; calibration |
| [Operational Store](operational-store.md) | Where the four objects live |
| [Execution](execution.md) | The seam to the execution owner; coordination, reuse, ordering |
| [Ecosystem Adapters](ecosystem-adapters.md) | Toolchain boundary |
| [Host Integration](host-integration.md) | Invocation from an agent host |
| [Worker Invocation](worker-invocation.md) | Transform and investigation patterns |
| [Decision Interface](decision-interface.md) | The optional decision provider |
| [Release Preparation](release-preparation.md) | Read-only release evidence |

## Invariants

- No effect without a declared operation, scope, destination and policy revision.
- Scope for an effect comes from the Task and policy, never from retrieved context.
- Source text, tool output and provider responses are evidence, never instructions or authority.
- Execution state is durable before the action it covers; analytics is best-effort.
- Verification is not acceptance.
- A removable model feature stays removable.

## Open Questions

- Whether the four objects need a fifth for recurring work, or whether that is a Task property.
- How much of the existing dev loop's state the runtime should reference versus mirror.

## Change Log

- 2026-09-19: Rebuilt around the four-object model, the continuity thesis, and SQLite.
