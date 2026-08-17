---
name: commit-message-workflow
description: Use when preparing commit messages. Keeps subjects concise, human-readable, impact-oriented, and aligned with the repository commit policy.
---

# Commit Message Workflow

## Trigger

Use this skill before creating or amending a commit, or when a commit-message hook fails.

## Required Reads

- `AGENTS.md`
- target commit policy and validation pack
- staged diff summary
- related issue/spec identifiers when required by the target profile

## Workflow

1. Summarize the staged change in one plain-language impact statement.
2. Keep the subject short, specific, and in the target's required style.
3. Use the body only when it adds useful context: why, risk, migration, validation, or follow-up.
4. Avoid vague verbs, internal shorthand, redundant prefixes, and implementation trivia.
5. Recheck the staged diff before finalizing the message.

## Validation

Run the commit-message validation pack or hook when available.

## Evidence

Report the final commit subject, whether a body is needed, and commit-message check status.
