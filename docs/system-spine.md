---
id: docs.system-spine
title: System Spine
type: guide
status: current
owner: project-governance
created: 2026-07-07
updated: 2026-08-24
summary: Top-level map of the package-based, project-neutral governance system.
---

# System Spine

The system has one clear split: the wheel owns generic governance behavior; each repository owns
its own policy choices and project checks. Markdown is the sole current policy authority.

| Layer | Owner | Contents |
| --- | --- | --- |
| Runtime wheel | `project-governance` | CLI, changed-path planning, generic packs, process handling, finding normalization, shared skills, and small local validation telemetry |
| Repository configuration | Adopting repository | Runtime lock, profile, facts, target-owned packs, commands, and project documentation |
| Product validation | Adopting repository | Builds, tests, linters, device checks, and product-specific policies |

## Normal Flow

1. Bootstrap the wheel named by `config/governance/runtime.lock.yaml`.
2. Change one owner, run its focused proof, and commit the coherent result through pre-commit.
3. If one governance pack fails, use its named execution only when focused diagnosis needs it.
4. Freeze the repaired candidate and use one branch-aware impacted pre-push sign-off, or the
   automatically invoked hook, as the affected recheck; do not immediately replay both.
5. Check only the pull-request title and body through the shipped pre-PR hook; CI owns its separate
   affected trust boundary.
6. Adopt a newer runtime only through `project-governance update`, after reviewing its dry run.

For substantial agent work, the coordinator may run the public context command. A matched target
route selects and materializes the smallest exact skill set. The runtime does not require a
per-skill utilization receipt or retain task content.

Optional delegation uses the host's native agent controls. The primary remains responsible for
planning and integration, all roles share the current checkout by default, and delegation never
authorizes another worktree.

The runner resolves changed scope once, supplies every selected pack the same immutable before/after
packet, and gives each pack a run-scoped evidence directory. An unmapped path produces one selector
finding instead of triggering every pack. The runner does not duplicate build-system caching or
store receipts for product checks. It removes only empty evidence directories that it created and
never deletes target-written evidence implicitly.

## What Is Broad On Purpose

Complete validation is reserved for a runtime release, configuration-schema migration, hook or
selection-contract change, security/process-isolation boundary, scheduled reconciliation, or an
explicit operator request. Routine product work stays narrow.

## Reading Path

- [Runtime contract](specs/governance-kernel.md)
- [Runtime architecture](architecture/governance-runtime.md)
- [Bootstrap standards](governance/bootstrap-standards.md)
- [Hook and check taxonomy](governance/hook-and-check-taxonomy.md)
- [Validation strategy](governance/validation-strategy.md)
- [Agent setup](guides/agent-setup-instructions.md)
