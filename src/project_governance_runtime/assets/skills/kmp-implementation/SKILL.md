---
id: skill.kmp-implementation
title: KMP Implementation
stage: Work
provenance: package-default
---

# KMP Implementation

Implement or review Kotlin Multiplatform changes with source-set and boundary discipline.

## Trigger

Use this skill when changing Kotlin Multiplatform source, Gradle KMP build logic, shared APIs,
Compose Multiplatform UI, platform bridges, common data/domain layers, or KMP tests.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- repository profile `quality.platform_profiles` entries with ecosystem `kmp`, `kotlin`, `android`, or `ios`
- repository profile validation packs for format, lint, code-quality, boundary, and tests
- nearest existing source-set, module, and test patterns

## Workflow

1. Inspect existing modules, source sets, public APIs, state patterns, data boundaries, and tests.
2. Decide whether each change belongs in `commonMain`, an intermediate source set, or a platform source set.
3. Keep shared code platform-neutral; move platform APIs behind narrow abstractions or platform implementations.
4. Preserve module APIs and avoid reaching into another module's internals.
5. Keep UI state immutable, effects separate from durable state, and business logic out of rendering code.
6. Add or update tests in the source set that owns the behavior.

## Stack Pack Routing

When a generated repository includes `.governance/runtime/skills/stack-packs/kmp/`, use the stack pack
manifest to select the most focused KMP skill:

- feature work: `kotlin-project-feature-implementation`
- bug work: `kotlin-project-bugfix`
- code review: `kotlin-kmp-code-review`
- architecture review: `kotlin-project-architecture-review`
- refactor or migration: `kotlin-kmp-refactor-safety`
- Gradle/build changes: `kotlin-build-kmp-gradle-governance`
- module boundaries: `kotlin-project-modularization`
- data layer: `kotlin-data-kmp-data-layer`
- platform bridges: `kotlin-platform-kmp-bridges`
- testing: `kotlin-testing-kmp`
- state management: `kotlin-project-state-management`
- Compose UI: `kotlin-ui-compose-multiplatform`
- adaptive UI/resources: `kotlin-ui-adaptive-resources`
- navigation: `kotlin-navigation-compose-multiplatform`
- Android app links/deep links: `kotlin-platform-app-links-and-deep-links`

When the generated repository includes the advanced bridge pack, route complex platform work to the
more specific skill:

- all-host bridge architecture: `kmp-cross-platform-bridge-architecture`
- event streams, buffering, sequence, and stale callback handling: `kmp-bridge-event-delivery`
- headless shared core with native host UI shells: `kmp-multi-host-ui-shell`
- Swift, native, FFI, JNI, cinterop, or generated binding boundaries: `kmp-platform-native-interop`
- cross-host E2E, selector parity, and test matrix design: `kmp-qa-parity-automation`
- Gradle conventions, target presets, CI lanes, native prebuilts, or publishing: `kmp-build-platform-governance`
- dependency and toolchain compatibility matrix changes: `kmp-matrix-dependency-governance`
- shared Compose UI implementation: `compose-multiplatform-implementation`
- React Native host bridge development loops: `react-native-bridge-dev-loop`

Use target governance when it conflicts with upstream stack-pack guidance. Check current official
documentation for version-sensitive platform claims before treating them as binding.

## Validation

Run the target profile's KMP build commands and validation packs for formatting, lint, code-smell,
comments, naming, platform boundaries, and tests. Escalate to broader checks when shared APIs,
Gradle build logic, or source-set boundaries change.

## Evidence

Report source-set placement decisions, module/API changes, tests added or skipped with reasons,
validation commands, and any portability or platform-specific risk.
