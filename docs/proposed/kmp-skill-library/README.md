---
id: proposed.kmp-skill-library
title: Provider-Neutral KMP Skill-Library Strategy
type: plan
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Proposed capability model, source policy, quality gates, and roadmap for a cohesive KMP skill library.
---

# Provider-Neutral KMP Skill-Library Strategy

This proposal turns the current KMP stack pack into an extensive, cohesive library without making
Philipp Lackner, Claude, Codex, or any single framework the authority. It records the operator's
authorization to adopt useful supplied Lackner skills, but does not itself implement an import,
refresh, release, or external-content transcription.

## Supporting maps

- The [active V0 implementation plan](../../exec-plans/active/2026-08-24-kmp-skill-library-v0.md)
  turns this strategy into ordered runtime, content, evaluation, cutover, and wearable slices with
  proof and pause criteria.
- The [current inventory](../../reference/kmp-skill-inventory.md) records what ships today.
- The [quality audit](../../reference/kmp-skill-quality-audit.md) assesses every current leaf.
- The [capability and normalization map](capability-map.md) defines the required end state, gaps,
  fill method, and planning sequence.
- The [architecture and vocabulary packet](architecture-and-vocabulary.md) proposes the
  whole-of-KMP target, artifact, sharing, routing, and evidence contract.
- The [V0 core scope](v0-core-scope.md) limits initial delivery to one router and six high-value
  cross-KMP leaves.
- The [quality and provenance contract](quality-and-provenance.md) defines candidate-to-active
  lifecycle, source, freshness, evaluation, selection-scenario, conditional consumer-proof, and
  provider-conformance gates.
- The [platform-bridge performance packet](bridge-performance-patterns.md) turns reusable
  high-cadence transport, lifecycle, UI-pressure, and measurement lessons into cross-cutting V0
  requirements without adding another broad leaf.
- The [activation and utilization contract](activation-and-utilization.md) defines proactive
  deterministic selection, capability composition, selected-skill packets, normal-handoff
  evidence, and the post-V0 receipt boundary so users do not need to name skills manually.
- The [source corpus](source-corpus.md) records licensed, operator-authorized, original, and
  research-only inputs.

## Desired outcome

The KMP library should help an agent make sound cross-platform decisions, implement them safely,
and prove the result in the adopting repository. It should not be a collection of creator-branded
prompts or a second architecture authority.

A proper first release has six properties:

1. Capability-first: each leaf owns one decision or workflow and overlapping leaves are composed or
   retired.
2. Evidence-backed: normative claims trace to current primary documentation or a compatible,
   pinned upstream source.
3. Provider-neutral: Codex and Claude receive the same canonical skill content through the
   coordinator path; native provider discovery remains supplemental.
4. Behavior-tested: evaluations prove when a skill activates, what it improves, and when it stays
   out of the way.
5. Target-owned execution: the wheel supplies generic method, while the adopting repository
   supplies commands, versions, product policy, and runtime evidence.
6. Proactively activated: governed task intake composes the relevant skills from repository facts
   and records whether they were applied, declined, unavailable, or missed.

## Authority order

When sources disagree, authoring and review should use this order:

1. the adopting repository's current contracts and pinned dependency versions;
2. official Kotlin, Android, library, and platform documentation;
3. approved licensed or operator-authorized expert skills and production reference applications;
4. practitioner material as hypotheses, edge cases, and evaluation prompts; and
5. sanitized internal experience as supporting evidence.

Practitioner popularity is not universal authority. The operator-authorized Lackner files may be
adopted as canonical owners for the specific capabilities they pass. They must not define unrelated
KMP targets or bypass repository authority, current primary sources, overlap review, and behavior
proof.

## Capability architecture

Use a small router plus independently testable leaves grouped by durable concerns.

