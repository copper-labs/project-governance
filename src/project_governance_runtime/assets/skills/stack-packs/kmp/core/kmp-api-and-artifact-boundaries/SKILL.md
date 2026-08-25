---
name: kmp-api-and-artifact-boundaries
description: Design KMP public APIs and artifacts from each consumer's language, binary, lifecycle, error, export, size, and distribution contract.
---

# KMP API and Artifact Boundaries

Use this skill when changing a public Kotlin API, exported framework, XCFramework, Swift package,
KLIB, JVM library, native binary, generated binding, or host bridge contract.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-api-and-artifact-boundaries/references/decision-guide.md`
before choosing the export surface.

## Design outside-in

1. Enumerate artifact consumers, languages, target/architecture slices, distribution channel,
   versioning promise, and lifecycle model. A Kotlin source API is not automatically a usable Swift,
   Objective-C, Java, JavaScript, C, or bridge API.
2. Keep exported DTOs, commands, states, results, and errors bounded and stable. Hide coroutine
   scopes, platform handles, implementation types, and dependency graphs.
3. Decide suspend/stream projection, cancellation, threading, ownership, nullability, generics, and
   error mapping for each consumer language. Verify generated names and signatures.
4. Export dependencies explicitly. Avoid transitive export unless the larger API, compile time, and
   binary size are intentional and measured.
5. Treat experimental export technology as a support-tier decision with migration risk, not a
   default modernization step.
6. Rebuild the exact artifact from source, inspect its slices and public surface, and consume that
   artifact from the supported host path. Do not validate a stale cached framework.

## Bridge and wearable pressure

Prefer one shared semantic contract with thin transport bindings. For watches and other constrained
devices, include architecture slices, package size, startup, memory, power, offline behavior, and
companion protocol compatibility in the artifact decision.

## Evidence

Report public-surface diff, artifact coordinates and digest, target slices, generated binding diff,
binary-size or performance changes, consumer compile/run proof, and compatibility classification.
Stop when the consumer contract or distribution form is undeclared.
