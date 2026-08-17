---
id: skill.frame
title: Frame
stage: Frame
provenance: package-default
---

# Frame

Define the work boundary before planning or editing.

## Trigger

Use this skill when a request is ambiguous, cross-cutting, high-risk, or governed by durable docs,
plans, specs, issues, or generated template policy.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `docs/governance/context-routing.md`
- Latest router packet or route evidence when available

## Workflow

1. Restate the requested outcome and identify the governing artifact or missing artifact.
2. Select the narrowest context route and list the files or facts needed next.
3. Classify risk: docs-only, source change, architecture, security, release, migration, or unknown.
4. Decide whether a durable plan, spec update, or direct small change is appropriate.
5. Record blockers, assumptions, and validation packs expected later.

## Validation

Run the context-router pack when route config or route fixtures change. For ordinary framing, record
the selected route and why it is sufficient.

## Evidence

Report the framed outcome, governing artifact, selected route, risk class, assumptions, and next
stage.
