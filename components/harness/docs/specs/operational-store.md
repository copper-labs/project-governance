---
id: spec.harness.operational-store
title: Operational Store
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Operational Store

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C01/C13/C17](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
critical state, analytics isolation and future memory projection. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Contract

SQLite is authoritative for local task and action state. Git repositories locate it at
`git rev-parse --git-common-dir` plus `harness/harness.db`; linked worktrees share this store.
Non-Git folders use `.harness/harness.db`. An explicit `--db` overrides discovery.

Schema 6 migrates schemas 4 and 5 transactionally and preserves historical records. Unsupported versions
are refused before schema changes. WAL, FULL synchronization, foreign keys and a bounded busy
wait are enabled. Network-shared databases are unsupported. Migration failure preserves the prior
transaction; keep a coherent backup before adopting a new runtime in an important project.

Task versions are append-only. Action current state uses compare-and-set with legal transitions;
ledger events retain transitions and reconciliation. SQLite does not make external effects atomic.

## Identity and portability

A persisted repository UUID identifies this local history; clones are not silently equated by URL.
Workspace UUIDs use local filesystem identity of the Git admin directory (or non-Git directory) and
store the current path as a locator. This survives ordinary moves and distinguishes recreated
checkouts on the same filesystem. Cross-filesystem movement requires an explicit new binding.

Selected task exports read one transaction and carry a version, digest, history, evidence and
optional artifact content. Export is local output, not permission to transmit private material.
Import verifies bundle identity and retains it in quarantine. It does not activate tasks, jobs,
permissions or acceptance. Import is idempotent by bundle digest; conflicting histories coexist.
This is portability for inspection, not automatic synchronization or a database merge.

## Artifacts and retention

Large content uses durable content-addressed files beside the store, referenced by artifact rows.
Keep these files with backups/exports. References to an upstream job point to that owner's logs;
its retention must cover the evidence lifetime. No automatic pruning or cascading deletion exists.
Preserve active tasks, unresolved actions and referenced proof. A future retention command must
prove reachability, coherent export and recovery before it can delete anything.

## Cost and failure behavior

Byte budgets are stored and reserved transactionally per task. A caller cannot reset the ceiling
by making another read. Explicit expansion has a host reference and a ledger event. These are
retrieval guards, not native token counts. Analytics writes are best-effort; critical records fail
closed. Artifacts left unreferenced after interruption are harmless and not automatically deleted.

## Future substrate

Keep storage-specific code behind one owner. Define the [memory boundary](../../../../docs/specs/engine-memory-boundary.md)
now, including durable identity, projection intent, freshness, scope and withdrawal. Adopt Mnemos later
as a rebuildable context projection while SQLite remains authoritative. Replacement of
execution-critical storage needs its own durability, concurrency, migration and rollback proof.
The target host resource registry has a distinct admission responsibility outside repository history;
see the [host resource contract](../../../../docs/specs/engine-workflow-and-device-contract.md#host-resource-authority).
N12 in the migration inventory settles post-write recovery before activation. Existing exports are
inspectable/quarantined records, not proof of downgrade compatibility or live-job recovery.

The retired task_path table is removed during migration; it held advisory prototype path sightings,
not task/evidence history. Per-item fork origins are stored in task_item. The coherent library
`exportJson` method remains a diagnostic surface; portable exchange uses selected exportTask bundles.

## Bundled adoption and analytics

[Installation](installation.md) governs deployment/migration coordination across worktrees. Non-Git
and explicit-database paths above describe current low-level mechanics, not standalone product support.
[Telemetry](measurement-and-qualification.md) owns the E1 choice of reused or separate bounded storage;
operational records and referenced artifacts are not subject to analytics expiry.

## Optional provider health — accepted design

E3 selects bounded advisory storage scoped by repository, provider and nonsecret config revision,
outside critical ledger transactions. Its failure cannot prevent task recording or workflow progress.
Compare a suitable existing mechanism with a small local health file; do not introduce a subsystem
merely for cooldowns. Preserve authentication suppression until reset/configuration change and
transient cooldown across CLI invocations. In-process state alone does not meet this requirement.

Store only failure category, cooldown expiry and reset/configuration markers, within 16 KiB. Updates
must be concurrency-safe and bounded; contention or invalid state returns the deterministic result.
For a file, use atomic replacement and a short exclusive update; qualify equivalent guarantees for
reused storage. State grants no authority and cannot block core operation. Losing it may lose
suppression history; mode and export policy still gate requests. Explicit reset clears only advisory
state, never task history. Do not hash credentials into keys or store provider text. Test repeated
CLI invocations, contention, expiry, auth reset and unavailable storage before enabling the adapter.
