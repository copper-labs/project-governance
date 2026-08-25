---
id: proposed.kmp-skill-library.bridge-performance-patterns
title: KMP Platform-Bridge Performance Learning Packet
type: specification
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Cross-cutting platform-bridge architecture, hot-path, lifecycle, and evidence patterns for the KMP skill library.
---

# KMP Platform-Bridge Performance Learning Packet

This packet defines platform-bridge practices that the KMP library should teach and evaluate. The
patterns are sanitized design learnings from a multi-host KMP implementation. Product identities,
checkout paths, adopter details, and runtime receipts remain outside this governance repository.

This packet does not add an eighth V0 leaf. Bridge performance crosses architecture, concurrency,
API, platform-boundary, and evidence concerns. The six shared-core leaves should carry the
universal rules; a later profile-gated overlay can provide Flutter, React Native, WebView, Swift,
JNI, or other transport mechanics.

## Performance objective

Preserve producer and product semantics while reducing the cost of crossing and consuming the
boundary. A performance change is invalid if it silently lowers source cadence, delays semantic
state, drops commands or results, changes visible behavior, or uses a timing workaround to hide an
ordering or lifecycle defect.

The first question is not “how do we throttle this?” It is:

1. Which facts cross the boundary?
2. Which consumer actually needs each fact?
3. Which facts require ordering, and which are latest-value render data?
4. Which work occurs when observability is disabled?
5. Which thread, actor, or lifecycle owner controls delivery and teardown?
6. What evidence shows whether transport, decode, notification, paint, composition, or the producer
   is the real pressure point?

## Lane model

Do not force facts with different cadence and correctness needs through one broad state stream.

| Lane | Typical facts | Correctness contract | Consumption contract |
| --- | --- | --- | --- |
| Semantic state | Readiness, progression, commands, visible identity, summary | Latest accepted semantic state; never replaced by a visual-only update | Broad observers wake only for meaningful semantic change |
| Visual render | Frame geometry, waveform points, preview overlays, transient renderer data | Latest renderable value; stale or duplicate visual-only work may be coalesced | Narrow renderer signal; no unrelated UI-store wake-up |
| Ordered data | Domain events, command outcomes, developer-visible facts | Ordered and bounded, with sequence and visible drop evidence | Public event/data consumer; default UI subscribes only when it needs the facts |
| Diagnostics | Health, profiling, support, and evidence breadcrumbs | Explicit, bounded, redacted, and non-authoritative | Default off and separate from product UI notifications |
| Terminal result | Final result, artifact descriptors, closeout status | Lifecycle-safe and delivered according to the run contract | Dedicated terminal consumer; not lost during ordinary navigation teardown |

Lane selection is semantic policy. It belongs in shared KMP or shared bridge support. EventChannel,
native emitter, callback, WebView message, structured clone, or FFI mechanics belong in thin
platform shells.

## Shared bridge rules

### 1. Establish a baseline before compact updates

A compact or renderer-only payload is safe only after the consumer has accepted the full semantic
baseline it depends on. A late listener, new run, reset, or changed semantic identity requires a
fresh baseline.

### 2. Revalidate at delivery time

Classification performed before a main-thread hop or asynchronous callback can be stale by the
time delivery occurs. Recompare the candidate with the latest accepted baseline:

- rescue a pessimistic full payload to compact form when only renderer data changed;
- fall back from compact to full state when semantics moved first;
- drop a visual-only candidate when its rendered value is now unchanged; and
- never let an old candidate overwrite a newer semantic baseline.

This is authoritative classification, not blind coalescing.

### 3. Bound retained work and expose loss

Queues and replay buffers need an explicit bound and overflow policy. Ordered lanes expose sequence,
generation or epoch, and drop counters. A dropped event must not look like complete history.

Visual lanes may use latest-value coalescing under pressure. Semantic, command, result, and other
ordered lanes may not inherit that policy merely because they share a transport.

### 4. Reject stale callbacks across lifecycle generations

An asynchronous callback captures the generation or epoch of its owning run/listener. Replacement,
reset, or teardown advances that identity, clears obsolete retained work, and rejects delayed state
or event callbacks from the previous generation. Any terminal-result exception must be explicit and
covered by lifecycle tests.

### 5. Keep host storage and rendering narrow

High-cadence renderer updates should wake only the subtree or consumer that renders them. Raw
ordered events and delivery counters should not rebuild default chrome. Equality-gated selectors,
narrow listenables/flows, stable identities, and isolated repaint boundaries are preferred over a
single mutable catch-all store.

When evidence identifies allocation or paint pressure, consider batching draw operations, reusing
stable topology or buffers, avoiding per-frame clones and intermediate collections, and adding
platform compositor hints. Do not apply speculative hot-path rewrites without a trace or matched
profile.

### 6. Make observability truly default-off

Disabled profiling should perform no observer installation, sampling-clock read, payload capture,
metadata construction, log formatting, or diagnostic delivery. Enabled profiling should be sparse,
aggregate, payload-free where possible, and bounded. Useful sample reasons include first delivery,
drop movement, fixed cadence, and terminal delivery.

Observability failure must not affect canonical delivery.

### 7. Shape the transport contract deliberately

