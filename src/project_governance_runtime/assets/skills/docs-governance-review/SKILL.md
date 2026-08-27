---
id: skill.docs-governance-review
title: Docs Governance Review
stage: Review
provenance: package-default
---

# Docs Governance Review

Review documentation, traceability, frontmatter, context routing, and lifecycle changes.

## Trigger

Use this skill when docs under `docs/**`, root agent adapters, traceability maps, context routes, or
governed artifact lifecycle states change.

## Required Reads

- `AGENTS.md` or the nearest repository instruction authority
- `.governance/runtime/skills/resources/reader-first-authoring.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- the repository's documentation index, catalog, lifecycle, and traceability guidance when present

## Workflow

1. Identify every governed artifact touched or created.
2. Check frontmatter keys, status values, owner, summary, and artifact id consistency.
3. Verify configured catalog or traceability entries for durable docs.
4. Check local links and exact documentation routes.
5. Confirm lifecycle movement is intentional and supported by evidence.

## Validation

Consume existing subject-valid documentation proof. Run the documentation pack or one
project-owned extension only for a named uncovered claim; do not replay both after an unchanged
impacted sign-off.

## Evidence

Report docs checked, traceability changes, validation commands, unresolved link/frontmatter issues,
and any lifecycle or ownership risk using the shared review finding schema.
