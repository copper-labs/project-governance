---
name: kmp-platform-native-interop
description: Use when adding or reviewing KMP interop with Swift, Objective-C, C, C++, Rust, JNI, cinterop, generated bindings, or native resources. Focuses on narrow facades, flat payloads, ownership, lifecycle, memory, concurrency, and generated-type containment.
---

# KMP Platform Native Interop

## Trigger

Use this skill for native interop, Swift-facing API design, generated bindings, platform resource handles, memory ownership, native worker/thread boundaries, or cross-language lifecycle management.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles for KMP, Android, iOS, native, and build tooling
- current KMP source-set layout and native interop modules
- public API docs for the interop technology in use
- memory, threading, and lifecycle tests around the touched boundary

## Workflow

1. Put common facades and contracts in `commonMain`; keep generated bindings and platform adapters in platform source sets.
2. Keep the exported surface narrow, stable, and host-ergonomic. Do not expose coroutine scopes, DI containers, database entities, generated FFI internals, or platform resource owners as domain API.
3. Prefer flat payloads across FFI: primitives, strings, byte arrays, numeric arrays, compact structs, or fixture-backed DTOs.
4. Make ownership explicit for every native handle. Define close/free/dispose behavior and make repeated cleanup safe.
5. Keep native code from retaining managed objects unless the platform interop mechanism documents a safe lifecycle pattern.
6. Use generated bindings where they reduce manual glue risk, but wrap generated types behind target-owned facades.
7. Make Swift, Kotlin, TypeScript, and Dart APIs ergonomic for their host while preserving the same KMP-owned semantics.
8. Add failure-path, cancellation, teardown, and concurrency tests, not just happy-path smoke tests.

## Validation

Run KMP platform compilation, native interop generation, memory/lifecycle tests, public API checks, and host build tests. Check current official docs before accepting version-sensitive claims about Swift export, binding generators, native memory models, or platform APIs.

## Evidence

Report the facade shape, generated binding containment, ownership rules, cleanup behavior, concurrency assumptions, platform validation, and unresolved memory or thread-safety risks.
