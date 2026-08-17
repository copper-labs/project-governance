---
name: sveltekit-ui-library-integration
description: Implement or review repository profile-gated SvelteKit UI library integration, including Bits UI, Ark UI, Melt UI, shadcn-style registries, component wrappers, design tokens, accessibility, theming, SSR behavior, and dependency boundaries. Use only when a target profile selects a UI component library.
---

# SvelteKit UI Library Integration

## Trigger

Use this skill only when a target profile selects a UI component library or a task explicitly asks to
evaluate, add, migrate, or review a SvelteKit UI library such as Bits UI, Ark UI, Melt UI,
shadcn-style registries, or another component system.

## Required Reads

- `AGENTS.md`
- target profile UI library decision, design-system rules, accessibility requirements, and validation packs
- selected library docs for the target version
- nearest design tokens, component wrappers, registry config, app CSS, and component tests
- `svelte-5-component-authoring`
- `sveltekit-tailwind-design-system`

## Workflow

1. Confirm repository profile selection. If no UI library is selected, use local components or request
   an architecture decision instead of adding a library by preference.
2. Identify integration mode: direct library components, local wrappers, copied registry components,
   headless primitives, or migration from another system.
3. Keep public app components stable. Wrap third-party primitives when doing so protects product
   APIs, design tokens, accessibility defaults, or future replacement.
4. Preserve the target design system. Map library variants, CSS variables, themes, and tokens to
   project-owned values.
5. Verify accessibility behavior instead of assuming the library handles it: labels, roles, focus
   management, keyboard behavior, portals, dialogs, menus, comboboxes, and reduced motion.
6. Check SSR and hydration behavior for portals, browser APIs, generated ids, media queries, and
   client-only features.
7. Avoid mixing multiple component libraries in the same product surface unless migration is planned.
8. Keep dependencies narrow and auditable. Do not import a large library for one primitive without
   documenting the tradeoff.
9. Add component and browser tests for wrappers, accessibility-critical flows, and theme variants.

## Validation

Run UI-library validation packs. Common checks include:

- Svelte/TypeScript check
- lint and format
- dependency/license checks
- accessibility checks
- component tests for wrappers and variants
- Playwright smoke for dialogs, menus, comboboxes, forms, and keyboard flows
- SSR/hydration build or browser checks

## Evidence

Report repository profile library selection, integration mode, wrappers added, token/theme mapping,
accessibility checks, SSR/hydration risks, dependency impact, validation commands, and any component
library mixing or migration debt.
