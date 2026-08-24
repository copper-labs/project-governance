---
id: reference.kmp-skill-quality-audit
title: KMP Skill Quality Audit
type: reference
status: current
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Whole-of-KMP scope, value, richness, freshness, and disposition audit for every current KMP leaf.
---

# KMP Skill Quality Audit

This audit asks a stricter question than “does the file contain useful advice?” It asks whether each
current leaf adds distinct Kotlin Multiplatform value, applies at the right scope, changes an agent's
decisions, and can prove that value. It covers the 24 leaves recorded in the
[KMP skill inventory](kmp-skill-inventory.md).

## Verdict

The pack contains substantial useful material, but no current leaf is proven ready under the
proposed library standard.

- The 15 upstream files are often detailed, but detail is unevenly KMP-specific. Several large
  files restate generic implementation or Android application guidance.
- The 9 internal advanced files contain strong cross-host patterns, but at 36–39 lines each they are
  playbooks rather than rich technical skills. They have no citations, examples, compatibility
  notes, or behavior evaluations.
- None of the 24 leaves has activation, correctness, conflict, restraint, and independent-fixture
  evaluation evidence.
- Several current statements have already aged. The state skill says AndroidX ViewModel is not
  natively available outside Android and needs an additional common abstraction, while current
  [Android KMP guidance](https://developer.android.com/kotlin/multiplatform/viewmodel) supports
  ViewModel from `commonMain` with platform-specific integration caveats. The navigation skill
  repeatedly describes Navigation 3 as a mid-2025 alpha, while current
  [Compose Multiplatform guidance](https://kotlinlang.org/docs/multiplatform/compose-navigation-3.html)
  documents Navigation 3 support across Android, iOS, desktop, and web.

“Not proven ready” does not mean “worthless.” It means the current content is candidate material
whose scope, freshness, distinctness, and behavior still need governance.

## Whole-of-KMP standard

[Kotlin's current platform guidance](https://kotlinlang.org/docs/multiplatform/supported-platforms.html)
distinguishes Android, iOS, desktop JVM, server JVM, JS web, Wasm web, watchOS, tvOS, and additional
Kotlin/Native targets. A KMP library cannot silently use Android applications as its universal
model.

Whole-of-KMP does not require every leaf to apply identically to every target. It requires:

1. the router to establish the declared targets, stability posture, artifact type, and sharing
   strategy before selecting a leaf;
2. common guidance to operate at the highest valid shared source-set or contract level;
3. target-specific mechanics to be clearly named and routed as Android, Apple, JVM/server,
   desktop, web/Wasm, or native overlays; and
4. every skill to state which targets it covers, excludes, or requires the operator to verify.

An Android App Links leaf is legitimate as an Android overlay. It is not legitimate as the complete
KMP deep-linking capability.

Wearables require the same discipline. Wear OS is an Android device/runtime profile; watchOS is an
Apple Kotlin/Native profile whose current core KMP stability is Beta. Shared logic support does not
imply shared Compose UI support, phone-like lifecycle, continuous connectivity, or phone-owned
execution. A mature router must ask about standalone/companion/hybrid topology, authority,
background execution, sensors, provenance, disconnect/reconnect, power, and device-specific proof.

## Audit rubric

| Dimension | Question |
| --- | --- |
| Applicability | Does it begin from target, runtime/device profile, wearable topology, and sharing posture instead of Android phone defaults? |
| Distinct value | Does it add KMP decisions beyond generic architecture, review, or change discipline? |
| Decision depth | Does it explain tradeoffs, failure modes, and stopping conditions rather than list ideals? |
| Execution depth | Does it provide source-set, lifecycle, artifact, interop, or target-specific mechanics? |
| Evidence | Does it require observable proof and include evaluation cases or independent fixtures? |
| Freshness | Are technical claims tied to primary sources, versions, and a review date? |
| Routing quality | Is activation narrow, conflict behavior explicit, and restraint testable? |

The “value” column below means distinct value inside the KMP pack, not general writing quality.
“Richness” describes useful technical depth, not file length.

## Internal advanced leaves

| Current leaf | KMP role | Value | Richness | Disposition | Reason |
| --- | --- | --- | --- | --- | --- |
| `compose-multiplatform-implementation` | Shared Compose UI | Medium | Thin | Consolidate | Useful guardrails duplicate the much larger Compose leaf and add no sources or examples. |
| `kmp-bridge-event-delivery` | Host-bridge runtime | High | Thin | Retain and enrich | Queue generation, stale rejection, sequencing, and drop evidence are concrete and distinctive. |
| `kmp-build-platform-governance` | Build and release | Medium | Thin | Split and consolidate | Mixes Gradle architecture, native prebuilts, CI, and publication while overlapping the upstream build leaf. |
| `kmp-cross-platform-bridge-architecture` | Multi-host SDK architecture | High | Thin | Retain and enrich | Strong shared-runtime and thin-host ownership model; needs alternatives, examples, and evaluations. |
| `kmp-matrix-dependency-governance` | Target/toolchain compatibility | High | Thin | Retain and enrich | A target matrix is foundational to whole-of-KMP routing; current workflow needs concrete evidence contracts. |
| `kmp-multi-host-ui-shell` | Native-host UI over shared core | High | Thin | Reframe under UI-sharing strategy | Valuable for one architecture, but its headless-core/native-UI choice must not become the default for every KMP product. |
| `kmp-platform-native-interop` | Native and language interop | High | Thin | Retain and decompose | Covers critical ownership, memory, lifecycle, and FFI concerns but is too broad for one short leaf. |
| `kmp-qa-parity-automation` | Cross-host public behavior | High | Thin | Retain and enrich | Selector parity, deterministic setup, and shared-plus-host proof provide clear value. |
| `react-native-bridge-dev-loop` | React Native host overlay | Medium | Thin | Relocate to optional host extensions | Useful for KMP-backed React Native products, but it is not a KMP core capability. |

## Imported upstream leaves

| Current leaf | KMP role | Value | Richness | Disposition | Reason |
| --- | --- | --- | --- | --- | --- |
| `kotlin-build-kmp-gradle-governance` | Gradle and modules | High | Partial | Retain and normalize | Good source-set/build guidance, but Android KMP dominates and native, Apple, JS/Wasm, server, and publication concerns are thin. |
| `kotlin-data-kmp-data-layer` | Data architecture | Medium | Partial | Rewrite as KMP data router | Mostly generic Android repository guidance; lacks Ktor, persistence, sync, offline, target engines, and concurrency choices. |
| `kotlin-kmp-code-review` | Implementation review | Medium | Verbose but under-targeted | Replace with KMP review overlay | Much of 977 lines duplicates generic review; the manifest ID and declared name also disagree, and the file has no primary references. |
| `kotlin-kmp-refactor-safety` | Change discipline | Low | Generic | Move to generic governance | Sound refactor rules, but almost no KMP-specific decision content and no references. |
| `kotlin-navigation-compose-multiplatform` | Shared Compose navigation | High | Substantive but stale | Refresh and version-route | Useful route/back-stack treatment, but Navigation 2 assumptions and repeated 2025 Navigation 3 warnings are now stale. |
| `kotlin-platform-app-links-and-deep-links` | Android inbound links | Medium | Substantive host detail | Relocate to Android overlay | Strong Android App Links content; missing Apple Universal Links, browser history, desktop protocol handling, and common route intake. |
| `kotlin-platform-kmp-bridges` | Source sets and platform APIs | High | Substantive | Retain and normalize | One of the strongest KMP-core leaves; needs behavior fixtures, freshness pins, and clearer separation from host transport bridges. |
| `kotlin-project-architecture-review` | Architecture review | Medium | Verbose but Android-heavy | Replace with KMP architecture overlay | Repeats generic architecture policy and dedicates major sections to Android entry points instead of target/sharing decisions. |
| `kotlin-project-bugfix` | Bug fixing | Low | Generic | Move to generic governance | Useful root-cause workflow, but little content is uniquely KMP; create a small KMP diagnosis overlay instead. |
| `kotlin-project-feature-implementation` | Feature delivery | Medium | Verbose but under-targeted | Replace with KMP implementation overlay | Strong generic discipline, but it duplicates governed implementation and uses Android-derived application architecture as the baseline. |
| `kotlin-project-modularization` | Module and source-set boundaries | Medium | Partial | Rewrite | Android feature/data/app module taxonomy dominates; KMP artifacts, target compilations, intermediate source sets, server/native modules, and publication need more depth. |
| `kotlin-project-state-management` | Shared presentation state | High | Substantive but stale | Retain and refresh | Valuable comparison of presenters, MVI, effects, and lifecycles; current ViewModel availability guidance is inconsistent with current KMP support. |
| `kotlin-testing-kmp` | Test strategy | High | Partial and Android-heavy | Split into core plus target overlays | Strong behavior-first principles, but 59 Android references outweigh iOS, desktop, server, native, JS, and Wasm proof. |
| `kotlin-ui-adaptive-resources` | Adaptive Compose UI | Medium | Android-heavy | Split and relocate | Universal window/resource concerns are useful; canonical layouts, window APIs, and most citations are Android-specific. |
| `kotlin-ui-compose-multiplatform` | Shared Compose UI | High | Substantive | Consolidate and enrich | Best current shared-UI base; merge the thin internal Compose leaf and add performance, focus, animation, effects, resources, and platform fixtures. |

## Cross-cutting quality findings

### Useful content is trapped in the wrong shape

The strongest KMP content is currently divided between long imported checklists and short internal
playbooks. The end state should preserve their high-signal decisions while removing duplicated
generic process and moving target mechanics into overlays and references.

### File length is masking shallow differentiation

The feature, architecture-review, code-review, and bug-fix leaves largely repeat generic skills
already present in the wheel. A KMP overlay should add only target matrix, sharing, source-set,
interop, lifecycle, artifact, and per-target proof concerns. Generic process should compose from its
existing owner.

### Android material is useful but mispositioned

Android architecture, testing, adaptive UI, and App Links material remains valuable. The defect is
not its existence; it is being presented inside broad KMP leaves without equal target modeling or
an explicit Android-only scope.

The operator-supplied Lackner skills may now be adopted directly where they provide the best
Android-overlay owner. Direct import still requires technical, overlap, freshness, activation,
restraint, and provider-conformance proof; operator authorization removes the licensing blocker,
not the quality gate.

### High-signal advanced leaves need depth

The advanced bridge leaves often contain the most distinctive decisions in the pack. To become
rich skills, they need tradeoff tables, failure examples, target variations, source-backed
references, minimal fixtures, conflict rules, and behavior evaluations.

## Rich-enough gate

A KMP leaf is rich enough only if it:

- changes at least one material design, implementation, or validation decision;
- begins from declared targets, product/artifact type, and sharing posture;
- accounts for runtime/device profile and wearable topology when applicable;
- explains at least one alternative and why it may be preferable;
- covers failure, cancellation, lifecycle, migration, or compatibility behavior relevant to its
  capability;
- distinguishes common contracts from target overlays;
- cites current primary sources and records freshness;
- demands observable evidence from every affected target tier; and
- passes automatic activation, correctness, conflict, restraint, and independent-fixture
  evaluations.

Automatic activation must be proven through the
[activation and utilization contract](../proposed/kmp-skill-library/activation-and-utilization.md),
not inferred from the existence of a good `description` field.

The [capability and normalization map](../proposed/kmp-skill-library/capability-map.md) turns these
findings into a sequenced planning backlog.
