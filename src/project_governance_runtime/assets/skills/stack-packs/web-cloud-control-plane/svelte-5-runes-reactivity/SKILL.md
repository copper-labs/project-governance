---
name: svelte-5-runes-reactivity
description: Implement or review Svelte 5 runes reactivity, including $state, $derived, $effect, $props, $bindable, snippets, event syntax, and migration away from legacy Svelte reactivity. Use when editing .svelte, .svelte.ts, or .svelte.js files with reactive state, derived values, effects, props, context, stores, or component migration concerns.
---

# Svelte 5 Runes Reactivity

## Trigger

Use this skill when a change touches Svelte 5 reactivity, component state, derived values, effects,
props, snippets, event syntax, legacy `$:` logic, stores, or `.svelte.ts` / `.svelte.js` modules.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/architecture/reference-architectures/web-cloud-control-plane.md`
- target profile Svelte/SvelteKit platform profile and validation packs
- nearest existing `.svelte`, `.svelte.ts`, and `.svelte.js` files that show local conventions
- current official Svelte 5 docs for runes or migration when syntax or feature stability is uncertain

## Workflow

1. Identify every reactive value and classify it as local state, derived value, prop, bindable prop,
   external subscription, persistent store, or non-reactive local variable.
2. Use `$state` only for values that must update markup, derived values, or effects. Keep ordinary
   variables ordinary.
3. Use `$derived` or `$derived.by` for computed values. Do not use `$effect` to compute values that
   can be derived.
4. Treat `$effect` as an integration escape hatch for browser APIs, imperative libraries, logging,
   or external subscriptions. Keep effects small, idempotent, and cleanup-aware.
5. Use `$props` for component inputs and derive anything that must update when props change.
6. Use `$bindable` only for intentional two-way component APIs. Prefer explicit events or callbacks
   when ownership should stay with the parent.
7. Prefer typed context helpers or existing local context patterns over shared module state that can
   leak across SSR requests.
8. Prefer snippets and `{@render}` for reusable markup slots in Svelte 5 code. Preserve existing
   local conventions when migrating gradually.
9. Avoid legacy syntax in new Svelte 5 code: `$:` assignments, `export let`, `on:` event handlers,
   `<slot>`, `$$props`, `$$slots`, and broad store usage when runes are clearer.
10. When migrating, keep behavior stable. Make syntax changes separately from product behavior
    changes unless the execution plan explicitly approves both.

## Validation

Run the target profile's Svelte validation packs. Common checks include:

- Svelte typecheck or `npm run check`
- lint and format
- component/unit tests for reactive updates
- interaction tests for prop, event, binding, and snippet behavior
- browser smoke when hydration or SSR behavior could change
- Svelte autofix or official documentation lookup when the target tooling provides it

## Evidence

Report state ownership decisions, any legacy syntax removed or intentionally kept, effects added and
why they cannot be derived, prop/binding API changes, SSR leakage risks checked, validation commands,
and remaining migration risks.
