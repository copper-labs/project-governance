---
id: governance.release-process
title: Release Process
type: governance
status: current
owner: project-governance
created: 2026-08-15
updated: 2026-09-06
summary: Defines compiled major-release proof and deliberate publication, with retained legacy wheel guidance.
---

# Release Process

## Compiled runtime (3.x)

The coordinated major release uses `@organta/project-governance`, one bundled `.tgz` archive,
Node `>=24.16.0 <25`, and the schema-2 runtime lock. Package and canonical dependency-lock
versions must match the exact stable or `MAJOR.MINOR.PATCH-rc.N` tag (positive N). Preview versions are local qualification artifacts;
the release metadata builder refuses to publish them as stable releases.

Release candidates publish with GitHub prerelease status and `latest: false`. Their update metadata
is deliberate-only and pins `from_version` to the exact RC. Ordinary stable discovery excludes them.
An operator-authorized RC may tag its qualified implementation branch before stable integration;
this does not merge that branch or activate any adopter. Release notes must identify deferred native
host/device qualification and experimental provider behavior. The tagged release workflow repeats
source and installed-package proof before publishing the immutable assets.

The source-readiness workflow runs source tests, type checking, release-metadata tests, package
construction and offline installed-command proof on each non-draft pull request update, including
new commits. This does not replace the required device, semantic or migration evidence for a release.
A changed integration candidate requires current proof.

The release workflow repeats that source/package boundary, then creates `runtime.lock.yaml` and
`runtime-update.json` from the archive identity and full source commit. Metadata defaults to
deliberate adoption (`automatic: false`, `integration_change: true`); no major upgrade is inferred.
Before an authorized tag, confirm repository release immutability, reconcile exact candidate proof,
and prepare migration notes. The workflow uploads the archive and metadata to a draft before
publishing. Pushing, tagging and publication require explicit operator authorization. Before tagging, compare the exact release archive with the device-qualified archive; enumerate
unchanged executed paths and rerun any affected scenario. Passing CI or matching source names alone
does not establish this binding. After
publication, verify the release assets and immutable status before claiming released adoption.

The source checkout can retain its current governance hook owner while the preview is qualified.
Shared automatic startup and related instruction replacement remain a separate deliberate cutover;
release packaging does not grant authority to change another checkout.

## Legacy wheel process (2.x)

The following process is retained for existing wheel installations and historical release work.
It is not the 3.x CI or publication path.

Stable releases use exact `MAJOR.MINOR.PATCH` tags and matching Python package versions. Examples
are `1.0.0`, `1.1.0`, and `1.1.1`. GitHub release titles use `Project Governance <version>`.
Commit hashes never appear in a stable release name.

- Increment `MAJOR` for an adopter-breaking runtime or configuration contract.
- Increment `MINOR` for backward-compatible capabilities.
- Increment `PATCH` for backward-compatible fixes.

For a major release, the release notes name every known adopter-owned integration surface that
requires manual review. The lock's `configuration_schema` describes only runtime-owned
configuration compatibility; it is not a claim that provider workflows or templates need no work.
Increment it whenever a target configuration accepted by the prior runtime becomes invalid because
the runtime's configuration semantics changed, even if the YAML shape did not. Do not increment it
for looser validation, checker output changes, or adopter-owned integration guidance.

Untagged source builds use the next patch as a PEP 440 development version with commit identity,
such as `1.1.2.dev3+gabcdef123456`. They are CI or local artifacts, not GitHub releases.

## Publication

1. Confirm GitHub release immutability is enabled for this repository before forming the release;
   the setting protects only releases published after it is enabled.
2. Select one exact publication candidate and keep repairs on its branch until it is stable.
3. Keep the pinned governance runtime, required release checks, toolchain, and baselines fixed for
   that candidate. If one changes, form and certify a new candidate.
4. Before merge or tag, run the source-readiness workflow on the candidate's proposed merge result.
   Opening or reopening a ready pull request, or marking a draft ready, starts it; a repair push does
   not automatically replay it. The workflow runs the complete runtime tests, builds the wheel, and
   verifies the installed-wheel boundary. After a failure, return the pull request to draft, repair
   the failed owner and directly affected seam, then mark the stable replacement candidate ready to
   run source readiness once.
5. Merge the certified content and integration base to `main`. If the base advances or integration
   changes the certified result, form and certify a new candidate before proceeding.
6. Create and push one exact semantic tag on the certified merge commit, such as `1.1.0`.
7. The tag workflow verifies the immutable tagged source at the independent publication trust
   boundary, builds the final versioned wheel and exact adopter lock, and verifies the installed
   wheel. Only then does it create a draft release, attach the wheel and `runtime.lock.yaml`, and
   publish the complete release so GitHub can make it immutable.
8. Confirm the published tag, wheel, lock, hashes, immutable state, and release page as publication
   readback.

The runtime lock version equals the GitHub tag so `project-governance update --to <version>` resolves
one unambiguous release directory. Existing hash-named releases remain historical; new releases do
not reuse that convention.

When `.github/release-notes/<version>.md` exists, publication includes that authored text before
the generated change list. Record operator-authorized validation exceptions there before publication.

## Startup Compatibility Metadata

Every release publishes `runtime-update.json` beside its wheel and exact runtime lock. The
release builder binds the metadata to the lock digest. Review `.github/runtime-update-policy.json`
as part of release classification: its source-version range must include skipped-version paths,
and startup integration changes or migrations require `automatic: false` with an appropriate
source boundary. Equal configuration schema versions alone do not establish compatibility.
The initial automatic source floor is 2.5.0. Earlier adopters require deliberate integration.

The [startup contract](../specs/startup-runtime-updates.md) requires immutable release assets and
same-major stable selection. Clean-wheel proof exercises setup and a two-version local fixture
upgrade with an ordinary Git hook, preserving unrelated staged and unstaged work. Fixture wheels
are never published. Source release proof and independent review remain required.
