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
- repository profile validation impact map and platform profiles
- current code layout and relevant tests

## Workflow

1. Define scope, non-goals, assumptions, and dependencies.
2. Break work into ordered slices with a validation checkpoint after each meaningful boundary.
3. Name files/modules likely to change without overcommitting to premature implementation details.
4. Include rollback or pause criteria for risky steps.
5. Map validation packs and review skills to the plan.
6. Keep the plan temporary unless the repo's docs lifecycle says otherwise.

## Validation

Run docs-governance if the plan is stored durably. Before implementation closeout, reconcile the plan with actual work and validation evidence.

## Evidence

Report plan path or inline plan, slices, validation map, risk/rollback notes, and remaining operator approvals.
