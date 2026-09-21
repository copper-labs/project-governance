---
id: research.harness.release-management
title: Release Management Plugin
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Release and promotion modelled as one gated state machine, delivered as the first plugin instance.
---

> Child of [Decision-First Harness Core](harness-core.md), instance of [Plugin Contract](plugin-contract.md).

# Release Management Plugin

## Purpose

Model release and promotion as states and gates rather than as a growing collection of per-release
scripts and hand-written plans.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** One adopting project already implements this by hand: declarative
  environment gates, review-lane policy, a family of evidence checkers, an evidence-packet builder
  that leaves live facts for an operator to fill, and a bespoke promotion plan per release.
- **Evidence:** none for the plugin.
- **Known limits:** This is the last phase deliberately. A wrong decision here costs an incident,
  not a cycle.
- **Ledger:** [Research index](../../README.md).

## Scope

- The state machine and its gates.
- The evidence catalog that replaces per-release checkers.
- The packet that feeds both the gate and the generated plan.

## Non-Goals

- Automating approval. The goal is preparation, not removal of the approver.
- Reimplementing deploy tooling that already works.
- Serving only one project shape.

## Two Shapes, One Machine

Artifact publication and environment promotion are the same machine with different states. The
contract models gates generically; it does not hardcode environment names.

```
prepared -> staged -> validated -> candidate -> released -> verified
```

## Gates

| Transition | Deterministic facts | Decision | Approval |
| --- | --- | --- | --- |
| to staged | Mergeability, required checks, conflicts | Batch safety, risk class | Existing repository policy |
| to validated | Smoke results, version drift, migration state, config diff, quotas | Failure triage; environment readiness score | None |
| to candidate | Assembled evidence packet, complete catalog coverage | Which evidence types apply | Human review |
| to released | Candidate verified, approvals present | **None** | Human, always |
| to verified | Post-deploy signals against declared thresholds | Health classification | Threshold, not a model |

The rollback trigger is a declared threshold in code. A decision may raise a flag earlier. It may
never pull the lever.

## The Evidence Catalog

Per-release evidence checkers are replaced by declared evidence types evaluated by one evaluator.
A type declares what it proves, how it is produced, which changes require it, and how long it stays
valid.

- Existing checkers are harvested into catalog entries, not deleted. Each encodes a real lesson.
- Checkers bound to a shipped release version are retired explicitly.
- A new concern adds a catalog entry, not a script and a test.
- Which types a change requires is a routing decision against the catalog, recorded.

## The Packet

The release evidence packet is assembled automatically, including the live facts currently left for
an operator. It is the input to the gate, to the generated promotion plan, and to the record.

Generating the promotion plan from the packet is the one place a language model clearly belongs in
this path: prose over known content.

## Invariants And Constraints

- No decision authorizes a transition to released or verified.
- Existing environment approval settings are inherited untouched and never relaxed.
- Evidence is bound to the exact subject it was produced for; a moved or changed subject invalidates it.
- The plugin wraps existing deploy tooling and owns none of it.
- An unavailable fact is never treated as a satisfied gate.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Evidence expired or subject-mismatched | Gate blocked with the exact mismatch |
| Catalog coverage incomplete for a change | Gate blocked, missing types named |
| Live fact unavailable | Gate blocked; never assumed |
| Post-deploy signal breaches threshold | Declared rollback path, no decision involved |

## Validation Requirements

- One staging promotion executed end to end through the gate model, recorded, and compared against
  the hand-written runbooks it replaces.
- A generated promotion plan reviewed against a prior hand-written one for completeness.
- A gate with a missing fact blocks in a focused test.

## Open Questions

- Whether the evidence catalog belongs to the plugin or to the adopting repository.
- Whether promotion readiness should be evaluated continuously after every merge from the start,
  or only on request until the gates are trusted.

## Change Log

- 2026-09-19: First draft.
