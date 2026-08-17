---
name: sveltekit-data-loading
description: Design or review SvelteKit data loading with server and universal load functions, page data contracts, invalidation, caching, params, redirects, errors, and trust boundaries. Use when changing +page.server, +layout.server, +page, +layout, load functions, page data, or data dependencies.
---

# SvelteKit Data Loading

## Trigger

Use this skill when a change touches SvelteKit `load` functions, page data, params, invalidation,
server/universal data ownership, redirects, errors, caching, or data dependencies.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile web, runtime, security, data, and validation settings
- nearest route files and data-loading tests
- `sveltekit-server-boundaries-security` when private data, DB access, auth, or secrets are involved
- `sveltekit-drizzle-postgres` when load functions read or shape database data
- current official SvelteKit load docs when semantics are uncertain

## Workflow

1. Classify each data need as public page data, trusted server-only data, session/auth data,
   tenant-scoped data, or derived UI-only data.
2. Use server load functions for private data, DB access, secrets, tenant checks, and entitlement
   decisions. Universal load must receive only data safe for the browser.
3. Keep page data contracts typed and minimal. Do not leak raw database rows, secrets, internal
   audit fields, or broader tenant data than the route needs.
4. Validate and normalize route params before using them in data queries or authorization checks.
5. Use SvelteKit redirects and errors for expected control flow. Keep user-facing error messages
   safe and useful.
6. Track dependencies and invalidation deliberately. Avoid broad invalidation that refreshes more
   data than the workflow needs.
7. Avoid hiding long-running work inside load functions. Use job records, workers, queues, or
   service APIs for expensive workflows.
8. Keep data shaping close to ownership. Shared selectors or DTO builders may live in server-only
   modules when reused.
9. Add tests for successful data load, missing/invalid params, unauthorized access, empty states,
   and error paths.

## Validation

Run impacted web validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- unit/integration tests for load functions and data selectors
- route smoke tests for params, auth gates, redirects, errors, and empty states
- server-only import and secret exposure checks
- database query tests or migration checks when data shape changes

## Evidence

Report data classification, server/universal load placement, DTO or page data shape changes,
param/auth validation, invalidation behavior, tests run, validation commands, and any data exposure
or caching risks.
