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
configuration. `--apply` changes only the lock. A runtime release never updates a repository
automatically.
