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
   checks at completion of meaningful behavior, expensive build points and an applicable independent
   QA review at each completed batch boundary. Name each checkpoint's trigger, exact command/runbook,
   affected owners/dependents, claim and repeat reason. Earlier checks need a named blocking
   uncertainty, focused reproducer, failed proof or new risk. Internal steps do not each trigger
   testing or QA; preserve required hooks and the validation strategy's broad-proof boundaries.
3. Name files/modules likely to change without overcommitting to premature implementation details.
4. Include rollback or pause criteria for risky steps.
5. Map validation packs and review skills to the plan.
   Use configured stage/pack IDs for a structured verification item. Inspect adopted lint coverage
   when defining source work; missing setup requires an explicit project-owned setup or exclusion,
   not model selection of a substitute check. Keep tool acquisition separate from checks and hooks.
6. Use distinct implementation, verification and closeout checkboxes. Update them and current/next
   action at completed batches, checkpoints, material blockers and handoffs before dependent work;
   retain failed/invalidated evidence and leave unproved claims unchecked. Consolidate explanatory
   docs at closeout and update contracts earlier when needed. Include one owned local commit at each
   completed verified batch when authorized; keep normal hooks, account for their checks once and
   preserve uncommitted work at a pause or failed checkpoint. Keep the plan temporary unless the
   repository's docs lifecycle says otherwise.
   For new or deliberately converted structured plans, preserve the template's stable IDs and
   machine-owned slots. Inspect one batch with `project-governance implementation-plan inspect
   --path <plan> --batch <id>` and apply typed, digest-bound requests through
   `project-governance implementation-plan update`. A checkpoint can use the existing
   `check --implementation-plan <plan> --batch <id>` binding to record its original receipt once.
   Failed, stale or incomplete evidence leaves verification unchecked; narrative and acceptance
   remain authored judgments. Do not use an LLM or JEV to flip boxes or qualify a receipt.

## Validation

Run docs-governance if the plan is stored durably. Before implementation closeout, reconcile the plan with actual work and validation evidence.

## Evidence

Report plan path or inline plan, batches, validation map, risk/rollback notes, and remaining operator approvals.
