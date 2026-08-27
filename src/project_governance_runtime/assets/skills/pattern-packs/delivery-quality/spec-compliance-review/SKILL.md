---
name: spec-compliance-review
description: Use to compare implementation against a PRD, spec, execution plan, issue, or acceptance criteria. Finds missing requirements, changed semantics, extra behavior, and validation gaps.
---

# Spec Compliance Review

## Trigger

Use this skill before closeout, PR, or release when a change claims to implement a governed artifact or acceptance criteria.

## Required Reads

- `AGENTS.md`
- governing PRD, spec, execution plan, issue, or acceptance criteria
- changed files and validation evidence
- repository profile validation packs and traceability rules

## Workflow

1. List each requirement and acceptance criterion in reviewable form.
2. Map implementation changes to those requirements.
3. Mark each item as implemented, partially implemented, missing, changed, or out of scope.
4. Check non-goals and forbidden behaviors.
5. Check tests and validation evidence for every high-risk requirement.
6. Recommend pass, pass with follow-ups, or request changes.

## Validation

Consume existing target-profile proof tied to the governed artifact. Run one missing owner only for
a named uncovered criterion. Use docs-governance as that focused owner when traceability or artifact
state changed and no current proof covers it.

## Evidence

Report a requirement-by-requirement matrix, missing or changed behavior, extra behavior, validation gaps, and final compliance recommendation.
