---
id: review.decision-providers-design-reconciliation
title: Decision Providers Design Reconciliation
type: review
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Reconciles the requested Opus 5.5 medium review of interchangeable providers and supplied-image evaluation.
---

# Decision providers design reconciliation

Owners: [specification](../specs/engine-decision-providers-and-image-evaluation.md) and
[implementation plan](../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md).
The operator authorized documentation, independent review, reconciliation and a later simplification
pass. Runtime implementation and live experiments remain outside this authorization.

## Review evidence

Claude Opus 5.5 (`claude-opus-5-5`) completed the initial read-only review at medium effort, with
fallback disabled. Its audit reports exit 0, no timeout, a written review and no workspace changes.
The first restricted invocation failed before producing a review; the successful retry used the
existing Claude login. Raw assignments, responses and audits stay outside this reusable checkout.

The initial candidates had SHA256:

- Specification: `a0ada406a936ad18c6a311c13d7217efdd3b481cd4165810d05fd3a650f0bff2`.
- Plan: `bb5895fcdfc6e80735f2c876f2320bd9d1b11db5196f869d21c0b6ce0e688154`.

## Findings and decisions

| Finding | Disposition and smallest correction |
| --- | --- |
| DR-1 — Generic entry representation | Accepted the gap, with a simpler representation than the suggested catalog exception. Typed registered/supplied admission branches feed one private runtime lifecycle. Supplied definitions stay request-local; generic enablement fixes advice-only effects and has no shadow/baseline mode. |
| DR-2 — Caller-created spending scopes | Accepted. Every generic dispatch charges one host-derived workspace/UTC-day aggregate in the existing store. Callers provide operation identity and optional verified provenance, never a new spending window. No session/run sublimits in v1. |
| DR-3 — Check credentials are filtered | Accepted. Declare credential names on the custom command and forward through both detached worker startup and native command launch using existing credential owners. Support the standard OpenAI key name. Installed canary proof exercises actual filtering and checks retained artifacts. |
| DR-4 — Supplied disclosure class | Accepted. One explicit supplied-evidence grant covers inline text and all request text/images; image paths also require approved roots. Registered source permissions remain unchanged. No content classifier or arbitrary source reader. |
| DR-5 — Layout and effect compatibility | Accepted. Capabilities include layouts; OpenAI rejects isolated per-question evidence with zero dispatch. Registered swaps are shadow-only in this delivery. Generic advice remains usable; lifting registered effects is a later accepted, qualified change. No new qualification registry. |
| DR-6 — Claimed legacy parser change | Rejected as a source misreading. `decision-schema.ts` already catches malformed individual answers and preserves others; wrong envelope/model/extra question can invalidate the batch. `decision-schema.test.ts` already covers this distinction. The spec now states preservation explicitly. |
| DR-7 — Model relationship | Accepted. Initially accept returned `gpt-6-luna` for that request; later snapshots require exact documented adapter mappings. No invented prefix/date rule or immutable-weights claim. |
| DR-8 — Store coexistence | Accepted. A typed evaluation namespace encodes at the current version-2 store boundary using reserved keys. Task encodings remain unchanged. Storage keys never become task IDs; no schema bump or second store. |
| DR-9 — Image preparation/pacing | Accepted. Preserve JEV token preparation/pacing; extend the existing pool for OpenAI byte/image bounds and call/concurrency pacing. Image token estimate is null; native usage supplies observed cost, without a pre-dispatch dollar guarantee. |
| DR-10 — Outcome/provider identity | Accepted. New version-3 receipts use baseline/provider delivery plus explicit provider/adapter identity. The owner projects old JEV receipts without rewriting them. Provider-aware telemetry/cost readers and their existing tests are part of B1. |
| DR-11 — Duplicate source and pilot proof | Accepted. B3 runs the engine source suite once. The exact archive verifier already includes the installed decision pilot; extend that constituent proof instead of duplicating it. |
| DR-12 — Common/native answer fields | Accepted. Name required native and common fields. Score preserves native score, computed weighted expectation, confidence, full distribution and request-bound legend. OpenAI supplies labeled indexed probabilities; no invented native legend/confidence. |

## Closure boundary

The first focused Opus 5.5 medium recheck closed all twelve original findings and explicitly
confirmed the DR-6 correction. Its audit reports successful read-only completion with no workspace
changes. It found one new material edge: a daily spending window must not reset an interrupted
evaluation's dispatch identity. The documents now require a durable workspace/evaluation-ID claim,
including admitted request identity, atomically retained independently of daily charges. They also
clarify exact credential names, per-command missing values, window closure and version-3 public
presentation proof. The final focused Opus 5.5 medium recheck closed N-1 and those clarifications,
found no new material contradictions, and reported all design blockers resolved. Its audit confirms
successful read-only completion, fallback disabled and no workspace changes. The optional retention
note is incorporated: v1 retains dispatch claims within existing capacity; future pruning must not
silently make an old ID dispatchable again.

The [separate simplification pass](2026-10-06-decision-providers-simplification.md) follows this
reconciliation. This is design closure only. Source batches,
installed execution, live beta compatibility, visual accuracy, required-gate adoption and accepted-task
benefit remain unproved. All implementation and verification boxes remain unchecked.
