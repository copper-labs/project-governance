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

Keep storage-specific code in `src/store`. Do not introduce a provider framework now. Mnemos may
first receive an exported context projection while SQLite remains authoritative. Replacement of
execution-critical storage needs its own durability, concurrency, migration and rollback proof.

The retired task_path table is removed during migration; it held advisory prototype path sightings,
not task/evidence history. Per-item fork origins are stored in task_item. The coherent library
`exportJson` method remains a diagnostic surface; portable exchange uses selected exportTask bundles.

## Bundled adoption and analytics

[Installation](installation.md) governs deployment/migration coordination across worktrees. Non-Git
and explicit-database paths above describe current low-level mechanics, not standalone product support.
[Telemetry](measurement-and-qualification.md) uses a separate bounded analytics store when implemented;
operational records and referenced artifacts are not subject to analytics expiry.
