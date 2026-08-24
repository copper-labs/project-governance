# Coroutines and Concurrency Decision Guide

Reviewed: 2026-08-24

## Operation record

For every asynchronous boundary, record owner, scope, dispatcher, start mode, input identity,
cancellation authority, state/event semantics, buffering, terminal state, failure mapping, and close
ordering. Use injected dispatchers or test schedulers when timing is not product behavior.

State and events have different delivery promises:

- state may replay the latest value and conflate intermediate values;
- ordered events need sequence identity, duplicate policy, buffer limit, overflow behavior, and a
  terminal contract;
- high-frequency samples often need native/KMP reduction before host projection; and
- command responses should be correlated independently from observation handles.

## Lifecycle-safe bridge pattern

Reserve an observation identity before launching collection. Reject duplicate live identities.
Capture the current lifecycle generation, and admit each external callback only if the transport is
open, the generation still matches, and the registered job is still the same job. Do not invoke an
external emitter while holding the lifecycle lock.

At close-start, prevent new admission and advance the generation synchronously. Cancel owned jobs,
retain tombstones for callbacks already admitted outside the lock, join those jobs, then release the
shared session or native resource. This avoids stale callbacks, identifier-reuse races, and teardown
that returns while host code is still executing.

Use bounded timeout only in the test harness to keep a failed test finite. Production correctness
must follow events, identities, state, or lifecycle—not sleeps or settle windows.

## Primary sources

- Kotlin/Native memory management and testing considerations:
  https://kotlinlang.org/docs/native-memory-manager.html
- Swift export concurrency behavior and current limitations:
  https://kotlinlang.org/docs/native-swift-export.html

Swift export is currently documented as pre-stable; verify status and dispatcher behavior before
making it part of a supported public contract.
