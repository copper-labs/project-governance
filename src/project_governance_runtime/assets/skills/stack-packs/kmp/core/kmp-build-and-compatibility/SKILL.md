---
name: kmp-build-and-compatibility
description: Govern KMP toolchain, plugin, dependency, host, target, and publication compatibility as one verified matrix instead of isolated version edits.
---

# KMP Build and Compatibility

Use this skill for Kotlin, Kotlin Gradle plugin, Gradle, JDK, Android Gradle plugin, Compose,
coroutines, Xcode, target, native binary, or publishing changes.

Read `.governance/runtime/skills/stack-packs/kmp/core/kmp-build-and-compatibility/references/decision-guide.md`
before changing the matrix.

## Build the compatibility decision

1. Snapshot wrapper, runtime JDK, Kotlin/KGP, Gradle, AGP, Compose, key libraries, Xcode, native
   toolchains, target presets, and artifact tasks from current source and CI.
2. Define the smallest coherent candidate matrix from current primary compatibility documents and
   repository constraints. Do not combine individually plausible versions without matrix proof.
   Keep every wrapper, JDK, plugin, library, host, and target dimension unchanged unless the
   requested change or verified compatibility evidence requires it to move.
3. Identify host restrictions: Apple and watchOS binaries need an appropriate macOS/Xcode lane;
   native, JS/Wasm, server, desktop, and Android tasks have different runners and outputs.
4. Change one owning version source and preserve repository policy, plugin order, hierarchy, target
   names, artifact coordinates, and consumer integration unless the change explicitly owns them.
5. Prove configuration and representative compilations first, then every affected artifact and
   consumer seam. Inspect warnings for deprecations and silently skipped targets.

## Failure boundaries

Reject dynamic versions, unreviewed repositories, cache clearing as a claimed fix, or a single
Android compile as KMP compatibility proof. If the matrix is undocumented or a target cannot run,
mark that row conditional or unproved rather than inferring support.

Do not prescribe commit grouping or a universal upgrade order. Sequence changes only after the
target's actual compatibility edges identify which dimensions must move together or separately.

## Evidence

Report before/candidate matrices, primary-source dates, changed owner, target tasks, produced
artifacts, consumer checks, warnings, and unproved rows. Stop before publication when any supported
row lacks reproducible output or consumer evidence.
