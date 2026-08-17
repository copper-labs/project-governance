---
id: skill.release-readiness-review
title: Release Readiness Review
stage: Review
provenance: package-default
---

# Release Readiness Review

Review release candidates, promotion plans, smoke checks, and post-deploy evidence.

## Trigger

Use this skill when preparing a release, publishing an artifact, promoting a build, changing release
automation, or evaluating post-release evidence.

## Required Reads

- `docs/governance/validation-strategy.md`
- `docs/governance/hook-and-check-taxonomy.md`
- `docs/architecture/reference-architectures/central-observability-lens.md`
- `.governance/runtime/skills/review-finding.schema.yaml`
- repository profile `ci.release_profiles`
- repository profile `ci.smoke_checks`
- release or deployment docs for the target repository

## Workflow

1. Identify the release profile and artifacts affected.
2. Confirm required CI checks, smoke checks, credentials, and operator approvals.
3. Verify versioning, changelog, signing, packaging, or deployment evidence when applicable.
4. Confirm central-observability proof for changed behavior in staging, post-deploy, or release
   evidence, or record an explicit gap.
5. Check known residual risks and rollback or recovery notes.
6. Do not mark release-ready when required evidence is missing.

## Validation

Run the configured release profile or its dry-run equivalent. Confirm required PR checks passed for
the release commit or artifact source.

## Evidence

Report artifact/version identifiers, checks run, smoke evidence, observability proof or gaps,
approvals, residual risks, and the release readiness verdict using the shared review finding schema.
