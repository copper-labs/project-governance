---
id: proposed.kmp-skill-library.source-corpus
title: KMP Skill Source Corpus
type: research
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Candidate source register and authorization posture for the proposed KMP skill library.
---

# KMP Skill Source Corpus

This register separates licensed imports, operator-authorized supplied skills, reference
implementations, and research material. Every intake path still records provenance, exact content,
technical review, freshness, overlap, and evaluation evidence.

## Import or adaptation candidates

| Source | Observed license | Candidate value | Intake posture |
| --- | --- | --- | --- |
| [Kotlin agent skills](https://github.com/Kotlin/kotlin-agent-skills) | Apache-2.0 | AGP 9, CocoaPods-to-SPM, Kotlin/Native performance, immutable collections migrations | High-priority overlap and compatibility review |
| [Android skills](https://github.com/android/skills) | Apache-2.0 | Navigation 3, adaptive UI, test setup, profiling, intent security, AGP 9, XML-to-Compose, edge-to-edge | Import only Android-host leaves that add distinct KMP value |
| [Chris Banes skills](https://github.com/chrisbanes/skills) | Apache-2.0 | Compose state/effects, APIs, performance, animation, focus, tests; Kotlin Flow/concurrency and API design | Strong capability and behavior-eval reference |
| [Touchlab KaMPKit](https://github.com/Touchlab/KaMPKit) | Apache-2.0 | Production KMP architecture and platform integration fixture | Reference implementation, not automatically a skill import |
| [Kotlin KMP production sample](https://github.com/Kotlin/kmp-production-sample) | MIT | Official production-shaped fixture and integration evidence | Use as a verification fixture with pinned revision |
| [`mmiani/kotlin-kmp-claude-agent-skills`](https://github.com/mmiani/kotlin-kmp-claude-agent-skills) | Apache-2.0 | Existing 15-skill foundation | Pin, audit drift, and deduplicate before refresh |

[Kotlin's AI skills documentation](https://kotlinlang.org/docs/kotlin-ai-skills.html) should be the
starting point for the official Kotlin skill set and its installation model. Exact upstream commits,
license texts, notices, and content digests belong in the shipping manifests rather than only in
this research note.

## Wearable primary corpus

Wearable skills should start from target and platform authorities rather than treating all devices
as Android phones or generic sensors:

| Source | Skill value |
| --- | --- |
| [KMP supported platforms](https://kotlinlang.org/docs/multiplatform/supported-platforms.html) | Current core KMP and Compose Multiplatform stability; watchOS is a core KMP Beta target and is not listed in the current Compose Multiplatform UI table |
| [Wear OS application architecture](https://developer.android.com/training/wearables/get-started/creating) | Standalone, companion, and hybrid models; offline-first storage, watch-optimized UI, power, and release-build measurement |
| [Wear OS Data Layer overview](https://developer.android.com/training/wearables/data/overview) | Phone/watch communication scope, availability, security identity, listener threading, and cloud-routing disclosure |
| [Wear OS synchronization](https://developer.android.com/training/wearables/data/sync) | Local storage versus synchronization, small data versus assets, paired-platform limitations, and disconnected behavior |
| [Apple watchOS workout sessions](https://developer.apple.com/documentation/HealthKit/running-workout-sessions) | Workout authority, permissions, background execution, sensor collection, save/discard feedback, companion coordination, and CPU constraints |
| [Apple HealthKit](https://developer.apple.com/documentation/healthkit/) | Permissioned health-data store and user-controlled acquisition boundary |

Sanitized implementation experience can supply evaluation scenarios for authority, deduplicated
commands, stale callbacks, bounded buffering, visible gaps, measurement freshness, and reconnect
recovery. Target projects retain their product algorithms, vendor contracts, device evidence, and
release requirements.

## Philipp Lackner corpus

Lackner is a high-value practitioner source because his public work covers end-to-end Android and
KMP decisions in the vocabulary developers actually use. His
[AI mentoring page](https://www.pl-coding.com/ai-mentoring) advertises more than 50 skills and
custom agents, but does not expose a public itemized advanced-skill catalog.

| Supplied source | Authorization | Candidate value | Intake posture |
| --- | --- | --- | --- |
| Eight basic `SKILL.md` files and README | Explicit operator authorization for adoption or modification | Android modules, data, MVI, navigation, Koin, testing, Compose UI, and error handling | Evaluate each file for byte-preserved adoption, adaptation, or rejection; licensing is not a gate |

### Public advanced themes

The public page emphasizes:

- agent harness and token-use discipline;
- custom skill creation and self-correcting agents;
- visual UI comparison against Figma;
- acceptance criteria and modular specifications;
- legacy-codebase onboarding, migration, and refactoring; and
- multi-agent decomposition and delegation.

Most are generic governance capabilities, not KMP leaf skills. They should inform the shared
authoring, planning, review, validation, and delegation layers once, with KMP-specific leaves
supplying only platform knowledge.

### Public KMP research themes

A discovery pass across public videos and linked sample repositories identified these useful
questions for the KMP roadmap:

| Theme | Public artifact |
| --- | --- |
| When KMP or Compose Multiplatform is appropriate | YouTube `N4h3K73TyZI`, `uEGT1qVeHZM` |
| Multi-module architecture | YouTube `hY09fygeLoY` |
| Incremental Android-to-KMP migration | YouTube `vb-Pt8SdfEE` |
| `expect`/`actual` design | YouTube `WxCBzV4qUFw`; sample `ExpectActual` |
| State, actions, and events | YouTube `kzfVub-AJPs` |
| Gradle 9 migration | YouTube `Jp3Yg1VSRkY`; sample `KMPGradle9Migration` |
| Ktor client architecture | YouTube `Z1WoLYF-b14`; sample `CMP-Ktor` |
| Ktor MockEngine testing | YouTube `mKwPoGvkjSw`; sample `TestingWithKtor` |
| Koin dependency injection | YouTube `TAKZy3uQTdE`; sample `CMP-Koin-DI` |
| Compose Multiplatform testing | YouTube `tAMu-RPqkok`; sample `CMP-Testing` |
| Deep links on Android and iOS | YouTube `9XMN2neHyOw`; sample `CMPDeepLinking` |
| Native iOS views in shared Compose UI | YouTube `F0BnN_uLp9A`; sample `NativeIOSinComposeMultiplatform` |
| End-to-end clean/MVI application | YouTube `dveR4xWid4Q`; sample `CMPMemeCreator` |

The sampled repositories had no detected license during the 2026-08-24 review. Under
[GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository),
absence of a license leaves normal copyright restrictions in place. These repositories are
research pointers unless the operator separately authorizes their source as an import. The explicit
authorization below applies to the supplied skill files, not automatically to every video, course,
or sample repository.

### Operator authorization and acquisition boundary

The operator has explicitly authorized adoption or modification of the supplied Lackner skill files
without treating licensing as a selection gate. Those files may therefore be evaluated as direct,
byte-preserved imports or as adaptation inputs.

Accordingly:

- record the supplied file digest, observed author/source, and intake date;
- prefer byte-preserved adoption when the skill is distinct, correct, current, provider-neutral,
  and already rich enough;
- adapt when Android framing, overlap, technical defects, stale claims, or provider-specific
  instructions would reduce value;
- reject files that do not improve behavior over the smaller normalized owner;
- preserve attribution and record every local semantic change;
- verify normative technical claims and run the same activation, restraint, conflict, fixture, and
  provider-conformance evaluations as every other skill; and
- treat videos, courses, transcripts, and sample repositories as separate intake decisions rather
  than assuming the supplied-skill authorization covers them.

## Research record required at intake

For every candidate source, capture:

- canonical URL and owner;
- exact revision and access date;
- license identifier plus preserved license/notice files, or the explicit operator-authorization
  record;
- capability claims under consideration;
- overlap with current skill owners;
- primary sources used to verify each normative claim;
- content digest for any imported file;
- decision: import, adapt independently, use only as an evaluation prompt, or reject; and
- freshness trigger, responsible reviewer, and next review date.

The [library strategy](README.md) defines how approved sources become provider-neutral skills.
