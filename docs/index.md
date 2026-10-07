---
id: docs.index
title: Documentation Index
type: guide
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-10-06
summary: Routes current compiled-runtime development and retained installed generations to their owning documentation.
---

# Documentation Index

Current source development produces the compiled TypeScript npm package
`@organta/project-governance`. It combines checks, continuity, workflows, context and evidence.
Markdown owns rationale and rule changes; accepted machine rules have one declaration or code owner.
Existing installations, source Git hooks and shared startup handlers retain their owners until
deliberate cutover. Reading this index or building the package does not change their authority.

## Current Source Work

- [Root source instructions](../AGENTS.md) distinguish compiled development commands from the
  retained Python source Git hook owner. [README](../README.md) describes package setup and proof.
- The approved [4.1 context quality specification](specs/engine-4-1-context-quality.md) and
  [implementation plan](exec-plans/active/2026-10-05-4-1-context-quality.md) record published 4.1,
  exact task/plan linkage and proof mappings. Installed releases remain unchanged until adoption.
- [Developer documentation](developer/index.md) routes current capabilities and labels retained
  journeys. Read the smallest owning specification or plan before editing.
- [Validation strategy](governance/validation-strategy.md) defines focused batch proof and when to
  widen it. [Change narrative contract](specs/change-narrative-contract.md) owns commit and PR context.
- [Charter](../CHARTER.md) defines authority and the rule to remove complexity that does not earn its cost.

## Retained Wheel Journeys

These entries describe the older Python wheel and its installed owners. Use them only for that
generation; their commands and source paths do not select the compiled engine.

- [System spine](system-spine.md) explains the ownership boundary and normal workflow.
- [Runtime specification](specs/governance-kernel.md) defines the CLI, pack selection, findings,
  process handling, and configuration boundary.
- [Runtime architecture](architecture/governance-runtime.md) explains what belongs in the
  wheel and what remains target-owned.
- [Operator guide](guides/user-guide.md) explains bootstrap, routine checks, and deliberate
  upgrades.
- [Startup update guide](guides/startup-runtime-updates.md) explains one-time Codex opt-in,
  work assessment, isolated local commits, and recovery.
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

The retained [optional provider agent contract](specs/provider-agent-skills.md) defines the standalone
Gemini, Claude, and Codex wrappers in 2.4.0, including the scoped Gemini live-validation exception.

- [Governance policies](governance/README.md) cover packs, hooks, context routing, quality, and
  bootstrap rules.
- [Specifications](specs/README.md) contain the active generic contracts.
- [Guides](guides/README.md) provide task-oriented instructions for operators and agents.
- [Decisions](decisions/README.md) records durable generic boundary decisions.

## Boundaries

This repository does not contain a customer's source paths, build commands, runtime evidence,
credentials, product vocabulary, or target-specific checks. Those remain in the adopting
repository. Publishing a runtime requires an operator decision. An adopter may authorize compatible
startup updates through its tracked profile; major releases and integration changes remain deliberate.

## Compiled Runtime Contracts

The proposed [optional computer-use specification](specs/engine-optional-computer-use-testing.md)
and [implementation plan](exec-plans/active/2026-10-06-optional-computer-use-testing.md) define local
Holo grounding, project-owned browser execution and Decisions checkpoint experiments. They include
realistic synthetic scenarios and honest coverage when tools are absent. Runtime and live proof
remain future work.

The approved [decision providers and image evaluation specification](specs/engine-decision-providers-and-image-evaluation.md)
and [implementation plan](exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md)
own 4.2 implementation of interchangeable JEV/OpenAI adapters and a reusable text/image evaluation
operation. The batch plan distinguishes completed source work from installed and live qualification.
Implementation does not enable providers or change an installed release.

The [4.0 verification and semantic review specification](specs/engine-4-verification-feedback.md)
and [delivery plan](exec-plans/active/2026-10-04-major-verification-feedback.md) record the delivered
foundation: installed workflow proof, multilingual JEV advice, focused batch checks,
typed plan/specification links and known-fault detection. The [structured delivery guide](developer/guides/structured-delivery.md)
explains compact batch inspection and deterministic progress updates from original check receipts.
This source work does not replace an installed runtime or certify a release.

The approved [focused linting specification](specs/engine-linting-mvp.md) and
[delivery plan](exec-plans/active/2026-10-05-linting-mvp.md) extend the same check runner with
captured-candidate lint adapters and visible coverage. The [adoption guide](developer/guides/focused-linting.md)
explains reviewed setup, project-local tools and required narrow checks without model calls.

The [release evaluation contract](specs/engine-release-evaluation.md) and
[reporting workstream](exec-plans/active/2026-10-04-release-evaluation.md) define repeatable reliability,
context-quality and whole-task comparisons. The [reporting guide](developer/guides/release-evaluation.md)
explains evidence linkage and explicit unknown coverage. Passive observations stay separate from controlled proof.

