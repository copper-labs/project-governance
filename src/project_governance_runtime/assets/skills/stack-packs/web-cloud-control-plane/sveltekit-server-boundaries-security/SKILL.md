---
name: sveltekit-server-boundaries-security
description: Enforce SvelteKit server/client boundaries for secrets, private environment variables, database clients, auth, entitlement, tenant checks, server-only modules, and public input validation. Use when code touches $env/static/private, $env/dynamic/private, $lib/server, .server files, hooks, actions, load functions, endpoints, or browser imports.
---

# SvelteKit Server Boundaries Security

## Trigger

Use this skill when a change touches secrets, environment variables, database clients, auth,
entitlement, tenant checks, server-only files, hooks, actions, load functions, endpoints, public
input, or any code imported by browser-facing modules.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile security, auth, runtime, data, and validation settings
- nearest server-only modules, hooks, env configuration, data clients, and tests
- `sveltekit-cloud-worker-boundary` when the work involves durable jobs or privileged pipelines
- current official SvelteKit server-only modules and env docs when imports or runtime behavior are uncertain

## Workflow

1. Draw the import path from each changed file to browser-facing code. Treat any route component or
   universal module import as potentially client-bundled.
2. Keep private env vars, secrets, database clients, privileged SDKs, entitlement decisions, and
   tenant checks in server-only locations: `$lib/server`, `.server.ts`, server route files, hooks,
   or backend services.
3. Never import server-only modules from `.svelte`, universal `load`, browser utilities, stores, or
   shared components.
4. Validate all public input at the server boundary with Zod or a target-approved equivalent before
   it reaches auth, data, worker, or publishing logic.
5. Make authorization and tenancy checks explicit and close to the trusted operation. Do not rely
   only on hidden UI state.
6. Keep cookies, sessions, and locals server-owned. Expose only minimal derived session data to the
   client.
7. Treat logs as a data boundary. Do not log secrets, raw tokens, private payloads, or broad tenant
   data.
8. Use safe error messages across browser boundaries. Preserve detailed diagnostics only in trusted
   logs or traces.
9. If privileged work cannot safely complete inside a request, move it to a worker/service boundary
   with an explicit job record or service contract.

## Validation

Run security and web validation packs. Common checks include:

- Svelte/TypeScript check
- lint and import-boundary checks
- secret scanning and private env exposure checks
- tests for unauthorized, cross-tenant, invalid input, and missing-session paths
- browser build or bundle check when import leakage is plausible
- code review for logging, error shape, and server-only module placement

## Evidence

Report import paths checked, server-only files involved, env vars or secrets protected, public input
schemas, auth/tenant/entitlement checks, client data exposed, security validation commands, and any
remaining manual review required.
