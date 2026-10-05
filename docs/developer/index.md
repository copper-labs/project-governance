---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-10-05
summary: Routes evaluators, operators, contributors, and agents through the shortest useful Project Governance documentation journeys.
---

# Developer Documentation

Project Governance selects checks affected by a repository change and owns their execution evidence.
The 3.x compiled TypeScript runtime adds durable workflows and optional decision advice; existing
2.x wheel installations retain their owner until deliberate adoption. Choose the route that matches
what you need to accomplish.

## Evaluate Or Operate The Runtime

Use [Run Your First Governed Check](guides/first-governed-check.md) to understand the ownership
boundary, install the runtime into a Git repository, run one affected check, recognize success, and
recover from the most common setup failure.

The exact runtime/adopter responsibility split remains in
[Governance Runtime Architecture](../architecture/governance-runtime.md).

## Contribute To The Runtime

Use [Get Useful Feedback Before Review](guides/batch-verification.md) to declare an early focused
check through existing project packs and prove that a test catches an intended fault. The
[next major delivery plan](../exec-plans/active/2026-10-04-major-verification-feedback.md) records
installed journey and multilingual semantic-review qualification for the published 4.0.0 release.

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

Use [Change The Runtime Safely](guides/change-the-runtime.md) to find the owning component, run its
focused proof, cross one directly affected seam, and finish with the source checkout's governed
sign-off. Use the [Validation Strategy](../governance/validation-strategy.md) as the canonical
reference for that proof boundary.

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

Agents read [catalog.yaml](catalog.yaml) and select an exact capability id, alias, or symbol. The
installed runtime returns the same reference, guides, and local sources:

```sh
project-governance docs route --capability first-governed-check --json
project-governance docs route --capability change-runtime --json
project-governance docs route --capability structured-delivery --json
project-governance docs route --capability focused-linting --json
project-governance docs route --capability release-evaluation --json
```

The catalog is a routing surface, not a second technical authority. Follow its reference before
acting and inspect its local sources for current implementation behavior.

## Unified engine design and migration

For the next implementation, follow the
[decision-layer delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md)
and its linked functional validation plan. It is the single delivery/progress owner; the
[technical packages](../reference/2026-09-20-decision-layer-work-packages.md) supply reference detail.
The [RC3 experiments](../specs/engine-decision-experiments.md) define the preceding N0–N6 batch.
Next, [RC4 quality evaluation, model routing and CI advice](../specs/engine-decision-rc4.md) follows
R0–R6 within that same plan, including required governed delegation in the selected pilot.
New effects require separate host qualification and explicit opt-in; a fixed model is the default.
Optional category routing classifies work into the operator's predefined model/effort mapping.
The [September research](../research/2026-09-21-jev-agentic-development.md) and
[simplification review](../reviews/2026-09-21-rc4-simplification.md) explain the narrowed design.
The [target specification](../specs/unified-development-engine.md),
[category inventory](../reference/2026-09-20-engine-migration-inventory.md) and
[transition closeout](../exec-plans/active/2026-09-20-unified-development-engine.md#implementation-closeout)
retain the foundation and migration rationale, preserving established hook/check intent.
The [local-CI and merge contract](../specs/engine-local-ci-and-merge-contract.md) owns local/VM/hosted
profiles, result publication and candidate freshness for the future engine adapter.
Both remote and local CI are required; the operator reports existing GitHub local-CI authorization.
The [capability boundary](../specs/engine-capability-boundaries.md) uses release work to test the core
while deferring full release implementation and host-specific adapters.

## Continuity

The [continuity module](../../components/harness/README.md) owns task history and bounded resume.
It is part of this governance product and wheel; policy and process supervision retain their existing
owners. See the [process map](../../components/harness/docs/architecture/development-flow.md).

For compiled optional consumers, see the [decision experiment guide](../guides/decision-experiments.md).
