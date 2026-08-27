---
id: developer-guide.first-governed-check
title: Run Your First Governed Check
type: guide
status: current
owner: project-governance
created: 2026-08-21
updated: 2026-08-21
summary: Guides an evaluator or operator from runtime installation through one observable affected check and its recovery path.
---

# Run Your First Governed Check

Use this journey when you want to evaluate Project Governance or introduce it into a Git repository.
You will finish with one staged documentation change checked by the installed runtime.

## Understand The Boundary

The wheel owns generic mechanics: CLI behavior, affected-path selection, built-in packs, process
handling, normalized findings, generic skills, and bounded local telemetry. Your repository owns the
exact wheel lock, profile, product-specific packs, commands, documentation, and proof. The full
responsibility matrix is in [Governance Runtime Architecture](../../architecture/governance-runtime.md).

This separation matters because an update can improve generic governance without silently changing
your product policy.

## Prepare The Repository

You need Python `>=3.9,<4`, Git, and an immutable Project Governance wheel. Install the wheel through
your normal Python package tooling so `project-governance` is available, then enter a Git repository
with at least one commit.

Initialize the project-owned integration:

```sh
project-governance init
```

Expected result: JSON reports `status: initialized` and lists only newly created project-owned
configuration, launcher, hook, and ignore paths. Repeating the command reports an empty `created`
list, an empty `refreshed` list, and preserves later repository edits. If a tracked launcher later
differs from the installed wheel, `doctor` reports the difference without overwriting it. Use
`project-governance init --refresh-launchers` only after reviewing and choosing the wheel-owned
launcher.

Add the exact released wheel identity to `config/governance/runtime.lock.yaml`, then materialize the
locked runtime and inspect its health:

```sh
python3 tools/governance-bootstrap.py
.governance/runtime/bin/project-governance doctor
```

Expected result: `doctor` reports `status: passed`. The bootstrap verifies the wheel hash before
installing into ignored `.governance/runtime/`; hooks never download or change the lock.

## Run One Affected Check

Edit `README.md`, stage it, then preview the affected pack selection:

```sh
git add README.md
.governance/runtime/bin/project-governance plan --stage pre-commit --mode impacted --staged --json
```

The plan identifies only packs whose path rules own the staged change. Run that exact affected set:

```sh
.governance/runtime/bin/project-governance check --stage pre-commit --mode impacted --staged
```

Success is a JSON result with `status: passed`, no blocking finding, and evidence for each selected
pack. A failed pack remains visible with its normalized findings and process outcome.

## Recover When The Runtime Is Unavailable

If the repository-local command is missing, do not copy code from a source checkout or bypass the
lock. Check `config/governance/runtime.lock.yaml`, run the bootstrap again, then rerun `doctor`. A
hash, version, Python, or release-location error must be corrected at its owning lock or environment
before validation can be trusted.

For routine failures after installation, rerun only the failed pack while repairing it. Finish once
with a branch-aware impacted pre-push sign-off; do not use broad validation as the repair loop.

## Add Developer Documentation

An adopter that wants the shared human and agent entry structure can preview and install it:

```sh
project-governance docs init --dry-run
project-governance docs init
```

The command extends the existing profile and creates only a documentation index, capability catalog,
and empty guide/reference directories. The host agent then authors real pages directly, beginning
with local authority and using current public research only when permitted and useful.
