---
name: code-review
description: Use for bug/risk-first review of code changes. Prioritizes correctness, regressions, security, missing tests, API breaks, and maintainability findings over summaries.
---

# Code Review

## Trigger

Use this skill when asked to review a diff, PR, patch, or implementation for issues before merge.

## Required Reads

- `AGENTS.md`
- governing spec, plan, or issue for the change
- changed files and relevant tests
- repository profile validation packs for touched areas
- nearest architecture or API docs when boundaries changed

## Workflow

1. Understand the intended behavior and non-goals.
2. Review the diff for correctness, regressions, data loss, security/privacy, concurrency, lifecycle, platform compatibility, and API contract breaks.
3. Check tests for meaningful coverage of changed behavior and edge cases.
4. Prefer concrete findings with severity, file, line, impact, and suggested fix.
5. Keep summaries secondary to findings.

## Validation

Map findings to target validation packs and call out tests or checks that should be run before merge.

## Evidence

Report findings first, ordered by severity, then open questions, test gaps, residual risk, and a short change summary only if useful.
