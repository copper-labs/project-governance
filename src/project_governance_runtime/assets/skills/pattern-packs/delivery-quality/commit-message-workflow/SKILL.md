---
name: commit-message-workflow
description: Use when preparing commit messages. Explains outcome, product impact, conceptual change, affected code areas, reason, and validation before the diff.
---

# Commit Message Workflow

## Trigger

Use this skill before creating or amending a commit, or when a commit-message hook fails.

## Required Reads

- `AGENTS.md`
- target commit policy and validation pack
- `.governance/runtime/skills/resources/change-narrative.md`
- staged diff summary
- related issue/spec identifiers when required by the target profile

## Workflow

1. Write the subject as one plain-language outcome at the commit's scope.
2. Name the adopter's top-level product area and explain how the change surfaces there. State the
   intentional no-behavior-change boundary when relevant.
3. Describe the nature of change through responsibilities, relationships, contracts, data flow,
   boundaries, or coupling; leave symbol-level mechanics to the diff.
4. Name stable, human-recognizable code areas instead of file paths.
5. Preserve why the work was necessary and the check plus observed validation result.
6. Add risk or required action only when it gives the reader something material to watch or do.
7. Recheck the staged diff, governing issue or plan, and evidence before finalizing the message.

## Validation

Run the commit-message validation pack or hook when available.

## Evidence

Report the final outcome, product impact, nature of change, code areas, reason, validation, and
commit-message check status.
