---
id: skill.install
title: Install
stage: Plan
provenance: package-default
---

# Install

Initialize or deliberately update the locked governance runtime in a repository.

## Trigger

Use this skill when creating the lean governance integration, diagnosing bootstrap state, or
reviewing a requested runtime update.

## Required Reads

- `AGENTS.md`
- `CHARTER.md`
- `docs/index.md`
- `config/governance/profile.yaml`
- `config/governance/facts.lock.yaml`
- `config/governance/runtime.lock.yaml`

## Workflow

1. Run `project-governance doctor` without changing the repository.
2. For a new target, run `project-governance init`, review the created files, then create an exact
   runtime lock and run `python3 tools/governance-bootstrap.py`.
3. For an update, run `project-governance update --to <version> --dry-run` first.
4. Stop when a configuration-schema migration needs a project decision.
5. Apply an approved lock-only update with `project-governance update --to <version> --apply`.
6. Run the one affected installation seam and one impacted closeout check.

## Validation

Run `project-governance doctor`. A ready pull request later runs its pre-PR check with the authored
body required by the change-narrative resource.

## Evidence

Report the previous and new lock identities, SHA256 verification, configuration-schema change,
affected verification commands, and any project-owned decision still required.
