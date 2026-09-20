---
id: spec.harness.artifact
title: Artifact and Retrieval
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Artifact and Retrieval

## Identity

An artifact records kind, exact subject when established, source locator, bytes, provenance and
content-addressed identity. Identical contents at different source paths have different locators;
content files may still share the same byte digest. Missing content is never reconstructed by
reading a mutable source path.

Committed and staged reads resolve a tree object once and read that immutable tree. Symbolic refs
and the index are not consulted again to supply bytes. Worktree reads use actual filesystem bytes,
reject escaping symlinks and binary/oversized content, and identify each artifact by its bytes.
Per-file snapshots do not claim an atomic repository-wide view.

## Retrieval

`context get` defaults to worktree, because implementation needs current edits. Review callers
choose staged or a commit explicitly. Every path, including discovered and mandatory paths, is
checked against task scope. Mandatory paths are added to the request and missing/oversized required
content blocks the packet. Optional omissions are named.

A no-path request returns a bounded scope-filtered discovery list without reading or charging
source content. It does not pass directories to a Git file reader. Native host reads remain
available; the host can register important read dependencies through `paths --mode read`.

Materialization returns the actual source content and an artifact ID. Large stored artifacts are
available through `artifact read`, which requires a task link and supports bounded UTF-8 byte pages.
Retrieval budget counts delivered source bytes, including repeat reads; JSON overhead and model
prefixes are not tokens and are measured separately where available.

## Budget

The default task ceiling is 262144 bytes. Reservation is atomic across callers. `budget set`
explicitly changes the ceiling with a host reference; no new request silently resets it. Failed
or interrupted delivery can conservatively retain its reservation. Mandatory instructions in a
resume packet have their own bounded-envelope check and are never silently truncated.

## Evidence limits

Byte identity proves content identity, not completeness, policy authority, a valid environment or
acceptance. Original subjects remain attached after merge. Unknown subject is explicit. Complete
upstream logs stay with their execution owner; artifact references do not promise indefinite owner
retention.