Cross the boundary with stable, serialization-safe DTOs or prepared projections rather than a
chatty platform-object graph. Separate canonical semantic models from transport envelopes. Include
identity, revision, ordering, lifecycle, and compatibility fields needed to detect stale or partial
consumption.

Strict decoding is valuable for controlled contracts, but version and unknown-field behavior must
be chosen deliberately. Compact arrays, typed buffers, generated bindings, or binary formats are
candidate optimizations only after bytes, decode time, allocation, and compatibility have been
measured.

### 8. Keep timing out of correctness

Timers are valid when time is the behavior or an explicit timeout/backoff contract. Sleeps,
polling, debounce, throttle, or settle windows must not be hidden fixes for readiness, navigation,
ordering, lifecycle, or state synchronization. Use state, event, callback, or lifecycle join points.

## Anti-patterns the skills must reject

- Lowering native frame or event production before showing that the producer is the bottleneck.
- Sending a full application state object for every renderer-only update.
- Letting diagnostics, counters, or raw developer events wake the broad product UI store.
- Copying shared lane, ordering, or drop policy into each platform adapter.
- Using an unbounded replay buffer or dropping ordered facts without receipts.
- Accepting delayed callbacks without a run/listener generation check.
- Assuming a payload classified off-main is still safe when it reaches the sink.
- Adding per-frame logging or allocation-heavy profiling to diagnose a hot path.
- Claiming smoothness from unit tests, aggregate frame counts, or one unmatched device run.
- Changing visible behavior, source cadence, or domain semantics to make a profile look better.

## V0 ownership map

| V0 entry | Bridge-performance responsibility |
| --- | --- |
| `kmp-implementation` project-shape router | Detect high-cadence, cross-language, UI-bound, or lifecycle-sensitive boundaries and activate the relevant core concerns. |
| `kmp-sharing-and-architecture` | Place semantic policy, lane routing, projections, and host responsibilities at the correct ownership level. |
| `kmp-source-sets-and-platform-boundaries` | Keep shared policy in common/family code and isolate forced transport mechanics in thin target or host shells. |
| `kmp-build-and-compatibility` | Require affected target and consumer compilations when shared DTOs, bindings, or adapter surfaces change. |
| `kmp-coroutines-and-concurrency` | Own serialization of sink access, bounded buffers, cancellation, generation invalidation, backpressure, and main-thread/actor handoff. |
| `kmp-api-and-artifact-boundaries` | Own stable transport DTOs, baseline/delta contracts, revisions, serialization compatibility, and non-Kotlin consumer ergonomics. |
| `kmp-test-and-evidence` | Require dense-traffic, lifecycle, drop, default-off, parity, and target performance evidence proportional to the claim. |

Detailed EventChannel, RN emitter, WebView, JNI, Swift callback, browser stream, and renderer-specific
implementation stays in later target or host overlays.

## Evaluation scenarios

The V0 selection scenarios should add deterministic bridge-policy cases without adding a
product-specific host fixture:

| Scenario | Required proof |
| --- | --- |
| Full baseline then dense visual updates | Renderer updates remain narrow; unrelated semantic observers do not wake at visual cadence. |
| Semantic change interleaved with delayed visual work | Delayed compact work falls back or is rejected; semantic state is never lost. |
| Pessimistic classification before asynchronous dispatch | Delivery-time comparison can safely rescue full to compact form. |
| Listener detach, replacement, and reattach | Generation changes invalidate stale callbacks and require the correct baseline behavior. |
| Queue overflow | The configured bound holds and sequence/drop evidence reveals the gap. |
| Dense ordered data | Order remains correct; bounded loss is visible; default UI is not forced to consume raw events. |
| Diagnostics disabled | No diagnostic observer, payload, formatting, timing, or product-store notification work occurs. |
| Terminal delivery during teardown/navigation | The declared terminal contract is preserved without accepting unrelated stale state. |
| Equivalent policy in two target or host projections | Lane decisions and sequence/drop semantics match for the same scenario vectors. |

The shared-contract and mobile-native-UI scenarios can host these deterministic cases. A later host
extension adds framework-specific throughput, rendering, and device scenarios.

## Performance evidence contract

Performance advice must start with a claim and a pressure hypothesis. Evidence should record the
smallest relevant set of:

- envelope count and approximate bytes by lane;
- full-baseline, compact, no-op, fallback, and rescue decisions;
- decode/apply time and allocation or collection pressure;
- broad semantic notifications versus narrow renderer notifications;
- queue depth, overflow drops, sequence gaps, and stale-generation rejections;
- terminal delivery and teardown behavior;
- UI/render missed deadlines, jank, or target-equivalent evidence; and
- producer cadence, to prove it was preserved when the claim requires it.

Use matched controls with the same build type, scenario, instrumentation mode, and target class.
Synthetic and unit evidence can prove policy; only target-appropriate profiling or device/consumer
evidence can support a runtime performance claim. The adopting repository supplies exact tools,
budgets, commands, and artifact locations.

## Later overlay trigger

A dedicated `kmp-platform-bridge-performance` overlay becomes justified only when the V0 core is
active and at least two independent consumers need implementation-level guidance beyond these
shared rules. Its activation should require a declared cross-language or host-extension boundary
plus measured transport, notification, rendering, or lifecycle pressure.
