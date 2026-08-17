---
name: scope-check-review
description: Use after implementation to verify that every addition traces to approved scope or necessary infrastructure, and to catch agent overbuild, speculative options, aliases, flags, and extension points.
---

# Scope Check Review

## Trigger

Use this skill when implementation is done and you need to confirm that nothing extra was added beyond the approved spec, issue, plan, or user request.

## Required Reads

- `AGENTS.md`
- governing spec, plan, issue, or user request
- changed files and diff
- repository profile rules for naming, architecture, and validation

## Workflow

1. Extract the approved requirements, non-goals, interfaces, and acceptance criteria.
2. Inventory added files, APIs, options, flags, dependencies, abstractions, schema fields, docs, and tests.
3. Trace each addition to a requirement or classify it as necessary infrastructure.
4. Flag untraceable additions, optional parameters, new extension points, compatibility shims, config flags, speculative helpers, and abstractions with one caller.
5. Recommend remove, justify in governed docs, or split to a follow-up.

## Validation

Run docs-governance when scope changes affect durable docs. Run impacted code checks when removing or adjusting implementation.

## Evidence

Report traceable additions, necessary infrastructure, flagged scope creep, recommended removals or justifications, and any operator decision needed.
