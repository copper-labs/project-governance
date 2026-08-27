---
id: governance.release-process
title: Release Process
type: governance
status: current
owner: project-governance
created: 2026-08-15
updated: 2026-08-27
summary: Defines semantic release identity and the automated immutable wheel publication boundary.
---

# Release Process

Stable releases use exact `MAJOR.MINOR.PATCH` tags and matching Python package versions. Examples
are `1.0.0`, `1.1.0`, and `1.1.1`. GitHub release titles use `Project Governance <version>`.
Commit hashes never appear in a stable release name.

- Increment `MAJOR` for an adopter-breaking runtime or configuration contract.
- Increment `MINOR` for backward-compatible capabilities.
- Increment `PATCH` for backward-compatible fixes.

For a major release, the release notes name every known adopter-owned integration surface that
requires manual review. The lock's `configuration_schema` describes only runtime-owned
configuration compatibility; it is not a claim that provider workflows or templates need no work.

Untagged source builds use the next patch as a PEP 440 development version with commit identity,
such as `1.1.2.dev3+gabcdef123456`. They are CI or local artifacts, not GitHub releases.

## Publication

1. Select one exact publication candidate and keep repairs on its branch until it is stable.
2. Keep the pinned governance runtime, required release checks, toolchain, and baselines fixed for
   that candidate. If one changes, form and certify a new candidate.
3. Before merge or tag, run the source-readiness workflow on the candidate's proposed merge result.
   Opening or reopening a ready pull request, or marking a draft ready, starts it; a repair push does
   not automatically replay it. The workflow runs the complete runtime tests, builds the wheel, and
   verifies the installed-wheel boundary. After a failure, return the pull request to draft, repair
   the failed owner and directly affected seam, then mark the stable replacement candidate ready to
   run source readiness once.
4. Merge the certified content and integration base to `main`. If the base advances or integration
   changes the certified result, form and certify a new candidate before proceeding.
5. Create and push one exact semantic tag on the certified merge commit, such as `1.1.0`.
6. The tag workflow verifies the immutable tagged source at the independent publication trust
   boundary, builds the final versioned wheel and exact adopter lock, and verifies the installed
   wheel. Only then does it publish the GitHub release, wheel, generated release notes, and
   `runtime.lock.yaml`.
7. Confirm the published tag, wheel, lock, hashes, and release page as publication readback.

The runtime lock version equals the GitHub tag so `project-governance update --to <version>` resolves
one unambiguous release directory. Existing hash-named releases remain historical; new releases do
not reuse that convention.
