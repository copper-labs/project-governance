---
id: guide.user-guide
title: Operator Guide
type: guide
status: current
owner: project-governance
created: 2026-03-02
updated: 2026-08-21
summary: Task-oriented guide for installing and operating the package-based governance runtime.
---

# Operator Guide

The runtime is a normal Python wheel. Your repository chooses when to adopt it and owns all
project-specific policy, packs, and commands.

## Install

1. Obtain an immutable wheel release and its SHA256.
2. Install that downloaded wheel through standard Python package tooling so its CLI is available.
3. Run `project-governance init` once to create the small integration surface.
4. Add the exact artifact details to `config/governance/runtime.lock.yaml`.
5. Run the generated bootstrap launcher. It verifies the hash and installs the locked wheel into
   ignored `.governance/runtime/`. For a private GitHub repository it reads `GH_TOKEN`,
   `GITHUB_TOKEN`, or the current `gh auth` credential; no credential enters the lock.
6. Run `project-governance doctor` to confirm the runtime and configuration are usable.

There is no separate source template or generator. The installed wheel's `init` command is the
only initialization authority and never invents an artifact lock.

The lock, profile, facts, and project extensions stay tracked. The virtual environment, installed
skills, and telemetry stay local and ignored.

## Install Developer Documentation

Preview and install the optional shared human and agent entry structure:

```sh
project-governance docs init --dry-run
project-governance docs init
```

The command extends the existing profile and creates only missing index, catalog, and directory
paths. It does not generate product claims or edit the repository's root agent instructions. The
installed technical-authoring skill reads local authority first, then may use current public
research when the profile and host allow it.

## Use Governed Delegation

In Codex or Claude Code, tell the primary agent:

> Use delegation for this task.

That is the operator interface. `Use governed delegation for this task` and `Delegate this task`
are equivalent. The primary prepares the bounded plan, chooses solo when delegation would add
overhead, and handles the internal route, authorization, launch, and finish commands. The operator
does not prepare JSON files or run those commands manually.

## Routine Work

Use impacted validation:

```sh
project-governance check --stage pre-commit --mode impacted
```

Inspect selection without running checks:

```sh
project-governance plan --stage pre-pr --mode impacted --json
```

If a pack fails, run that pack only, repair it, and run one impacted closeout. Do not use a broad
run as a repair loop.

## Upgrade Deliberately

Preview an adoption:

```sh
project-governance update --to <version> --dry-run
```

Review the old and new artifact hash, exact configuration migrations, bounded predecessor cleanup
inventory, required project decision, and verification commands. Automatic cleanup is limited to
unchanged files proven runtime-owned by the predecessor manifest; modified, target-owned, unknown,
and ignored runtime state remain untouched. Apply only after that review:

```sh
project-governance update --to <version> --apply
python3 tools/governance-bootstrap.py
.governance/runtime/bin/project-governance check --stage pre-pr --mode impacted
```

The apply command swaps the tracked lock and may remove only reviewed, hash-proven predecessor
artifacts from the dry-run list. Bootstrap then safely replaces the ignored local environment after
the old runtime command has exited. Requesting the already locked immutable version returns
`no-op`; the same version resolving to different bytes fails closed.

Use `project-governance telemetry status` to inspect availability and outcomes. The underlying
ignored JSONL retains bounded, redacted execution aggregates for trend analysis; it is diagnostic
only and never authorizes a pass or policy change.

## Configuration Ownership

The runtime provides generic packs and normalized findings. Your repository provides its source
paths, tool commands, extra packs, platform checks, and product language. Do not put repository
identity or product rules in the shared runtime.

For agent usage, see [Agent setup](agent-setup-instructions.md). For the exact operational rules,
see [Validation strategy](../governance/validation-strategy.md).
