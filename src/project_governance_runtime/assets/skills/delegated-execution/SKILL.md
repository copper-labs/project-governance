---
id: skill.delegated-execution
title: Delegated Execution
stage: Work
provenance: package-default
---

# Delegated Execution

Use the host's native delegation, or the optional Gemini, Claude, and Codex skills, when the operator
requests it or one bounded specialist can materially reduce uncertainty or elapsed time.

## Rules

1. The primary remains accountable for planning, integration, and closeout.
2. Prefer solo execution. Delegate one clearly bounded read or write responsibility, not a workflow.
3. Use the current checkout for every role. Delegation never authorizes another worktree; only a
   direct operator request does.
4. Use at most one writer and two non-overlapping read-only specialists at a time. The coordinator,
   not this runtime, enforces that host lifecycle.
5. Give each specialist the objective, governing references, read or write scope, fixed decisions,
   expected result, and one focused proof. Native host delegation needs no runtime envelope; the
   optional provider skills supply their own job and completion interface.
6. Do not introduce nested delegation, retries, provider cascades, or a second QA wave without
   operator scope for it. An authorized nested provider job must not conflict with an enclosing
   job's workspace or session; the optional helper rejects that conflict before queueing.
7. Integrate through the primary and reject stale, unidentified, or scope-expanded output.
8. Reuse proof from the integrated subject. One finding permits one focused repair and one affected
   recheck; it does not restart delegation or broad validation.

## Evidence

Report the roles used, their scopes, the integrated subject, relevant proof, unresolved findings,
and any operator-authorized worktree path plus whether it was retained or removed.
