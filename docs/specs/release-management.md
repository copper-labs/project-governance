---
id: spec.harness.release-management
title: Release Management Plugin
type: spec
status: draft
owner: project-harness
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
- **Ledger:** [Research index](../research/concept.md).

## Scope

Split by what can be proven independently, because preparation and execution have completely
different risk.

- **Read-only preparation.** Collect current release facts, preserve existing checker receipts, and
  render a reviewable packet. This needs no gate engine, no tuned thresholds, no worker dispatch and
  no classifier. It is separable and is the clearest measurable saving available.
- **Gated execution.** The state machine, its gates, and real transitions. Late, and separately
  authorized.

## Non-Goals

- Automating approval. The goal is preparation, not removal of the approver.
- Reimplementing deploy tooling that already works.
- Serving only one project shape.

## Two Shapes, Related But Not Identical

Artifact publication and environment promotion share an action envelope. They are not the same
subject and must not share every lifecycle rule.

- An **artifact** is immutable. It stays available while environments change around it.
- An **environment's current deployment** is mutable state, and "the same version" is not the same
  fact twice.
- **Publication may be permanently undoable**. Deployment compensation requires new actions and
  cannot be assumed safe - an irreversible migration is not rolled back by redeploying.

The contract models gates generically; it does not hardcode environment names.

```
prepared -> staged -> validated -> candidate -> released -> verified
```

## Gates

| Transition | Deterministic facts | Decision | Approval |
| --- | --- | --- | --- |
| to staged | Mergeability, required checks, conflicts | Batch safety, risk class | Existing repository policy |
| to validated | Smoke results, version drift, migration state, config diff, quotas | Failure triage; environment readiness score | None |
| to candidate | Assembled evidence packet; coverage against the **policy-computed mandatory set** | May add evidence or order collection; may not subtract | Human review |
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
- **The mandatory set is computed from repository policy and exact change facts, never chosen by a
  decision.** A decision may recommend additional evidence or order its collection. It can never
  remove a requirement, and a confident wrong answer cannot produce a complete packet that is
  missing a mandatory type.
- Unknown applicability widens the mandatory set, or records an explicit unresolved requirement that
  blocks the gate. It never resolves to "not required".
- Gate evaluation binds the **policy version in force at evaluation time**. A policy changed after
  a plugin loaded is either used or the evaluation is rejected as stale; it is never silently
  evaluated against the older policy.

## The Packet

The release evidence packet is assembled automatically, including the live facts currently left for
an operator. It is the input to the gate, to the generated promotion plan, and to the record.

The packet is rendered from a deterministic template first. A language model is used only where
narrative synthesis demonstrably helps, measured against that template rather than assumed.

## Invariants And Constraints

- No decision authorizes a transition to released or verified.
- No decision reduces the mandatory evidence set. The policy baseline and its configuration version
  are named in every gate evaluation record.
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
- A forced, confidently wrong decision that omits a mandatory evidence type still leaves the gate
  blocked.
- Policy changed after plugin load is either honored at evaluation or the evaluation is rejected as
  stale; static load validation alone is not accepted as proof.

## Open Questions

- Whether the evidence catalog belongs to the plugin or to the adopting repository.
- Whether promotion readiness should be evaluated continuously after every merge from the start,
  or only on request until the gates are trusted.

## Change Log

- 2026-09-19: First draft.
