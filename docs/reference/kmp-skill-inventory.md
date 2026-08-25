---
id: reference.kmp-skill-inventory
title: KMP Skill Inventory
type: reference
status: current
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Governed Kotlin Multiplatform V0 skill surface, provenance, activation, and deferred capability families.
---

# KMP Skill Inventory

The wheel contains one governed provider-neutral KMP router and six progressively disclosed core
leaves. This is the sole active KMP pack and capability authority.

## Governed V0 surface

| Capability | Skill ID | Material decision |
| --- | --- | --- |
| Project-shape routing | `kmp-implementation` | Establishes targets, runtime/device topology, consumers, artifacts, sharing posture, and boundary pressure before leaf selection. |
| Sharing and architecture | `kmp-sharing-and-architecture` | Chooses shared logic, presentation, UI, headless runtime, host-shell, and wearable authority boundaries. |
| Source sets and platform boundaries | `kmp-source-sets-and-platform-boundaries` | Places behavior in the narrowest honest source set and isolates forced platform mechanics. |
| Build and compatibility | `kmp-build-and-compatibility` | Treats Kotlin, Gradle, JDK, AGP, Compose, Xcode, libraries, targets, and consumers as one verified matrix. |
| Coroutines and concurrency | `kmp-coroutines-and-concurrency` | Owns scopes, state/events, bounded delivery, cancellation, stale-work rejection, reconnect, and teardown. |
| API and artifact boundaries | `kmp-api-and-artifact-boundaries` | Designs consumer-visible APIs, DTOs, lifecycle, error, export, binary, and artifact contracts. |
| Test and evidence | `kmp-test-and-evidence` | Matches common, target, bridge, host, artifact, device, performance, and wearable proof to the claim. |

All seven entries use portable `name` and `description` discovery, provider-neutral Markdown,
manifest-owned canonical paths, exact installed-byte verification, and `activation.mode: governed`.
An adopting repository must explicitly enable `kmp-implementation` on its selected target-owned
route and provide KMP facts before automatic leaf composition occurs.

## Provenance

The V0 skill bodies are original Project Governance synthesis with dated primary sources,
independent adaptation of useful Apache-2.0 material, and sanitized reusable implementation
patterns. No legacy upstream skill or operator-supplied Philipp Lackner file remains byte-preserved
in the live V0 payload. The packaged `LICENSE`, `NOTICE.md`, manifest records, and frozen historical
fixture preserve the relevant provenance and transition evidence.

The [KMP V0 evaluation](kmp-skill-v0-evaluation.md) records the final selected-body digests and the
Codex/Claude behavior comparison. The immutable historical inventory remains in
`tests/fixtures/kmp-skills/legacy-2026-08-24.yaml`; Git history preserves the removed implementation.

## Removed and deferred surface

The cutover removed the 15 imported upstream leaves and 9 internal advanced-bridge leaves from the
wheel. Their distinct V0 decisions were consolidated into the six core owners. Generic feature,
bug-fix, refactor, review, and authoring process remains owned by generic governance skills.

These capability families remain deferred until separately admitted and proven:

- data, Ktor, persistence, synchronization, typed outcomes, and offline architecture;
- Compose UI, state, navigation, adaptive resources, accessibility, and performance;
- Android host overlays, including Koin, App Links, and Android-specific testing;
- detailed Swift, Objective-C, JavaScript, C, JNI, framework, package, and publication mechanics;
- transport-specific Flutter, React Native, WebView, browser, and native-host bridge mechanics;
- security, privacy, observability, desktop, web, Wasm, and multi-target release operations; and
- the first separately approved wearable architecture overlay.

The core already applies bridge pressure and wearable topology to shared decisions. It does not
claim implementation-level coverage for every deferred target, host, or device mechanism.

## Live controls

- Exactly one catalog entry and one manifest own the KMP pack.
- Exactly seven KMP skills are shipped: one router and six leaves.
- No `evaluation-only`, legacy upstream, advanced-pack, unmanifested, provider-specific, or
  user-home-path KMP skill is releasable.
- Selection and materialization are deterministic; target builds and physical-device evidence
  remain adopter-owned.
- Any selected-body, reference, matcher, scenario, or rubric change invalidates the affected
  evaluation record and requires focused re-evaluation before release.
