---
id: spec.engine-rc7-prompt-reliability
title: RC7 Prompt Timing and Task Transitions
type: spec
status: current
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Give semantic selection its own clock and refresh context after explicit task changes without resetting spending or history.
---

# RC7 prompt reliability

This amendment owns the timing and task-transition corrections to the
[RC6 retrieval contract](engine-rc6-linked-retrieval.md). Other retrieval, disclosure, execution and
fixed-model boundaries remain with that contract.

## Time belongs to the phase that consumes it

The normal context operation has a 10-second cooperative deadline. Its optional JEV selection
gets up to 3.5 seconds starting after local preparation, within the remaining operation allowance.
Individual requests retain the existing profile deadline. The managed Codex prompt hook allows
15 seconds so the runtime can render fallback and release its reader. Synchronous filesystem work
remains size-bounded; these cooperative limits are not a promise that arbitrary synchronous I/O
can be interrupted. No provider call starts after the operation allowance expires.

Route and prompt receipts distinguish local preparation, index maintenance, semantic selection,
current provider-call elapsed time (including request preparation/validation), delivery preparation
and total observed time. Exclude historical replay latency. Label operation exhaustion, selection
exhaustion, individual provider deadlines and caller cancellation separately. Record delivery
overrun without relabeling a successful selection as cancelled. A prepared fallback is not successful
JEV selection. These measurements do not establish model use or savings.

An exact older managed 10-second prompt handler can be reconciled to 15 seconds by the backed
installer. Preserve authored handlers. The host may require approval of the changed definition.
The reconciled, approved 15-second handler is required for RC7 prompt qualification. A retained
10-second definition can kill fallback delivery and is not a supported partial upgrade.

## A turn can deliberately change tasks

Prompt entry still retrieves immediately from the submitted request. An inherited task is
background, not a permanent choice for the new turn. The existing top-level task create, resume,
fork or revision command records an append-only refresh association when its accepted binding
differs from the packet's historical association. It returns that context needs refreshing.

The existing context-route continuation accepts this verified transition in the same session,
worktree and latest turn. It builds a new packet for the current request and current task scope.
It does not require an initial failed expansion or a new operator prompt. Plain context-route
after a recorded switch also joins the current entry allowance rather than opening fresh spending.
Unverified changes, delegated workers, closed tasks and foreign sessions/worktrees still fail.

Preserve the original prompt, packet, task association, provider jobs and native usage records.
New packets record the current binding and transition reference. Reuse the repository index;
semantic replay additionally includes task identity and revision. A task switch does not reset
the entry's call/byte allowance, expiry or two-expansion ceiling. Repeated identical requests
reuse existing paid answers. Exhausted allowance still returns local context and original reads.
Turn-level native usage spanning different tasks remains unallocated when task attribution is
ambiguous; never move previously recorded usage to the new task.
An expired or closed turn retains local fallback rather than opening fresh spending. Only a newly
observed prompt starts another turn allowance. If the host skips prompt observation, a CLI caller
cannot infer that a new turn exists; diagnose the hook rather than silently renew its budget.

## Proof boundary

Focused tests cover delayed preparation, genuine operation exhaustion, separate timing fields,
task A to B refresh, same-task replay, retained spending, immutable historical receipts, changed
purpose, missing credentials, closed tasks and concurrent session/worktree isolation. Installed
package proof exercises the managed launcher and real hook entry. A bounded live JEV fixture
uses synthetic project material. It establishes integration, not product outcomes or savings.
