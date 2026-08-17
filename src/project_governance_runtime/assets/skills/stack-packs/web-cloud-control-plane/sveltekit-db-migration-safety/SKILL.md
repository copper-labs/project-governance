---
name: sveltekit-db-migration-safety
description: Plan or review database migration safety for SvelteKit control-plane projects, including expand-contract rollout, rollback, backfill, destructive-change review, lock duration, zero-downtime compatibility, Drizzle or Prisma migration commands, and production release evidence. Use when schema, migration, data backfill, or database rollout behavior changes.
---

# SvelteKit DB Migration Safety

## Trigger

Use this skill when a change touches database schema, migrations, backfills, seed data, destructive
changes, indexes, constraints, generated ORM migrations, data rollout plans, or production database
release safety.

## Required Reads

- `AGENTS.md`
- `docs/governance/validation-strategy.md`
- target profile data, migration, dependency, deployment, release, and rollback settings
- nearest schema, migration files, migration history, data-access layer, release plan, and rollback docs
- `sveltekit-drizzle-postgres` for Drizzle-backed targets
- `sveltekit-prisma-postgres-alternative` only when the target profile selects Prisma
- `sveltekit-deployment-adapters` when runtime or release topology affects migration timing

## Workflow

1. Classify the migration as additive, compatible change, backfill, index/constraint change,
   rename, type change, deletion, data rewrite, seed change, or generated-client change.
2. Prefer expand/contract rollout for production systems:
   - expand with backward-compatible schema
   - deploy code that can read/write both old and new shape where needed
   - backfill safely and observe
   - contract only after old code paths and old data are gone
3. Treat destructive changes as release risks. Require explicit backup, rollback, backfill,
   communication, and approval notes before dropping columns, tables, enum values, or constraints.
4. Check lock duration and table size before adding indexes, constraints, defaults, not-null
   columns, or broad rewrites on live tables.
5. Keep application code compatible with the deployed migration order. Do not require new code and
   new schema to land atomically unless the target release process guarantees it.
6. Review generated migrations. Confirm they match the intended schema and do not include accidental
   drops, table rewrites, or data-loss operations.
7. Keep backfills idempotent, resumable, observable, and tenant-safe. Long backfills belong in
   workers or one-off operations, not web request handlers.
8. Add tests for old/new compatibility, data mapping, tenant scope, rollback assumptions, and query
   behavior after migration.
9. Record release evidence: migration command, dry run or staging apply, rollback note, backup note,
   and post-deploy verification.

## Validation

Run migration and release validation packs. Common checks include:

- ORM migration generate/check command from the target profile
- migration dry-run, staging apply, or local apply/reset where supported
- TypeScript/Svelte check for generated client or typed schema changes
- repository/query tests and compatibility tests
- backfill tests or dry-run proof
- database explain or lock-risk review for critical indexes/constraints
- release-readiness review for destructive or production-impacting migrations

## Evidence

Report migration classification, expand/contract plan, generated migration review, destructive-change
risk, lock/backfill concerns, compatibility tests, migration commands, rollback/backup evidence, and
operator approvals or release steps still required.
