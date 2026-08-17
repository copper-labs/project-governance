---
name: docs-structure-migration
description: Use when moving, renaming, splitting, or consolidating repository docs while preserving frontmatter, links, traceability, reader entry points, and agent context routing.
---

# Docs Structure Migration

## Trigger

Use this skill for documentation reorganization, governed artifact moves, filename changes, link rewrites, traceability updates, or context-route changes.

## Required Reads

- `AGENTS.md`
- `docs/index.md`
- docs lifecycle, traceability, context routes, and generator rules
- existing source docs, inbound links, and repository profile docs settings

## Workflow

1. Inventory docs being moved and every inbound link or traceability reference.
2. Preserve or intentionally update frontmatter ids according to lifecycle policy.
3. Move content into the target docs layer that matches its durable purpose.
4. Rewrite links, context-router paths, traceability entries, and index references.
5. Add redirects or tombstones only if the target docs policy requires them.
6. Run docs validation before closeout.

## Validation

Run docs-governance, link checks, context-route validation, traceability validation, and repository profile validation when profile paths changed.

## Evidence

Report moved docs, id decisions, link/traceability updates, validation commands, and any reader-facing migration notes.
