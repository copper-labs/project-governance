---
name: governed-spec-workflow
description: Use when drafting or updating a technical spec from approved intent. Produces durable, traceable, implementation-oriented specifications without mixing in execution logs.
---

# Governed Spec Workflow

## Trigger

Use this skill when creating or updating a technical spec for architecture, API, workflow, integration, data model, validation, or platform behavior.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `docs/governance/artifact-lifecycle.md`
- `docs/architecture/reference-architectures/central-observability-lens.md`
- target docs governance and traceability rules
- approved discovery, PRD, decision, issue, or user intent
- related architecture, specs, and decisions

## Workflow

1. State the problem, goals, non-goals, constraints, and audience.
2. Define the contract: ownership, data shapes, APIs, lifecycle, states, failure modes, observability, instrumentation applicability, and validation.
3. Include implementation boundaries without turning the spec into a task log.
4. Add acceptance criteria, test strategy, and required evidence, including central observability proof or an explicit no-new-signal rationale.
5. Link related artifacts and update traceability when durable docs change.
6. Run the technical-authoring harness or quality gates for substantial prose.

## Validation

Run the documentation, link, frontmatter, and traceability checks the target configures.

## Evidence

Report created/updated spec path, source intent, major decisions, open questions, validation commands, and next artifact needed.
