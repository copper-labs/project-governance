---
id: governance.release-process
title: Release Process
type: governance
status: current
owner: project-governance
created: 2026-08-15
updated: 2026-08-15
summary: Defines semantic release identity and the automated immutable wheel publication boundary.
---

# Release Process

Stable releases use exact `MAJOR.MINOR.PATCH` tags and matching Python package versions. Examples
are `1.0.0`, `1.1.0`, and `1.1.1`. GitHub release titles use `Project Governance <version>`.
Commit hashes never appear in a stable release name.

- Increment `MAJOR` for an adopter-breaking runtime or configuration contract.
- Increment `MINOR` for backward-compatible capabilities.
- Increment `PATCH` for backward-compatible fixes.

Untagged source builds use the next patch as a PEP 440 development version with commit identity,
such as `1.1.2.dev3+gabcdef123456`. They are CI or local artifacts, not GitHub releases.

## Publication

1. Merge the validated release change to `main`.
2. Create one exact semantic tag on that merge commit, such as `1.1.0`.
3. Push the tag. The release workflow runs the complete runtime tests, builds one wheel, creates its
   exact adopter lock, and verifies the installed wheel.
4. Only after every proof passes does the workflow publish the GitHub release, wheel, generated
   release notes, and `runtime.lock.yaml`.

The runtime lock version equals the GitHub tag so `project-governance update --to <version>` resolves
one unambiguous release directory. Existing hash-named releases remain historical; new releases do
not reuse that convention.
