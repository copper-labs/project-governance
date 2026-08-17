---
name: async-ci-stability
description: Use before push/PR or while fixing CI to map changed areas to local CI-equivalent checks, run fast gates first, mirror CI order, fix failures, and report push readiness.
---

# Async CI Stability

## Trigger

Use this skill before pushing code, opening/updating a PR, or diagnosing failing CI for any code-changing branch.

## Required Reads

- `AGENTS.md`
- repository profile validation impact map and CI/release sections
- current diff, changed paths, and dependency expansion rules
- CI workflow files and local build/test docs
- recent failing check logs when debugging CI

## Workflow

1. Classify changed targets and map them to validation packs and CI jobs.
2. Run fast local gates first: format, lint/typecheck/compile, and targeted tests.
3. Run the CI-mirror gate for touched areas in the same order CI uses where possible.
4. For app targets, run the smallest runtime smoke that proves startup and the touched flow.
5. Fix failures minimally, rerun the failed command, then rerun the enclosing gate.
6. Stop and reassess if the same failure repeats without a new hypothesis.
7. Confirm implementation quality, commit message, and PR description readiness before final push recommendation.

## Validation

Use the target profile's impact-aware pack selection. Escalate to full-suite checks when shared APIs, build logic, generated code, security, release, or cross-platform behavior changed.

## Evidence

Report changed targets, gate mapping, commands, pass/fail results, fixes, skipped checks with reasons, residual risks, and ready/not-ready recommendation.
