---
id: governance.bootstrap-standards
title: Bootstrap Standards
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-27
summary: Defines the small, target-owned integration surface for the runtime wheel.
---

# Bootstrap Standards

Bootstrap creates a lean integration surface once. It does not copy the generic runtime into the
repository. Replacing tracked launchers requires a separate explicit command.

## Tracked Repository Files

- `config/governance/runtime.lock.yaml`: exact wheel name, semantic release version, SHA256, source
  commit, supported Python range, and configuration-schema version.
- `config/governance/profile.yaml`: project-owned generic policy choices.
- `config/governance/facts.lock.yaml`: project-owned confirmed facts.
- Target-owned packs, extensions, project documentation, and thin hooks.

## Ignored Local State

- `.governance/runtime/`: virtual environment and installed wheel.
- `.governance/runtime/skills/`: materialized generic skills for discovery.
- `.governance/telemetry/runs.jsonl`: bounded advisory run history.

## Bootstrap And Upgrade

`project-governance init` creates missing integration files without replacing existing content.
`doctor` reports tracked bootstrap or hook launchers that differ from the installed wheel as
non-blocking notices because a project may customize them deliberately. After reviewing those
differences, `project-governance init --refresh-launchers` replaces only those launchers; it does
not edit project configuration or target packs.
Bootstrap downloads the wheel named by the lock, verifies SHA256, builds the repository-local
environment, and installs it. Private GitHub releases use `GH_TOKEN`, `GITHUB_TOKEN`, or the
current `gh auth` credential without storing that credential. Hooks only report a bootstrap
instruction when that environment is absent. Bootstrap also replaces ignored generic skill state
with the exact wheel payload, so an existing adopter reruns bootstrap after updating its lock. Its
repository-local pip invocation suppresses pip's unrelated upgrade advertisement.

`project-governance update --to <version> --dry-run` shows the lock change, configuration-schema
impact, and exact validation commands. A schema change requires deliberate review of project-owned
configuration. `--apply` changes only the lock. A runtime release never pushes a repository update. An explicit tracked opt-in may authorize the
[startup update contract](../specs/startup-runtime-updates.md) for compatible local adoption.

Native task startup is distinct from Git hooks. The [startup update guide](../guides/startup-runtime-updates.md)
covers its one-time integration. Git hooks remain update-free; updater-owned validation can join
the exclusive runtime transaction. Runtime generations are installed at their final paths and
retained for recovery. Manual bootstrap preserves the existing generation until installation succeeds when the runtime
uses the generation/symlink layout. Legacy ordinary-directory installations are cleared in place;
a later dependency-install failure can leave that runtime unavailable. Keep the tracked lock and
launcher, repair the artifact/network availability, and rerun bootstrap. Do not claim rollback for
that older layout.

## Locked Runtime Dependencies

The release wheel contains `assets/runtime-requirements.txt` with exact versions and SHA256 hashes
for the complete runtime dependency closure, including transitive packages and Python markers.
Bootstrap reads that lock only after verifying the enclosing wheel and installs the runtime and
its dependencies together with pip hash checking and binary-only resolution. Missing pins, missing
hashes, altered archives, or unavailable compatible wheels fail installation. Source builds cannot
introduce an unchecked build dependency chain.

The package metadata retains compatibility ranges for ordinary Python packaging; those ranges alone
are not a reproducible adoption install. The supported adoption path is the refreshed bootstrap
launcher. Older launchers do not gain hash enforcement just by changing the runtime version. Refresh
them deliberately from the new release, review their diff, and rerun bootstrap before declaring CI
adoption reproducible. The new launcher rejects older wheels without an embedded dependency lock.

Dependency updates replace the embedded pins and approved wheel hashes together. Obtain hashes from
the pinned releases, review package metadata for the full closure and supported Python versions,
and prove a clean bootstrap, `pip check`, and the runtime suite before release. Platform wheels may
have different approved hashes; repeatability means the same pinned dependency versions and approved
artifacts for the same Python/platform. Availability on every future Python or platform is not implied.
The host Python, its bundled pip, and source-development/build tooling remain separate prerequisites;
this lock covers installed runtime dependencies, not reproducible construction of the release wheel.

Pip retains the adopter's existing index and mirror configuration. Regardless of transport, only
artifacts matching the release's embedded hashes are accepted. Do not direct installs outside the
repository runtime with target/prefix overrides. The local Python 3.9 proof used pip 21.2.4; CI also
proves the current Python 3.14 environment. Older bundled installers are not separately certified.
