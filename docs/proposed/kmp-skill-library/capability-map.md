---
id: proposed.kmp-skill-library.capability-map
title: KMP Capability and Normalization Map
type: plan
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Required KMP capabilities, normalization backlog, coverage gaps, and source-to-evaluation fill plan.
---

# KMP Capability and Normalization Map

This map answers four planning questions before any leaf is imported or rewritten:

1. What does a complete KMP library need?
2. What in the current pack must be normalized?
3. Where are the capability and quality gaps?
4. How will each gap be filled and proved?

It is a draft planning authority only. It does not authorize skill implementation or removal.

## Whole-library model

The library as a whole serves Kotlin Multiplatform. Individual leaves operate at one of four
explicit levels:

| Level | Responsibility | Examples |
| --- | --- | --- |
| KMP router | Establish target matrix, artifact/product profile, sharing posture, and risk before selecting leaves | Android+iOS shared logic; JVM+JS library; shared Compose app |
| Shared core | Decisions valid across declared targets or at the highest valid shared source set | source sets, public API, serialization, concurrency, data contracts |
| Target/device overlay | Mechanics that genuinely differ by platform family or device runtime | Android App Links, Wear OS lifecycle, watchOS workout execution, JVM server engines, browser history |
| Host/integration extension | Optional host ecosystems over a KMP core | React Native, Flutter, native FFI consumers, WebView transports |

No Android-only rule may masquerade as KMP-wide guidance. No shared rule may erase legitimate
platform differences.

## Routing prerequisites

Before selecting an implementation leaf, the router must establish:

- declared Kotlin targets, runtime/device profiles, and support tiers;
- wearable topology: standalone, companion, hybrid, sensor peripheral, or replicated peer;
- application, library/SDK, server, tooling, or native-binary artifact profile;
- logic-only, shared Compose UI, native-host UI, or hybrid sharing posture;
- public consumers and interop surfaces;
- persistence, network, lifecycle, and runtime environments;
- build, packaging, and publication families; and
- validation expectations for every affected target tier.

If those facts are absent, the correct behavior is to inspect or clarify them—not assume an Android
mobile application.

## Capability map

Coverage uses four states: `strong base`, `partial`, `host-only`, and `missing`.
Priority expresses capability risk and dependency order across the eventual library; it does not
automatically place a capability in V0. The [V0 scope](v0-core-scope.md) additionally requires broad
applicability across KMP project shapes.

### Foundation and routing

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| Target and stability profiling | Partial | Router recognizes mainly KMP, Android, and iOS; it does not classify JVM/server, desktop, JS, Wasm, or native families | Original router contract from official Kotlin target/stability docs plus target fixtures | P0 |
| Wearable project-shape profiling | Missing | Wear OS, watchOS, standalone/companion/hybrid roles, authority, constrained lifecycle, and paired-device behavior are not routed | Add wearable topology to the core router and a conditional wearable selection scenario from official platform contracts | P0 |
| Sharing-strategy decision | Partial | Shared Compose and native-host patterns exist separately, with no neutral decision owner | Author `kmp-sharing-strategy` from official KMP guidance and comparative fixtures | P0 |
| Source-set and hierarchy design | Strong base | Needs version pins, hierarchy migration cases, and behavior proof | Normalize `kotlin-platform-kmp-bridges`; use official Kotlin docs and fixtures | P0 |
| Module, artifact, and API boundaries | Partial | Android module taxonomy dominates; public artifact and consumer models are thin | Rewrite modularization around compilations, artifacts, consumers, visibility, and source sets | P1 |
| KMP architecture review overlay | Partial | Current review duplicates generic architecture and overweights Android entry points | Compose generic architecture review with a small KMP-only overlay | P1 |

