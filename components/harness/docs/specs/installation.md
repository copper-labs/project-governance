---
id: spec.harness.installation
title: Governance Product and Installation
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Governance product and installation

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C12/C15/C16](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
one release/lock and qualified runtime/package cutover. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Decision

Harness is the continuity module of Project Governance. Supported adoption requires governance;
there is no standalone harness product, separate user-selected harness version or generic executor
fallback. Codex app on macOS is the first supported-host target. Cowork and other hosts are deferred.
Bundled installation is implemented; native host qualification remains separate.

One governance release, one install/update/repair experience and one qualified deployment identity
are the target. Governance-only installations can remain available during rollout and for existing
users; an enabled harness always requires governance. A failed continuity module may fall back to
normal governance/Codex work with an explicit coverage gap, never to ungoverned execution.

## Code organization versus product boundary

The current TypeScript module and Python runtime use public versioned contracts. The unified target
standardizes the core on TS, with category-led replacement and a proposed coordinated major cutover.
The [migration inventory](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) records
what must carry forward. One product and lock remain; the current wheel below describes delivered
packaging, not a permanent requirement to retain Python/Node wrappers.

The governance wheel embeds this module as package data generated from `components/harness/src`.
One existing wheel lock pins all bytes. There is no separate harness release, composition manifest,
Node package installation or independently editable component lock. Node remains a prerequisite.

The Python launcher holds governance's runtime-reader lease, probes Node/SQLite, then starts the
packaged CLI while preserving the caller's workspace. It binds default governance commands to its
own Python environment. Both `harness` and `project-governance harness` use this one launcher.

Source consolidation and wheel packaging are implemented locally. Publication and adopter rollout
still require the existing governance release boundary. No live SQLite database was relocated or
merged as part of the source migration.

## Installer responsibilities

1. Inspect Git common directory, current worktree, installed deployment, runtime prerequisites,
   instruction ownership, active jobs and Codex integration state.
2. Stage the exact governance wheel containing both modules. Verify hashes before execution.
   Ship only required runtime files. Resolve a supported Node executable explicitly; do not install
   development dependencies or rely on an interactive shell's PATH.
3. Validate public protocols, storage compatibility and provider-free smoke scenarios. A release is
   promoted only with a qualified Codex recipe and published-artifact receipts.
4. Activate under one repository installation lease using governance's existing generation machinery.
   Journal the transition so interruption can complete or restore a coherent generation. Multiple file
   updates are not one atomic transaction; block new calls while activation is incomplete.
5. Install one managed AGENTS.md entry and one chosen Codex hook registration. Preserve authored text,
   unrelated governance delegation markers and host trust prompts. Do not populate an empty override
   that would hide project instructions. Global and project registrations must not duplicate work.
6. Read back deployment identity, workspace/store binding, command availability and qualification
   status. Repeated install and repair are idempotent; no release lookup/download from Git hooks.

Governance's existing `harness-agent` delegation executor is not this continuity module. Installer
messages must distinguish them. Model selection, check selection and job supervision remain existing
owners; bundling must not introduce parallel implementations.

## Worktrees, upgrades and recovery

One Git common directory owns the operational store and compatible deployment generation. Worktrees
retain separate attempts and mutable-source identities. Conflicting branch pins are visible and cannot
silently migrate a store used by another session. Active jobs retain their original executor generation.

Incompatible migrations require quiescent writers/jobs and a coherent backup. Code rollback alone is
not database rollback. Never restore an old backup over newer task history automatically. Keep old
runtime generations while referenced jobs still need them. Network-shared SQLite is unsupported.

## Qualification status

The wheel contains the runtime and generation-bound launcher. `init --apply` still only writes
explicitly requested instruction blocks; native Codex hook installation is not claimed. Public CLI
and installed-wheel tests establish local packaging/owner behavior. Native hook qualification, full
cross-worktree upgrade coordination and automatic adoption remain separate planned work. Low-level
non-Git/explicit-database functions are fixtures/diagnostics, not a standalone supported product.

## Optional decision-provider setup — accepted design

The selected unified release will contain the internal decision interface and optional adapter. Install, update,
repair, doctor, task resume and ordinary execution require no JEV account or token. Core tests need
no provider/network access. Node remains the continuity prerequisite, separate from provider access.

The [decision interface](decision-interface.md) owns off/auto/shadow modes, credential handling and
fallback. Doctor reports configured/disabled/unavailable and qualification status without exposing
credentials or making a network request by default. A missing token is a provider-availability
notice, not an installation failure. One switch disables all optional decisions without reinstalling.

The target doctor also reports optional ripgrep availability under the [discovery contract](repository-discovery.md);
its absence uses in-process lexical search and never fails installation.
