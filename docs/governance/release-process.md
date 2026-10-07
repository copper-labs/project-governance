---
id: governance.release-process
title: Release Process
type: governance
status: current
owner: project-governance
created: 2026-08-15
updated: 2026-10-06
summary: Defines compiled proof reuse and exact manual publication, with retained legacy wheel guidance.
---

# Release Process

## Compiled runtime (3.x and later)

The coordinated release uses `@organta/project-governance`, one bundled `.tgz` archive,
Node `>=24.16.0 <25`, and the schema-2 runtime lock. Package and canonical dependency-lock
versions must match the exact stable, `MAJOR.MINOR.PATCH-rc.N`, or RC hotfix
`MAJOR.MINOR.PATCH-rc.N.M` tag (positive N and M). Preview versions are local qualification artifacts;
the release metadata builder refuses to publish them as stable releases.

Release candidates publish with GitHub prerelease status and `latest: false`. Their update metadata
is deliberate-only and pins `from_version` to the exact RC. Ordinary stable discovery excludes them.
An operator-authorized RC may tag its qualified implementation branch before stable integration;
this does not merge that branch or activate any adopter. Release notes identify deferred native
host/device qualification and experimental provider behavior.

### Current publication owners

**4.x uses qualified local proof and manual publication.** The current
[release workflow](../../.github/workflows/release.yml) has no 4.x release job. Do not wait for it to
rebuild or publish the candidate. The same workflow retains tagged 3.x compiled and 2.x wheel jobs;
those are separate generation-specific publication owners.

The [source-readiness workflow](../../.github/workflows/source-readiness.yml) remains available for
non-draft pull requests on `opened`, `reopened` and `ready_for_review`; it does not run on every
repair push. Hosted proof is a separate environment boundary. It does not replace required local,
device, semantic or migration evidence, and publication alone does not justify replaying valid proof.
Use the existing operator authorization for the selected publication path; do not add per-step
approval or a hook bypass. An authorized manual 3.x exception still identifies the hosted-CI
exception in its release notes. For 4.x, notes identify the normal local qualification path.

### Keep one candidate and reuse its originals

Finish the coherent repairs, stop writers, and qualify one active candidate through the owning plan
and [validation strategy](validation-strategy.md). Keep source/check manifests, dependency and
configuration identities, archive hashes, installed proof, review and their scope limits together
in an external release evidence directory. Preserve failed and superseded originals as history.
An exact archive or passing check is not by itself device proof, host consumption, task acceptance
or a token/time saving.

Before the checkpoint, verify the declared Node version and the Git executable inherited by test
subprocesses. A platform launcher that repeatedly starts developer-tool discovery can make fixtures
slow and invalidate timing cases. Correct that execution environment and rerun failed, unfinished
or invalidated owners; retain completed proof whose inputs and claims remain valid.

Source proof and archive proof are separate. Bind the selected archive to its qualified source and
packaging inputs, and bind the review to the source/archive it actually inspected. Reuse originals
only while their relevant source, dependencies, configuration, toolchain, conditions and claims still
match. A new commit identity or a status update does not require rebuilding unchanged archive bytes;
verify the changed paths and packaging correspondence instead of assuming equivalence.

After a correction, recheck the failed or invalidated owner and its directly affected boundaries.
Keep other valid originals. Do not restart the whole release matrix or independent review merely
because a repair, commit or publication step finished. Required gates and declared broad-proof
boundaries remain effective; this policy adds no cache or alternate approval authority.

| Actual change | Requalify | Retain when its inputs still match |
| --- | --- | --- |
| Executable source, packaged assets, dependencies or configuration | Affected source and installed/semantic boundaries; produce a new archive if its contents changed | Unaffected original cases and review findings |
| Verifier or synthetic fixture only | Its regression/assessment and affected installed cases; current declared source closure | Frozen runtime bytes after verifying no packaging/runtime change |
| Unpackaged documentation, authored notes or typed plan progress | Documentation/narrative and exact source-to-candidate comparison | Runtime, installed and review proof unaffected by those edits |
| Publication metadata or destination | Metadata binding and remote asset readback | Qualified source/archive execution proof |

Installed package proof includes the dedicated greenfield suite: an empty Git repository grows
knowledge and skills, then exercises shipped prompt, task, context, check and cleanup paths before
its first commit. Fixture inference covers delivery and provider failure, and saved raw evidence
must survive the documentation gate while a broken live guide still blocks. Live provider proof
remains separate and uses existing disclosure authorization and a funded account. A token alone is
not readiness proof; a successful call alone is not a useful accepted development outcome.

### Manual compiled publication checklist

Record these fields in the external release record; reuse existing manifests and receipts rather
than copying their contents into another source document.

- [ ] **Candidate:** exact version, full release commit, archive filename, byte count, SHA256 and
  SHA512 integrity; package/dependency-lock agreement and source/archive correspondence.
- [ ] **Proof:** original source, installed, applicable migration/semantic/device and independent
  review references, their exact identities, closed findings and explicit remaining limits.
- [ ] **Git gates:** stage only owned changes and prepare the authored narrative. Let the normal
  commit/push hook invocation count for its gate; do not run that same stage manually immediately
  before it. A failed hook is repaired and retried normally, with its original failure retained.
- [ ] **Metadata:** from the intended release commit, generate `runtime.lock.yaml` and
  `runtime-update.json` against the frozen archive using the existing metadata owner below.
  Inspect version, archive integrity, full source commit and lock digest. Adoption stays deliberate
  (`automatic: false`, `integration_change: true`). Do not rebuild the archive to generate metadata.
- [ ] **Publication:** use the recorded push/tag/publication authorization. Confirm repository
  release immutability before publishing, verify the exact tag commit, and use authored
  `.github/release-notes/<version>.md` notes. Upload the frozen archive and both metadata files to a
  draft, then publish the complete release with the correct stable/prerelease channel.
- [ ] **Readback:** download all three published assets into a fresh external directory. Compare
  archive bytes/SHA256/SHA512 and metadata byte hashes with the selected local assets; verify lock
  version/source commit, update lock digest, tag target, release URL, non-draft state, immutable
  status and stable/prerelease channel before claiming publication.
- [ ] **Closeout:** retain local and remote identities and readback in the existing release record.
  Publication does not upgrade adopters, alter their pins, move chats or change startup authority.

The existing metadata command reads the current checkout's `HEAD`; run it from the intended release
commit. Use exact arguments and a fresh existing output directory:

```sh
node components/engine/scripts/release-assets.mjs <frozen-archive> <version> <owner/repository> <output-directory>
```

The source checkout retains its current governance hook owner until deliberate cutover. Release
packaging grants no authority to change another checkout or replace its shared startup instructions.

## Legacy wheel process (2.x)

The following process is retained for existing wheel installations and historical release work.
It is not the compiled runtime CI or publication path.

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
