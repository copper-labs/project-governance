---
id: review.decision-first-simplification-candidates
title: Decision-First Cleanup and Flexibility Decisions
type: review
status: current
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Accepted balanced dispositions for cleanup, flexibility and progressive implementation.
---

# Cleanup and flexibility decisions

The operator accepted the balanced dispositions below after reviewing the simplification candidates.
Evaluate development benefit (accuracy, token use and feedback time), concrete flexibility, reliability,
and implementation/operating cost. Flexibility wins when its potential benefit earns its cost.
Simplicity alone does not justify removing capability. These are specification changes, not delivered
runtime behavior; historical Opus review artifacts remain unchanged.

| Area | Accepted disposition | Timing and evidence |
| --- | --- | --- |
| Duplicate guidance and plans | Consolidate normative rules under their specifications and keep S1–S9 as the single sequence. Preserve historical research/reviews. | Address now; replace duplicate batch sketches with owner links and retain their unique acceptance details. |
| Savings forecasts | Remove unmeasured percentage forecasts from active guidance. Keep explicit benefit targets derived from baselines before experiments. | Address now; S2 records usage coverage, variability and thresholds. No retrofitted winning threshold. |
| Runner interface | One convenient entry point with inspectable stages, results and owner-supported cancellation/retry/recovery. Do not hide needed controls or mirror the owner's full state machine. | S4 diagnoses reliability first, then chooses reuse/repair/replacement and proves partial capability behavior. |
| Telemetry storage | Compare reuse and separate storage; preserve required observations, joins, retention, failure isolation and frozen comparisons. | S2 records the tradeoff and decision. A separate store is justified when it earns its maintenance cost. |
| Shadow evaluation | Keep comparison on real workloads. Do not assume offline replay replaces live shadow. | S7 chooses runtime/evaluator placement with named ownership, bounded work and complete accounting; measure added overhead. |
| Provider health | Keep cross-process outage/auth suppression and immediate baseline fallback. Choose storage independently. | S7 compares existing advisory storage with a small file and proves reset, concurrency and failure behavior. |
| Source indexing | Preserve a discovery interface and progressive direct-search/map/symbol/embedding path. | S3 establishes baseline; S8 adds layers for measured cost or retrieval misses, independently of JEV. |
| Platform support | Native, React Native, Flutter and other required surfaces are progressive delivery requirements. Keep framework, OS, target and transport separate. | S4–S6 qualify each prioritized adopter lane. One required consumer can justify a concrete adapter gap; no speculative plugin framework. |

The proposed `auto` rename and `.env.example` removal are not adopted. Keep current names and
optional setup documentation until an actual usability or maintenance issue warrants a change.

## Preserved requirements

Immediate no-account/no-token fallback, a complete deterministic path, mandatory evidence, durable job
identity, cleanup and source/binary/target binding stay intact. Simulator and physical-device proof
remain separate. A model may advise on unresolved diagnostics; known process/service recovery belongs
in code. Measure accepted-work outcomes, including rework, rather than crediting fewer log messages.

## Authoritative owners

- [Implementation sequence](../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md): slices, dependencies and exits.
- [Development loop](../../components/harness/docs/specs/development-loop.md): runner control and platform qualification.
- [Measurement](../../components/harness/docs/specs/measurement-and-qualification.md): storage decision, baselines and evaluation.
- [Decision interface](../../components/harness/docs/specs/decision-interface.md): provider modes and shadow behavior.
- [Operational storage](../../components/harness/docs/specs/operational-store.md): provider-health behavior.
- [Discovery](../../components/harness/docs/specs/repository-discovery.md): progressive retrieval/index boundary.

This acceptance supersedes the earlier candidate recommendations. It does not certify new runtime
capabilities or extend the scope of the earlier [independent review](2026-09-19-decision-first-reconciliation.md).
