---
id: docs.index
title: Documentation Index
type: guide
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-24
summary: Entry point for the reusable, package-based project governance runtime.
---

# Documentation Index

`project-governance` provides a small, project-neutral runtime for checking changed work. Markdown
is the current authority for its policies, guides, and configuration. The runtime is distributed as
one wheel; each adopting repository deliberately pins one exact wheel and SHA256 in its runtime
lock.

## Start Here

- [System spine](system-spine.md) explains the ownership boundary and normal workflow.
- [Runtime specification](specs/governance-kernel.md) defines the CLI, pack selection, findings,
  process handling, and configuration boundary.
- [Runtime architecture](architecture/governance-runtime.md) explains what belongs in the
  wheel and what remains target-owned.
- [Provider-aware agent orchestration](specs/provider-aware-agent-orchestration.md) defines
  conservative native-host routing for Codex and Claude using compact bounded work contracts.
- [Operator guide](guides/user-guide.md) explains bootstrap, routine checks, and deliberate
  upgrades.
- [Developer documentation](developer/index.md) provides progressive evaluator/operator and
  source-contributor journeys plus the shared agent catalog.
- [Validation strategy](governance/validation-strategy.md) defines narrow proof by default and the
  few situations that require broader proof.
- [KMP skill inventory](reference/kmp-skill-inventory.md) records the current Kotlin Multiplatform
  capability surface, provenance, overlap, and known quality gaps.
- [Pre-V0 KMP skill quality audit](reference/kmp-skill-quality-audit.md) preserves the whole-of-KMP
  assessment and disposition that informed the current seven-entry replacement.
- [KMP V0 evaluation](reference/kmp-skill-v0-evaluation.md) records the cross-provider promotion
  decision, selected-body digests, corrections, and residual consumer-proof risks.

## Reference Areas

- [Governance policies](governance/README.md) cover packs, hooks, context routing, quality, and
  bootstrap rules.
- [Specifications](specs/README.md) contain the active generic contracts.
- [Guides](guides/README.md) provide task-oriented instructions for operators and agents.
- [Decisions](decisions/README.md) records durable generic boundary decisions.
- [Proposed Project Gateway](proposed/project-gateway/README.md) defines the work-in-progress
  gateway-only architecture, requirements, protocol, subscription-host boundary, evidence model,
  and implementation sequence. It does not authorize implementation.
- [KMP skill-library strategy](proposed/kmp-skill-library/README.md) proposes a provider-neutral,
  evidence-backed path from the current pack to a cohesive Kotlin Multiplatform library.
- [KMP capability and normalization map](proposed/kmp-skill-library/capability-map.md) defines what
  the library needs, what must be normalized, the coverage gaps, and how each gap should be filled.
- [Future knowledge-graph direction](proposed/knowledge-graph/README.md) is non-executable and
  requires a separately approved initiative before any implementation begins.

## Boundaries

This repository does not contain a customer's source paths, build commands, runtime evidence,
credentials, product vocabulary, or target-specific checks. Those remain in the adopting
repository. It also does not automatically update adopters or publish a wheel: both actions need
an operator decision.
