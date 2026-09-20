---
id: spec.harness.concurrency
title: Concurrency and Workspaces
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Concurrency and Workspaces

## Coverage

Concurrency support is advisory for cooperating hosts. It cannot prevent an editor that bypasses
the harness from overwriting files. It must never imply a universal filesystem lock.

Repository history is shared across linked Git worktrees; each workspace has a distinct identity.
Stable session/attempt identity distinguishes callers. Without it, coverage is unknown. Session
activity uses a 30-minute window, which is an explicit heuristic rather than liveness proof.

## Read and write intentions

`paths` records canonical repository-relative paths with read/write mode, session, task, workspace,
observed content digest and timestamp. Two reads do not conflict. A writer overlapping a reader
requires refreshing dependent conclusions; two writers require coordination or isolation. Task
mode describes intent but never suppresses reader/writer risk. Writing a spec is still a write.

Relevant file hashes detect repeated edits to already-dirty files. A bounded Git fingerprint
includes dirty contents and index changes; unavailable or oversized inspection is unknown. No
warning identifies the actor solely from a content change. Release stale intentions explicitly;
undeclared paths remain outside coverage.

## Shared resources

Separate worktrees isolate checkout files, not ports, devices, global caches, shared services or
deployment targets. Resource claims and cleanup remain with their existing owners. Shared-workspace
Git index, checkout and commit operations need host coordination even for disjoint file edits.

## History

Task lineage, checkpoint lineage and source lineage are separate. A merge does not merge task
acceptance. Use explicit reconciliation and ask governance for required combined proof. Keep
receipts and continuity records after a workspace disappears. Filesystem-based local identity is
not a cross-machine identity scheme.

## Validation

Cover two readers, reader/writer drift, overlapping writers, different worktrees, changed contents
with unchanged porcelain status, missing host identity, repeated CLI calls with one stable identity,
late executor completion and task corrections. Device isolation needs project-specific proof.

Only status/path-report boundaries compute a workspace fingerprint. Ordinary metadata commands
update activity without rereading source. The fingerprint is limited to 2000 paths and 8 MiB total;
unavailable comparison returns `unknown`, never false. Symlink aliases share path intentions.
