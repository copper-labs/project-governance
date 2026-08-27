---
id: skill.hook-check-operation
title: Hook Check Operation
stage: Maintain
provenance: package-default
---

# Hook Check Operation

Install, check, or debug thin hooks and local validation stages.

## Trigger

Use this skill when hook installation, pre-commit behavior, pre-push checks, the pre-PR narrative
check, or validation pack binding is changed or failing.

## Required Reads

- `AGENTS.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `docs/governance/validation-strategy.md`
- `config/governance/runtime.lock.yaml`
- `config/validation/packs/`

## Workflow

1. Inspect configured hook path, install command, and stage definitions.
2. Verify each stage references known validation packs.
3. Confirm the shipped pre-PR hook names only `pr-description`; a deliberate full pre-PR stage is a
   separate adopter-owned boundary.
4. Confirm critical stages remain blocking according to policy.
5. Run the smallest failing hook or named pack directly only when debugging needs it. For final
   proof, use the affected hook or stage once; do not replay a passed named pack inside it on the
   unchanged subject.
6. Preserve bypass policy and report any manual bypass as residual risk.

## Validation

Run `project-governance doctor` and the affected hook or
`project-governance check --stage <stage> --mode impacted` invocation once.

## Evidence

Report hook path, stages checked, packs executed, failures, bypasses, and fixes made.
