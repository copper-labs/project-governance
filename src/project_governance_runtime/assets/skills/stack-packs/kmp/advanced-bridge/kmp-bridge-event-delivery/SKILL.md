---
name: kmp-bridge-event-delivery
description: Use when implementing or reviewing event delivery across KMP/native/web bridges. Defines run identity, delivery generation, sequence assignment, bounded queues, drop diagnostics, stale callback rejection, late listener behavior, and parity proof across host transports.
---

# KMP Bridge Event Delivery

## Trigger

Use this skill when a change touches bridge streams, native event emitters, event channels, WebView messaging, browser callbacks, listener registration, buffering, backpressure, run replacement, or dense event traffic.

## Required Reads

- `AGENTS.md`
- the target bridge architecture docs
- repository profile validation packs for boundary, tests, lint, naming, code-smell, and architecture
- existing event-envelope DTOs, event buffers, listener stores, and stream tests
- host lifecycle docs for every touched transport

## Workflow

1. Identify the canonical run identity fields. Prefer a stable tuple such as `runId` plus `epoch`; do not collapse semantic identity and delivery guardrails into one opaque string.
2. Define envelope metadata for host delivery: kind/name, canonical payload, delivery sequence, delivery generation, and generation-scoped drop count.
3. Assign delivery sequence in FIFO order for one transport instance. Treat sequence gaps as local delivery evidence, not as domain event truth.
4. Advance delivery generation when the active run is prepared, replaced, disposed, or otherwise invalidated. Clear queued events and reject delayed callbacks from older generations.
5. Queue late-listener events up to a bounded target-owned size. Drain in FIFO order when the listener attaches.
6. On overflow, evict the oldest pending event, increment a generation-scoped drop count, and expose the cumulative count on the next delivered envelope.
7. Distinguish listener detach from teardown. Detach can keep the bounded queue; teardown or run replacement must advance generation and clear state.
8. Keep transport mechanics host-local while keeping queue, sequence, generation, drop, and stale-rejection semantics shared or fixture-proven.

## Validation

Add or run fixture-backed tests for late listener drain, overflow, generation reset, stale callback rejection, FIFO sequence assignment, detach versus teardown, dense event pressure, and cross-language envelope parity. Include host tests for every transport touched by the change.

## Evidence

Report envelope fields, queue size/default, generation reset triggers, stale callback strategy, overflow behavior, parity fixtures, host test results, and any known event-loss or ordering risk.
