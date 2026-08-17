---
name: sveltekit-auth-session-boundaries
description: Implement or review repository profile-gated SvelteKit auth and session wiring, including hooks, cookies, locals, server-only session reads, provider adapters, route guards, CSRF, redirects, and safe client session projection. Use only when a target profile selects an auth provider or auth/session work is explicitly in scope.
---

# SvelteKit Auth Session Boundaries

## Trigger

Use this skill only when a target profile selects an auth provider or the task explicitly touches
SvelteKit auth, sessions, cookies, hooks, `locals`, route guards, OAuth/email/password provider
adapters, CSRF, redirects, or client session projection.

## Required Reads

- `AGENTS.md`
- target profile auth provider, session, security, deployment, and validation settings
- provider docs selected by the target profile
- nearest hooks, auth helpers, route guards, cookie/session configuration, and auth tests
- `sveltekit-server-boundaries-security`
- `sveltekit-data-loading` and `sveltekit-form-actions-zod` when auth affects routes or actions

## Workflow

1. Confirm the target profile selects or permits the auth provider. If not, stop and request a
   repository profile decision instead of inventing a provider default.
2. Keep provider-specific wiring isolated behind auth modules, hooks, or adapter files so product
   code depends on a small session/identity contract.
3. Store tokens, secrets, provider credentials, and refresh logic server-side. Project only minimal
   safe session data to the browser.
4. Configure cookies deliberately: secure, httpOnly where appropriate, sameSite, path, expiry,
   domain, and preview/staging differences.
5. Put route guards in server-aware locations. Do not rely only on hidden UI or client navigation
   for authorization.
6. Keep authentication separate from authorization, entitlement, licensing, and tenant policy unless
   the target explicitly combines them in a backend service.
7. Validate redirect targets and callback paths to avoid open redirects.
8. Model signed-out, pending, expired, unauthorized, insufficient-permission, and provider-error
   states.
9. Add tests for login/logout callback behavior where feasible, route guards, session projection,
   invalid/expired sessions, and unauthorized access.

## Validation

Run auth and security validation packs. Common checks include:

- TypeScript/Svelte check
- lint and format
- cookie/session configuration review
- route guard tests
- action/load tests for authenticated and unauthenticated users
- browser smoke for login/logout or mocked auth flow
- secret exposure and server-only import checks

## Evidence

Report repository profile auth provider, session contract, cookies configured, server-only data kept
private, route guards changed, client session projection, auth tests, validation commands, and any
provider setup or secret configuration left to operators.
