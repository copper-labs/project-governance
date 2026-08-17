---
name: structured-discovery-interview
description: Use when intent is still ambiguous and an agent needs to turn a conversation, idea, or stakeholder request into clear goals, constraints, non-goals, risks, and next artifacts.
---

# Structured Discovery Interview

## Trigger

Use this skill when the user is exploring a product, architecture, workflow, integration, migration, or documentation idea before a stable PRD, spec, or plan exists.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- nearest existing PRD, spec, decision, or architecture doc for the area
- repository profile product and docs sections

## Workflow

1. Restate the intent in plain language and identify the decision or artifact the discovery should feed.
2. Collect known goals, users, constraints, non-goals, success signals, risks, dependencies, and open questions.
3. Ask only the highest-leverage missing questions; do not turn discovery into a questionnaire when evidence can be read locally.
4. Separate facts, assumptions, and decisions.
5. Identify candidate artifacts: PRD, spec, execution plan, decision record, brief, or no durable artifact.
6. End with a compact discovery summary and recommended next step.

## Validation

Check that the discovery output has traceable goals, open questions, source references where applicable, and a clear artifact recommendation. Run docs governance only when durable docs are created or changed.

## Evidence

Report the clarified intent, key constraints, unresolved questions, recommended artifact path, and whether the user must approve before implementation.
