---
id: proposed.kmp-skill-library.architecture-vocabulary
title: KMP Skill Architecture and Vocabulary Packet
type: specification
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Recommended whole-of-KMP target, artifact, sharing, routing, and proof vocabulary for the skill library.
---

# KMP Skill Architecture and Vocabulary Packet

This is Planning Packet 1 for the provider-neutral KMP skill library. It defines the vocabulary
needed to route a small set of high-quality skills without assuming an Android application.

The current target profile does not implement these fields. This packet proposes a future
target-owned input contract; it does not change the profile schema or runtime.

## Recommended decisions

1. Separate ecosystem stability, project support, and observed validation. They answer different
   questions and must never be collapsed into one “supported” flag.
2. Describe each target using a family plus a concrete runtime profile. Do not use `mobile` as a
   substitute for Android and Apple differences.
3. Select skills from project shape—targets, artifact, sharing posture, consumers, and risk—before
   selecting by task verb.
4. Keep generic implementation and review process in generic skills. KMP leaves add only
   multiplatform decisions and evidence.
5. Use target overlays and host extensions only when the target contract activates them.
6. Make validation proportional to the affected target and consumer surfaces, not to a universal
   command list embedded in a skill.
7. Profile cross-language boundaries by semantic lane and cadence before selecting a transport or
   performance overlay.
8. Treat wearables as first-class device/runtime profiles across Android, Apple, and other native
   families; do not collapse them into phone assumptions or invent one universal wearable target.

## Three independent truths

| Truth | Owner | Meaning | Example values |
| --- | --- | --- | --- |
| Ecosystem stability | Current primary documentation | Maturity of the Kotlin/Compose capability itself | stable, beta, alpha, experimental |
| Project support tier | Adopting repository | Compatibility promise made by this project | required, supported, experimental, excluded |
| Evidence state | Current run or release receipt | What was actually proved for one snapshot | untested, compiled, tested, integrated, consumer-proved, release-proved |

An ecosystem-stable target can still be excluded by a project. An experimental ecosystem target can
be deliberately supported with explicit risk. A declared required target is not proved merely
because it appears in a profile.

## Target vocabulary

### Target family

Use a small stable family vocabulary for routing:

| ID | Scope |
| --- | --- |
| `android` | Android application or library target |
| `apple` | iOS, watchOS, tvOS, macOS Native, and related Apple Kotlin/Native targets |
| `jvm` | Desktop JVM, server JVM, and other JVM consumers |
| `web-js` | Kotlin/JS browser or Node.js target |
| `web-wasm` | Kotlin/Wasm browser target |
| `wasi` | Kotlin/Wasm WASI target |
| `native` | Linux, Windows, embedded, and other Kotlin/Native targets outside the Apple family |

Family IDs are routing categories, not Gradle target names. The target-owned record must also retain
the exact Gradle target ID, such as `iosArm64`, `jvm`, `js`, `wasmJs`, or `linuxX64`.

### Runtime profile

Use the most specific applicable profile:

- `android-app`, `android-library`, or `wearos-app`;
- `ios`, `watchos`, `tvos`, or `macos-native`;
- `desktop-jvm` or `server-jvm`;
- `browser-js` or `node-js`;
- `browser-wasm` or `wasi`;
- `linux-native`, `windows-native`, or `other-native`.

The runtime profile determines lifecycle, threading, packaging, interop, and validation overlays.

