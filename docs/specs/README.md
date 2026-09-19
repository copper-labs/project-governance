---
id: spec.harness.index
title: Decision-First Harness Specifications
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Draft contract family for the decision-first harness, held in research until its owning repository is decided.
---

# Decision-First Harness Specifications

Draft contracts, revised against [the secondary review](../reviews/2026-09-19-secondary-review.md);
see [the reconciliation](../reviews/2026-09-19-reconciliation.md) for what changed and why. Not yet
accepted policy.

This family now lives in its own repository. The harness consumes the governance runtime through
that runtime's published CLI and JSON surface only.

Start with [the umbrella](harness-core.md). It carries the tier rule, the fixed decisions, and the
contract map.

| Specification | Purpose |
| --- | --- |
| [Harness Core](harness-core.md) | Ownership boundary, tier rule, fixed decisions, invariants |
| [Task Lifecycle](task-lifecycle.md) | Request identity, writer ownership, staleness, verification binding |
| [Host Integration](host-integration.md) | Invocation from Codex, Claude Code, and Cowork |
| [Decision Interface](decision-interface.md) | Question shapes, confidence, escalation, provider abstraction |
| [State Store](state-store.md) | Task and decision state, file-based v0, substrate boundary |
| [Decision Record](decision-record.md) | Record shape, outcome attachment, calibration |
| [Context Packet](context-packet.md) | Candidate generation, narrowing, budgets, packet shape |
| [Worker Invocation](worker-invocation.md) | Stateless worker contract and model-tier routing |
| [Ecosystem Adapters](ecosystem-adapters.md) | Toolchain boundary for KMP, TypeScript, and Python targets |
| [Build Orchestration](build-orchestration.md) | Build identity, lock, staged ladder, lane selection |
| [Failure Triage](failure-triage.md) | Failure taxonomy, remedies, retry bounds |
| [Plugin Contract](plugin-contract.md) | How optional capability attaches without weakening gates |
| [Release Management](release-management.md) | The release plugin instance |

Plans live in [../exec-plans/](../exec-plans/README.md).
