---
name: kmp-build-platform-governance
description: >-
  Use when KMP build behavior is the subject: Gradle convention plugins, repositories, target
  presets, native prebuilts, CI lanes, publications, release markers, or artifact families. Keeps
  build-platform changes governed, sliced, and validated.
---

# KMP Build Platform Governance

## Trigger

Use this skill when changing KMP build architecture, module archetypes, Gradle convention plugins, repository policy, target matrices, native source/prebuilt workflows, CI jobs, publication, or release verification.

## Required Reads

- `AGENTS.md`
- repository profile platform profiles, validation packs, release targets, and artifact policy
- build architecture docs, CI workflows, release runbooks, and current Gradle convention plugins
- current modules, target presets, repositories, and publication scripts

## Workflow

1. Treat build behavior as a governed platform, not incidental module configuration.
2. Classify touched modules into known archetypes before editing Gradle files.
3. Keep repository policy centralized; project/module build files should not invent dependency repositories.
4. Keep target presets governed compatibility contracts, not local module preferences.
5. Separate native source builds from durable native prebuilt consumption, and keep heavyweight native builds out of ordinary PR lanes unless required.
6. Slice migrations narrowly: representative module first, shared convention update next, broad rollout after evidence, release/native lanes last.
7. For publish work, validate all artifact families and publish the final release marker only after immutable artifacts are complete.
8. Distinguish partial release retries from complete release retries by checking durable markers and artifact state.

## Validation

Run changed-module Gradle checks, convention plugin tests, repository policy checks, dependency resolution checks, CI workflow validation, native prebuilt checks when relevant, and publication dry-run or release-lane validation from the target profile.

## Evidence

Report module archetypes, target preset changes, repository-policy effects, native source/prebuilt decisions, CI lane mapping, publish/retry safety, validation commands, and any release risk.
