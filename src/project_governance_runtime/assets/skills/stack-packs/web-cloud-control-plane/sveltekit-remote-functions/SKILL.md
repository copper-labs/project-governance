---
name: sveltekit-remote-functions
description: Implement or review repository profile-gated SvelteKit remote functions, including query, command, form, server-only access, invalidation, validation, experimental feature risk, and migration alternatives. Use only when a target profile explicitly opts into SvelteKit remote functions.
---

# SvelteKit Remote Functions

## Trigger

Use this skill only when a target profile explicitly opts into SvelteKit remote functions or the
task explicitly asks to evaluate, implement, migrate, or review remote function usage.

## Required Reads

- `AGENTS.md`
- target profile feature flags, SvelteKit version, runtime, deployment, and validation settings
- current official SvelteKit remote functions docs
- nearest remote function files, route actions/load alternatives, and tests
- `sveltekit-server-boundaries-security`
- `sveltekit-form-actions-zod` when remote forms overlap native form actions

## Workflow

1. Confirm repository profile opt-in. If remote functions are not enabled or approved, recommend native
   SvelteKit load functions, form actions, or server endpoints instead.
2. Treat remote functions as an experimental/adoption-gated feature. Verify current docs and target
   SvelteKit version before editing.
3. Choose the narrowest primitive for intent: query for reads, command for imperative mutations, and
   form for form-shaped submissions when approved by target conventions.
4. Keep secrets, DB clients, entitlement, tenant checks, and privileged service calls server-only.
5. Validate inputs at the remote boundary with Zod or the target-approved equivalent.
6. Define invalidation and cache behavior explicitly. Avoid stale UI after mutations.
7. Keep remote functions small and product-intent named. Move shared business logic to server-only
   services when reuse grows.
8. Preserve progressive enhancement requirements. If no-JavaScript operation matters, confirm remote
   forms satisfy the workflow or use native form actions.
9. Add tests for valid input, invalid input, unauthorized access, cache invalidation, and deployment
   runtime behavior.

## Validation

Run remote-function and web validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- server-only import checks
- tests for query/command/form behavior
- browser smoke for mutation plus invalidation
- deployment adapter smoke when runtime support is uncertain

## Evidence

Report repository profile opt-in, current SvelteKit version checked, primitive chosen, validation schema,
server-only data protected, invalidation behavior, tests and smoke commands, and fallback path if
remote functions become unsuitable.
