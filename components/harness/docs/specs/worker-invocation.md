---
id: spec.harness.worker-invocation
title: Worker Invocation
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Worker Invocation

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C03/C04](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
deterministic execution workers versus native reasoning agents. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Current owner

Codex is the first supported host and owns reasoning workers, model/effort choice, permissions and delegation. This
harness does not start provider jobs or decide when to spawn agents. A worker is a host session
bound to a task attempt, not an execution owner invented by this runtime.

## Work shapes

Predictable checks use a typed governance batch with no model. Open investigation uses a compact
resume, progressive reads and host reasoning. Both contribute attributed checkpoints and evidence.
Do not force an investigation into a predetermined classifier or pipeline.

## Handoff

Provide objective, live constraints, exact source/evidence pointers, known gaps and next work.
Keep hypotheses and observed facts distinct. Record the parent attempt where known. A child task
fork pins parent revision/checkpoint; a continuation of the same objective stays on that task.
A worker's result cannot grant itself wider scope, accept a task or relax a release requirement.

## Cost

Include all delegated usage in the task comparison, with source/measurement IDs and missing
coverage. Parallel workers may reduce elapsed time while increasing tokens; neither is assumed
better without accepted-work evidence. Prefer one writer per checkout unless cooperating hosts
explicitly coordinate paths and shared resources.

## Deferred

Approved deterministic workflow advancement is now a target responsibility of the unified engine,
under the [workflow contract](../../../../docs/specs/engine-workflow-and-device-contract.md). This is
distinct from reasoning-agent delegation, which retains actual host authorization and native tools.
It does not authorize an automatic model router or an owned replacement agent loop.
Future adapters must preserve the host's explicit provider choice
and expose unavailable capabilities rather than silently falling back.

Governance remains the single model-selection policy owner. Harness records the policy reference and
requested/observed model; it does not add another table, parent-model switcher or delegation authority.
Cowork support is deferred.
