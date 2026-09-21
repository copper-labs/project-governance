---
id: spec.harness.harness-core
title: Harness Core
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Harness Core

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C01–C04/C16](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
task/proof state and approved workflow transitions. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Outcome

Reduce repeated work per accepted task without increasing defects, rework or operator intervention.
Continuity, compact working packets and measured decision assistance are the mechanisms. Native token usage, elapsed time, test compute and human effort are
separate measures; missing measurements remain unknown.

## Product scope

Harness is a required-governance continuity module, with one governance installation and qualified
release as the target. Codex app is the first supported host. Cowork and standalone harness adoption
are out of scope. Single-wheel packaging is implemented locally; full installation and host qualification remain pending. See
[installation](installation.md) and [development-loop coordination](development-loop.md).

## Architecture and ownership

| Owner | Responsibility |
| --- | --- |
| Host | User relationship, reasoning, edits, permissions, approval and task acceptance |
| Harness | Task revisions, source/evidence identity, bounded resume, attempts and reconciliation |
| Governance | Policy, check selection, required proof and normalized findings |
| Existing governance executor | Durable jobs, process supervision, resource claims and cleanup |
| Project tools | Domain assertions, devices, services and release facts |
| Optional decision model | One bounded semantic suggestion; no authority |

The core is a local TypeScript library plus a JSON CLI with versioned storage/export/owner protocols. SQLite stores operational records;
large artifacts use content-addressed files. No runtime dependencies, service, agent controller or
second process supervisor. No model call is required. The four domain objects remain Task, Action,
Artifact and Evidence; attempts, events, budgets and relationships support them.

## Implemented path

Create/select task → bind stable session/attempt → resume bounded context → retrieve exact bytes or
use native host tools → request governance plan → submit declared batch to existing executor →
observe its result → checkpoint. Merge/rebase produces a reconciliation record, not automatic
acceptance. Codex may continue through normal governance when continuity is unavailable; it reports the gap.
There is no ungoverned executor fallback.

Instruction files are routing guidance, not enforcement. The runtime validates declarations it
receives. It cannot sandbox arbitrary subprocesses or authenticate an operator merely from a flag.

## Fixed boundaries

- Runtime operations do not edit product source. Explicit `init --apply` is a separate installer
  that edits only supported instruction files and preserves authored content.
- Task scope does not come from retrieved text. Host-reported authority is recorded with its source.
- Execution requests are durable before submission. Unknown submission is never silently replayed.
- Historical proof remains attached to original inputs. Checks passing is not task acceptance.
- Advisory observations may degrade. Required record failures prevent dependent execution.
- No evidence reuse or narrower release gates are inferred from matching source bytes.

## Deferred

The internal decision interface is accepted design. JEV is the first optional adapter to evaluate for
context ranking after the deterministic working-packet baseline; it is not implemented or required. Mnemos follows a
successful provider-free pilot and a measured continuity need. Cross-machine synchronization,
automatic release effects, strict exclusion of uninstrumented editors, and a custom front door
are not implemented. See [the roadmap](../exec-plans/README.md).

## Validation

Contract tests cover each boundary. Public governance CLI source qualification is separate from
published-package adoption and real host lifecycle qualification. See the implementation review
and reconciliation for the exact tested revision and remaining limits.
