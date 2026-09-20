# Harness specifications

Current architecture-reset contracts and accepted adoption design. Governance is required; Codex
app is the first supported-host target. Cowork is deferred. The goal is less repeated work per accepted task. The core
works without a model; host reasoning/editing, governance policy and executor supervision retain
separate owners. Read [Harness Core](harness-core.md) first.

| Durability, migration and local state | Purpose |
| --- | --- |
| [Harness Core](harness-core.md) | Ownership, boundaries and provider-free workflow |
| [Product and Installation](installation.md) | One governance wheel with embedded continuity; required dependency |
| [Development Loop](development-loop.md) | Focused proof, hooks, device workflow and duplicate coordination |
| [Telemetry and Qualification](measurement-and-qualification.md) | Bounded analytics, lightweight lab and provisional benefit assumptions |
| [Repository Discovery](repository-discovery.md) | Gated, disposable shallow map; no mandatory indexing |
| [Operational Store](operational-store.md) | Durability, migration and local state |
| [Action](action.md) | Authorization, revisions and legal transitions |
| [Execution](execution.md) | Governance jobs, receipts, recovery and cancellation |
| [Artifact and Retrieval](artifact.md) | Pinned bytes, artifact access and cumulative budgets |
| [Task, Attempts and Checkpoints](task.md) | Intent, attempts, checkpoint lineage and reconciliation |
| [Evidence and Measurement](evidence.md) | Evidence limits and truthful native usage |
| [Concurrency and Workspaces](concurrency.md) | Cooperating sessions, path intentions and drift |
| [Host Integration](host-integration.md) | Instruction routing, bounded resume and hook qualification |
| [Ecosystem Adapters](ecosystem-adapters.md) | Project assertions without duplicated governance policy |
| [Worker Invocation](worker-invocation.md) | Existing executor ownership; no worker controller |
| [Optional Decision Interface](decision-interface.md) | Deferred semantic decision experiment |
| [Failure Triage](failure-triage.md) | Deterministic failure handling and explicit unknowns |
| [Release Preparation](release-preparation.md) | Deferred read-only preparation; no publication authority |

Current implementation includes task revisions, bounded retrieval/resume, session attempts,
public governance CLI adapters, evidence and usage, advisory concurrency, reconciliation and
quarantined history import. Deferred decision and release contracts state their admission rules;
they do not claim integrations that are absent. Review history is historical, not current policy.

`accepted-design` documents specify the next implementation; they do not claim shipped behavior.
Existing CLI capabilities beyond the support target are development/legacy surfaces. See the
[three-stage process map](../architecture/development-flow.md) and [adoption plan](../exec-plans/active/2026-09-19-governance-codex-adoption.md).
