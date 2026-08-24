---
name: kmp-source-sets-and-platform-boundaries
description: Place KMP behavior in the narrowest valid source set and isolate platform APIs without leaking target types or inventing unsupported sharing.
---

# KMP Source Sets and Platform Boundaries

Use this skill when code moves among `commonMain`, intermediate source sets, and platform source
sets, or when `expect`/`actual`, platform services, or target-specific dependencies are involved.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-source-sets-and-platform-boundaries/references/decision-guide.md`
for hierarchy and boundary choices.

## Place code deliberately

1. Enumerate the compilations that must consume the behavior. Source-set names are not evidence;
   inspect the declared targets and hierarchy.
2. Prefer the default hierarchy template when it represents the target set. Add an intermediate
   set only for a real shared API or dependency available to all of its compilations.
3. Put platform-neutral contracts and policy in the narrowest common set. Put platform APIs,
   lifecycle bindings, and native dependencies in the corresponding intermediate or platform set.
4. Choose a common interface with injected platform implementations when behavior is composable or
   testable. Use `expect`/`actual` when the declaration itself is inherently platform-shaped and
   every declared target has an honest implementation.
5. Keep platform types, error objects, handles, and generated bindings from leaking into common
   APIs. Translate at one named boundary.

## Wearable and bridge pressure

`watchosMain`, Apple intermediates, Wear OS Android targets, and phone targets may share libraries
without sharing lifecycle, power, sensors, UI, or connectivity behavior. Keep those mechanics in
their owning target sets and project only stable state or commands across the bridge.

## Evidence

Report the target-to-source-set graph, placement rationale, dependency availability, boundary API,
implementations for every supported target, and focused common plus platform tests. Stop if a new
intermediate set would hide incompatible APIs or if a declared target has no implementation.