[Kotlin's current platform table](https://kotlinlang.org/docs/multiplatform/supported-platforms.html)
lists core KMP support for watchOS as Beta. Wear OS uses the Android target family and a distinct
Android device/application profile. The current Compose Multiplatform support table does not list
watchOS; do not infer shared Compose UI support from core KMP support. Wear OS UI uses Android host
guidance, including Compose for Wear OS where selected.

### Device and wearable topology

Target family is not enough for wearable work. Record the device role and relationship to other
devices:

| ID | Meaning |
| --- | --- |
| `handheld` | Phone or tablet is the primary runtime. |
| `wearable-standalone` | Core behavior remains available without a paired handheld. |
| `wearable-companion` | The wearable depends on a paired handheld for material behavior. |
| `wearable-hybrid` | Core behavior runs locally, with enhanced configuration, synchronization, or compute from a paired device. |
| `sensor-peripheral` | The device primarily supplies measurements or controls to another authority. |
| `replicated-peer` | Multiple devices retain state, but exactly one declared authority owns each operation or session. |

For wearables, also record:

- progression/execution authority and whether handoff is permitted;
- sensor/acquisition owner and workout/record owner;
- offline behavior and local durability;
- paired/unpaired, disconnect/reconnect, retry, deduplication, and conflict policy;
- measurement time, arrival time, freshness, liveness, validity, and provenance separately;
- battery, thermal, memory, background-execution, and interaction constraints;
- permissions, consent, health-data, signing, entitlement, and store/package obligations; and
- screen, input, audio, haptic, complication/widget, and accessibility posture.

The router selects wearable concerns from these facts, not merely from a `watch` directory name.

### Project support tier

| Tier | Contract |
| --- | --- |
| `required` | Affected changes and releases cannot complete without the declared target evidence. |
| `supported` | The project makes a compatibility promise; impacted proof and release/scheduled full proof are required. |
| `experimental` | Explicit opt-in with documented limitations and no stable compatibility promise. |
| `excluded` | Outside the project contract and must not activate target-specific guidance. |

The router may not silently downgrade a required or supported target because its toolchain is
unavailable. It records deferred proof as a blocker or explicit residual risk under target policy.

### Proposed target record

```yaml
targets:
  - target_id: iosArm64
    family: apple
    runtime_profile: ios
    device_profile: handheld
    project_support: required
    ecosystem_stability:
      level: stable
      source: https://kotlinlang.org/docs/multiplatform/supported-platforms.html
      reviewed_on: 2026-08-24
    artifact_outputs: [framework]
    required_evidence: [compile, platform-test, consumer]
```

This is illustrative proposed vocabulary, not an implemented profile schema.

## Artifact vocabulary

A repository declares one or more output profiles:

| ID | Meaning | Typical consumers |
| --- | --- | --- |
| `application` | End-user application assembled for one or more targets | Android, Apple, desktop, browser |
| `shared-library` | Kotlin-first reusable modules or artifacts | KMP, JVM, JS, native projects |
| `cross-language-sdk` | Public surface intended for non-Kotlin consumers | Swift/Objective-C, Java, JavaScript/TypeScript, C ABI |
| `server-service` | Deployable server runtime plus optional shared contracts | JVM server, Node.js, native/WASI |
| `tooling-cli` | Developer or operator tooling | JVM, native, Node.js, WASI |
| `native-library` | Native binary or library intended for platform/FFI consumption | C, C++, Rust, Swift/Objective-C, JNI |

Artifact profile controls which API, ABI, publication, consumer, and release evidence matters. A
single repository can produce more than one artifact profile, but every skill invocation should
identify which output is affected.

## Sharing vocabulary

### UI posture

| ID | Meaning |
| --- | --- |
| `none` | No user interface is part of the shared artifact. |
| `native-host` | Shared logic/presentation may exist, while each host renders its own UI. |
| `shared-compose` | Compose Multiplatform owns the shared UI for declared targets. |
| `hybrid` | Shared Compose and native-host UI are deliberately combined or embedded. |

### Capability placement

| ID | Meaning |
| --- | --- |
| `common` | Valid across every declared target and owned at the common contract/source-set level. |
| `family` | Valid for a target family and owned by an intermediate source set or family adapter. |
| `target` | Valid for one concrete target/runtime profile. |
| `host-extension` | Optional consumer ecosystem layered over the KMP artifact. |

“Share as much as possible” is not sufficient guidance. Placement should be the highest level that
preserves correct semantics, supported dependencies, lifecycle behavior, and consumer ergonomics.

## Consumer vocabulary

Record consumer surfaces separately from compilation targets:

- `kotlin`, `java`, `swift`, `objective-c`, `javascript`, `typescript`, `c-abi`, `jni`, and `dart`;
- target-owned application shells; and
- optional React Native, Flutter, WebView, or other host extensions.

Consumer surfaces determine export shape and independent-consumer proof. Compiling an iOS
framework is not equivalent to proving its Swift API is usable.

## Boundary-pressure vocabulary

When a KMP artifact crosses a language, process, native UI, or host-framework boundary, record the
facts that materially affect transport design:

- semantic state, high-cadence visual/render data, ordered developer data, diagnostics, and
  terminal-result lanes;
- expected cadence and payload-size class for each lane;
- whether the consumer needs every value, the latest value, or a baseline plus compact updates;
- sink thread/actor and lifecycle owner;
- ordering, replay, queue-bound, overflow, generation, and drop-evidence requirements; and
- whether the boundary can trigger broad UI work or only a narrow consumer.

The router uses these facts to compose architecture, concurrency, API, and evidence leaves. A host
extension is not required merely because a project has a bridge. Transport-specific mechanics are
activated only when the declared consumer surface needs them. The detailed reusable rules are in
the [platform-bridge performance packet](bridge-performance-patterns.md).

## Evidence vocabulary

| Evidence ID | Proves |
| --- | --- |
| `contract` | Shared models, source-set rules, and deterministic behavior pass focused checks. |
| `compile` | The affected concrete target compiles with the declared toolchain. |
| `platform-test` | Target-specific unit or integration behavior passes. |
| `interop` | A language/platform boundary transfers values, failures, lifecycle, and cancellation correctly. |
| `host-e2e` | A public host surface crosses into the intended shared runtime path. |
| `consumer` | A clean independent consumer can use the packaged public surface. |
| `publication` | The final artifact family is complete, identifiable, installable, and retry-safe. |
| `release` | Required target and consumer evidence is bound to one release candidate. |
| `wearable-runtime` | Standalone/companion behavior, background lifecycle, permissions, and constrained-device execution work as declared. |
| `sync-recovery` | Disconnect, reconnect, retry, deduplication, buffering, authority, and conflict behavior preserve the contract. |
| `power-performance` | Target-appropriate profiling covers declared CPU, memory, battery, thermal, and render constraints. |

Skills name required evidence classes; the adopting repository supplies exact commands and artifact
locations.

## Skill applicability vocabulary

Portable `SKILL.md` frontmatter remains limited to `name` and `description`. The pack manifest owns
governed routing metadata:

```yaml
applicability:
  scope_level: shared-core
  target_families: [android, apple, jvm, web-js, web-wasm, wasi, native]
  device_profiles: [handheld, wearable-standalone, wearable-companion, wearable-hybrid]
  artifact_profiles: [application, shared-library, cross-language-sdk, server-service, tooling-cli]
  ui_postures: [none, native-host, shared-compose, hybrid]
activation:
  mode: governed
  default_level: recommended
conflicts_with: []
evidence_classes: [contract, compile]
```

Allowed `scope_level` values are `router`, `shared-core`, `target-overlay`, and `host-extension`.
Target overlays and host extensions require explicit profile or task evidence; they are not default
KMP guidance.

The only activation modes in V0 are `evaluation-only` and `governed`. This is a promotion gate, not
a general lifecycle engine. Ordinary direct selection of an evaluation-only leaf blocks; the
evaluation harness is the only caller that may include it. Leaf composition occurs only after a
matched target route lists the stable `kmp-implementation` router in that route's own `skills`;
router defaults, fallback, and ambiguous outcomes do not activate the pack.

## Routing contract

```text
task
  -> generic task owner
  -> KMP project-shape router
  -> smallest relevant shared-core leaf set
  -> affected target-family overlays
  -> explicitly enabled host extensions
  -> target-owned evidence plan
```

The router follows this sequence:

1. Read declared targets, support tiers, runtime/device profiles, wearable topology, artifact
   profiles, UI posture, consumers, versions, and boundary-pressure facts where a bridge or exported
   callback surface exists.
2. If facts are absent, inspect build and architecture evidence or request the material decision; do
   not invent an Android application profile.
3. Select the existing generic skill for implementation, architecture, review, refactor, diagnosis,
   security, or release process.
4. Select the smallest KMP shared-core leaves that add necessary multiplatform decisions.
5. Add only overlays for affected non-excluded target families.
6. Add a host extension only when the profile or explicit task places that host in scope.
7. Derive required evidence from affected support tiers, artifacts, consumers, and risk.

## Generic-versus-KMP ownership

| Concern | Generic owner | KMP owner |
| --- | --- | --- |
| Framing, planning, bounded implementation | Generic governance workflow | Target matrix and KMP impact overlay |
| Architecture review | Ownership, coupling, authority, migration | Sharing posture, source sets, artifacts, interop, target consequences |
| Code review | Correctness, maintainability, naming, tests | Platform leakage, lifecycle, target semantics, common/actual behavior |
| Bug diagnosis | Evidence, root cause, minimal correction | Target-only reproduction, compiler/source-set/interop/concurrency failure classes |
| Refactor safety | Scope, compatibility, migration, rollback | Target and artifact compatibility matrix |
| Security review | Trust, secrets, dependencies, supply chain | Platform storage, exported surfaces, native/web boundaries, artifact families |
| Release readiness | Gates, receipts, rollback, publication authority | Per-target packages, consumers, ABI/API, and compatibility evidence |

The KMP library should not copy the generic column into every leaf.

## Minimum selection-scenario matrix

The first evaluation harness should use four general project shapes plus a conditional wearable
shape. These are deterministic task, changed-path, and declared-fact vectors; they are not
compiling consumer repositories.

| Scenario | Shape | Primary purpose |
| --- | --- | --- |
| `shared-contract-library` | JVM/server plus JS or Wasm consumer | Prove non-mobile source sets, serialization/API, build, and tests. |
| `mobile-native-ui` | Android and iOS with shared logic and native-host UI | Prove sharing decisions, lifecycle, state, and target overlays. |
| `shared-compose-app` | Android, iOS, and desktop JVM | Prove shared UI remains an opt-in posture and target behavior is explicit. |
| `swift-sdk-consumer` | KMP framework plus clean Swift consumer | Prove cross-language API and artifact usability beyond compilation. |
| `wearable-runtime-pair` | Shared KMP contracts consumed by a Wear OS app and watchOS native shell, with paired-handheld stubs | Prove standalone/hybrid authority, constrained lifecycle, disconnect/reconnect, buffered sync, and target-specific UI ownership. |

The wearable scenario is required for wearable router/core claims and for promoting a wearable
overlay; it does not force every non-wearable leaf to run watch targets. Later overlays can add
browser E2E, server runtime, WASI, Linux/Windows native, React Native, Flutter, vendor sensor
integrations, and deeper publication fixtures.

## Packet 1 exit gate

Packet 1 is ready for approval when reviewers agree on:

- separation of ecosystem stability, project support, and run evidence;
- target family and runtime-profile vocabulary;
- artifact, UI posture, placement, consumer, and evidence vocabularies;
- routing order and generic/KMP ownership split;
- boundary-pressure and wearable-topology vocabularies; and
- the four general selection scenarios plus the conditional wearable scenario.

The recommended bounded implementation set is defined in [V0 core scope](v0-core-scope.md).
