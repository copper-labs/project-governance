---
id: docs.index
title: Documentation Index
type: guide
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-09-06
summary: Entry point for the reusable, package-based project governance runtime.
---

# Documentation Index

`project-governance` provides a small, project-neutral runtime for checking changed work. Markdown
is the current authority for its policies, guides, and configuration. The runtime is distributed as
one wheel; each adopting repository pins one exact wheel and SHA256 in its runtime lock. Adoption
is deliberate by default, with an optional compatible-update policy for top-level task startup.

## Start Here

- [System spine](system-spine.md) explains the ownership boundary and normal workflow.
- [Runtime specification](specs/governance-kernel.md) defines the CLI, pack selection, findings,
  process handling, and configuration boundary.
- [Runtime architecture](architecture/governance-runtime.md) explains what belongs in the
  wheel and what remains target-owned.
- [Operator guide](guides/user-guide.md) explains bootstrap, routine checks, and deliberate
  upgrades.
- [Startup update guide](guides/startup-runtime-updates.md) explains one-time Codex opt-in,
  work assessment, isolated local commits, and recovery.
- [Developer documentation](developer/index.md) provides progressive evaluator/operator and
  source-contributor journeys plus the shared agent catalog.
- [Validation strategy](governance/validation-strategy.md) defines narrow proof by default and the
  few situations that require broader proof.
- [Change narrative contract](specs/change-narrative-contract.md) defines the product-level and
  conceptual context required before a reader opens a commit or pull request diff.
- [KMP Surface Validation](specs/kmp-surface-validation.md) defines the opt-in contract that maps
  selected cross-surface KMP capabilities through an adopter-owned target catalog, the existing pack
  runner, shallow routes, and guarded target-local proof.
- [KMP skill inventory](reference/kmp-skill-inventory.md) records the current Kotlin Multiplatform
  capability surface, provenance, overlap, and known quality gaps.
- [Pre-V0 KMP skill quality audit](reference/kmp-skill-quality-audit.md) preserves the whole-of-KMP
  assessment and disposition that informed the current seven-entry replacement.
- [KMP V0 evaluation](reference/kmp-skill-v0-evaluation.md) records the cross-provider promotion
  decision, selected-body digests, corrections, and residual consumer-proof risks.

## Reference Areas

The [Test Execution contract](specs/test-execution.md) defines direct/external proof, deterministic
batches, Codex/Claude completion handoff and bounded usage observations.

The [optional provider agent contract](specs/provider-agent-skills.md) defines the standalone
Gemini, Claude, and Codex wrappers in 2.4.0, including the scoped Gemini live-validation exception.

- [Governance policies](governance/README.md) cover packs, hooks, context routing, quality, and
  bootstrap rules.
- [Specifications](specs/README.md) contain the active generic contracts.
- [Guides](guides/README.md) provide task-oriented instructions for operators and agents.
- [Decisions](decisions/README.md) records durable generic boundary decisions.

## Boundaries

This repository does not contain a customer's source paths, build commands, runtime evidence,
credentials, product vocabulary, or target-specific checks. Those remain in the adopting
repository. Publishing a wheel requires an operator decision. An adopter may authorize compatible
startup updates through its tracked profile; major releases and integration changes remain deliberate.
