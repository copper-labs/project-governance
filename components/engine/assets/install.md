---
id: skill.install
title: Install
stage: Plan
provenance: package-default
---

# Install the compiled runtime

Use this guidance for deliberate installation, update or forward repair of the compiled engine.
Read the project's instructions and current lock first. Preserve authored files and unrelated work.
Only the parent may perform an authorized installation; workers and Git hooks inherit its runtime.

## Prepare

Use a trusted compiled CLI and an exact local package archive. The lock has schema_version 2,
package `@organta/project-governance`, an exact version, artifact URL and SHA-512 integrity,
full source_commit, node `>=24.16.0 <25`, and configuration_schema 1. Do not invent source identity
or treat a dirty preview as an immutable release.

Run `runtime-migration-plan --workspace ABSOLUTE_WORKSPACE` and save its JSON output to a plan file.
This discovers project files only. Inventory external stores, legacy jobs, active owners, shared Git
configuration and artifacts separately before a migration. Reconcile and drain existing owners;
archive required history and retain verified receipts. Resolve old-runtime interpreter dependencies
in project-owned commands before activation.
The activation check also refuses direct GitHub workflow steps that invoke the retired wheel
bootstrap or interpreter. Workflow files belong to the backed migration scope. Separately inspect
indirect scripts, composite actions and reusable workflows; this check does not recursively execute
or resolve those command graphs.

Create a private JSON request containing:

- `mode`: `init`, `update` or `repair`;
- canonical absolute `workspace`, `registry` and local `archive` paths;
- `lock`: the exact compiled lock object;
- `expectedRevision`: the installation registry revision, zero for a fresh init;
- `inputs`: the plan's path/kind records plus declared external files and operational databases;
- `hostPlan`: the discovered plan's hostPlan for init and update;
- `history`: a required legacy archive directory and receiptDigest when migrating retained history;
- `startupReceipts`: an absolute receipt-store path when transitioning the shipped legacy Codex hooks.

For a fresh checkout that already contains the compiled lock but has no installed launcher or
registry, use `mode: init` with `lockedCheckout: true`. The request's lock must exactly match the
tracked lock, which must appear as a file in the backup plan. The launcher must remain an absent
target. This installs the pinned artifact without selecting another version or rewriting lock bytes.
It is not an update or repair shortcut for an existing installation.

The package also ships `dist/engine/assets/bootstrap-runtime.mjs` for a fresh compiled checkout.
Use a trusted copy of that entrypoint with Node 24.16 or later in the 24.x line:

```sh
node bootstrap-runtime.mjs --workspace ABSOLUTE_WORKSPACE --archive ABSOLUTE_LOCAL_TGZ --state-directory ABSOLUTE_EXTERNAL_STATE
```

The external state's parent must already exist. Keep that directory: it contains the registry,
retained archive, backup and recovery operation. Reuse it for an identical retry. The entrypoint
accepts the JSON-form lock emitted by the compiled runtime, verifies the supplied archive's SHA-512
before loading package code, disables npm scripts/network dependency fetching, and delegates to the
packaged installer. Omit `--archive` to read the exact lock URL, or reuse a previously retained archive without network
access. HTTPS downloads share a 60-second deadline and a 32 MiB archive limit. Private GitHub release
assets use `GH_TOKEN` or `GITHUB_TOKEN` only on the initial GitHub API requests; credentials never
follow redirects. No latest-version discovery or alternate-asset fallback occurs. This entrypoint
does not migrate a wheel installation or update an existing compiled installation. The calling CI
or installation flow must establish trust in the bootstrap entrypoint itself.

Use a new operation directory outside the source checkout. Keep the request and plan with the
operation's evidence. A repair requires a post-write compiled generation and declared operational
SQLite evidence; it preserves new history instead of restoring an older database.

## Apply and verify

Invoke `init|update|repair --request-file REQUEST --project-plan PLAN --operation-directory OPERATION`
with exactly one command name. Update and repair may use the installed repository-local launcher.
Initial installation uses the trusted compiled CLI. Legacy update acquires the old installation's
workspace exclusion before transitioning; do not bypass this handoff.

Repeat the identical request and operation directory to resume. Changed input or incomplete evidence
requires reconciliation, not deleting receipts, stealing ownership or creating a second installation.
An error can retain maintenance while recovery obligations remain unresolved.

After completion, run the repository-local launcher with `doctor`. Verify the exact lock, launcher,
required project workflow, retained evidence and cleanup. Init creates missing profile, facts, ignore
and hook files, preserving authored files. Hook-file creation alone does not configure Git: inspect
`hooks` and use `hooks --apply --configure` only within the authorized configuration scope. Shared
worktree configuration or custom hooks require reconciliation.

Report old/new identity, evidence, changed configuration and unresolved obligations. Publication,
release tags and other-project rollout require their own explicit authorization.

## Startup integration

Run the installed launcher's `startup-help` for the command contract covering discovery, work
assessment, application and recovery. That guide ships with the same runtime that owns those commands.
Do not apply wheel startup commands to a compiled installation.

For existing shipped legacy Codex hooks, include `startupReceipts` in the coordinated update request.
The verified backup and drained transition own their replacement. Customized or incomplete legacy
handlers require deliberate reconciliation. For new configuration, `startup hooks --receipts
ABSOLUTE_EXTERNAL_SQLITE_PATH` proposes handlers and `startup install-hooks` installs them.
Neither installation path enables compatible updates or grants native project/hook trust.

Verify actual native event delivery separately from file installation. Keep the old launcher and
receipt history until their replacement and retained-history readback are qualified. Inventory CI
bootstrap calls, project-owned interpreter dependencies and skill routes before retiring the wheel.
A passing package test alone does not qualify an adopter cutover or its device workflows.
