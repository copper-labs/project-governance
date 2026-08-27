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
2. Consume existing subject-valid local proof and identify one uncovered affected claim, if any.
3. Run the target's impact-selected local sign-off once. Add one focused test or runtime smoke only
   when the selected sign-off does not prove a named changed seam.
4. Leave provider CI to its independent environment and trust boundary. Mirror CI locally only when
   the target explicitly declares that separate proof necessary.
5. Fix failures minimally, then choose one affected recheck: the failed owner for focused diagnosis
   or the enclosing gate for final proof. Do not automatically run both against the unchanged
   subject.
6. Stop and reassess if the same failure repeats without a new hypothesis.
7. Confirm implementation quality, commit message, and PR description readiness before final push recommendation.

## Validation

Use the target profile's impact-aware pack selection. Shared APIs, build logic, generated code, or
cross-platform behavior may require one directly affected seam; they do not by themselves require
a full suite. Use full-suite proof only at the target's declared release, schema, hook/selection,
security/process-isolation, scheduled-reconciliation, or operator-requested boundary.

## Evidence

Report changed targets, gate mapping, commands, pass/fail results, fixes, skipped checks with reasons, residual risks, and ready/not-ready recommendation.
