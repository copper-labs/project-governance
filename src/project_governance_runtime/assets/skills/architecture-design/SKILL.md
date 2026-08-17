---
id: skill.architecture-design
title: Architecture Design
stage: Plan
provenance: package-default
---

# Architecture Design

Plan architecture changes before implementation.

## Trigger

Use this skill when adding a new module, changing dependency direction, defining public contracts,
introducing a new subsystem, or converting an approved idea into an implementation-ready design.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- `docs/architecture/`
- `docs/architecture/reference-architectures/central-observability-lens.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- repository profile `products`
- repository profile `architecture_preferences`
- repository profile `quality.platform_profiles`

## Workflow

1. State the problem, owner, affected products, and non-goals.
2. Locate existing patterns that solve similar problems.
3. Propose the smallest architecture change that fits existing boundaries.
4. Define ownership, module boundaries, data flow, public surface, central observability hooks, and validation packs.
5. Call out alternatives rejected and why.
6. Update or create the governed architecture artifact before implementation begins.

## Validation

Run docs-governance validation for architecture docs and architecture/boundary packs for any
prototype or source changes.

## Evidence

Report the governing architecture artifact, boundary decisions, affected profiles, required
validation packs, rejected alternatives, and open risks.
