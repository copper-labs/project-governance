---
id: skill.plan
title: Plan
stage: Plan
provenance: package-default
---

# Plan

Turn framed work into coherent implementation batches with planned test and review boundaries.

## Trigger

Use this skill when work needs more than a trivial direct edit, changes durable policy, spans
multiple files, or requires validation and review evidence.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/resources/implementation-plan-template.md`
- `.governance/runtime/skills/delegated-execution/SKILL.md`
- `docs/governance/apple-dependency-policy.md` when Apple platforms may be in scope
- The governing spec, PRD, issue, plan, or decision

## Workflow

1. Confirm the desired final state and non-goals.
2. Discover Apple dependency surfaces before proposing dependency work. Default to SwiftPM. If the
   plan would add, expand, or remove CocoaPods, alert the operator now and stop that slice until a
   specific compatibility or availability reason is approved and recorded.
3. Define bounded, reviewable batches around observable outcomes using the canonical template.
   Make each batch substantial enough to avoid repeated setup and review, and small enough to
   understand and diagnose confidently. Combine tightly related steps; split unrelated outcomes or
   uncertainty that needs earlier feedback. Do not size batches by fixed file, line, or time quotas.
   Group shared behavior and affected bindings when they implement one settled contract. Mark exact
   dependencies; parallel investigation never grants a second writer in the same repository.
   Split early for unresolved contracts, material risk, or work too large to review coherently.
   Assess independent read-only assignments that replace necessary investigation or prevent rework.
   Record `Parallel support`: each useful question, expected output, and when it is needed, or a
   short reason for solo execution. Use zero to two readers, with a separate justification for
   the second. This is one batch-planning decision, not an agent quota or an extra approval.
4. Declare a `Proof Budget`: claims to prove, cheapest sufficient evidence, normally one complete
   proof cycle, expected duration or cost, invalidation rules, and an explicit stop condition.
   Set focused development checkpoints, expensive build points, one applicable QA review per batch,
   and the attended acceptance milestone. The writer may adjust checks for new evidence or risk.
5. Map changed areas to validation packs, review skills, rollback, and evidence. Treat checks that
   prove the same claim on the same digest-bound subject as substitutes, not additive ceremonies.
6. Consolidate plan/status and explanatory documentation at batch closeout. Update governing
   contracts earlier when dependent work needs them. Record open questions only when they block
   safe execution; internal steps do not each require approval, QA, or a documentation update.
7. Keep the plan in the correct lifecycle location and link every active plan from
   `docs/exec-plans/README.md`.

## Validation

Run docs-governance for durable plans. Run impact planning dry-run when changed paths are known.

## Evidence

Report the plan path or no-plan rationale, dependency order, batch ownership and sequencing,
delivery state when known, validation packs, proof budget and stop condition, review skills,
rollback, and unresolved blockers.
