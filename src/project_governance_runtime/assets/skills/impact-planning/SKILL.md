---
id: skill.impact-planning
title: Impact Planning
stage: Plan
provenance: package-default
---

# Impact Planning

Decide which validation packs, CI checks, or release profiles a change requires.

## Trigger

Use this skill before pre-PR, CI planning, release planning, or any change where broad validation
would be expensive and targeted validation may be sufficient.

## Required Reads

- `docs/governance/validation-strategy.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `config/validation/packs/`
- `config/governance/profile.yaml`
- target-owned extension packs

## Workflow

1. Collect changed paths from the working tree, commit range, PR, or operator packet.
2. Map paths to validation packs using the pack runner.
3. Expand dependencies conservatively when shared code, public API, build logic, or contracts change.
4. Fail closed when path mapping or dependency impact is unknown.
5. Produce a concise impact plan for local hooks, CI, or release.

## Validation

Run `project-governance plan --stage pre-pr --mode impacted --changed-path <path> --json`.
Verify every changed path maps to at least one validation pack or fails with one unmapped-path
finding.

## Evidence

Report changed path groups, selected packs, escalations, skipped packs with reasons, and fail-closed
conditions.
