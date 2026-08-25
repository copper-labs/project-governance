---
id: proposed.kmp-skill-library.v0-core-scope
title: KMP Skill Library V0 Core Scope
type: plan
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Deliberately small initial KMP skill set selected for cross-target value, freshness, depth, and measurable behavior.
---

# KMP Skill Library V0 Core Scope

V0 should contain one router and six shared-core leaves. Its purpose is to prove that a small,
current, provider-neutral set improves KMP decisions across different project shapes. It is not a
feature-complete KMP catalog.

## Selection rules

A V0 capability must:

- apply to most KMP applications, libraries, SDKs, services, or tools;
- avoid treating phone, tablet, desktop, server, browser, or wearable assumptions as universal;
- add decisions that generic governance does not already own;
- have current primary sources and feasible selection scenarios;
- carry high architectural or correctness consequence;
- be narrow enough to activate and evaluate reliably; and
- avoid requiring one UI framework, data stack, DI framework, or host ecosystem.

## Recommended active set

### 1. `kmp-implementation` (project-shape router)

**Role:** Establish declared targets, support tiers, artifact profiles, UI posture, consumers,
versions, runtime/device profiles, wearable topology, boundary-pressure facts, and affected proof
before selecting KMP leaves.

**Current inputs:** `kmp-implementation`, both manifests, and the new
[architecture vocabulary](architecture-and-vocabulary.md).

**Why V0:** Without this router, every other skill risks applying Android/mobile or shared-Compose
assumptions to the wrong project.

### 2. `kmp-sharing-and-architecture`

**Role:** Decide what belongs in common, family, target, or host-extension ownership and whether the
product shares logic, presentation, UI, or only contracts. For bridges, place lane selection,
semantic projections, and delivery policy separately from platform transport and rendering. For
wearables, separate execution/progression, acquisition, record, replication, and presentation
authority.

**Current inputs:** High-signal parts of `kmp-cross-platform-bridge-architecture`,
`kmp-multi-host-ui-shell`, and the KMP-specific parts of `kotlin-project-architecture-review`.

**Why V0:** Sharing is the first material KMP architecture decision. Neither shared Compose nor
native-host UI should be the default.

### 3. `kmp-source-sets-and-platform-boundaries`

**Role:** Choose common, intermediate, and target source sets; decide between a multiplatform
library, interface injection, entry-point wiring, and `expect`/`actual`; contain platform types.
Shared bridge policy belongs above thin target or host transport shells unless a platform constraint
is proven. Wear OS remains an Android device/runtime profile; watchOS remains an Apple
Kotlin/Native profile with its own host APIs and maturity.

**Current inputs:** `kotlin-platform-kmp-bridges` is the strongest existing base.

**Why V0:** Incorrect source-set and platform-boundary choices create portability failures that
generic Kotlin guidance cannot catch.

### 4. `kmp-build-and-compatibility`

**Role:** Govern Gradle/Kotlin/Compose/AGP/Xcode/Node/native compatibility, target declarations,
source-set build logic, dependency support, wearable application/framework targets, and affected
compilation evidence.

**Current inputs:** Consolidate the useful parts of `kotlin-build-kmp-gradle-governance`,
`kmp-build-platform-governance`, and `kmp-matrix-dependency-governance`.

**Why V0:** A KMP design is not valid if its toolchain, dependencies, and target artifacts do not
resolve together.

Publication and release mechanics remain outside this leaf until a later artifact-family overlay.

### 5. `kmp-coroutines-and-concurrency`

**Role:** Govern structured concurrency, cancellation, dispatcher/runtime assumptions, Flow/state
behavior, freezing/thread-safety concerns where applicable, and boundary translation for declared
targets. This includes serialized sink ownership, bounded buffers, backpressure, generation-based
stale callback rejection, lifecycle-safe teardown, intermittent connectivity, deduplicated retries,
and explicit authority during disconnect/reconnect.

**Current inputs:** Extract scattered concurrency rules from feature, state, code-review, bug-fix,
data, and native-interop leaves. Adapt compatibly licensed Kotlin concurrency material only after an
overlap and provenance review.