### Kotlin runtime and contracts

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| Kotlin API design and binary evolution | Missing | No focused public API, source/binary compatibility, deprecation, or consumer ergonomics skill | Adapt licensed Kotlin API-design material; add KMP artifact fixtures | P1 |
| Coroutines, Flow, cancellation, and dispatchers | Partial | Scattered rules; no target runtime matrix or Swift/JS/JVM boundary treatment | Adapt licensed concurrency material and author target overlays from primary docs | P0 |
| Typed failures, retry, and outcome translation | Partial | Error advice is scattered and sometimes generic | Adapt the authorized Lackner error-handling input plus primary docs and failure-path fixtures; correct the discarded-fallback defect before activation | P0 |
| Serialization and schema compatibility | Missing | No focused skill for Kotlin serialization, unknown fields, polymorphism, versioning, or interop DTOs | Original skill from kotlinx.serialization docs and cross-target fixtures | P1 |
| Lifecycle and resource ownership | Partial | State and interop leaves cover fragments of the problem | Consolidate ownership rules; add Android, Apple, desktop, browser, and server overlays | P1 |

### Data and integration

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| Data ownership and source-of-truth design | Partial | Current leaf is generic Android data-layer guidance | Rewrite as a neutral router for network, persistence, cache, and sync leaves | P1 |
| Ktor client architecture and engine selection | Missing | No network engines, plugins, serialization, auth, timeout, or platform setup | Original skill from Ktor docs; verify with JVM, Android, Apple, JS, and Wasm fixtures | P0 |
| Ktor MockEngine and network tests | Missing | No deterministic cross-target HTTP evaluation | Original test leaf from Ktor docs and licensed sample fixtures | P1 |
| Persistence and schema migration | Missing | No database/driver choice, migration, encryption, or target storage constraints | Framework-neutral decision skill plus opt-in SQLDelight, Room, DataStore, file, and browser overlays | P1 |
| Offline-first, cache, sync, and conflicts | Partial | Current source-of-truth text lacks algorithms, consistency choices, retries, and conflict policy | Original capability using primary docs, reference apps, and fault-injection fixtures | P1 |
| Dependency injection and composition roots | Missing | No shared/target composition strategy; Lackner bundle supplies a useful Android/Koin overlay only | Consider direct adoption of the authorized Koin leaf as an Android overlay; author the framework-neutral core and other target/framework references separately | P0 |

### Presentation and UI

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| UI-sharing decision | Partial | Shared Compose and native-host assumptions are disconnected | Make UI sharing a branch of `kmp-sharing-strategy`, with shared, native, and hybrid fixtures | P0 |
| Shared state and effects | Strong base | ViewModel availability is stale; lifecycle and Swift/desktop/web integration need current treatment | Refresh state skill from current Lifecycle KMP and Compose docs; add target cases | P0 |
| Compose UI architecture | Strong base | Duplicate leaves; performance, focus, animation, components, and effects are incomplete | Consolidate current leaves and selectively adapt licensed Compose skills | P1 |
| Adaptive UI and resources | Partial | Universal concepts and Android APIs are mixed | Split common window/resource strategy from Android adaptive and per-target resource overlays | P1 |
| Navigation and route state | Strong base | Navigation 2/3 routing is stale and browser/target differences need explicit version paths | Version-route Navigation 2 and 3 using current official docs and fixtures | P0 |
| External route intake and deep links | Host-only | Android App Links is detailed; Apple, web, desktop, and common route parsing are missing | Add common inbound-route contract plus Android, Apple, browser, and desktop overlays | P1 |
| Accessibility and localization | Partial | Mentioned across UI leaves but no target parity, semantics, or resource decision owner | Author cross-target contract with Compose and host overlays | P2 |

