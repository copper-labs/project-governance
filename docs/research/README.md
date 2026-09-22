---
id: research.index
title: Research
type: research
status: draft
owner: project-governance
created: 2026-09-18
updated: 2026-09-21
summary: Exploratory work that is not yet a specification, plan, or decision.
---

# Research

Exploratory notes on ideas that may or may not become work. Nothing here is authoritative. A page
graduates into `docs/specs/`, `docs/prds/`, or `docs/decisions/` if it earns it, and is deleted if
it does not.

## Decision-First Harness

The entries in this section are historical rationale. Their draft specs and phase plans are
superseded by [current module contracts](../../components/harness/docs/specs/README.md) and the
[S1–S9 adoption plan](../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md).
Divergent copies under the module research directory are also historical; neither is a second authority.

A harness and governance system whose control plane runs on a decision model rather than an LLM.

- [Concept, risks and sequence](2026-09-18-decision-first-harness.md) - start here.
- [The flow, end to end](decision-first-harness/flow.md)
- [Builds and checks](decision-first-harness/builds-and-checks.md)
- [Release management as a plugin](decision-first-harness/release-management.md)
- [Portal case study](decision-first-harness/portal-case-study.md)

### Contracts and plans

- [Specifications](decision-first-harness/specs/README.md) - umbrella plus focused child contracts.
- [Master plan](decision-first-harness/plans/README.md) - phases 0 to 5 with exit evidence.

## September JEV research

- [Agentic development research and RC4 reconciliation](2026-09-21-jev-agentic-development.md)
  compares primary sources on evidence selection, task categories, evaluations, harnesses and CI.
- The [RC4 specification](../specs/engine-decision-rc4.md) owns accepted behavior; the
  [simplification review](../reviews/2026-09-21-rc4-simplification.md) records scope and tradeoffs.