**Why V0:** Async behavior is shared widely but runtime and consumer semantics differ materially
across JVM, Apple/native, JS/Wasm, and host boundaries.

### 6. `kmp-api-and-artifact-boundaries`

**Role:** Design portable public models and APIs for declared Kotlin and non-Kotlin consumers;
control exported surface, serialization compatibility, lifecycle ownership, exceptions, and
artifact expectations. For eventful boundaries, own baseline/compact DTOs, identities, revisions,
ordering metadata, and compatibility behavior. Wearable observations preserve source, device,
measurement and arrival time, units, freshness, validity, consent, and lineage without making a
vendor score or connectivity signal the shared product authority.

**Current inputs:** KMP-specific parts of modularization, native interop, bridge architecture, and
licensed Kotlin API-design sources.

**Why V0:** KMP success is measured at consumer boundaries, not only by `commonMain` compilation.

Detailed Swift, Objective-C, JavaScript, C, JNI, Maven, npm, framework, and klib mechanics become
later target/artifact overlays.

### 7. `kmp-test-and-evidence`

**Role:** Derive common, target, interop, host, consumer, and publication proof from the project
contract; choose the owning source sets and prevent Android instrumentation from becoming the
universal test model. For bridges, prove dense traffic, semantic interleaving, queue/drop behavior,
stale lifecycle rejection, default-off instrumentation, narrow consumption, and matched target
performance claims. Wearable claims additionally require standalone/paired behavior,
disconnect/reconnect, background lifecycle, permissions, constrained-device performance, and
authority proof.

**Current inputs:** Rewrite `kotlin-testing-kmp` around a whole-of-KMP core and extract reusable
contract/parity rules from `kmp-qa-parity-automation`.

**Why V0:** The library cannot claim value without a consistent way to prove target behavior and
evaluate the skills themselves.

## Why these seven

Together, the router and six leaves answer the common questions in order:

```text
What kind of KMP project is this?
  -> What should be shared?
  -> Where does each responsibility live?
  -> Can the declared toolchain and dependencies support it?
  -> Are async semantics correct across targets?
  -> Is the public consumer/artifact boundary usable?
  -> What evidence proves the decision?
```

The set is useful to applications, shared libraries, cross-language SDKs, services, and tools. It
does not assume Compose, Ktor, Koin, Android UI, SwiftUI, React Native, Flutter, or a phone-first
runtime.

## Cross-cutting wearable requirement

Wearables are a first-class project shape in V0, not an Android afterthought. The core router and
six leaves must make correct decisions for Wear OS, watchOS, standalone, companion, hybrid, sensor,
and replicated-peer scenarios using the vocabulary in the
[architecture packet](architecture-and-vocabulary.md).

The V0 core owns target/device classification, sharing and authority, source-set placement,
connectivity/concurrency, portable observation and command contracts, and evidence derivation. A
later `kmp-wearable-architecture` overlay owns implementation-level Wear OS/watchOS lifecycle,
workout, sensor, UI, packaging, signing, power, and paired-device mechanics. Vendor integrations
remain narrower provider extensions rather than defining the wearable core.

## Cross-cutting bridge requirement

Platform-bridge performance is not a separate V0 leaf. When the router identifies a high-cadence,
cross-language, UI-bound, or lifecycle-sensitive boundary, it composes the relevant core leaves
using the [platform-bridge performance packet](bridge-performance-patterns.md).

The V0 contract includes semantic lane separation, shared policy with thin transports, accepted
baseline revalidation, bounded and observable loss, generation-based stale work rejection, narrow
consumer notifications, true default-off diagnostics, and proportional evidence. Detailed
framework bindings, platform render tuning, and profiler operation remain later overlays.

## Explicitly outside V0

Defer these capabilities until the core proves effective:

- feature implementation, bug fixing, refactoring, generic code review, and generic architecture
  process, which already have generic owners;
- data architecture, Ktor, persistence, caching, synchronization, and offline-first behavior;
- dependency injection and framework-specific composition;
- presentation state, Compose UI, adaptive layout, navigation, resources, accessibility, and
  localization;
