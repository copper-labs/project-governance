---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-09-25
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

Use [Change The Runtime Safely](guides/change-the-runtime.md) to find the owning component, run its
focused proof, cross one directly affected seam, and finish with the source checkout's governed
sign-off. Use the [Validation Strategy](../governance/validation-strategy.md) as the canonical
reference for that proof boundary.

## Work Across Branches And Codex Chats

Use [Work Safely Across Git Worktrees and Codex Chats](guides/source-control-and-worktrees.md)
for task ownership, separate implementation checkouts, reviewed integration, coordinated governance
adoption, shared build/device resources and cleanup. It distinguishes operating practices from
runtime enforcement and current behavior from the expanded RC6 qualification still to be completed.

## Agent Entry

Agents read [catalog.yaml](catalog.yaml) and select an exact capability id, alias, or symbol. The
installed runtime returns the same reference, guides, and local sources:

```sh
project-governance docs route --capability first-governed-check --json
project-governance docs route --capability change-runtime --json
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
