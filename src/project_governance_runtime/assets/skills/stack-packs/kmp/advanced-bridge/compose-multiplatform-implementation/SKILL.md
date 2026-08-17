---
name: compose-multiplatform-implementation
description: Use when implementing or reviewing Compose Multiplatform UI in a governed KMP repo. Covers shared UI ownership, state/effect boundaries, resource handling, previews, platform expectations, accessibility, and tests.
---

# Compose Multiplatform Implementation

## Trigger

Use this skill for shared Compose UI, Compose resource handling, Compose navigation, preview/screenshot work, platform visual parity, accessibility, or UI tests in a KMP repository.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles for Compose, Android, desktop, iOS, web, or Wasm targets
- existing UI state, effect, theme, resource, and navigation patterns
- official Compose Multiplatform docs for version-sensitive APIs
- target validation packs for UI, accessibility, screenshots, and tests

## Workflow

1. Confirm whether the target intentionally shares UI with Compose or uses host-native UI over a headless KMP core.
2. Keep business logic out of composables. Feed composables immutable state and callbacks/intents.
3. Separate durable state from transient effects such as navigation, toasts, permission prompts, or analytics.
4. Keep platform-specific UI behavior behind narrow expect/actual, platform adapters, or host shell code.
5. Use shared resources only where target support is proven; keep host-specific assets and typography in host layers when needed.
6. Add accessibility identifiers and semantics that align with the repository selector policy.
7. Validate recomposition-sensitive areas with stable keys, bounded state observation, and screenshot or E2E proof where visual output matters.

## Validation

Run shared UI tests, platform compilation, screenshot/preview checks where available, accessibility checks, and host E2E smoke flows for changed public UI.

## Evidence

Report UI ownership decision, state/effect boundaries, resource strategy, platform exceptions, accessibility identifiers, visual proof, and validation commands.
