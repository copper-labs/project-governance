---
id: governance.bootstrap-standards
title: Bootstrap Standards
type: governance
status: current
owner: project-governance
created: 2026-07-05
updated: 2026-08-12
summary: Defines the small, target-owned integration surface for the runtime wheel.
---

# Bootstrap Standards

Bootstrap creates a lean integration surface once. It does not copy the generic runtime into the
repository and never overwrites a project decision.

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
Bootstrap downloads the wheel named by the lock, verifies SHA256, builds the repository-local
environment, and installs it. Private GitHub releases use `GH_TOKEN`, `GITHUB_TOKEN`, or the
current `gh auth` credential without storing that credential. Hooks only report a bootstrap
instruction when that environment is absent. Bootstrap also replaces ignored generic skill state
with the exact wheel payload, so an existing adopter reruns bootstrap after updating its lock.

`project-governance update --to <version> --dry-run` shows the lock change, configuration-schema
impact, any project-owned migration, and exact validation commands. `--apply` changes the lock only
when no human judgment is required. A runtime release never updates a repository automatically.
