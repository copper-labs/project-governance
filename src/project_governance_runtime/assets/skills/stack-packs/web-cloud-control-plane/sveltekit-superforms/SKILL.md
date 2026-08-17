---
name: sveltekit-superforms
description: Implement or review repository profile-gated Superforms usage with SvelteKit and Zod, including schema adapters, server validation, form state, progressive enhancement, error handling, nested data, files, and native form action boundaries. Use only when a target profile adopts Superforms.
---

# SvelteKit Superforms

## Trigger

Use this skill only when a target profile explicitly adopts Superforms or a task asks to evaluate,
implement, migrate, or review Superforms in a SvelteKit form workflow.

## Required Reads

- `AGENTS.md`
- target profile form library decision, validation settings, SvelteKit version, and test packs
- current Superforms docs for the target version
- nearest form actions, Zod schemas, Superforms helpers, form components, and tests
- `sveltekit-form-actions-zod`
- `sveltekit-server-boundaries-security`

## Workflow

1. Confirm repository profile Superforms adoption. If absent, use native SvelteKit form actions plus
   Zod or request an explicit profile decision.
2. Keep server validation authoritative. Superforms client helpers may improve UX, but trusted
   writes still validate server-side.
3. Keep schema ownership clear. Share schemas only when safe for client bundles and useful across
   boundaries.
4. Use Superforms helpers consistently for form initialization, validation result shape, errors,
   tainted state, enhancement, and reset behavior.
5. Model nested data, arrays, optional values, empty strings, numbers, booleans, and files
   explicitly. Do not rely on accidental coercion.
6. Preserve progressive enhancement requirements. Confirm no-JavaScript behavior if the product
   needs it.
7. Keep authorization, tenancy, entitlement, and privileged writes outside client-side form helpers.
8. Avoid mixing multiple form-state systems in one workflow unless migration requires it.
9. Add tests for valid submit, invalid payload, nested fields, authorization failure, pending state,
   and error rendering.

## Validation

Run form validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- schema tests
- action integration tests for Superforms result shape
- component tests for error and pending states
- Playwright smoke for critical forms
- server-only import and secret exposure checks

## Evidence

Report repository profile Superforms opt-in, schema ownership, server validation path, form state
helpers used, progressive enhancement behavior, tests and validation commands, and any migration
mixing with native forms.
