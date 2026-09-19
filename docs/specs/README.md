---
id: spec.harness.index
title: Harness Specifications
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Contracts for a runtime that makes work resumable, keeps actions in scope, and preserves evidence.
---

# Harness Specifications

Draft contracts, revised against two independent reviews and one greenfield critique. Not yet
accepted policy. See [the reconciliations](../reviews/) for what changed and why.

**The thesis is continuity**, not decision cost. The runtime is useful with zero model calls;
model routing is an optional optimization that must stay removable.

Start with [the umbrella](harness-core.md). Everything the runtime owns is one of four objects.

## The Four Objects

| Contract | Holds |
| --- | --- |
| [Task](task.md) | Desired outcome, constraints, acceptance criteria, progress |
| [Action](action.md) | A proposed operation, its scope, authority and execution status |
| [Artifact](artifact.md) | A versioned input or output, bound to an exact source version |
| [Evidence](evidence.md) | What an observation establishes, and decision annotations |

## Supporting Contracts

| Contract | Purpose |
| --- | --- |
| [Harness Core](harness-core.md) | Thesis, fixed decisions, ownership boundary, invariants |
| [Operational Store](operational-store.md) | SQLite for state, Markdown for briefs, files for artifacts |
| [Concurrency](concurrency.md) | Several conversations in one worktree; modes; overlap detection |
| [Execution](execution.md) | The seam to the existing execution owner; coordination, reuse, ordering |
| [Ecosystem Adapters](ecosystem-adapters.md) | Toolchain boundary across Kotlin, npm and Python units |
| [Host Integration](host-integration.md) | Invocation from an agent host |
| [Worker Invocation](worker-invocation.md) | Transform and investigation patterns |
| [Decision Interface](decision-interface.md) | The optional decision provider |
| [Failure Triage](failure-triage.md) | A candidate first decision, if the evidence points there |
| [Release Preparation](release-preparation.md) | Read-only release evidence |

## Retired

`task-brief`, `task-lifecycle`, `action-authority`, `decision-record`, `context-packet`,
`state-store`, `build-orchestration` and `plugin-contract` were folded into the four objects or
retired. Their content is in git history. The gate invariant that `plugin-contract` carried now
lives in [the umbrella](harness-core.md), independent of any plugin mechanism.

Plans live in [../exec-plans/](../exec-plans/README.md).
