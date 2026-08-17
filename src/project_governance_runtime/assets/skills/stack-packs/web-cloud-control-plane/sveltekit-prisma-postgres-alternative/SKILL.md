---
name: sveltekit-prisma-postgres-alternative
description: Implement or review repository profile-gated Prisma with PostgreSQL in SvelteKit as an explicit alternative to the Drizzle default, including schema, migrations, generated client, server-only access, transactions, tenancy, and deployment runtime constraints. Use only when a target profile selects Prisma.
---

# SvelteKit Prisma Postgres Alternative

## Trigger

Use this skill only when a target profile explicitly selects Prisma or a task is evaluating Prisma
as an alternative to the default Drizzle/PostgreSQL path.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile data/ORM decision, Prisma version, database provider, runtime, and validation packs
- nearest Prisma schema, migrations, generated client usage, repositories, and tests
- official Prisma docs or official Prisma skills for current commands and version-specific behavior
- `sveltekit-server-boundaries-security`

## Workflow

1. Confirm the target profile selects Prisma. If not, use `sveltekit-drizzle-postgres` or document
   the architecture decision needed to switch ORMs.
2. Keep Prisma Client server-only. Do not import generated clients into browser-facing modules.
3. Treat `schema.prisma` and migrations as durable contracts. Review model names, relation names,
   constraints, indexes, enums, defaults, and field nullability.
4. Use Prisma migrations according to target workflow. Avoid `db push` for production-like schema
   changes unless the target explicitly allows it.
5. Plan destructive schema changes with backup, migration, backfill, and rollback notes.
6. Keep transactions explicit for multi-step writes and use isolation options when product behavior
   needs them.
7. Keep tenant scope in every query that needs it. Test cross-tenant denial.
8. Watch runtime compatibility: serverless connection management, edge support, binary targets,
   generated client output, and deployment packaging.
9. Return route-safe DTOs instead of leaking broad Prisma models or internal fields.

## Validation

Run Prisma/data validation packs. Common checks include:

- Prisma format/validate/generate commands from the target profile
- migration generate/apply/dry-run where supported
- TypeScript/Svelte check
- lint and format
- repository/query tests, transaction tests, and tenancy tests
- server-only import checks for Prisma Client
- deployment build smoke for generated client packaging

## Evidence

Report repository profile Prisma selection, schema/migration changes, generated client impact,
transaction and tenant boundaries, runtime/deployment considerations, validation commands, and any
data migration or rollback work still required.
