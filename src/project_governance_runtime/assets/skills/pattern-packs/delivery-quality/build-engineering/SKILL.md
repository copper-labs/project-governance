---
name: build-engineering
description: >-
  Use for build system changes or failures outside a single source edit: local/CI parity, dependency
  resolution, caches, scripts, generated code, task ordering, and reproducible diagnostics.
---

# Build Engineering

## Trigger

Use this skill when changing build scripts, task graphs, CI workflow glue, package managers, generated code, dependency resolution, caches, release scripts, or when diagnosing build failures.

## Required Reads

- `AGENTS.md`
- repository profile validation, CI, release, and platform profiles
- build docs, package manager files, CI workflow files, and recent failure logs
- changed build scripts and generated-code contracts

## Workflow

1. Reproduce the failure or desired build behavior with the smallest command.
2. Classify the problem: toolchain, dependency, source compile, generated code, test runtime, cache, environment, or CI sequencing.
3. Prefer deterministic fixes over sleeps, retries, hidden environment assumptions, or broad cache clearing.
4. Keep build configuration centralized and boring; do not spread repositories, versions, or task policy into leaf modules.
5. Validate the fast local command, then the CI-equivalent command for affected areas.
6. Record environment assumptions and cache changes when they matter.

## Validation

Run the target build/lint/test commands, dependency-resolution checks, generated-code checks, and CI workflow validation required by the profile.

## Evidence

Report reproduction command, root cause category, fix, commands rerun, CI parity, environment assumptions, and residual build risk.
