---
name: external-docs-authoring
description: Use when writing externally consumed docs such as customer guides, developer guides, onboarding docs, public release notes, support docs, or partner-facing instructions.
---

# External Docs Authoring

## Trigger

Use this skill when creating or revising docs for people outside the implementation team.

## Required Reads

- `AGENTS.md`
- target writing style guide and terminology rules
- approved product/spec/source-of-truth docs
- target audience, prerequisites, supported versions, and validation evidence

## Workflow

1. Identify audience, job-to-be-done, prerequisites, supported environment, and expected outcome.
2. Use plain language and define necessary terms on first use.
3. Avoid internal codenames, ticket IDs, unreleased implementation details, and unexplained acronyms.
4. Provide steps that can be followed, verified, and recovered from when something fails.
5. Keep examples current with the actual product/API surface.
6. Ask for source-of-truth confirmation when docs imply contractual support, pricing, legal, safety, or security behavior.

## Validation

Consume existing docs, link, and prose proof. Run only the missing deterministic owner for a named
gap, plus command/example verification or product-owner review when the public claim specifically
requires it; do not replay every configured documentation check as a second matrix.

## Evidence

Report audience, source docs used, commands/examples verified, public claims needing review, validation status, and residual doc risk.
