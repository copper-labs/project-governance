---
name: sveltekit-tailwind-design-system
description: Implement or review Tailwind CSS in SvelteKit with project-owned design tokens, responsive layout, accessible states, maintainable utility composition, component styling boundaries, and visual QA. Use when changing Tailwind configuration, app CSS, design tokens, Svelte component styling, layout, themes, or visual system primitives.
---

# SvelteKit Tailwind Design System

## Trigger

Use this skill when a change touches Tailwind configuration, app CSS, design tokens, utility
classes, responsive layout, themes, component styling, visual primitives, or UI polish in a
SvelteKit project.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- target profile UI, design-system, accessibility, and validation settings
- nearest Tailwind config, app CSS, theme tokens, component primitives, and visual tests
- `svelte-5-component-authoring`
- current official Tailwind/SvelteKit docs when setup or version behavior is uncertain

## Workflow

1. Identify the design-system owner: Tailwind theme tokens, CSS custom properties, component
   variants, UI library config, or app-level CSS.
2. Prefer project-owned tokens and existing spacing, color, typography, radius, and shadow scales.
   Do not introduce one-off palettes or local magic values without a reason.
3. Keep utility classes readable. Extract component variants only when repetition or conditional
   composition becomes hard to understand.
4. Keep responsive behavior explicit with stable layout constraints. Prevent dynamic text, icons,
   hover states, or async content from shifting fixed-format UI.
5. Model focus, hover, disabled, selected, loading, empty, error, destructive, and reduced-motion
   states when relevant.
6. Preserve accessibility: contrast, focus visibility, semantics, keyboard targets, and motion
   preferences matter more than visual novelty.
7. Keep global CSS small and intentional. Use component-scoped styling or tokens for local concerns.
8. Avoid styling changes that silently alter product meaning, density, or workflow priority.
9. Validate on the viewports and themes the target profile requires.

## Validation

Run impacted UI validation packs. Common checks include:

- Svelte/TypeScript check
- lint, format, and style lint where configured
- accessibility checks
- component/browser tests for interactive states
- screenshot or visual regression checks for high-risk UI
- responsive smoke for target mobile, tablet, and desktop breakpoints
- contrast or theme checks when colors change

## Evidence

Report tokens or theme settings changed, components affected, responsive states checked, accessibility
evidence, screenshots or visual checks when applicable, validation commands, and any visual risk
left for human review.
