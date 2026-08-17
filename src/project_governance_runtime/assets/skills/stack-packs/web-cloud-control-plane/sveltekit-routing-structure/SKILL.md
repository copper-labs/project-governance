---
name: sveltekit-routing-structure
description: Implement or review SvelteKit routing structure, including +page, +layout, +server, hooks, route groups, dynamic routes, error boundaries, redirects, SSR settings, and route ownership. Use when changing SvelteKit route files, layouts, navigation, route-level server code, or application shell behavior.
---

# SvelteKit Routing Structure

## Trigger

Use this skill when a change touches SvelteKit route files, layouts, route groups, dynamic routes,
navigation, hooks, error boundaries, `+server` endpoints, SSR/prerender settings, redirects, or
application shell behavior.

## Required Reads

- `AGENTS.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile routing, runtime, auth, deployment, and validation settings
- nearest existing route tree and route conventions
- `sveltekit-data-loading` for `load` behavior
- `sveltekit-server-boundaries-security` for server-only code, private env, auth, or DB access
- current official SvelteKit docs when route semantics or feature stability is uncertain

## Workflow

1. Map the affected route tree before editing. Identify shared layouts, route groups, dynamic
   params, server files, and error boundaries.
2. Put route-specific UI in `+page.svelte`; shared shell and cross-page data in the nearest
   appropriate `+layout` files.
3. Keep route groups organizational. Do not let grouping hide ownership, auth, or data boundary
   changes.
4. Put trusted server work in server-only files: `+page.server.ts`, `+layout.server.ts`,
   `+server.ts`, hooks, or `$lib/server`.
5. Keep browser navigation behavior predictable. Use SvelteKit redirects and errors instead of
   ad hoc client-only routing for server-known outcomes.
6. Define error and not-found behavior near the route that owns the user experience.
7. Keep route params typed and validated before they cross data, auth, or tenant boundaries.
8. Avoid disabling SSR, enabling prerender, or changing trailing-slash/base/path behavior without a
   deployment-aware reason.
9. Preserve the application shell. Route-level changes should not silently alter global nav,
   session handling, theme, telemetry, or layout density.

## Validation

Run the target profile's routing and web validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- route-level unit/integration tests
- Playwright smoke for changed navigation, redirects, errors, auth gates, and params
- server-only import checks
- deployment adapter checks when SSR, prerender, or platform runtime settings change

## Evidence

Report the affected route tree, ownership changes, server/client boundary choices, params validated,
SSR/prerender changes, error/redirect behavior, validation commands, and any routes needing manual
review.
