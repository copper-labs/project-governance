---
name: sveltekit-svelte5-migration-audit
description: Audit and guide migration of existing Svelte/SvelteKit code to Svelte 5 patterns, including legacy reactivity, export let, event syntax, slots, stores, lifecycle usage, route files, form actions, and SSR behavior. Use when upgrading Svelte, reviewing legacy syntax, or preparing a Svelte 5 migration plan.
---

# SvelteKit Svelte 5 Migration Audit

## Trigger

Use this skill when a codebase is upgrading to Svelte 5, contains legacy Svelte syntax, mixes runes
and legacy patterns, or needs a migration audit before implementation.

## Required Reads

- `AGENTS.md`
- target profile current Svelte/SvelteKit versions, migration policy, validation packs, and release constraints
- package manifests, Svelte config, Vite config, route tree, and representative legacy components
- current official Svelte 5 migration guide
- `svelte-5-runes-reactivity`
- `sveltekit-routing-structure` when route or SSR behavior changes

## Workflow

1. Inventory framework versions and migration constraints. Confirm whether the target allows gradual
   migration or requires a coordinated upgrade.
2. Scan for legacy syntax: `$:` reactive statements, `export let`, `on:` event handlers, `<slot>`,
   `$$props`, `$$slots`, `<svelte:component>`, broad stores, legacy lifecycle assumptions, and
   old action patterns.
3. Classify each finding as mechanical migration, behavior-sensitive migration, public component API
   change, test gap, or deliberate legacy hold.
4. Separate framework upgrade, syntax migration, behavior changes, and visual changes into distinct
   implementation slices where possible.
5. Preserve SSR and hydration behavior. Watch for module-level state, browser-only APIs, and route
   data leakage.
6. Prefer official migration tooling for mechanical changes, then manually review the result.
7. Add or update tests before behavior-sensitive migrations.
8. Keep compatibility notes for public components, package exports, or downstream consumers.
9. Do not turn migration into broad refactoring unless the execution plan explicitly approves it.

## Validation

Run migration validation packs. Common checks include:

- dependency install and lockfile check
- Svelte/TypeScript check
- lint and format
- Svelte migration/autofix tooling where available
- component and route tests around migrated behavior
- browser smoke for hydration, forms, navigation, and critical flows
- bundle/build check for deprecated imports or runtime warnings

## Evidence

Report version inventory, legacy patterns found, migration slice plan, behavior-sensitive files,
tests added or needed, validation commands, compatibility risks, and any deliberate legacy syntax
remaining with rationale.
