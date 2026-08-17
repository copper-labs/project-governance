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

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `docs/governance/README.md`
- `docs/governance/artifact-lifecycle.md`
- `docs/governance/traceability-map.yaml`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile `docs`

## Workflow

1. Identify every governed artifact touched or created.
2. Check frontmatter keys, status values, owner, summary, and artifact id consistency.
3. Verify traceability entries for durable docs.
4. Check local links and context-route references.
5. Confirm lifecycle movement is intentional and supported by evidence.

## Validation

Run the docs-governance validation pack when the target configures one.

## Evidence

Report docs checked, traceability changes, validation commands, unresolved link/frontmatter issues,
and any lifecycle or ownership risk using the shared review finding schema.
