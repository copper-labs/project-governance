---
name: pr-description-workflow
description: Use when writing or updating a pull request description. Gives readers product impact, conceptual change, affected code areas, reason, and validation before they open the diff.
---

# PR Description Workflow

## Trigger

Use this skill before opening a PR, updating a PR after major changes, or preparing review handoff.

## Required Reads

- `AGENTS.md`
- target PR template and work-tracking policy
- `.governance/runtime/skills/resources/change-narrative.md`
- governing issue/spec/plan
- diff summary and validation evidence

## Workflow

1. State one plain-language outcome for the complete pull request.
2. List each adopter-owned top-level product area and how the change surfaces there, including an
   explicit no-behavior-change boundary when relevant.
3. Explain the nature of change through responsibilities, relationships, contracts, data flow,
   boundaries, or coupling rather than implementation trivia.
4. List stable human-recognizable code areas rather than file paths.
5. Explain why the change exists and list validation checks with their observed outcomes. Give a
   specific reason for any intentionally unrun check.
6. Add risks, migration, rollout, compatibility, or follow-up action only when material.
7. Link issues or specifications where target policy requires or they materially preserve intent.
8. Keep the body updated after material scope, behavior, design, or validation changes.

## Validation

Run pre-PR or PR-description checks from the target profile when available.

## Evidence

Report the PR body path, outcome, product impact, nature of change, code areas, validation, and any
residual risk or required action.
