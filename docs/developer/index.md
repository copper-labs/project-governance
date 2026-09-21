---
id: developer-documentation.index
title: Developer Documentation
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-08-21
summary: Routes evaluators, operators, contributors, and agents through the shortest useful Project Governance documentation journeys.
---

# Developer Documentation

Project Governance is a small Python-wheel runtime that selects and runs governance checks affected
by a repository change. Choose the route that matches what you need to accomplish.

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

Before new engine implementation, follow the [target specification](../specs/unified-development-engine.md),
[category inventory](../reference/2026-09-20-engine-migration-inventory.md) and
[transition plan](../exec-plans/active/2026-09-20-unified-development-engine.md). These distinguish current
behavior from proposed replacements, preserving hook/check intent while changing runtime mechanisms.
The [local-CI and merge contract](../specs/engine-local-ci-and-merge-contract.md) owns local/VM/hosted
profiles, result publication and candidate freshness for the future engine adapter.
Both remote and local CI are required; the operator reports existing GitHub local-CI authorization.
The [capability boundary](../specs/engine-capability-boundaries.md) uses release work to test the core
while deferring full release implementation and host-specific adapters.

## Continuity

The [continuity module](../../components/harness/README.md) owns task history and bounded resume.
It is part of this governance product and wheel; policy and process supervision retain their existing
owners. See the [process map](../../components/harness/docs/architecture/development-flow.md).
