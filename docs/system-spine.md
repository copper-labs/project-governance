---
id: docs.system-spine
title: System Spine
type: guide
status: current
owner: project-governance
created: 2026-07-07
updated: 2026-08-16
summary: Top-level map of the package-based, project-neutral governance system.
---

# System Spine

The system has one clear split: the wheel owns generic governance behavior; each repository owns
its own policy choices and project checks. Markdown is the sole current policy authority.

| Layer | Owner | Contents |
| --- | --- | --- |
| Runtime wheel | `project-governance` | CLI, changed-path planning, native-host agent routing and dispatch state, generic packs, process handling, finding normalization, generic skills, and small local telemetry |
| Repository configuration | Adopting repository | Runtime lock, profile, facts, target-owned packs, commands, and project documentation |
| Product validation | Adopting repository | Builds, tests, linters, device checks, and product-specific policies |

## Normal Flow

1. Bootstrap the wheel named by `config/governance/runtime.lock.yaml`.
2. Run `project-governance check --stage <stage> --mode impacted` for normal work.
3. If one pack fails, run that pack alone, repair it, then run one impacted closeout.
4. Commit the coherent change.
5. Adopt a newer runtime only through `project-governance update`, after reviewing its dry run.

Optional delegated execution begins only when the operator explicitly runs `agent-route` and then
`agent-dispatch start`. The current Codex or Claude Code session remains primary; the runtime
returns same-provider launch entries but does not launch them. A missing or rejected route falls
back to the normal solo flow.

The runner resolves changed scope once, supplies every selected pack the same immutable before/after
packet, and gives each pack a run-scoped evidence directory. An unmapped path produces one selector
finding instead of triggering every pack. The runner does not duplicate build-system caching or
store receipts for product checks.

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

## Future Direction

Any future knowledge-graph initiative starts from a new, approved design. The only current record
of that possibility is under [proposed/knowledge-graph](proposed/knowledge-graph/README.md); it
does not affect the runtime, bootstrap, or authority model today.