The historical [RC10.9 prompt-entry repair](exec-plans/active/2026-10-04-rc10-9-prompt-entry.md) separates
advisory context preparation from retained startup ownership, records safe failure causes and
verifies exact packet-reference replay. Its retained evidence does not qualify the current candidate.

## Migration History

The [decision-layer delivery and pilot measurement plan](exec-plans/active/2026-09-21-major-adoption-and-measurement.md),
[RC3 experiments](specs/engine-decision-experiments.md) and
[RC4 quality, routing and CI advice](specs/engine-decision-rc4.md) preserve earlier delivery decisions.
Their old pending checkpoints are not new source work. The
[September research reconciliation](research/2026-09-21-jev-agentic-development.md) and
[RC4 simplification pass](reviews/2026-09-21-rc4-simplification.md) retain the reasoning behind
context/output advice and fixed-model defaults.

The [architecture decision register](specs/unified-development-engine.md) and
[transition closeout](exec-plans/active/2026-09-20-unified-development-engine.md#implementation-closeout)
record the explicit compiled-engine foundation. The
[migration inventory](reference/2026-09-20-engine-migration-inventory.md)
preserves category treatments and deferred authority changes.
The [local-CI contract](specs/engine-local-ci-and-merge-contract.md) makes execution placement independent
of proof requirements and integrates both remote and already authorized local CI paths.
The [capability pressure test](specs/engine-capability-boundaries.md) keeps future release support
optional; additional adopter stacks inform core design without expanding first-iteration delivery.

The [Opus 5 extra-high review reconciliation](reviews/2026-09-20-unified-engine-reconciliation.md)
records the original design corrections and limits of that review evidence.

## Continuity

The [continuity module instructions](../components/harness/AGENTS.md) own task history and bounded
resume work inside the current root package. Its
[original README](../components/harness/README.md) and
[process map](../components/harness/docs/architecture/development-flow.md) preserve the module's
earlier integration design; their wheel and toolchain descriptions are historical.

## Context Delivery History

The following contracts explain the accumulated context behavior and its original proof. Use the
current 4.1 plan for new work; historical release status and test results are not current proof.


| Original scope | Contract and delivery record |
| --- | --- |
| Ordinary task entry | [Contract](specs/engine-task-context-entry.md), [plan](exec-plans/active/2026-09-22-task-context-entry.md) |
| RC6 automatic entry and maintained index | [Contract](specs/engine-rc6-linked-retrieval.md), [plan](exec-plans/active/2026-09-23-rc6-linked-retrieval.md) |
| RC7 retrieval timing and explicit task changes | [Contract](specs/engine-rc7-prompt-reliability.md), [plan](exec-plans/active/2026-09-25-rc7-prompt-reliability.md) |
| RC8 hook sources and required-context budgets | [Contract](specs/engine-rc8-hook-sources.md), [plan](exec-plans/active/2026-09-25-rc8-hook-sources.md) |
| RC9 metadata, passage and parallel selection | [Contract](specs/engine-rc9-parallel-context.md), [plan](exec-plans/active/2026-09-27-rc9-parallel-context.md) |
| RC9.1 removal of the per-request deadline | [Contract](specs/engine-rc9-1-context-deadlines.md), [plan](exec-plans/active/2026-09-28-rc9-1-context-deadlines.md) |
| RC10 alignment, exact reuse and optional procedures | [Contract](specs/engine-rc10-context-use.md), [plan](exec-plans/active/2026-09-29-rc10-context-use.md) |
| RC10.1 Python parser repair | [Completed plan](exec-plans/completed/2026-09-30-rc10-1-python-parser.md) |
| RC10.2 first-task and provider diagnostics | [Completed plan](exec-plans/completed/2026-10-01-rc10-2-new-project.md) |
| RC10.3 live documents and saved evidence | [Completed plan](exec-plans/completed/2026-10-01-rc10-3-documentation-evidence.md) |
| RC10.4 scoped evidence capture | [Completed plan](exec-plans/completed/2026-10-02-rc10-4-evidence-capture.md) |

The [context configuration guide](guides/rc6-prompt-context.md) separates local retrieval, hosted
disclosure, host trust and measured use. The
[source-control and Codex workflow guide](developer/guides/source-control-and-worktrees.md) explains
worktree ownership, reviewed integration, coordinated upgrades and cleanup.

The [repository-index research](research/2026-09-25-repository-index-harness-practices.md),
[RC6 design review](reviews/2026-09-25-rc6-index-design-reconciliation.md) and
[accepted simplifications](reviews/2026-09-25-rc6-index-simplification.md) retain the original design
comparisons and worktree/database boundaries. The
[computer-use research](research/2026-09-25-jev-computer-use.md) remains exploratory; it does not
declare another executor part of the current release.
