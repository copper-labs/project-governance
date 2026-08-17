---
name: sveltekit-drizzle-postgres
description: Implement or review Drizzle ORM with PostgreSQL in SvelteKit, including schema ownership, migrations, server-only database access, query composition, transactions, constraints, indexes, tenancy, and data tests. Use when changing Drizzle schema, migrations, queries, database clients, repositories, or PostgreSQL-backed workflows.
---

# SvelteKit Drizzle Postgres

## Trigger

Use this skill when a change touches Drizzle schema, migrations, database clients, query builders,
repositories, transactions, PostgreSQL constraints, indexes, seed data, tenancy, or SvelteKit
server workflows backed by PostgreSQL.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile data, migration, deployment, security, and validation settings
- nearest schema files, migration folder, database client, repository/data-access patterns, and tests
- `sveltekit-server-boundaries-security`
- current official Drizzle/PostgreSQL docs and Svelte CLI Drizzle docs when APIs or setup are uncertain

## Workflow

1. Keep the database client and Drizzle schema server-only. Do not expose DB clients, connection
   strings, or query helpers to browser bundles.
2. Treat schema files as durable contracts. Name tables, columns, constraints, indexes, and enums
   clearly and consistently with target naming policy.
3. Prefer explicit constraints over application-only assumptions: primary keys, foreign keys,
   uniqueness, not-null, check constraints where supported, and indexes for lookup paths.
4. Generate and review migrations. Do not hand-edit generated migrations unless the target workflow
   allows it and the reason is documented.
5. Avoid destructive migration changes without an approved rollout plan, backup/restore strategy,
   and data backfill path.
6. Keep tenant, organization, or account scope in every query that needs it. Add tests for
   cross-tenant denial when applicable.
7. Use transactions for multi-step writes that must succeed or fail together.
8. Keep repository/query functions focused. Return typed DTOs for route/page use instead of leaking
   broad rows or internal fields.
9. Watch for N+1 queries, unbounded lists, missing pagination, and filters that bypass indexes.
10. Keep seed and fixture data safe, deterministic, and separate from production secrets.

## Validation

Run impacted data validation packs. Common checks include:

- Drizzle migration generation/check command from the target profile
- TypeScript/Svelte check
- lint and format
- unit/integration tests for queries, repositories, transactions, and tenancy
- migration apply/rollback or dry-run where the target supports it
- database performance or explain checks for critical queries
- server-only import checks for database clients

## Evidence

Report schema and migration changes, constraints/indexes added or changed, destructive migration
risk, transaction boundaries, tenant filters, query tests, migration commands, and any production
rollout steps or data backfills still needed.