### Platform interop and host integration

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| `expect`/`actual`, interfaces, and platform APIs | Strong base | Needs conflict cases, migration examples, and current source-set proof | Normalize platform bridge leaf and add fixture evaluations | P0 |
| Apple/Swift-facing API design | Partial | One thin interop leaf; no export ergonomics, Flow/suspend bridging, exceptions, generics, or lifecycle depth | Decompose native interop; use official Kotlin/Apple docs and Touchlab references | P0 |
| C/Objective-C/C++/Rust/JNI interop | Partial | One short leaf covers too many FFI systems | Shared ownership/memory core plus technology-specific references and fixtures | P1 |
| Multi-host bridge architecture | Strong base | Needs alternative architectures, public contract examples, and explicit semantic-versus-transport ownership | Enrich current bridge architecture and event-delivery leaves | P1 |
| Platform-bridge throughput and UI pressure | Partial | No normalized lane, baseline/compact, bounded delivery, stale-generation, narrow-consumer, default-off instrumentation, or matched-evidence contract | Apply the cross-cutting [bridge-performance packet](bridge-performance-patterns.md) in V0; add transport-specific overlays only after measured demand | P1 |
| React Native, Flutter, and other host loops | Host-only | React Native exists; other optional hosts do not | Move RN to optional extensions; add other hosts only from real demand and evidence | P2 |
| Desktop, browser, Wasm, and server integrations | Missing | Existing pack is centered on mobile/Compose applications | Author overlays from official target docs and independent consumer fixtures | P1 |
| Wearable runtime architecture | Missing | No cross-platform owner for standalone/companion/hybrid topology, progression authority, offline durability, reconnect, deduplication, background lifecycle, power, sensors, permissions, and constrained UI | Author a provider-neutral wearable overlay over V0 sharing/concurrency/API/evidence leaves; add Wear OS and watchOS references and fixtures | P0 |
| Wearable providers and sensor ecosystems | Missing | Health stores, vendor SDKs, direct devices, and phone-mediated routes can be mistaken for one KMP target | Keep portable observation/sync contracts in shared core; add provider/platform extensions only when current API, consent, commercial, and device evidence exists | P1 |

### Build, delivery, and operations

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| Gradle, convention plugins, and source-set build design | Strong base | Duplicate build leaves and Android-heavy coverage | Consolidate build architecture; retain target-specific references | P0 |
| Toolchain and dependency compatibility | Strong base | Workflow lacks a maintained matrix schema, version evidence, and upgrade fixtures | Enrich dependency-matrix leaf; selectively import official Kotlin migration skills | P0 |
| Native build performance and dependencies | Partial | No cinterop caching, Xcode, SwiftPM/CocoaPods, or native compile diagnostics depth | Adapt official Kotlin skills and docs; test on Apple/native fixtures | P1 |
| Publication and artifact families | Partial | Advanced build leaf mentions publishing but lacks Maven, npm, framework, klib, signature, and retry contracts | Author publication router plus artifact-family overlays | P1 |
| ABI, API compatibility, deprecation, and migration | Missing | No compatibility tooling or consumer-proof lifecycle | Original skill with binary compatibility validator and independent consumers | P1 |
| Security, privacy, secrets, and supply chain | Partial | Generic review mentions exist; KMP storage, native, web, and artifact concerns are not modeled | Compose generic security review with KMP target overlays | P1 |
| Observability, performance, power, and memory | Partial | Scattered advice, no platform or constrained-device metrics and target baselines | Author measurement-first skills with target profilers and wearable CPU/memory/battery/thermal evidence | P1 |

### Testing and change workflows

| Needed capability | Current coverage | Main gap | Fill method | Priority |
| --- | --- | --- | --- | --- |
| Common and target test architecture | Partial | Current testing leaf is Android-heavy | Split common contracts from Android, Apple/native, JVM/server, desktop, JS/Wasm, and UI overlays | P0 |
| Cross-host parity and public-surface proof | Strong base | Internal leaf needs executable fixtures and evaluation receipts | Enrich current QA parity leaf and keep it profile-gated | P1 |
| Wearable authority and recovery proof | Missing | No deterministic fixture for disconnect/reconnect, duplicated commands, stale measurements, authority handoff, buffering, or constrained background execution | Add shared policy vectors plus Wear OS/watchOS consumer and target evidence | P0 |
| KMP migration and onboarding | Missing | No sharing assessment, dependency audit, seam selection, staged extraction, or rollback workflow | Author Android-to-KMP and general adoption skills; use authorized Lackner files directly where they own a distinct step and public themes for scenarios | P0 |
| KMP-specific diagnosis | Partial | Generic bug-fix skill does not isolate source-set, target, interop, compiler, and lifecycle failure classes | Compose generic diagnosis with a concise KMP troubleshooting overlay | P1 |
| Dependency and framework migrations | Partial | Matrix skill plans compatibility but lacks per-framework migration playbooks | Import official licensed migration skills where distinct; author the rest from primary docs | P1 |

