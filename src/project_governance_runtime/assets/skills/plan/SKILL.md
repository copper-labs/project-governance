---
id: skill.plan
title: Plan
stage: Plan
provenance: package-default
---

# Plan

Turn framed work into an executable governed slice.

## Trigger

Use this skill when work needs more than a trivial direct edit, changes durable policy, spans
multiple files, or requires validation and review evidence.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/resources/implementation-plan-template.md`
- `docs/governance/apple-dependency-policy.md` when Apple platforms may be in scope
- The governing spec, PRD, issue, plan, or decision

## Workflow

1. Confirm the desired final state and non-goals.
2. Discover Apple dependency surfaces before proposing dependency work. Default to SwiftPM. If the
   plan would add, expand, or remove CocoaPods, alert the operator now and stop that slice until a
   specific compatibility or availability reason is approved and recorded.
3. Break the work into independently useful slices using the canonical template. Mark exact
   dependencies and use `Execution: parallel with <slice IDs>` only for non-overlapping ownership.
4. Declare a `Proof Budget`: claims to prove, cheapest sufficient evidence, normally one complete
   proof cycle, expected duration or cost, invalidation rules, equivalent-repeat reason policy, and
   an explicit stop condition.
5. Map changed areas to validation packs, review skills, rollback, and evidence. Treat checks that
   prove the same claim on the same digest-bound subject as substitutes, not additive ceremonies.
6. Record open questions only when they block safe execution.
7. Keep the plan in the correct lifecycle location and link every active plan from
   `docs/exec-plans/README.md`.

## Validation

Run docs-governance for durable plans. Run impact planning dry-run when changed paths are known.

## Evidence

Report the plan path or no-plan rationale, dependency order, slice ownership and sequencing,
delivery state when known, validation packs, proof budget and stop condition, review skills,
rollback, and unresolved blockers.
