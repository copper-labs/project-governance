---
id: research.harness.index
title: Decision-First Harness Specifications
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Draft contract family for the decision-first harness, held in research until its owning repository is decided.
---

> Historical research only. Superseded by the [current module contracts](../../../../components/harness/docs/specs/README.md) and [S1–S9 plan](../../../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md). The separate-product and migration language below records an abandoned proposal, not current instructions.


# Decision-First Harness Specifications

Draft contracts, not accepted policy. They live under research deliberately: this repository's
charter keeps it project-neutral with no model invocation path, and the harness is a different
product. When its owning repository is settled, the family moves intact.

Start with [the umbrella](harness-core.md). It carries the tier rule, the fixed decisions, and the
contract map.

| Specification | Purpose |
| --- | --- |
| [Harness Core](harness-core.md) | Ownership boundary, tier rule, fixed decisions, invariants |
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

Plans live in [../plans/](../plans/README.md).
