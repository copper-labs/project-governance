---
name: commit-message-workflow
description: Use when preparing commit messages. Produces a useful subject and compact authored explanation without duplicating pull request structure.
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

1. Write the subject as one useful outcome at the commit's scope. Say what becomes
   possible, changes, or is prevented rather than naming the coding activity, ticket, or path.
2. Follow it with a compact paragraph that lets a teammate understand the commit without opening
   the diff. Explain the problem or intent, conceptual change, and any consequence, constraint, or
   decision that matters.
3. Name recognizable capabilities or components when useful, but do not inventory files, symbols,
   or individual edits. Connect the ideas with complete sentences rather than a checklist.
4. Do not repeat the subject, reproduce test output, narrate the implementation process, or copy
   the pull request description. One informative sentence is enough for a small mechanical change.
5. Split the work when the explanation becomes long or covers unrelated ideas.
6. Recheck the staged diff and governing issue or plan before finalizing the message.

## Validation

Run the commit-message validation pack or hook when available.

## Evidence

Report the final subject, body, and commit-message check status.
