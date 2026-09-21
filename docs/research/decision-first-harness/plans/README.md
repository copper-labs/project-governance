---
id: research.harness.master
title: Decision-First Harness Master Plan
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Sequenced phases for the decision-first harness, each with its own child plan and exit evidence.
---

> Historical research only. Superseded by the [current module contracts](../../../../components/harness/docs/specs/README.md) and [S1–S9 plan](../../../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md). The separate-product and migration language below records an abandoned proposal, not current instructions.


# Decision-First Harness Master Plan

All phases are governed by [the umbrella contract](../specs/harness-core.md), whose fixed decisions
and invariants no phase may revisit.

Draft, pending independent review. Child plans follow the canonical implementation-plan template;
they become `active` one at a time, as the phase before them produces its exit evidence.

## Final State

A harness that makes the loop's decisions outside a language model, invoked from the agent host the
operator already uses, recording every decision and outcome to files, and proven against recorded
baselines rather than intuition.

**Non-goals for this plan:** a standalone front door, a desktop application, a substrate migration,
a plugin ecosystem, and any change to what the governance runtime owns.

## Delivery

- Delivery: local-only

## Ordering Principle

Cheapest and most reversible first; irreversible last. Each phase also produces the evidence the
next one needs, so the order is not only about risk.

Phases 0 and 1 do not require the harness to exist as a product. They are scripts. Building a CLI
to discover whether the idea works would invert the whole argument.

| Phase | Plan | Exit evidence | Owning specs |
| --- | --- | --- | --- |
| 0 | [Measure](phase-0-measure.md) | Accuracy and calibration per question on our own decisions | [Decision Interface](../specs/decision-interface.md) |
| 1 | [Build hygiene](phase-1-build-hygiene.md) | No colliding or duplicate builds; failures arriving earlier; builds recorded | [Build Orchestration](../specs/build-orchestration.md), [State Store](../specs/state-store.md), [Ecosystem Adapters](../specs/ecosystem-adapters.md) |
| 2 | [Decision interface](phase-2-decision-interface.md) | Triage accuracy against recorded outcomes; retries bounded | [Decision Interface](../specs/decision-interface.md), [Failure Triage](../specs/failure-triage.md), [Decision Record](../specs/decision-record.md) |
| 3 | [Harness as a tool](phase-3-harness-as-tool.md) | Packet misses measured and falling | [Host Integration](../specs/host-integration.md), [Context Packet](../specs/context-packet.md), [Worker Invocation](../specs/worker-invocation.md) |
| 4 | [Tighten on evidence](phase-4-tighten-on-evidence.md) | Threshold and map changes justified by the record | [Decision Record](../specs/decision-record.md), [Ecosystem Adapters](../specs/ecosystem-adapters.md) |
| 5 | [Release plugin](phase-5-release-plugin.md) | One gated staging promotion, compared to hand-written runbooks | [Plugin Contract](../specs/plugin-contract.md), [Release Management](../specs/release-management.md) |

A phase does not start until the prior phase's exit evidence exists. Phase 0 may end the effort.

## Model Class Legend

Batches name a work class from the installed model-selection policy, with the concrete pair from
its default table and the selection source. An explicit operator choice or a project override
replaces these; when it does, the batch records the new pair and its source.

| Work class | Used here for | Default pair |
| --- | --- | --- |
| routine | Clear, bounded work against a settled contract | gpt-5.6-luna, high |
| difficult-implementation | Well-understood approach, demanding implementation | gpt-5.6-luna, xhigh |
| ambiguous-integration | Wiring across components or toolchains | gpt-5.6-terra, high |
| diagnosis-review | Measurement, calibration, consequential review | gpt-5.6-sol, medium |
| deep-reasoning | Taxonomy and contract design with real consequences | gpt-5.6-sol, high |
| major-planning | Unresolved problems and plan revision | gpt-6-astra, low |

Labels are planning guidance, not enforcement. The coordinator applies the policy's precedence
rules at dispatch and records what was actually used.

## Cross-Phase Risks

- **Provider dependence.** The decision interface and its fallbacks exist from Phase 2 precisely so
  that a single hosted provider never becomes load-bearing. A phase that ships a question without a
  fallback has broken the plan.
- **Compounding decisions.** Every phase adds decisions to one loop. Each must stay independently
  checkable by a later deterministic fact.
- **Substrate drift.** Files are the store until a tuned baseline exists. A phase that reaches for
  a richer substrate early is out of scope.
- **Ecosystem leakage.** Anything toolchain-specific that lands in the core is a defect, not a
  shortcut.

## Rollback

Each phase is independently removable in reverse order. The harness is additive: with it absent,
the governance runtime, the build tooling, and the hosts behave exactly as they do today. No phase
introduces a compatibility shim or a second authority for an existing contract.
