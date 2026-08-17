---
name: implementation-quality-gate
description: >-
  Use before commit, push, or PR to evaluate implementation quality: simplicity, readability,
  comments, public docs, naming, abstraction boundaries, tests, and stack-specific rules.
---

# Implementation Quality Gate

## Trigger

Use this skill for any code-changing workflow before final closeout, commit, push, or PR readiness.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- repository profile quality, validation, platform profiles, and waiver paths
- changed files, public API surface, and tests
- stack-specific skills for touched languages when available

## Workflow

1. Identify changed files, public declarations, generated files, and platform boundaries touched.
2. Check simplicity: avoidable layers, helper churn, speculative abstraction, long functions, large types, and deep branching.
3. Check readability: clear names, linear flow, local conventions, and no stale/commented-out code.
4. Check comments/docs: touched types and public APIs have useful responsibility and usage context.
5. Check design: abstractions have real ownership and do not leak infrastructure into domain logic.
6. Check tests: changed behavior has targeted tests or an explicit validation reason.
7. Mark each issue as critical, high, medium, or low with minimal corrective action.

## Validation

Run code-smell, comment-quality, naming, lint, format, platform-boundary, and impacted tests from the target profile.

## Evidence

Report pass/fail checklist, severity counts, required fixes, validation commands, waivers, and recommendation: pass, pass with follow-ups, or request changes.
