---
name: pr-description-workflow
description: Use when writing or updating a pull request description. Gives readers product impact, conceptual change, affected code areas, and reason before they open the diff.
---

# PR Description Workflow

## Trigger

Use this skill before opening a PR, updating a PR after major changes, or preparing review handoff.

## Required Reads

- `AGENTS.md`
- target PR template and work-tracking policy
- `.governance/runtime/skills/resources/change-narrative.md`
- governing issue/spec/plan
- diff summary

## Workflow

1. State one plain-language outcome in the pull request title. Say what becomes possible, changes,
   or is prevented; do not repeat it in an Outcome section.
2. List each adopter-owned top-level product area and how the change surfaces there, including an
   explicit no-behavior-change boundary when relevant.
3. Explain the nature of change through responsibilities, relationships, contracts, data flow,
   boundaries, or coupling rather than implementation trivia.
4. List stable human-recognizable code areas rather than file paths.
5. Explain why the change exists.
6. Put any material user-facing limitation or rollout consequence in Product impact. Do not add a
   generic validation, risk, or required-action section.
7. Link issues or specifications where target policy requires or they materially preserve intent.
8. Keep the body updated after material scope, behavior, or design changes.

## Validation

Run pre-PR or PR-description checks from the target profile when available.

## Evidence

Report the PR title, body path, product impact, nature of change, code areas, and check status.
