---
name: implementation-plan-workflow
description: Use to create or update a scoped execution plan from an approved spec, issue, or user request. Keeps tasks, validation, risk, rollback, and closeout evidence concrete.
---

# Implementation Plan Workflow

## Trigger

Use this skill before substantial implementation, migration, multi-file refactor, release, or validation work that needs ordered steps and evidence.

## Required Reads

- `AGENTS.md`
- governing spec, PRD, decision, or issue
- `docs/governance/validation-strategy.md`
- `.governance/runtime/skills/resources/implementation-plan-template.md`
- repository profile validation impact map and platform profiles
- current code layout and relevant tests

## Workflow

1. Define scope, non-goals, assumptions, and dependencies.
2. Plan coherent implementation batches using the canonical template. Set focused development
   checks, expensive build points, and an applicable independent QA review at each batch boundary.
   Let the writer adjust checkpoints for new evidence or risk; internal steps do not each trigger QA.
3. Name files/modules likely to change without overcommitting to premature implementation details.
4. Include rollback or pause criteria for risky steps.
5. Map validation packs and review skills to the plan.
6. Consolidate plan/status and explanatory docs at batch closeout; update contracts earlier when
   dependent work needs them. Keep the plan temporary unless the repo's docs lifecycle says otherwise.

## Validation

Run docs-governance if the plan is stored durably. Before implementation closeout, reconcile the plan with actual work and validation evidence.

## Evidence

Report plan path or inline plan, batches, validation map, risk/rollback notes, and remaining operator approvals.
