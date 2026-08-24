# API and Artifact Boundary Decision Guide

Reviewed: 2026-08-24

## Consumer contract

Inventory each consumer's language, target and architecture, build system, artifact form, import
name, public types, threading, lifecycle, cancellation, failure representation, versioning promise,
and distribution path. Inspect generated consumer-facing declarations; Kotlin signatures alone do
not show the real API.

Prefer bounded DTOs and explicit commands/results. Avoid exporting implementation graphs, coroutine
scopes, mutable collections, platform handles, or dependency types. Treat nullability, generics,
exceptions, overloads, sealed hierarchies, suspend functions, flows, and callbacks as interop design
decisions with consumer tests.

## Apple artifacts

Choose direct framework integration for same-repository development or an XCFramework/Swift package
for distribution according to the target repository's contract. When combining modules, use an
umbrella framework and export only API dependencies the consumer must see. Transitive export can
increase public surface, compile time, and binary size; require an explicit measured reason.

Swift export can provide more idiomatic Swift and direct concurrency projection, but its documented
stability and limitations must be treated as a support-tier constraint. Objective-C framework
export remains a distinct contract. Do not silently switch between them.

Include watchOS/device and simulator slices that correspond to declared consumers. Verify the
artifact being consumed is the artifact just built, not a cached framework at another path.

## Primary sources

- Kotlin/Native framework and XCFramework export:
  https://kotlinlang.org/docs/multiplatform/multiplatform-build-native-binaries.html
- Swift package export:
  https://kotlinlang.org/docs/multiplatform/multiplatform-spm-export.html
- Swift export and limitations: https://kotlinlang.org/docs/native-swift-export.html
- Direct Apple integration:
  https://kotlinlang.org/docs/multiplatform/multiplatform-direct-integration.html

Refresh these sources when Kotlin, Xcode integration, or distribution tooling changes.
