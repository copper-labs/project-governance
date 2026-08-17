---
id: governance.context-routing
title: Context Routing
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-11
summary: Defines deterministic, repository-local routing to the smallest useful agent context.
---

# Context Routing

Context routing chooses the smallest useful Markdown and skill packet for a task. It is
deterministic first: repository-owned routes map path and task signals to repository-owned sources.
Agents do not discover broad historical material during routine work.

## Ownership

- The runtime owns generic selection mechanics and generic skill discovery.
- The repository owns routes, aliases, path patterns, product terminology, and required reads.
- The task owner decides whether a routed packet is sufficient for a novel situation.

## Operating Rules

1. Start from repository root instructions and the route configuration.
2. Select only the matching policy, architecture, specification, and skill sources.
3. Record a route miss when no route applies; do not silently widen to every document.
4. Change route configuration and its focused fixture together.
5. Run context-routing validation only when routing inputs change.

Runtime materialization is local and ignored by Git. It is a convenience copy of installed generic
skills, never a second policy authority.
