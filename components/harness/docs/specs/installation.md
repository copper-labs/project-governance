---
id: spec.harness.installation
title: Governance Product and Installation
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Governance product and installation

## Decision

Harness is the continuity module of Project Governance. Supported adoption requires governance;
there is no standalone harness product, separate user-selected harness version or generic executor
fallback. Codex app on macOS is the first supported-host target. Cowork and other hosts are deferred.
This is an accepted product contract, not a claim that bundled installation is implemented.

One governance release, one install/update/repair experience and one qualified deployment identity
are the target. Governance-only installations can remain available during rollout and for existing
users; an enabled harness always requires governance. A failed continuity module may fall back to
normal governance/Codex work with an explicit coverage gap, never to ungoverned execution.

## Code organization versus product boundary

Keep the current TypeScript continuity module and Python governance runtime behind their public
versioned contracts. This repository is a development location, not an independently supported
product. No rewrite, second installer or dependency-injection framework is needed merely to bundle.

The first integrated release packages both internally versioned artifacts under a single governance
release manifest. Extend governance's lock schema to pin that immutable manifest and its exact
component digests/source revisions; do not add an independently editable harness lock. The existing
lock remains the truth until that migration ships. Record the resolved deployment digest in receipts.
Internal component revisions are diagnostic data, not a user compatibility matrix.

A later repository consolidation can move the module into governance unchanged once packaging and
qualification pass. Preserve history/tests and public seams. Migration is a separate governance-owned
change; this specification does not move files into or modify the read-only sister repository.
The benefit of consolidation is one change/release pipeline, not eliminating useful module boundaries.

## Installer responsibilities

1. Inspect Git common directory, current worktree, installed deployment, runtime prerequisites,
   instruction ownership, active jobs and Codex integration state.
2. Stage the exact governance release and both component artifacts. Verify hashes before execution.
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

Current `init --apply` only writes instruction blocks; the package is private/version 0.0.0. The unified
manifest, bundled installer, compatibility enforcement at all production entry points and real Codex
qualification are remaining work. Existing low-level non-Git/explicit-database functions remain useful
for fixtures and diagnostics; they do not define a standalone supported deployment.
