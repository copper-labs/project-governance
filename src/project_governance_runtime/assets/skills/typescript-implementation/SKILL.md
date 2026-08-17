---
id: skill.typescript-implementation
title: TypeScript Implementation
stage: Work
provenance: package-default
---

# TypeScript Implementation

Implement or review TypeScript, Node, web, or React Native changes.

## Trigger

Use this skill when changing TypeScript or JavaScript source, Node services, web clients, React
Native clients, shared packages, build scripts, API clients, or frontend state flows.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- repository profile `quality.platform_profiles` entries with ecosystem `typescript`, `node`, `web`, or `react-native`
- package scripts, lint config, typecheck config, and nearest tests for the affected package

## Workflow

1. Identify package ownership, module boundaries, runtime target, and existing state/data patterns.
2. Preserve type safety; avoid `any`, broad casts, and implicit runtime contracts unless the target policy allows them.
3. Keep API, persistence, domain, and UI models separated when the codebase has those layers.
4. Keep async behavior explicit, cancellation/error paths handled, and user-facing errors safe.
5. Reuse existing components, hooks, utilities, and package conventions before adding new abstractions.
6. Add or update tests close to the changed behavior.

## Validation

Run the target profile's TypeScript/Web/Node validation packs, usually format, lint, typecheck,
code-smell, comment-quality, naming, and impacted tests.

## Evidence

Report affected package, public API/type changes, test coverage, validation commands, skipped checks
with reasons, and runtime or compatibility risks.
