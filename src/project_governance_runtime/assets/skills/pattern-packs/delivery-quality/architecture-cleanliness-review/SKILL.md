---
name: architecture-cleanliness-review
description: Use to review changed code or design for layering, ownership, coupling, duplication, module boundaries, public surface discipline, and long-term maintainability.
---

# Architecture Cleanliness Review

## Trigger

Use this skill after a design or implementation changes modules, ownership boundaries, public APIs, source-set placement, dependency direction, or cross-cutting behavior.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- nearest architecture docs and decisions
- repository profile platform profiles, validation packs, and source roots
- changed files, dependency graph, and public API surface

## Workflow

1. Identify the intended ownership model and changed architectural boundaries.
2. Check dependency direction, layering, module responsibilities, source-set placement, and public API exposure.
3. Flag duplicated policy, hidden global state, unowned abstractions, speculative extension points, large classes, and ambiguous names.
4. Distinguish correctness bugs from maintainability risks.
5. Recommend minimal corrective actions and note when a larger refactor needs a separate plan.

## Validation

Consume existing subject-valid proof. Run or require one target owner only for a named uncovered
architecture claim; do not create a second boundary, naming, code-smell, lint, and test matrix.

## Evidence

Report findings by severity with file/line references when reviewing code, plus boundary decisions, required fixes, deferred risks, and validation status.
