---
name: kmp-matrix-dependency-governance
description: Use when changing dependency versions, KMP targets, Kotlin, Gradle, Android Gradle Plugin, Compose, Node/web tooling, Swift/iOS integration, or target support. Focuses on compatibility matrix proof and avoiding platform-only leaks into common source.
---

# KMP Matrix And Dependency Governance

## Trigger

Use this skill for dependency upgrades, target additions/removals, platform profile changes, build-tool versions, Compose/Web/Wasm/iOS shifts, or dependency resolution failures in a KMP repository.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles and dependency policy
- version catalog, Gradle settings, build convention plugins, lockfiles, and package manager files
- official docs or release notes for version-sensitive ecosystem claims
- changed target source sets and dependency graphs

## Workflow

1. Build a matrix of touched targets, languages, toolchain versions, plugin versions, and dependency families.
2. Keep versions centralized in the target's chosen version catalog or dependency-management mechanism.
3. Prefer multiplatform dependencies in shared source; do not import platform-only libraries into common source sets.
4. Verify target artifact support before adding a dependency to shared code, especially for native, browser, or Wasm targets.
5. Separate dependency resolution policy from publication policy.
6. Make target removal or target downgrade explicit in the profile, docs, and release notes.
7. Update tests and CI gates for every target whose compile/runtime surface changes.

## Validation

Run dependency resolution, changed target compilation, lockfile checks where applicable, lint/static checks, source-set import guards, and platform tests. Browse official docs or release notes before relying on current toolchain compatibility.

## Evidence

Report the compatibility matrix, central version changes, target support evidence, dependency graph risks, source-set guard results, and tests run or deferred.
