---
id: reference.kmp-skill-inventory
title: KMP Skill Inventory
type: reference
status: current
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Current Kotlin Multiplatform skill surface, provenance, overlaps, and quality gaps.
---

# KMP Skill Inventory

This inventory records what the wheel already ships before new Kotlin Multiplatform (KMP) skills
are acquired or authored. It is a dated assessment, not a claim that every listed skill is mature
or current.

## Snapshot

As of 2026-08-24, the wheel contains one KMP router and 24 leaf skills:

- 15 imported Apache-2.0 skills from `mmiani/kotlin-kmp-claude-agent-skills`;
- 9 internally authored advanced bridge and implementation skills; and
- 0 behavior-evaluation suites that demonstrate activation, correctness, or restraint.

The current opportunity is therefore not merely to add prompts. It is to turn a broad but uneven
collection into a governed capability system with explicit owners, authorized sources, measurable
behavior, and one provider-neutral representation.

## Current router

`src/project_governance_runtime/assets/skills/kmp-implementation/SKILL.md` selects leaf skills from
the KMP pack. Its body is provider-neutral, but its frontmatter uses the runtime's older
`id`/`title`/`stage`/`provenance` schema instead of the portable `name`/`description` discovery
fields used by current Agent Skills implementations. Direct discovery by Codex and Claude must be
proved before calling the router provider-neutral.

## Imported upstream skills

These skills are declared in
`src/project_governance_runtime/assets/skills/stack-packs/kmp/manifest.yaml`.

| Capability | Current skill ID |
| --- | --- |
| Gradle and build governance | `kotlin-build-kmp-gradle-governance` |
| Shared data layer | `kotlin-data-kmp-data-layer` |
| Code review | `kotlin-kmp-code-review` |
| Refactor safety | `kotlin-kmp-refactor-safety` |
| Compose navigation | `kotlin-navigation-compose-multiplatform` |
| App and deep links | `kotlin-platform-app-links-and-deep-links` |
| Platform bridges | `kotlin-platform-kmp-bridges` |
| Architecture review | `kotlin-project-architecture-review` |
| Bug fixing | `kotlin-project-bugfix` |
| Feature implementation | `kotlin-project-feature-implementation` |
| Modularization | `kotlin-project-modularization` |
| State management | `kotlin-project-state-management` |
| Testing | `kotlin-testing-kmp` |
| Adaptive UI and resources | `kotlin-ui-adaptive-resources` |
| Compose Multiplatform UI | `kotlin-ui-compose-multiplatform` |

The pack includes its upstream Apache-2.0 license and notice. Its manifest records repository,
path, license, and import date, but not the exact upstream commit or content digest. A comparison
against upstream `main` at commit `939786cb13b49daacea7d5fb0a10877b6005e6be` found all 15 local
files had drifted by 2026-08-24. This is a refresh signal, not permission to overwrite local
changes. One manifest-directory mismatch also exists: `kotlin-kmp-code-review` declares the
internal name `kotlin-project-code-review`.

## Internally authored advanced skills

These skills are declared in the advanced bridge manifest.

| Capability | Current skill ID |
| --- | --- |
| Cross-platform bridge architecture | `kmp-cross-platform-bridge-architecture` |
| Bridge event delivery | `kmp-bridge-event-delivery` |
| Multiple native UI hosts | `kmp-multi-host-ui-shell` |
| Platform-native interop | `kmp-platform-native-interop` |
| Cross-platform parity automation | `kmp-qa-parity-automation` |
| Platform build governance | `kmp-build-platform-governance` |
| Dependency-matrix governance | `kmp-matrix-dependency-governance` |
| Compose Multiplatform implementation | `compose-multiplatform-implementation` |
| React Native bridge development loop | `react-native-bridge-dev-loop` |

The React Native skill is a specialized bridge consumer rather than a core KMP capability. Keep it
as an optional integration leaf; do not let it define the KMP library's architecture.

## Operator-supplied Lackner bundle

The supplied bundle contains eight `SKILL.md` files plus a README:

