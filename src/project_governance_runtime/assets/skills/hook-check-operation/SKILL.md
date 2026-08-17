---
id: skill.hook-check-operation
title: Hook Check Operation
stage: Maintain
provenance: package-default
---

# Hook Check Operation

Install, check, or debug thin hooks and local validation stages.

## Trigger

Use this skill when hook installation, pre-commit behavior, pre-push checks, pre-PR aggregation, or
validation pack binding is changed or failing.

## Required Reads

- `AGENTS.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `docs/governance/validation-strategy.md`
- `config/governance/runtime.lock.yaml`
- `config/validation/packs/`

## Workflow

1. Inspect configured hook path, install command, and stage definitions.
2. Verify each stage references known validation packs.
3. Confirm critical stages remain blocking according to policy.
4. Run the smallest failing hook stage directly when debugging.
5. Preserve bypass policy and report any manual bypass as residual risk.

## Validation

Run `project-governance doctor` and the affected
`project-governance check --stage <stage> --mode impacted` invocation.

## Evidence

Report hook path, stages checked, packs executed, failures, bypasses, and fixes made.
