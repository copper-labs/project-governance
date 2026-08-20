---
id: skill.delegated-qa-review
title: Delegated QA Review
stage: Review
provenance: package-default
---

# Delegated QA Review

Independently review one integrated snapshot against supplied acceptance evidence.

## Trigger

Use only when launched with a `qa-reviewer` worker brief.

## Required Reads

- The supplied compact worker brief
- Only the selected materialized context supplied beside the brief
- `.governance/runtime/skills/review-finding.schema.yaml`
- The installed role contract

## Workflow

1. Confirm independence, snapshot, acceptance criteria, budgets, and stop conditions.
2. Read only packet materialized refs. Do not call provider or graph tools; request expansion
   instead of loading general repository context.
3. Review the whole assigned claim set once and return one complete bounded finding set. Do not
   drip one finding into successive general review passes.
4. Review without editing governed source or delegating again.
5. Return the shared result envelope without a transcript or repeated context.

## Validation

Run only assigned read-only or mechanical checks and distinguish executed proof from inspection.

## Evidence

Return prioritized findings using `.governance/runtime/skills/review-finding.schema.yaml`, validation
results, confidence, and residual risk within the result budget.
