---
id: skill.delegated-implementation
title: Delegated Implementation
stage: Work
provenance: package-default
---

# Delegated Implementation

Implement one bounded write scope without assuming coordinator responsibilities.

## Trigger

Use only when launched with an `implementation-worker` worker brief.

## Required Reads

- The supplied compact worker brief
- Only the selected materialized context supplied beside the brief
- The installed role contract

## Workflow

1. Confirm the objective, base snapshot, write scope, budgets, and stop conditions.
2. Read only packet materialized refs. Do not call provider or graph tools; request expansion when
   required context is absent.
3. Edit only the assigned scope; do not integrate other work or delegate again.
4. Run only the focused validation named in the envelope.
5. Return the shared result envelope. Do not add a transcript or repeat the supplied context.

## Validation

Run the smallest assigned checks that prove the bounded change and report exact outcomes.

## Evidence

Return files changed, commands, results, blockers, assumptions, and residual risk within the result
budget.
