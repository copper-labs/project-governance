---
name: svelte-5-component-authoring
description: Build or review Svelte 5 components with stable props, events, snippets, accessibility, styling hooks, state boundaries, and readable markup. Use when creating or changing Svelte components, component APIs, reusable UI primitives, page sections, design-system components, or component-level behavior.
---

# Svelte 5 Component Authoring

## Trigger

Use this skill when creating, editing, or reviewing `.svelte` components, component APIs, reusable
UI primitives, page sections, accessibility behavior, snippets, bindings, events, or component
composition.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/writing-style-guide.md`
- target profile UI, accessibility, TypeScript, and validation settings
- nearest existing components, layout primitives, design tokens, and test examples
- `svelte-5-runes-reactivity` when state, props, or effects are non-trivial
- `sveltekit-tailwind-design-system` when Tailwind classes or design tokens are involved

## Workflow

1. Identify component responsibility in one sentence. Split only when responsibilities are truly
   separate or local conventions already use smaller primitives.
2. Keep public component APIs small, typed, and stable. Prefer named props, clear event/callback
   names, and explicit children/snippet slots.
3. Keep ownership clear: parent owns workflow state, component owns local interaction state, server
   owns trusted data, and shared stores are used only for intentional cross-tree state.
4. Use accessible HTML first. Preserve labels, roles, focus order, keyboard behavior, reduced-motion
   needs, and error announcements for form-like controls.
5. Make empty, loading, error, disabled, pending, and unauthorized states explicit when users can
   encounter them.
6. Keep markup readable. Avoid deeply nested conditionals, hidden side effects in templates, and
   broad prop spreading unless local patterns justify it.
7. Use snippets for reusable markup seams and composition points. Avoid legacy slot patterns in new
   Svelte 5 code unless migrating incrementally.
8. Keep component styles scoped or tokenized. Do not introduce one-off styling systems beside the
   target design system.
9. Add or update tests for user-observable behavior, not implementation trivia.

## Validation

Run the target profile's component validation packs. Common checks include:

- Svelte/TypeScript check
- lint, format, naming, comment-quality, and code-smell checks
- accessibility checks where available
- component tests for state, props, callbacks, snippets, and error states
- browser smoke for important interaction flows
- visual or screenshot checks when layout risk is material

## Evidence

Report component responsibility, public API changes, state ownership, accessibility checks, states
covered, tests added or updated, validation commands, and any intentionally deferred UI states.