## Normalization backlog

Normalization precedes content expansion.

### N0: define one target vocabulary

Create a versioned vocabulary for target family, stability, artifact profile, UI-sharing posture,
consumer surface, and proof tier. The router, manifest, leaves, and evaluations must use the same
terms.

### N1: rebuild routing around project shape

The KMP router should first classify targets and architecture, then compose generic governance,
KMP core, target overlays, and optional host extensions. It should not route directly from “feature”
or “bug” to large duplicate KMP process skills.

### N2: normalize portable metadata

Use canonical `name` and `description` discovery fields plus governed manifest metadata for:

- capability owner and aliases;
- applicability and exclusions;
- runtime/device profiles and wearable topology;
- activation mode, default selection level, and profile gates;
- maturity and lifecycle;
- source, authorization, revision, and digest;
- compatibility and freshness review;
- conflict and precedence rules; and
- evaluation and fixture references.

### N3: separate generic process from KMP knowledge

Feature implementation, bug fixing, refactoring, architecture review, code review, security, and
release process already have generic owners. Replace duplicated KMP versions with compact overlays
that add only KMP-specific decisions and evidence.

### N4: consolidate and decompose

- Merge the two Compose implementation leaves.
- Separate build architecture, compatibility matrix, and publication.
- Separate shared UI, native-host UI, and hybrid UI strategies.
- Split common testing from target test overlays.
- Split common route intake from Android, Apple, browser, and desktop registration.
- Split native interop ownership from Apple export, JNI, C interop, and other FFI mechanics.

### N5: correct freshness and provenance

Resolve the ID/name mismatch, pin imported commits and digests, review all upstream drift, replace
mid-2025 technical status statements, and add review dates and refresh triggers. Do not bulk-refresh
without a semantic diff and evaluation run.

### N6: prove behavioral value

For each leaf, add no-skill baseline, forced activation, automatic activation, restraint, conflict,
coordinator-conformance, and selection-scenario cases. A leaf stays candidate-only until it improves a
decision or proof outcome without causing adjacent-task regressions.

Selection also needs proof. The [activation and utilization contract](activation-and-utilization.md)
requires deterministic positive, negative, conflict, missing-fact, provider, and materialization
cases so a valuable leaf cannot remain unused merely because the user did not name it.

### N7: create a minimal selection-scenario matrix

Use the four small project shapes defined by the architecture packet:

- `shared-contract-library`: JVM/server plus JS or Wasm consumer;
- `mobile-native-ui`: Android and iOS with shared logic and native UI;
- `shared-compose-app`: Android, iOS, and desktop shared Compose UI; and
- `swift-sdk-consumer`: Apple framework plus a clean Swift consumer.
- `wearable-runtime-pair`: conditional Wear OS and watchOS shells over shared contracts with paired
  handheld stubs.

The first four are the general minimum. The wearable scenario is required for wearable router/core
claims and wearable-overlay promotion. The scenarios prove routing and decision behavior; they must
not encode one adopter's product architecture or be presented as compiling consumer proof.
Later target overlays add dedicated server-runtime, browser E2E, WASI, Linux/Windows Native, and
native/FFI consumer proof when those capabilities enter scope.
Add dense bridge-policy cases to the shared-contract and mobile-native-UI scenarios: baseline
then compact delivery, semantic interleaving, bounded overflow, stale-generation rejection,
default-off diagnostics, terminal teardown, and narrow-versus-broad notification evidence. Do not
add a framework-specific host scenario to V0 solely for this concern.

