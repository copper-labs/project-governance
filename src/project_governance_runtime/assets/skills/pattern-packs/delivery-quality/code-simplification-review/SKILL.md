---
name: code-simplification-review
description: Use after implementation or during review to simplify code without behavior changes. Targets dead code, avoidable complexity, unclear names, duplicated logic, and unnecessary abstractions.
---

# Code Simplification Review

## Trigger

Use this skill when implementation is functionally complete and the goal is cleanup, readability, complexity reduction, or maintainability without behavior change.

## Required Reads

- `AGENTS.md`
- changed files or diff
- repository profile code-quality, naming, comment-quality, and test packs
- passing or expected verification commands for the touched area

## Workflow

1. Scan changed files for dead code, unused imports, deep nesting, repeated logic, unclear names, unnecessary abstractions, and stale comments.
2. Prioritize safest improvements first: dead code, then control flow, naming, duplication, and modern patterns already used by the repo.
3. Preserve behavior exactly. Do not combine simplification with feature work.
4. Change one simplification category at a time when editing code.
5. Stop if tests fail, behavior changes, or dead-code certainty is low.

## Validation

Run the smallest relevant tests after changes, then the enclosing target profile checks for code quality, naming, lint, and impacted tests.

## Evidence

Report files simplified, simplification categories, behavior-preservation evidence, tests run, and any cleanup deferred because risk was too high.
