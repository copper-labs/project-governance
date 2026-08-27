---
id: skill.qa-review
title: QA Review
stage: Review
provenance: package-default
---

# QA Review

Review behavior, tests, fixtures, and regression risk.

## Trigger

Use this skill when a change affects user-visible behavior, core logic, contracts, regression tests,
fixtures, or release readiness.

## Required Reads

- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile `validation.packs`
- repository profile `ci.pr_checks`
- relevant specs, plans, or acceptance criteria

## Workflow

1. Confirm the integrated revision or tree digest under review and remain independent from its
   implementation.
2. Identify the behavior promised by the governing artifact or work item.
3. Review changed tests and fixtures against edge cases and failure modes.
4. Check whether impacted validation covers the changed paths.
5. Check whether observability proof exists for important success, failure, degraded, or retried behavior.
6. Treat manual-only proof as residual risk unless policy accepts it.
7. Recommend the smallest additional test or check that would close material risk.

## Validation

Consume the stable candidate's existing affected sign-off evidence. Run one focused unit,
integration, or smoke check only for a named changed seam with no evidence. If no test maps to the
change, report the gap; release checks remain at the release boundary.

## Evidence

Report bugs, missing tests, validation commands, coverage gaps, and remaining regression risk using
the shared review finding schema.
