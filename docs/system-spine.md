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
| Runtime wheel | `project-governance` | CLI, changed-path planning, native-host agent routing and dispatch state, generic packs, process handling, finding normalization, generic skills, and small local telemetry |
| Repository configuration | Adopting repository | Runtime lock, profile, facts, target-owned packs, commands, and project documentation |
| Product validation | Adopting repository | Builds, tests, linters, device checks, and product-specific policies |

## Normal Flow

1. Bootstrap the wheel named by `config/governance/runtime.lock.yaml`.
2. Change one owner, run its focused proof, and commit the coherent result through pre-commit.
3. If one governance pack fails, rerun only that pack at the same stage and subject.
4. Freeze the candidate and run one branch-aware impacted pre-push sign-off.
5. Check only the pull-request title and body through the shipped pre-PR hook; CI owns its separate
   affected trust boundary.
6. Adopt a newer runtime only through `project-governance update`, after reviewing its dry run.

For substantial agent work, the coordinator first runs the public context command. A matched
target route selects and materializes the smallest exact skill set, while a bounded local selection
event records only safe IDs, digests, and reason classes. After proof, the coordinator records one
explicit per-skill closeout. The operator does not need to know the catalog or name skills, and the
receipt remains advisory rather than becoming change authority.

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
- [Skill selection and utilization](specs/skill-utilization.md)
- [Runtime architecture](architecture/governance-runtime.md)
- [Bootstrap standards](governance/bootstrap-standards.md)
- [Hook and check taxonomy](governance/hook-and-check-taxonomy.md)
- [Validation strategy](governance/validation-strategy.md)
- [Agent setup](guides/agent-setup-instructions.md)

## Future Direction

Any future knowledge-graph initiative starts from a new, approved design. The only current record
of that possibility is under [proposed/knowledge-graph](proposed/knowledge-graph/README.md); it
does not affect the runtime, bootstrap, or authority model today.
