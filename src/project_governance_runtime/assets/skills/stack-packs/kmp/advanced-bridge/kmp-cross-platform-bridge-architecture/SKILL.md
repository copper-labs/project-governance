---
name: kmp-cross-platform-bridge-architecture
description: Use when designing or reviewing KMP-backed bridges across multiple host stacks such as Android, iOS, React Native, Flutter, Ionic, web, or future native/web hosts. Applies shared-runtime-first ownership, thin platform shell rules, all-host impact review, and parity evidence before bridge work is called complete.
---

# KMP Cross-Platform Bridge Architecture

## Trigger

Use this skill when a change touches bridge APIs, commands, state projection, readiness, event streams, result projection, uploads, artifacts, observability, platform shells, host UI defaults, or a new host integration in a KMP product.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- repository profile platform profiles for KMP, Android, iOS, web, React Native, Flutter, or other touched hosts
- the nearest bridge architecture/spec/decision docs
- the smallest existing bridge shell, shared runtime, shared bridge-support, and E2E proof files for the touched area

## Workflow

1. Classify each behavior as shared runtime, shared bridge support, platform shell, host UI, or proof-only code.
2. Keep semantic ownership in KMP/shared runtime for lifecycle, run identity, command legality, readiness, progression, results, artifact/upload timing, ordered event semantics, and observability contracts.
3. Put reusable serialization, selectors, fixture readers, event buffers, command wrappers, and host-friendly projection glue in shared bridge support.
4. Let platform shells own only forced mechanics: module registration, event emitter installation, platform channels, WebView handlers, lifecycle callbacks, permissions, view/widget wrappers, and resource attachment.
5. Require all-host impact notes for every bridge API, event, command, result, readiness, upload, or observability change.
6. Hoist behavior before copying it into a second host, and block a third copy until shared ownership exists.
7. Keep customer-facing default visuals native to the host stack, fed by prepared shared projections and override seams.
8. Treat E2E/sample hosts as proof surfaces; never let them become hidden owners of product policy.

## Validation

Run the target profile's KMP boundary, architecture, lint, code-smell, naming, comment-quality, and affected host test packs. For bridge completion claims, require both shared contract tests and host-side proof that the public surface crosses into the KMP/shared runtime path.

## Evidence

Report the ownership classification, all-host impact notes, shared behavior moved or intentionally deferred, platform shell responsibilities, host visual ownership, validation commands, and any host that remains incomplete or proof-only.
