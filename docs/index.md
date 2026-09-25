---
id: docs.index
title: Documentation Index
type: guide
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-09-25
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

## Unified development direction

For the next delivery sequence, start with the
[decision-layer delivery, release and pilot measurement plan](exec-plans/active/2026-09-21-major-adoption-and-measurement.md).
The explicit-preview implementation has a recorded closeout; routine reading should not treat older
pending checkpoints as new work. The first RC includes eight optional decision consumers. The
[RC3 experiment specification](specs/engine-decision-experiments.md) and the delivery plan’s N0–N6
slices add attention advice, read-only diagnostic sequences and offline history analysis. Next,
[RC4 quality evaluation, routing and CI advice](specs/engine-decision-rc4.md) follows the same plan’s
R0–R6 slices: governed entry, fixed model defaults, opt-in routing, requirement-linked quality
and richer CI recommendations. Deliberate adoption compares ordinary automation with JEV-enabled
work and records authorized fallback or missing exposure. Successive consumer batches repeat this
release/update/measurement cycle before the selected stable-major launch.
The [September research reconciliation](research/2026-09-21-jev-agentic-development.md) and
[RC4 simplification pass](reviews/2026-09-21-rc4-simplification.md) prioritize existing context/output
selection and simple operator-defined category mappings, with fixed-model operation by default.

The [architecture decision register](specs/unified-development-engine.md) and
[transition plan](exec-plans/active/2026-09-20-unified-development-engine.md) describe the accepted
move to a unified engine. The [migration inventory](reference/2026-09-20-engine-migration-inventory.md)
records established intent, category treatments and the next decisions. Mnemos integration needs are
designed now, adoption later; RN iOS simulator qualification is followed by RN real devices.
The [local-CI contract](specs/engine-local-ci-and-merge-contract.md) makes execution placement independent
of proof requirements and integrates both remote and already authorized local CI paths.
The [capability pressure test](specs/engine-capability-boundaries.md) keeps future release support
optional; additional adopter stacks inform core design without expanding first-iteration delivery. The runtime
and distribution described above remain the current implementation until accepted cutover.

The [Opus 5 extra-high review reconciliation](reviews/2026-09-20-unified-engine-reconciliation.md)
records the latest design corrections, remaining decisions and limits of the review evidence.

## Continuity

The [continuity module](../components/harness/README.md) owns task history and bounded resume.
It is part of this governance product and wheel; policy and process supervision retain their existing
owners. See the [process map](../components/harness/docs/architecture/development-flow.md).

The [ordinary task context contract](specs/engine-task-context-entry.md) and [corrective implementation plan](exec-plans/active/2026-09-22-task-context-entry.md) close the gap between enabled decisions and normal task use.
The [RC6 prompt retrieval contract](specs/engine-rc6-linked-retrieval.md) and its
[implementation plan](exec-plans/active/2026-09-23-rc6-linked-retrieval.md) define automatic entry,
a maintained SQLite repository index, basic source-backed relationships, bounded JEV selection with
expansion and ordinary-task qualification. The earlier transient-index candidate is the comparison
baseline; the expanded implementation is complete and release sign-off is in progress. The
[configuration guide](guides/rc6-prompt-context.md) separates local retrieval, hosted disclosure,
host trust and measured use.
The [repository-index research](research/2026-09-25-repository-index-harness-practices.md) compares
current harness practices and explains the bounded first iteration accepted for RC6; its wider
research alternatives remain outside the release scope.
The [RC6 design review](reviews/2026-09-25-rc6-index-design-reconciliation.md) records the Opus 5.5
medium reconciliation and worktree/database boundaries. The
[accepted simplifications](reviews/2026-09-25-rc6-index-simplification.md) reduce implementation
overhead while retaining the feature scope. The
[source-control and Codex workflow guide](developer/guides/source-control-and-worktrees.md) explains
worktree ownership, reviewed integration, coordinated upgrades and cleanup.