| Supplied skill | Relationship to current pack | Disposition |
| --- | --- | --- |
| Android module structure | Strong overlap with modularization, build, and architecture review | Direct-import candidate only if overlap evaluation shows distinct Android-overlay value |
| Android data layer | Strong overlap with the existing KMP data-layer skill | Adapt or reject after behavior comparison with the normalized owner |
| Android presentation MVI | Strong overlap with state, feature, and Compose skills | Direct-import candidate as an Android presentation overlay if restraint tests pass |
| Android navigation | Strong overlap with Compose navigation | Direct-import candidate for Android-specific typed-route/result mechanics after freshness review |
| Android DI with Koin | Material leaf gap | High-priority direct-import or light-adaptation candidate for a Koin overlay |
| Android testing | Partial overlap with KMP testing and parity automation | Import distinct Android test mechanics; correct failing assumptions before activation |
| Android Compose UI | Strong overlap; performance specialization remains thin | Import only sections or the whole leaf if it beats the consolidated Compose owner in evaluations |
| Android error handling | Material cross-cutting gap | Adapt because the current fallback example has a correctness defect |

All eight leaf files use portable `name` and `description` frontmatter. The README is
Claude-specific, documents only six skills, and instructs installation under a Claude-only path.
The bundle contains no license file, source citations, version fields, or freshness metadata. The
operator has explicitly authorized direct adoption or modification, so licensing is not a selection
gate for these supplied skill files. Their
contents are also predominantly Android-first: examples rely on Android application contexts,
`SavedStateHandle`, resources, `BuildConfig`, WorkManager, and Android test machinery.

They may be adopted byte-for-byte when useful. Android scope, technical correctness, overlap,
freshness, provider-neutral discovery, and behavior evidence still determine whether a file should
be active, adapted, kept as a target overlay, or rejected.

### Technical review cautions

The bundle should not be imported indiscriminately. Examples include:

- an offline fallback that calls the local source inside `Result.onFailure` but discards the local
  result;
- a `StateFlow` test that appears to assert a loading state without first consuming the flow's
  initial state; and
- universal prescriptions about ViewModel ownership, validation errors, repository thresholds,
  dispatchers, and test frameworks that need architectural context and KMP target qualification.

These are useful evaluation cases: a mature skill should catch or avoid them.

## Capability overlap and gaps

### Substantially covered

- project architecture and modularization;
- feature, bug-fix, refactor, and review workflows;
- Compose Multiplatform UI, state, navigation, resources, and adaptation;
- data-layer structure and baseline testing;
- Gradle, platform build, bridge, and parity concerns.

### Partially covered or unproved

- dependency injection and target-specific composition roots;
- typed outcomes, error translation, cancellation, retry, and offline behavior;
- Android-to-KMP migration and the decision about what should remain native;
- Ktor client architecture, serialization, engine selection, and MockEngine tests;
- persistence choices, schema migration, synchronization, and conflict behavior;
- iOS-facing API design, Swift ergonomics, XCFramework/SwiftPM delivery, and ABI evolution;
- concurrency and Flow correctness across native targets;
- Compose performance, effects, component API design, focus, and animation;
- security, authentication, secrets, telemetry, privacy, and release operations;
- desktop, web, and Wasm target guidance; and
- Wear OS, watchOS, standalone/companion/hybrid wearable topology, constrained lifecycle and power,
  paired-device recovery, sensor provenance, and wearable target proof; and
- skill behavior evaluation and provider-conformance proof.

## Inventory controls to add

Every KMP leaf should eventually have:

- one stable capability ID and unambiguous owning router;
- target scope, supported library versions, maturity, and review date;
- exact provenance, license or operator authorization, upstream revision, and local content digest;
- primary-source references separated from practitioner input;
- activation, correctness, restraint, and integration evaluations; and
- proof that Codex and Claude receive the same canonical skill bytes and supporting resources.

The proposed delivery model and roadmap live in the
[KMP skill-library strategy](../proposed/kmp-skill-library/README.md). The
[KMP skill quality audit](kmp-skill-quality-audit.md) evaluates every current leaf individually.
