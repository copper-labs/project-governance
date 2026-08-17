---
name: pr-description-workflow
description: Use when writing or updating a pull request description. Captures what changed, why, how it was tested, risks, review notes, and linked work without bloated narration.
---

# PR Description Workflow

## Trigger

Use this skill before opening a PR, updating a PR after major changes, or preparing review handoff.

## Required Reads

- `AGENTS.md`
- target PR template and work-tracking policy
- governing issue/spec/plan
- diff summary and validation evidence

## Workflow

1. State what changed in reader-facing terms.
2. Explain why the change exists and what problem it closes.
3. List validation commands and outcomes, including skipped checks with reasons.
4. Call out risky areas, migrations, screenshots/artifacts, or review focus.
5. Link issues/specs only where target policy requires or they materially help review.
6. Keep the PR body updated after significant scope or validation changes.

## Validation

Run pre-PR or PR-description checks from the target profile when available.

## Evidence

Report the PR body path or content summary, validation included, residual risks, and review focus notes.