- Android App Links, Apple Universal Links, browser navigation, and desktop protocol registration;
- detailed Apple export, SwiftPM/CocoaPods, JNI, C/C++/Rust interop, and native build performance;
- React Native, Flutter, WebView, and other host development loops;
- detailed HealthKit, Health Connect, vendor SDK, direct-device, and store-specific wearable
  integration mechanics; and
- publication, ABI migration, platform-specific observability and performance tuning, security
  overlays, and release operations.

Deferred does not mean low value. It means the capability depends on the core routing, ownership,
boundary, compatibility, and proof model.

## Current-leaf transition map

| Current content | V0 disposition |
| --- | --- |
| `kmp-implementation` | Retain the stable ID and replace its content with the portable project-shape router after conformance proof. |
| `kotlin-platform-kmp-bridges` | Primary seed for source-set and platform-boundary leaf. |
| Three build/matrix leaves | Semantically consolidate into build and compatibility; leave publication deferred. |
| Cross-platform bridge and multi-host UI leaves | Extract neutral sharing decisions; retain bridge-specific detail as later overlays. |
| Native interop and modularization leaves | Extract consumer/API/artifact decisions; defer technology-specific mechanics. |
| Testing and QA parity leaves | Rebuild as common evidence core plus later target/host overlays. |
| Feature, bug-fix, refactor, code-review, and architecture-review leaves | Route generic process to existing owners; extract only unique KMP decisions. |
| Data, state, Compose, adaptive, navigation, and App Links leaves | Keep candidate-only until their later capability families are normalized. |
| React Native bridge loop | Remove from the V0 payload; Git history and the frozen transition record may inform a separately approved future host-extension plan. |

No current file should be deleted before its replacement route passes behavior and regression
evaluations.

## Per-leaf readiness gate

Each V0 leaf requires:

- one unambiguous capability contract and narrow activation description;
- whole-KMP applicability plus explicit exclusions;
- current primary sources with claims and freshness records;
- semantic provenance for any retained imported material;
- at least one alternative, failure mode, and stopping condition;
- relevant cases from the four general selection scenarios plus the conditional wearable scenario;
- bridge-pressure cases when the capability can affect a high-cadence or cross-language boundary;
- no-skill, forced, automatic, restraint, conflict, and provider-conformance evaluations;
- deterministic selection, exact selected-byte materialization, and an explicit handoff statement
  naming how each selected skill affected the result under the
  [activation contract](activation-and-utilization.md); and
- one independent review showing that it improves decisions rather than only adding text.

## V0 delivery order

1. Freeze and digest the current 24-leaf baseline; do not refresh upstream during normalization.
2. Approve the architecture vocabulary and manifest/evaluation contracts.
3. Establish the four general selection scenarios, conditional wearable scenario, and
   behavior-evaluation runner.
4. Implement nested leaf resolution, capability composition, and exact selected-byte
   materialization for the V0 catalog.
5. Replace and prove the existing `kmp-implementation` router content without changing its ID.
6. Normalize one leaf at a time in dependency order: sharing, source sets, build, concurrency, API,
   then test/evidence.
7. Remove superseded legacy entries from active routing only after replacement proof.
8. Activate the V0 set only when all seven entries pass cross-provider, activation,
   materialization, and selection-scenario gates.

## V0 success condition

V0 succeeds when one router and six leaves:

- use the same canonical bytes in Codex and Claude;
- activate proactively from target/task facts and close every required or recommended selection;
- select correctly across the four general project-shape scenarios and wearable cases when
  applicable;
- improve scored architecture, portability, and evidence decisions over no-skill baselines;
- remain inactive for generic Kotlin and irrelevant host-only tasks;
- contain no stale unqualified version claims;
- preserve bridge semantics while routing high-cadence, ordered, diagnostic, and terminal facts to
  consumers with the correct delivery and evidence contract; and
- replace or supersede their mapped legacy content without losing distinct KMP guidance.

Only after this proof should the library admit the first profile-gated expansion family.

The detailed promotion evidence is defined in the
[quality and provenance contract](quality-and-provenance.md).
