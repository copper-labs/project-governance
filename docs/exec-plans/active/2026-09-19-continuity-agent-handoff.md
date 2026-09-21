---
id: plan.continuity-agent-handoff
title: Continue Governance Continuity Adoption
type: exec-plan
status: active
owner: project-governance
created: 2026-09-19
updated: 2026-09-20
summary: Gives a new agent the accepted direction, current proof limits and next implementation sequence.
---

# Agent handoff

Use the following as the next agent's assignment. Verify live state before relying on the recorded
branch, installed development version or test counts. Paths below are relative to this repository.

## Assignment

Continue the [unified development engine transition](2026-09-20-unified-development-engine.md).
The operator requested detailed category-led migration planning before implementation. Review the
[target baseline](../../specs/unified-development-engine.md), [inventory/N1–N13](../../reference/2026-09-20-engine-migration-inventory.md),
[workflow](../../specs/engine-workflow-and-device-contract.md), [local CI](../../specs/engine-local-ci-and-merge-contract.md)
and [memory boundary](../../specs/engine-memory-boundary.md).
Use the [capability pressure test](../../specs/engine-capability-boundaries.md) to preserve later release
support. The operator explicitly limits the first iteration: additional hosts inform core design;
their full release and deployment processes are not added to this implementation scope.
Settle dispositions before dependent work; source-only E1a fixtures need not wait for all E0 decisions; preserve established intent without assuming a literal port. The current assignment is design/planning; it does not authorize runtime rewrites,
paid calls or adopter mutations. Preserve the completed monorepo migration.

Work in the governance repository. At handoff the active branch is `codex/harness-monorepo`; the module
is `components/harness`. Read root and module AGENTS.md before acting. Inspect Git status and preserve
unrelated work, including the pre-existing untracked `docs/research/` content. Handoff/documentation
corrections may also be uncommitted. Do not discard or indiscriminately stage them.

## Read in this order

1. `docs/reviews/2026-09-19-continuity-migration.md` and its JSON receipt: what actually shipped locally,
   source/artifact identity, tests and limitations.
2. `components/harness/docs/architecture/development-flow.md`: current process, first release and
   intended destination.
3. `docs/specs/unified-development-engine.md` and the new transition plan: decisions and forward sequence.
   The prior S1–S9 plan supplies acceptance criteria; it no longer orders implementation.
4. `components/harness/docs/specs/README.md`, then the contracts owning the first slice:
   `host-integration.md`, `installation.md`, `development-loop.md`,
   `measurement-and-qualification.md`, `execution.md`, `concurrency.md` and `operational-store.md`.
5. `docs/governance/validation-strategy.md` and `docs/governance/hook-and-check-taxonomy.md`.
   Consult other specs progressively rather than loading the whole archive.

Current contracts and the migration receipt override historical proposals that describe separate
products, two editable component locks, a pending repository move or immediate Cowork support.

## Current baseline and preserved requirements

- One governance product; the current wheel contains Python and TS. D1/D2/D11 decide the future
  runtime, cutover and packaging. Do not treat the current language split as an immutable requirement.
- Codex app on macOS is the first continuity host. Cowork and other continuity hosts are deferred.
  Do not remove existing governance provider-agent support; that is a separate capability.
- Codex owns reasoning, editing, permissions and acceptance. Governance owns policy, required checks,
  execution supervision and resource cleanup. Harness preserves intent, context, identity and evidence.
- SQLite remains authoritative local state. Linked worktrees share repository history but have distinct
  workspace/attempt identities. Same-workspace intentions are advisory; they are not exclusive locks.
- Core operation requires no provider/model call. The internal decision interface is accepted design;
  JEV is the first optional context-ranking adapter to evaluate, never an authority or prerequisite.
- E1/E2 include a modest shared structural map and targeted-search fallback. Define Mnemos scope,
  identity, provenance, freshness and lifecycle now; defer real dependency adoption to E6. No critical
  storage migration is implied. RN iOS simulator then RN iOS physical devices are the first lanes;
  native iOS/other frameworks follow. N4 settles wired/wireless order and recovery scope.
- Traditional remote and local CI are both supported requirements. The operator reports GitHub already
  authorizes local CI; integrate that existing path. Separate proof selection, execution placement and
  trusted publication. N8 records that settled direction; remaining choices concern adapter parity,
  host trust and fallback budget.
  VM simulator capability is separate from native-host RN/device qualification. No remote activation
  or adopter mutation occurred in this investigation.

## What is already working

The module preserves task revisions, checkpoints, bounded resume/retrieval, execution identity,
observational recovery, advisory overlap/drift, fork lineage and merge reconciliation. The wheel
embeds canonical TypeScript sources and exposes `project-governance harness` and `harness` through
one launcher. It probes Node/SQLite and binds default commands to its own governance environment.
Ordinary governance remains usable without Node.

Recorded proof: 468 Python tests with one skip; 72 module tests on Node 22.18.0; typecheck; clean
installed-wheel task/resume and real executor pass/fail/result observations; checkout/source-archive
wheel content parity. These are receipts for named sources, not proof of future edits or native hooks.

A local development wheel is installed under `.venv`. It was built from the source commit in the
receipt, not automatically from the current checkout. Rebuild/reinstall when changes affect it.
The existing `.governance/runtime` and adopter locks were not replaced. No push/tag/release occurred.

## Immediate planning sequence

[The transition plan](2026-09-20-unified-development-engine.md) owns E0–E6. Settle the architecture
category dispositions and N1–N13 before dependent runtime work. It brings actual runner reliability
forward, qualifies RN simulator then physical round trips, and evaluates JEV in an independent lane.
The current proposal builds by category and makes one coordinated major TS core cutover; it does not
publish a permanent series of mixed-runtime wrappers.

The retained module contracts provide evidence, fallback, privacy, measurement and platform requirements.
E0 reconciles conflicts explicitly; the new draft does not silently replace current enforcement.
Read the [latest review reconciliation](../../reviews/2026-09-20-unified-engine-reconciliation.md)
before starting: E1a source proof and E1b adopter assessment have separate exits. N11/N12/N13 reserve
policy authority, post-write recovery and first-pilot merge initiation for their dependent decisions.

## Completion and reporting

For each slice, deliver implementation, focused tests, updated contracts/plan and a compact receipt
identifying source and actual proof. Include new overhead, unresolved coverage and remaining work.
Measure total accepted-work cost, not just a cheaper model call or fewer commands. Preserve the
historical baseline denominator uncertainty until rederived from raw observations.

Run meaningful focused checks during development and the required integrated proof at its boundary.
Do not immediately repeat gates that a Git operation will invoke. Keep release/publication separate:
remote pushes, tags/releases, replacing an existing installed runtime and changing adopter repositories
need their applicable explicit authorization. Finish all local preparatory work first.

The next milestone is a qualified, measurable Codex development loop—not universal automation,
a second runtime controller, autonomous deployment or an optional-model showcase.

The preserved draft specs/phase plans under `docs/research/decision-first-harness/` are historical
rationale with research IDs. Do not implement from them or revive their phase sequences.

The [accepted cleanup dispositions](../../reviews/2026-09-19-decision-first-simplification-candidates.md)
balance development benefit, flexibility, reliability and cost. Carry those requirements into E0–E6:
telemetry chosen against requirements, inspectable stages/useful controls, owned shadow evaluation and
cross-process health suppression. Broader platform coverage is a progressive requirement.
Do not revive duplicate batch sequences or speculative savings forecasts.
