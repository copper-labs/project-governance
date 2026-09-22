---
id: spec.harness.task
title: Task, Attempts and Checkpoints
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Task, Attempts and Checkpoints

## Objective and revisions

A task preserves the desired outcome, constraints, scope, acceptance criteria and attributed
findings. Valid states are open, needs-input, accepted and cancelled. A blank objective is refused.
Revisions retain unrevoked items and record their predecessor. CLI revision requires the expected
version; conflicts require a fresh read. Revocation and acceptance require a host authority reference.
Acceptance is a recorded host decision, not an automatically proven consequence of test success.

Operator provenance means host-reported operator intent. Observations should reference evidence;
free-form CLI notes and ruled-out hypotheses are labelled hypotheses. Repeating a model conclusion
does not turn it into a fact. Structured operation constraints are described in [Action](action.md).

## Sessions and attempts

A host session binds to an explicit task and workspace. Stable identity comes from `--session`,
`HARNESS_SESSION`, a native Codex task ID, or a qualified hook payload. Missing identity is unknown,
not a generated subprocess PID. List tasks to choose one; never automatically take another open job.

A fresh session or workspace can continue the same objective through another attempt. Attempts
name task revision, workspace, host session and optional parent attempt. Task revisions do not
retroactively change earlier attempt or action identity.

## Fork

Forking creates an independent task. It pins the parent task revision and the checkpoint available
at fork time, carries unrevoked attributed understanding and rewrites descendant scope locators
into the selected checkout. It does not copy acceptance or actions. A later parent checkpoint does
not silently change what the child inherited. Findings keep their original applicability limits.

## Checkpoint and resume

A checkpoint has a bounded host-authored summary, next work, original subject when known and
validated evidence references. It does not revise authority. Resume includes live constraints,
scope and acceptance items, a compact checkpoint, recent findings, pending-action pointers and
paged event summaries. The returned cursor covers delivered events; omitted history remains
explicitly accessible. Required context that cannot fit produces a blocker.

## Reconciliation

Merge, rebase and cherry-pick require an explicit resulting commit/tree and exact source task
revisions. Preserve original receipts. Report source-match, stale or unknown applicability plus
host-reported semantic conflicts. Source-match still requires environment and policy validation.
Reconciliation never inherits accepted status or weakens required proof.

## Workspace continuation

Binding a new attempt does not broaden path authority. When continuing in another worktree,
explicitly revise the task scope to include its canonical root before reading or checking there.
The task ID and evidence history stay intact; actions bind the new task revision. A fork maps the
parent workspace scope to the explicitly selected new workspace and pins its parent revision.

Forked items carry an origin task/revision, preserved across further forks. A resume returns the
current attempt ID and workspace-scope warning. Binding alone grants no additional scope.

Reconciliation pins the target commit before resolving its tree. Tree subjects compare directly;
manifest receipts compare each declared workspace-relative file with the target tree and report
`declared-inputs-match`, stale or unknown. This never establishes completeness or environment
reuse. Unversioned legacy evidence stays unknown. Detailed observations are a linked receipt;
event pages return bounded summaries.

Manifest comparisons are memoized across receipts and capped per reconciliation at 256 unique
paths and 8 MiB of blob output, within a shared 5-second Git inspection deadline. Excess comparisons are unknown.
They compare stored Git blob bytes with original worktree hashes, so EOL/clean-smudge/LFS filters
can produce a conservative stale classification without a semantic source change. This limitation
is in the receipt; no transformation-aware reuse is claimed.

## Compiled engine projection

The compiled engine can read the default store's current session/workspace binding without creating
or migrating state. An open task at the recorded attempt version projects goal, acceptance and local
scope into decision context. The [engine entry contract](../../../../docs/specs/engine-task-context-entry.md)
owns its bounded projection, named fallback and delivery behavior; it grants no execution authority.
CLI revision can add acceptance items. It atomically advances only the revising session's existing
binding to a new attempt at the new version, preserving the earlier attempt as its parent.
Other sessions keep their captured version until explicit resume. Detached work retains its dispatch
projection even if later work rebinds the host session.
