---
name: sveltekit-stack-router
description: Route SvelteKit cloud-control-plane implementation, review, and debugging work to the narrowest web stack skill. Use when a task touches SvelteKit 5+, Svelte 5 components, TypeScript web code, Tailwind CSS, Drizzle/PostgreSQL, Zod validation, SvelteKit forms, deployment adapters, auth/session wiring, remote functions, or web-to-worker boundaries.
---

# SvelteKit Stack Router

## Trigger

Use this skill first for SvelteKit cloud-control-plane work when the task is broad, touches more
than one web layer, or needs the correct web stack skill selected.

This is a stack-local router. Use `context-router` to decide whether the web stack pack applies at
all, and use `typescript-implementation` for generic TypeScript/Node work that is not specific to
SvelteKit control-plane architecture.

## Required Reads

- `AGENTS.md`
- `.governance/runtime/skills/catalog.yaml`
- `.governance/runtime/skills/stack-packs/web-cloud-control-plane/manifest.yaml`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile sections for architecture preferences, platform profiles, skills, validation packs, and runtime/deployment choices
- affected package scripts, framework versions, route tree, data layer, and validation configuration

## Workflow

1. Confirm the target actually uses or is considering the web cloud-control-plane reference architecture.
2. Classify the task by primary ownership:
   - Svelte runes/reactivity: `svelte-5-runes-reactivity`
   - component API, markup, events, snippets, accessibility: `svelte-5-component-authoring`
   - route files, layouts, hooks, error boundaries, SSR: `sveltekit-routing-structure`
   - load functions, page data, invalidation: `sveltekit-data-loading`
   - form actions and validation: `sveltekit-form-actions-zod`
   - secrets, server-only modules, private env, DB/client boundary: `sveltekit-server-boundaries-security`
   - Drizzle/PostgreSQL schema, migrations, queries: `sveltekit-drizzle-postgres`
   - Tailwind and design tokens: `sveltekit-tailwind-design-system`
   - tests and browser proof: `sveltekit-testing-playwright-vitest`
   - adapters and runtime deployment: `sveltekit-deployment-adapters`
   - schema migration rollout, backfill, rollback, destructive changes: `sveltekit-db-migration-safety`
   - queues, workers, publishing, signing, encryption, entitlement, audit: `sveltekit-cloud-worker-boundary`
3. Use gated skills only when the target profile or explicit task selects that area:
   - auth provider/session wiring: `sveltekit-auth-session-boundaries`
   - SvelteKit remote functions: `sveltekit-remote-functions`
   - Prisma instead of Drizzle: `sveltekit-prisma-postgres-alternative`
   - Svelte 4 or legacy migration: `sveltekit-svelte5-migration-audit`
   - Superforms: `sveltekit-superforms`
   - Bits UI, Ark UI, Melt UI, shadcn-style registries, or other UI library: `sveltekit-ui-library-integration`
4. When a task spans multiple skills, read the most safety-critical skill first. Prefer this order:
   security boundary, worker boundary, data layer, form validation, routing/data loading, component/styling, tests/deployment.
5. Keep the stack preference advisory. Require rationale for alternatives, but block only on safety,
   trust-boundary, validation, or repository profile violations.
6. If official docs, framework versions, or feature stability are uncertain, verify current official
   docs before changing code or templates.

## Validation

Run the target profile's impacted web validation packs. Common checks include:

- package manager install consistency
- `npm run check` or equivalent Svelte/TypeScript check
- lint, format, code-smell, naming, comment-quality, and dependency checks
- unit/integration tests near changed server and component logic
- Playwright or equivalent smoke for critical operator flows
- security checks for secrets, env exposure, database access, and public input validation

## Evidence

Report the selected skill path, why it was selected, repository profile gates checked, impacted layers,
validation commands run, skipped checks with reasons, and any advisory stack deviations or safety
boundaries that remain unresolved.
