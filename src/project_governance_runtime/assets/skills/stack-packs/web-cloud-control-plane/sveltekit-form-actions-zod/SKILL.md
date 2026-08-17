---
name: sveltekit-form-actions-zod
description: Implement or review SvelteKit form actions with Zod validation, progressive enhancement, typed payloads, server-side trust boundaries, error handling, pending state, and post-submit behavior. Use when changing +page.server actions, form schemas, validation errors, form UI, or write workflows.
---

# SvelteKit Form Actions Zod

## Trigger

Use this skill when a change touches SvelteKit form actions, form validation, Zod schemas,
progressive enhancement, form UI state, write workflows, or server-side user input handling.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile form, validation, security, data, and test settings
- nearest existing `actions`, form components, schemas, and tests
- `sveltekit-server-boundaries-security`
- `sveltekit-drizzle-postgres` when writes touch PostgreSQL through Drizzle
- current official SvelteKit form action and Zod docs when behavior or APIs are uncertain

## Workflow

1. Classify the form as create, update, delete, search/filter, bulk action, upload, auth, or
   workflow command. Name the action by intent, not UI placement.
2. Keep validation on the server for trusted writes. Client validation may improve UX, but it must
   not be the only validation.
3. Define Zod schemas close to the boundary. Use shared schemas only when the schema is genuinely
   reused and safe in both client and server bundles.
4. Normalize raw `FormData` before validation. Preserve types intentionally for numbers, booleans,
   arrays, files, optional fields, and empty strings.
5. Return field errors, form errors, and safe status messages in a stable shape the UI can render.
6. Use redirects for successful navigational outcomes and action results for same-page feedback.
7. Model pending, success, validation failure, authorization failure, conflict, and unexpected error
   states. Avoid losing user input on validation failure.
8. Keep authorization, tenancy, entitlement, and rate/abuse checks in server-only code.
9. Wrap database writes in transactions when multiple records must remain consistent.
10. Add tests for valid submit, invalid payload, unauthorized user, stale/conflicting state, and
    unexpected server failure.

## Validation

Run impacted form and server validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- Zod schema tests for valid and invalid payloads
- action integration tests for success, errors, redirects, and auth gates
- Playwright smoke for critical form flows with and without JavaScript when feasible
- server-only import and secret exposure checks
- database migration/query tests when form writes change persistence

## Evidence

Report form intent, schema location, payload normalization, validation/error shape, auth and tenant
checks, transaction boundaries, pending/success/error UI states, validation commands, and any client
validation that is advisory only.
