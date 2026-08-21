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
sign-off.

## Agent Entry

Agents read [catalog.yaml](catalog.yaml) and select an exact capability id, alias, or symbol. The
installed runtime returns the same reference, guides, and local sources:

```sh
project-governance docs route --capability first-governed-check --json
project-governance docs route --capability change-runtime --json
```

The catalog is a routing surface, not a second technical authority. Follow its reference before
acting and inspect its local sources for current implementation behavior.
