---
id: spec.engine-memory-boundary
title: Development Engine Memory Boundary
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-09-25
summary: Keep prompt-time project-history retrieval provider-neutral while deferring mandatory Mnemos adoption and critical-store changes.
---

# Memory boundary: early retrieval, optional provider adoption

This contract owns the provider boundary for project-history retrieval. The
[RC6 prompt-time retrieval contract](engine-rc6-linked-retrieval.md) tests bounded historical
candidate lookup before the main agent reads task-specific source. Existing SQLite/file owners
can serve that lookup first; a project with a useful governed graph may qualify Mnemos behind the
same port. The port does not install Mnemos, activate learning, replace SQLite, or claim exact SDK
compatibility. The [transition plan](../exec-plans/active/2026-09-20-unified-development-engine.md)
separates contract fixtures from exact-package qualification.

The accepted RC6 current-source index is a disposable per-worktree SQLite projection, separate from
this optional history-provider port and the critical task database. It caches source facts and
basic declared/parsed links; it does not adopt Mnemos, build a historical prose corpus or turn an
index into a new authority. Its scope and freshness rules are owned by the RC6 contract.

## Responsibilities

The engine owns task intent, source identity, policy, permissions, required proof, job/resource state,
acceptance and recovery. SQLite plus retained artifacts remain their operational authority.
Memory providers expose bounded useful context and preserve provenance. An unavailable provider
cannot block build/test execution or turn an old procedure into an authorized operation.

Define the engine-facing port independently of Mnemos-specific objects. A qualified adapter maps
it to the public TS package root when a project elects that provider. Do not expose internal graph
queries, provider tables, storage handles, or private SDK types to engine modules. Language
alignment is an integration convenience, not a shared-database or platform-parity guarantee.

## Design obligations before the first core schema freezes

| Concern | Engine contract required now |
| --- | --- |
| Scope | Repository/workspace/task namespaces and an explicit permitted retrieval scope; default recommendation is repository-scoped |
| Stable identity | Opaque entity/event IDs, schema versions, task/source revisions, content digests and origin references |
| Record kinds | Observed fact/evidence, intent/constraint, proposal/inference, reviewed procedure and historical outcome remain distinguishable |
| Relationships | Explicit revision/supersession/withdrawal links; declared vs inferred relationships; no inferred execution dependency |
| Provenance | Owner, source revision, artifact reference, observation time and label origin; machine facts distinct from agent/reviewer labels |
| Freshness | Provider projection watermark/generation plus current-source checks before use; stale advice remains labelled or is excluded |
| Query budgets | Deadline, cancellation, result count/bytes, supported capabilities and bounded continuation; no unbounded traversal |
| Missing coverage | Ready/degraded/unavailable, omission/truncation reasons and unsupported capability; an empty result is not proof of absence |
| Lifecycle | Explicit open/close, cancellation, restart, health and no hidden daemon or automatic account setup |
| Data lifecycle | Allowed data classes, deletion/withdrawal propagation, retention and rebuild policy; no secrets or automatic remote export |
| Evaluation | Method/version/latency/coverage, measured useful retrieval and rework; no automatic learning activation |

Field names can be settled in E1; these semantics are required inputs to the core design, not deferred
until the adapter is written. Preserve native provider distinctions instead of inventing certainty in
a generic status field. Unknown response shapes fail to the ordinary context path.

## Proposed operation set

- `capabilities` reports which projection, lookup, provenance, freshness and cancellation behaviors exist.
- `project` ingests a bounded batch of eligible versioned facts with stable event IDs and returns an
  acknowledgment/watermark. Replays deduplicate; missing sequence ranges cannot imply complete history.
- `retrieve` accepts a bounded submitted-prompt purpose, a bound task where available, explicit
  repository/worktree scope and budgets, returning candidate refs, reasons, provenance, freshness
  and omissions. The engine fetches/revalidates authoritative bytes itself. A follow-up prompt
  needs the existing task context; prompt text alone is not a complete scope.
- `withdraw` propagates revocation/supersession/deletion markers for the affected scope and revisions.
- `close` ends owned sessions/resources; cancellation must not imply that a prior projection committed.

These are proposed engine operations, not claims that Mnemos has APIs with these exact names. The
later adapter must map supported semantics, report unsupported ones and preserve the deterministic
fallback. If a required semantic cannot be mapped safely, that use case remains unqualified.

## Durable projection and failure handling

Critical task changes and the minimal projection-intent marker can commit in one operational
transaction. Publishing to a provider happens outside that transaction. Failure to publish cannot
roll back an accepted task transition or stall a workflow. A provider cursor/watermark records what
was actually applied; retry is bounded and idempotent. Do not create an unbounded mandatory outbox.

If a bounded projection backlog overflows, mark the projection incomplete and rebuild eligible current
state before claiming freshness. Preserve required withdrawals independently or invalidate the
projection until they are applied. Engine-side scope/revision/revocation filtering remains mandatory,
so a lagging provider cannot restore revoked instructions or expose withdrawn context. Retained
historical proof and provider-local deletion have different retention rules.

Projection records contain references/metadata by default. Source/log excerpts require declared data
scope and retention. Rebuildable provider state may be discarded; task history and proof may not.
No cross-repository retrieval or inferred identity merge occurs without an explicit sharing decision.

## What memory can contribute

Initial candidates are prior related task/evidence references, useful investigation context and
reviewed development procedures. An experience trace can suggest a procedure for review; it cannot
automatically publish or execute a new recipe. A procedure names a version, trusted owner, prerequisites,
applicability, known failures and source evidence. Execution still passes the current engine policy.

Memory similarity cannot establish source freshness, complete dependencies, passing tests, device
identity, permission or acceptance. Task code and retrieved text remain evidence rather than runtime
instructions. Do not combine discovery confidence with proof applicability.

## Optional adoption and proof

Now: specify schemas/ports, capture identity/provenance fields, and plan fake-provider cases for stale
results, lag, duplication, omission, withdrawal, scope mismatch, cancellation and unavailability.
RC6 may exercise the port at prompt time through existing local owners without adding a package
dependency or network call. A project-owned populated graph is an optional comparison source;
its presence and coverage must be verified, not inferred from SDK capability.

If Mnemos is selected: qualify the exact TS package artifact, its runtime/storage/platform behavior,
project corpus and public API mapping before using it for prompt-time lookup. The inspected SDK
source docs use structural objects, Promises, AbortSignal and AsyncIterable; its brief/explanation
projection has explicit limits. Do not assume full graph, explanation or byte projection parity from
TS declarations alone. Keep adapter capability gaps visible.

Compare the first concrete retrieval use case against direct search/local SQL with the same allowed
inputs. Adopt only if accepted outcomes, retrieval quality or preparation cost improve without scope,
freshness or reliability regression. Critical-store replacement and cross-machine synchronization
remain separate decisions, not consequences of enabling memory retrieval.
