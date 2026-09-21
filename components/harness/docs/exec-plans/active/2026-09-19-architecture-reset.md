
> Completed architecture work; retained as historical evidence. The [adoption plan](2026-09-19-governance-codex-adoption.md) alone owns current order and exits. This file is retained in place to preserve references, not to start another sequence.

# Architecture reset and implementation

Status: complete. Authorized by the operator on 19 September 2026.

Objective: reduce repeated work per accepted task through correct resume context, existing
governance execution, bounded results, explicit workspace lineage and honest measurement.

## Delivery batches

1. Repair immutable retrieval, artifact access, task revisions, transitions and accounting.
2. Replace the local subprocess runner with the public governance batch CLI adapter. Preserve
   uncertain submissions; recover by reading the owning job, never by rerunning or file existence.
3. Add session bindings, checkpoints, compact resume, read/write awareness and explicit
   merge/rebase reconciliation. Add coherent selected exports and non-authoritative imports.
4. Update every specification, host instructions, usage guide and roadmap. Keep model routing,
   Mnemos, distributed synchronization and external release actions deferred.
5. Run contract and end-to-end fixtures, then request Claude Opus 5 at xhigh with no fallback.
   Reconcile findings and request focused rechecks for significant fixes.

## Boundaries

- Other repositories are read-only. All fixtures, runtime state and review artifacts stay here.
- No second process supervisor, resource-lock manager, policy engine or agent controller.
- No model is needed for core operation. JEV remains a future measured semantic experiment.
- Local fixtures establish protocol behavior; real host lifecycle, published-runtime adoption,
  device behavior and realized savings have their own future qualification.
- SQLite remains authoritative. The Mnemos evaluation follows a successful provider-free pilot
  and a demonstrated need for richer continuity; no dependency or adapter is introduced now.

## Acceptance

All reproduced review defects have regression coverage; CLI output and exit status agree;
historical evidence remains bound to its original inputs; a fresh session resumes a task without
dumping its history; shared worktrees do not silently merge task authority; missing measurements
remain unknown. The final review and reconciliation identify any remaining proof limits.

## Delivery receipt

See [implementation reconciliation](../../reviews/2026-09-19-implementation-reconciliation.md).
71 tests and typecheck pass. Claude Opus 5 xhigh (no fallback) reviewed the implementation and
rechecked significant fixes; no review blocker remains. The adopter/cost pilot is a separate
roadmap step, not a claim made by this delivery.
