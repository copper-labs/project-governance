---
name: kmp-multi-host-ui-shell
description: Use when a KMP product shares business logic and state while rendering UI natively across several host stacks. Applies the headless shared core, feature contract parity, host-owned navigation, override-first renderer registry, and thin shell adapter pattern.
---

# KMP Multi-Host UI Shell

## Trigger

Use this skill for products that use KMP as a shared core while exposing Android, iOS, React Native, Flutter, web, or other host-native user interfaces.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles for every host stack
- existing feature contract, state, intent, effect, and lifecycle patterns
- host UI override or renderer registry patterns
- target validation packs for KMP, host UI, and E2E proof

## Workflow

1. Keep shared KMP modules headless: domain, data, repositories, state machines, orchestration, reducers, and contracts are allowed; host UI frameworks are not.
2. Give each feature immutable state, typed intents, typed effects, dispatch semantics, and explicit close/dispose behavior.
3. Let shared core describe navigation or side effects, while the host executes routing, presentation, permissions, and platform UI behavior.
4. Implement default visuals in each host language/UI stack when customer-facing default UI is in scope.
5. Use an override-first registry or equivalent host mechanism where defaults are registered first and app overrides replace them without changing shared policy.
6. Keep shell adapters thin: subscribe to state, render through host registry/components, dispatch intents, handle effects, and own lifecycle/cancellation.
7. Keep TypeScript, Dart, Swift, Kotlin, and browser-facing payloads portable. Prefer JSON/value objects or generated DTOs when typed interop is not stable.
8. Add shared tests for state-machine behavior and host tests for default rendering, override seams, and lifecycle cleanup.

## Validation

Run common KMP tests for reducers/state machines, host UI tests for affected targets, bridge contract tests for cross-language payloads, and E2E smoke flows when public behavior changes.

## Evidence

Report feature contracts changed, source-set placement, host shell responsibilities, override seam behavior, tests added, and any host where default UI or parity remains deferred.
