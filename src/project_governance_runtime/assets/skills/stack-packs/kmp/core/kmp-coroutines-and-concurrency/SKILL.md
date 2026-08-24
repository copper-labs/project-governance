---
name: kmp-coroutines-and-concurrency
description: Design KMP coroutine ownership, event and state streams, cancellation, backpressure, stale-work rejection, and teardown across target and host boundaries.
---

# KMP Coroutines and Concurrency

Use this skill when work crosses scopes, dispatchers, callbacks, flows, language bridges, reconnects,
or component lifecycles.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-coroutines-and-concurrency/references/decision-guide.md`
for stream and teardown choices.

## Define the concurrency contract

1. Name the scope owner, start condition, cancellation handle, terminal state, dispatcher needs,
   and teardown point for each operation or observation.
2. Distinguish state from events. State may replay or conflate; ordered events need explicit
   sequence, buffering/backpressure, terminal, duplicate, and loss semantics.
3. Keep high-frequency sampling and reduction inside the native or KMP owner. Cross a host boundary
   only at a cadence and payload shape the consumer can sustain.
4. Reject stale work using identity or generation checks at admission. A cancelled old observer must
   not cancel a newer observer that reused a logical channel.
5. Stop new admission synchronously during close, cancel owned jobs, and drain already admitted
   external callbacks before releasing the underlying session or resource.
6. Treat `CancellationException` as control flow. Map other failures to stable public outcomes at
   the boundary; do not leak native exceptions or silently swallow terminal failure.

## Wearable and lifecycle pressure

Model disconnect, reconnect, background suspension, process death, power constraints, and stale
sensor samples as explicit state. Do not use sleeps, debounce delays, or polling windows to repair
an ownership or sequencing bug.

## Evidence

Test cancellation-before-start, duplicate observation, stale callback, slow consumer, overflow,
disconnect/reconnect, close during callback, and exact terminal behavior. Report queue policy,
drop/duplicate diagnostics, lifecycle owner, and per-target dispatcher or runtime proof.
