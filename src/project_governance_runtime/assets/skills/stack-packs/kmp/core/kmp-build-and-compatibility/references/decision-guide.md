# Build and Compatibility Decision Guide

Reviewed: 2026-08-24

## Matrix fields

Capture at least Kotlin/KGP, Gradle wrapper, runtime JDK, Android Gradle plugin when present, Compose
Multiplatform when present, kotlinx libraries with compiler/runtime coupling, Xcode and deployment
targets for Apple builds, native target architectures, publication plugin, repositories, CI hosts,
and consumer toolchains.

Version catalogs centralize values but do not prove compatibility. The matrix needs citations for
supported combinations and a repository-owned reason for any exception. Preserve one declared
version owner; do not shadow it in convention plugins, samples, or publication scripts.

Keep every matrix dimension unchanged unless the requested outcome or a verified compatibility
edge requires it to move. There is no universal wrapper-first, Kotlin-first, or single-commit
sequence; derive ordering and commit boundaries from the target's dependency edges and rollback
needs.

## Proof order

1. configuration and dependency resolution;
2. representative common and target compilation;
3. target tests affected by the change;
4. exact binary or publication tasks;
5. artifact inspection for coordinates, architectures, metadata, and size; and
6. supported consumer integration.

Warnings can reveal a future incompatibility even when the build exits successfully. Record
deprecations, disabled hierarchy templates, skipped targets, cached Apple frameworks, and tasks that
were unavailable on the current host.

Do not use a broad clean as primary evidence. If a stale artifact is suspected, identify and rebuild
the owning task, then prove the resulting digest or consumer behavior.

## Primary sources

- KMP compatibility guide:
  https://kotlinlang.org/docs/multiplatform/multiplatform-compatibility-guide.html
- Gradle compatibility matrix:
  https://docs.gradle.org/current/userguide/compatibility.html
- Compose Multiplatform compatibility and supported platforms:
  https://kotlinlang.org/docs/multiplatform/compose-compatibility-and-versioning.html

These documents are version-sensitive. Refresh them for every toolchain change; never encode their
current version numbers as timeless skill instructions.
