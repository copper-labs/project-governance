---
id: guide.user-guide
title: Operator Guide
type: guide
status: current
owner: project-governance
created: 2026-03-02
updated: 2026-08-24
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

There is no separate source template or generator. The installed wheel's `init` command owns the
base runtime integration and never invents an artifact lock. Optional module commands such as
`docs init` own only their declared extension and reuse the base profile seed.

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
project-governance plan --stage pre-push --mode impacted --json
```

For agent work, the coordinator should run `project-governance context --task <description>
--json-output .governance/runtime/context-result.json` before editing. Relevant governed skills are
selected and materialized automatically from the repository route and facts. No utilization
closeout is required. A materialized packet, including skills, cannot exceed 256 KiB; at most eight
completed packets are retained, and interrupted runtime staging is cleaned on the next context run.

If a pack fails, use its named execution only when focused diagnosis needs it. After the final
repair, run one affected recheck: either the enclosing hook or the impacted pre-push sign-off. Do
not automatically run the named pack and then replay it immediately inside an unchanged enclosing
gate. When `git commit` or `git push` will invoke that gate, the hook is the recheck; do not run the
same stage manually first. Do not use a broad run as a repair loop.

The target repository owns its local-feedback objective and command or CI deadlines. The runtime
has no default execution timeout. An explicitly supplied `--timeout-seconds` remains fail-closed;
otherwise elapsed time is evidence, not a generic pass/fail policy. The runtime does not add
another cache, scheduler, or retry system around target execution.

## Prepare a Pull Request

The shipped pre-PR hook checks only the pull request title and body, and fails closed until both have
been authored. It does not replay the affected code-validation sign-off. Store the one-line outcome
at the path returned by `git rev-parse --git-path PR_TITLE`, and store the body at the path returned
by `git rev-parse --git-path PR_DESCRIPTION.md`. The body contains Product impact, Nature of the
change, Code areas impacted, and Why; it does not repeat Outcome, Validation, or a generic risk
section.

Run the ordinary hook against those worktree-local drafts:

```sh
.githooks/pre-pr
```

For provider automation or another explicit draft location, supply the pair together:

```sh
project-governance check --pack pr-description --stage pre-pr --mode all \
  --pr-body-file <path> --pr-title "<plain-language outcome>"
```

Use the same title and body when creating the pull request. This keeps the locally checked draft
and the visible provider content aligned.

## Upgrade Deliberately

Preview an adoption:

```sh
project-governance update --to <version> --dry-run
```

Review the old and new artifact hash, configuration-schema change, and verification commands. If
the schema changes, update the repository-owned configuration first. Apply only after that review:

```sh
project-governance update --to <version> --apply
python3 tools/governance-bootstrap.py
.governance/runtime/bin/project-governance doctor
```

The apply command swaps only the tracked lock. Bootstrap then safely replaces the ignored local
environment after the old runtime command has exited. Requesting the already locked version returns
`no-op`; the same version resolving to different bytes fails closed.

Use `project-governance telemetry status` for routine efficiency inspection. The underlying ignored
JSONL retains at most 1,000 records and one mebibyte. It contains validation lifecycle aggregates
only; it is diagnostic and never authorizes a pass or policy change.

Use `--summary` on `plan` or `check` when a person or agent needs the outcome rather than a full
machine receipt. Shipped hooks use this projection. Active failures remain visible, while changed
path inventories, command lines, stdout, and stderr stay in the full default or `--json-output`
receipt.

## Configuration Ownership

The runtime provides generic packs and normalized findings. Your repository provides its source
paths, tool commands, extra packs, platform checks, and product language. Do not put repository
identity or product rules in the shared runtime.

For agent usage, see [Agent setup](agent-setup-instructions.md). For the exact operational rules,
see [Validation strategy](../governance/validation-strategy.md).
