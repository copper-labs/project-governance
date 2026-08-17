---
id: skill.python-implementation
title: Python Implementation
stage: Work
provenance: package-default
---

# Python Implementation

Implement or review Python service, tooling, data, or automation changes.

## Trigger

Use this skill when changing Python source, CLI tooling, service code, data processing jobs,
validation scripts, tests, packaging, or automation.

## Required Reads

- `AGENTS.md`
- `docs/governance/code-quality-policy.md`
- `docs/governance/validation-strategy.md`
- repository profile `quality.platform_profiles` entries with ecosystem `python`
- project packaging files, lint/type/test config, and nearest tests

## Workflow

1. Identify package ownership, entry points, runtime version, dependency manager, and existing test pattern.
2. Keep functions focused, names explicit, and side effects at boundaries.
3. Preserve typed interfaces where the project uses typing; avoid broad dictionaries when typed structures are clearer.
4. Handle errors explicitly and avoid logging secrets, tokens, PII, or large payloads.
5. Keep scripts deterministic and suitable for CI when they are used by governance or release checks.
6. Add or update focused tests for changed behavior.

## Validation

Run the target profile's Python validation packs, usually format, lint, typecheck if configured,
code-smell, comment-quality, naming, and impacted tests.

## Evidence

Report affected package or script, entry points changed, tests added, validation commands, skipped
checks with reasons, and operational risks.
