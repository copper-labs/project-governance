---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-10-06
summary: Routes evaluators, operators, contributors, and agents through the shortest useful Project Governance documentation journeys.
---

# Developer Documentation

Project Governance selects checks affected by a repository change and owns their execution evidence.
The current compiled TypeScript npm package adds durable workflows and optional decision advice.
Existing wheel installations retain their owner until deliberate adoption. Current source work follows
the 4.1 plan below; retained wheel journeys apply only to their installed generation.

## Evaluate Or Operate The Runtime

For the compiled runtime, start with the [root README](../../README.md) and the versioned
installation contract in its packaged install skill. The retained wheel journey
[Run Your First Governed Check](guides/first-governed-check.md) explains that generation's ownership
boundary, installation into a Git repository, running one affected check, recognizing success, and
recovering from the most common setup failure.

The retained wheel's responsibility split remains in
[Governance Runtime Architecture](../architecture/governance-runtime.md); current compiled authority
is described in the [charter](../../CHARTER.md#runtime-authority).

## Contribute To The Runtime

For 4.1 source work, use the approved [context-quality specification](../specs/engine-4-1-context-quality.md)
and active [delivery plan](../exec-plans/active/2026-10-05-4-1-context-quality.md). They bind exact
task/plan linkage and proof mappings. Existing installed releases remain unchanged until adoption.
Use [root source instructions](../../AGENTS.md) for compiled commands and the retained source Git
hook boundary. Current implementation owners are `components/engine` and `components/harness`.

Use [Get Useful Feedback Before Review](guides/batch-verification.md) to declare an early focused
check through existing project packs and prove that a test catches an intended fault. The
[4.0 delivery plan](../exec-plans/active/2026-10-04-major-verification-feedback.md) records
installed journey and multilingual semantic-review qualification for the published 4.0.0 release.

Use [Validate Retained JUnit Evidence](guides/retained-junit-evidence.md) to declare an explicit
report owner in 4.1. Code validates captured artifact integrity without rerunning tests or treating
historical test results as current task acceptance.

The approved [focused linting MVP specification](../specs/engine-linting-mvp.md) and
[delivery plan](../exec-plans/active/2026-10-05-linting-mvp.md) describe installable deterministic
adapters, visible coverage and narrow required checks. Source and installed qualification are complete
in 4.0.0; field adoption remains deliberate. Use [Adopt Focused Deterministic Linting](guides/focused-linting.md)
for proposal inspection, explicit setup and required batch coverage without model calls.

Use [Update Delivery Plans Without Model Bookkeeping](guides/structured-delivery.md) to define
stable batch items, bind specification criteria and record original check receipts. Compact batch
inspection and typed updates replace checkbox editing by the model. Code validates links and
mechanical evidence; tests and review still judge whether the behavior meets the specification.

Use the [Release Evaluation contract](../specs/engine-release-evaluation.md) and
[delivery plan](../exec-plans/active/2026-10-04-release-evaluation.md) to compare releases and diagnose
measurement gaps. Existing receipt and manifest owners supply the evidence; unavailable results
remain unknown. The [reporting guide](guides/release-evaluation.md) shows the public report command,
qualified evidence links and the limits of a controlled or passive comparison.

The retained [Change The Runtime Safely](guides/change-the-runtime.md) journey describes Python
source owners and source-hook sign-off; it does not select the compiled engine. Both generations
follow the [Validation Strategy](../governance/validation-strategy.md) for focused batch proof and
one directly affected seam.

For authored documentation and saved review artifacts, follow the
[live-document and evidence contract](../specs/developer-documentation-system.md#compiled-runtime-live-documents-and-saved-evidence).
Preserve raw snapshots and validate their authored summaries; recorded evidence is not a new guide.

## Work Across Branches And Codex Chats

Use [Work Safely Across Git Worktrees and Codex Chats](guides/source-control-and-worktrees.md)
for task ownership, separate implementation checkouts, reviewed integration, coordinated governance
adoption, shared build/device resources and cleanup. It distinguishes operating practices from
runtime enforcement. The [prompt-context guide](../guides/rc6-prompt-context.md) explains same-worktree
entry reuse, procedure opt-in, actual semantic coverage and unknown outcome evidence in RC10.

## Agent Entry

Agents read [catalog.yaml](catalog.yaml) and select an exact capability id, alias, or symbol.
Retained entries such as `first-governed-check` and `change-runtime` still describe Python owners;
current compiled source work starts with the root instructions and 4.1 plan above. An installed
runtime returns the catalog reference, guides and local sources:

```sh
project-governance docs route --capability first-governed-check --json
project-governance docs route --capability change-runtime --json
project-governance docs route --capability structured-delivery --json
project-governance docs route --capability focused-linting --json
project-governance docs route --capability release-evaluation --json
```

The catalog is a routing surface, not a second technical authority. Follow its reference before
acting and inspect its local sources for current implementation behavior.

## Migration History

The [decision-layer delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md),
[technical packages](../reference/2026-09-20-decision-layer-work-packages.md),
[RC3 experiments](../specs/engine-decision-experiments.md) and
[RC4 quality evaluation, model routing and CI advice](../specs/engine-decision-rc4.md) retain earlier
delivery decisions. Their pending checkpoints and pilot delegation requirements are historical,
not directions for current source work. A fixed model remains the default.
The [September research](../research/2026-09-21-jev-agentic-development.md) and
[simplification review](../reviews/2026-09-21-rc4-simplification.md) explain the narrowed design.
The [target specification](../specs/unified-development-engine.md),
[category inventory](../reference/2026-09-20-engine-migration-inventory.md) and
[transition closeout](../exec-plans/active/2026-09-20-unified-development-engine.md#implementation-closeout)
retain the foundation and migration rationale, preserving established hook/check intent.
The [local-CI and merge contract](../specs/engine-local-ci-and-merge-contract.md) owns local/VM/hosted
profiles, result publication and candidate freshness for declared engine adapters. Its original
qualification is not a new hosted-CI requirement for routine source work.
The [capability boundary](../specs/engine-capability-boundaries.md) uses release work to test the core
while deferring full release implementation and host-specific adapters.

## Continuity

The [continuity module instructions](../../components/harness/AGENTS.md) own current task history
and bounded resume work inside the root package. The
[original module README](../../components/harness/README.md) and
[process map](../../components/harness/docs/architecture/development-flow.md) retain the earlier
integration design; their wheel and toolchain descriptions are historical.

For compiled optional consumers, see the [decision experiment guide](../guides/decision-experiments.md).