### N8: give every leaf a lifecycle

Use `candidate`, `active`, `deprecated`, and `retired` states. Define the evidence required to
promote, refresh, or retire a leaf. “Included in the wheel” must not imply “current and valuable.”

### N9: close the activation loop

Resolve nested stack-pack leaves deterministically, compose the smallest capability set, materialize
exact selected bytes, and bind selection reasons and digests to the normal task handoff. Measure
missed and false activations in reviewed V0 evaluations instead of relying on model memory or
explicit user invocation. A runtime utilization receipt remains post-V0 unless observed friction
justifies a generic coordinator contract.

## How gaps will be filled

| Method | Use when | Required controls |
| --- | --- | --- |
| Preserve licensed import | Upstream wording is distinct, compatible, and already well evaluated | License/notice, pinned commit/digest, semantic diff, local routing and conformance proof |
| Preserve operator-authorized import | A supplied Lackner skill is useful as written | Authorization record, supplied/local digest, attribution, overlap/freshness/technical review, routing and conformance proof |
| Independently adapt | Licensed source is useful but overlaps or conflicts with local architecture | Primary-source verification, original structure/wording, overlap retirement, evaluations |
| Author original skill | No compatible source exists or the capability needs a neutral synthesis | Claims matrix, primary sources, independent fixtures, expert review, behavior evaluations |
| Add target overlay | Mechanics genuinely differ by target family | Common contract owner, explicit activation gate, target fixture, no universal claims |
| Add host extension | Optional ecosystem sits over KMP | Demand evidence, profile gate, shared-semantics boundary, host E2E proof |
| Retire or move generic | Content duplicates an existing generic owner | Replacement route, no lost KMP-specific decision, migration note |

The supplied Lackner skill files are operator-authorized import candidates. Choose byte-preserved
adoption, adaptation, or rejection from distinct value, technical correctness, Android/KMP scope,
freshness, overlap, and evaluation evidence. Public videos, courses, and sample repositories remain
separate intake decisions.

## Planning sequence

### Packet 1: architecture and vocabulary

Approve the whole-of-KMP levels, target/artifact/UI-sharing vocabulary, supported selection-scenario matrix,
and generic-versus-KMP ownership boundary. The recommended contract is drafted in the
[architecture and vocabulary packet](architecture-and-vocabulary.md).

### Packet 2: disposition and routing

Approve the individual retain, consolidate, rewrite, relocate, and retire decisions from the
[quality audit](../../reference/kmp-skill-quality-audit.md). Specify the new router and profile-gate
contract without editing leaves.

The [V0 core scope](v0-core-scope.md) proposes the first deliberately bounded active set and maps
the current leaves that may contribute evidence to it.

The [platform-bridge performance packet](bridge-performance-patterns.md) defines a cross-cutting
requirement for that small set. It does not create another V0 capability owner.

### Packet 3: quality and provenance

Approve manifest metadata, source intake, semantic-diff, freshness, behavior-evaluation, and
Codex/Claude conformance contracts. The recommended contract is drafted in
[quality and provenance](quality-and-provenance.md).

The [activation and utilization contract](activation-and-utilization.md) supplements Packet 3 with
deterministic selection, exact materialization, normal-handoff evidence, and the explicit post-V0
receipt boundary.

### Packet 4: normalized catalog

Produce the target capability tree, stable IDs, leaf ownership, target overlays, source candidates,
and evaluation owners. Only then create implementation slices for Wave 0 and the P0 gaps.

## Exit condition for mapping

Mapping is complete when every required capability has:

- one owner or an explicit missing-owner record;
- whole-KMP, shared-core, target-overlay, or host-extension scope;
- a current-leaf disposition;
- a source and authorization path;
- a fixture and behavior-evaluation path;
- a priority and dependency order; and
- an approved decision about whether it belongs in generic governance or the KMP library.