| Family | Representative capabilities |
| --- | --- |
| Foundation | architecture boundaries, sharing decision, module graph, API design, dependency direction |
| Kotlin runtime | coroutines, Flow, cancellation, concurrency, serialization, immutable models |
| Data and integration | Ktor, persistence, offline-first behavior, sync, caching, typed outcomes |
| UI and presentation | state/events, Compose components, effects, navigation, adaptation, performance, accessibility |
| Platform interop | expect/actual, native APIs, iOS/Swift surface, deep links, native UI embedding, bridges |
| Wearables | Wear OS, watchOS, standalone/companion/hybrid roles, sensors, authority, offline sync, constrained lifecycle and power |
| Build and delivery | Gradle, AGP, Kotlin/Native performance, XCFramework/SwiftPM, publication, ABI/deprecation |
| Quality and operations | common/platform tests, fakes, MockEngine, parity, security, telemetry, release proof |
| Change workflows | onboarding, Android-to-KMP migration, refactor, dependency migration, review and debugging |

General engineering behavior—specification writing, acceptance criteria, task decomposition,
delegated execution, and self-review—belongs in generic governance skills. KMP leaves should link
to those capabilities instead of duplicating them.

## Portable skill contract

The canonical artifact should use the common filesystem contract documented by both
[Codex](https://developers.openai.com/codex/skills) and
[Claude](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview):

```text
<capability-id>/
├── SKILL.md
├── references/        # optional, source-derived guidance and compatibility notes
├── scripts/           # optional deterministic helpers, separate from instructions
└── assets/            # optional templates consumed with the skill
```

Governance-owned selection scenarios, evaluation rubrics, and raw provider runs are not runtime
skill payload. Selection scenarios and rubrics live under `tests/`; raw runs remain ignored and
outside the committed source tree.

The canonical `SKILL.md` must:

- use stable `name` and precise `description` discovery fields;
- keep `name` within the hosts' shared restrictions and make `description` state both what the
  skill does and when it should activate;
- avoid provider names, provider-only tool syntax, and user-home installation paths;
- describe goals, decisions, constraints, evidence, and stopping conditions in plain Markdown;
- obtain executable commands and version truth from the adopting repository; and
- progressively disclose large references rather than loading a textbook into every task.

For cross-language or high-cadence boundaries, the shared-core leaves also compose the
[bridge-performance rules](bridge-performance-patterns.md): shared semantic policy, thin transports,
lane-specific delivery, bounded and observable loss, stale-callback rejection, narrow consumers,
and matched performance evidence.

Codex- or Claude-specific installation belongs in thin adapters that point to or copy the same
immutable directory. A conformance check should compare hashes, discovered names/descriptions,
router decisions, linked references, and representative activation behavior across both hosts.

## Source-to-skill pipeline

Every imported or original skill should pass the same pipeline:

```text
demand -> overlap check -> source/authorization record -> claim extraction -> independent verification
       -> original authoring, adaptation, or authorized import -> static checks -> behavior evals
       -> Codex/Claude conformance -> review -> release -> freshness monitoring
```

### Acquisition rules

- Import when a compatible license or an explicit operator authorization allows the source path.
- Pin the exact upstream commit and record a digest for each shipped file.
- Preserve required license and notice material.
- Treat the operator-supplied Philipp Lackner skill bundle as explicitly authorized for direct
  adoption or modification. Select import versus adaptation from usefulness, overlap, correctness,
  freshness, and target scope—not licensing.
- For other unlicensed courses, videos, repositories, or bundles without operator authorization,
  record only topics, public metadata, independently verified facts, and original evaluation
  scenarios.
- Do not place transcripts, copied examples, or close paraphrases in the wheel without permission.
- Prefer direct collaboration or written permission when a practitioner's expression is uniquely
  valuable.

### Authoring rules

Start from the capability contract and primary sources, not from a transcript. Practitioner inputs
may seed questions such as “does this work on iOS?” or “what is the failure mode during migration?”
The author then verifies those questions against official documentation and selection scenarios,
adds independent consumer proof when making executable claims, and writes new instructions in the
governance system's voice.

## Evaluation model

Static linting is necessary but insufficient. Each leaf needs a small behavior suite modeled on
the strongest public skill repositories:

| Evaluation | Question answered |
| --- | --- |
| No-skill baseline | Does the task expose a real, repeatable weakness? |
| Forced activation | Does the skill produce technically correct and evidenced behavior? |
| Automatic activation | Does deterministic task/target routing select it for the right requests without explicit user invocation? |
| Restraint | Does it stay inactive for adjacent or unsupported tasks? |
| Conflict | Does it defer to repository contracts and a more specific capability? |
| Provider conformance | Do Codex and Claude use the same content and reach compatible decisions? |
| Integration seam | When the leaf makes an executable claim, does separately maintained consumer evidence compile or test it? |

Evaluations should score decisions and observable evidence, not exact prose. A skill that merely
makes an answer longer has not demonstrated value.

## Delivery roadmap

Expansion is gated by the [V0 core scope](v0-core-scope.md). Later waves do not begin merely because
sources are available; the one-router, six-leaf core must first pass its selection and behavior
gates.

### Wave 0: make the current pack governable

- Normalize the router to the portable discovery contract without breaking runtime selection.
- Resolve the code-review ID/name mismatch.
- Pin the current upstream commit and file digests.
- Review upstream drift deliberately instead of bulk-overwriting local files.
- Add metadata for target scope, maturity, compatibility, and freshness.
- Implement nested leaf resolution plus exact selected-byte materialization.
- Build the behavior-evaluation and Codex/Claude conformance harness.

### Wave 1: deepen the imported foundation

Perform overlap reviews and selectively import or adapt approved sources for:

- coroutines, Flow, control flow, API design, and immutable collections;
- Compose state/effects, component APIs, performance, focus, animation, and UI testing;
- Android host concerns such as adaptive UI, Navigation 3, security, profiling, and edge-to-edge;
  and
- AGP, CocoaPods-to-SwiftPM, and Kotlin/Native build-performance migrations.

The [source corpus](source-corpus.md) identifies initial candidates. One capability owner should
remain after each import; do not preserve redundant leaves merely because their sources differ.

### Wave 2: author the missing KMP core

Prioritize original, provider-neutral skills for:

1. deciding what to share and what to keep native;
2. migrating an Android codebase to KMP incrementally;
3. Koin composition roots and target-specific dependency wiring;
4. Ktor client design, engine selection, serialization, and MockEngine testing;
5. typed outcomes, error translation, retry, cancellation, and offline fallback;
6. persistence, schema migration, caching, synchronization, and conflict policy;
7. cross-platform deep links and native/shared UI interop; and
8. iOS-facing API design, Swift ergonomics, and observable state.

These topics reflect both the current inventory gaps and Lackner's public KMP teaching themes. They
must still be authored from verified primary sources and tested selection scenarios, plus consumer
evidence when they make executable claims.

The supplied Lackner skill files may instead remain byte-preserved imports when their existing
scope and behavior pass the same technical, overlap, freshness, provider, and evaluation gates.

### Wave 2b: wearable project shapes

Make wearables the first profile-gated expansion after the V0 core. Add Wear OS and watchOS project
shapes, standalone/companion/hybrid authority, offline execution, paired-device synchronization,
sensor provenance, background lifecycle, permissions, constrained performance/power, and
device/store proof. Vendor-specific acquisition remains an extension over portable wearable
contracts.

### Wave 3: production breadth

Add delivery and operational capabilities for XCFramework/SwiftPM publication, ABI and
deprecation policy, native dependency isolation, security and authentication, privacy-safe
telemetry, desktop, web, and Wasm targets, and multi-target release proof.

## Definition of ready for a leaf

A leaf is ready to ship only when:

- its capability does not ambiguously overlap another owner;
- provenance, authorization, revision, digest, versions, and review date are recorded;
- wording and examples follow the recorded licensed or operator-authorized intake path;
- primary-source links support normative technical claims;
- activation, correctness, restraint, conflict, and applicable integration evaluations pass;
- Codex and Claude consume the same canonical bytes; and
- the skill specifies how it becomes stale, is refreshed, or is retired.

## Decisions still required

Before implementation, approve:

- the portable metadata schema and provider-conformance contract;
- the minimal manifest applicability fields, optional target-fact block, and selected-skill packet;
- which approved third-party skills remain byte-preserved imports or are independently adapted;
- the behavior-evaluation storage and runner design;
- which KMP targets form the minimum supported matrix; and
- the first wearable overlay boundary and the projects that will supply independent fixture proof.
