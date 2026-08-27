---
id: skill.delegated-execution
title: Delegated Execution
stage: Work
provenance: package-default
---

# Delegated Execution

Use the host's native delegation only when the operator requests it or one bounded specialist can
materially reduce uncertainty or elapsed time.

## Rules

1. The primary remains accountable for planning, integration, and closeout.
2. Prefer solo execution. Delegate one clearly bounded read or write responsibility, not a workflow.
3. Use the current checkout for every role. Delegation never authorizes another worktree; only a
   direct operator request does.
4. Use at most one writer and two non-overlapping read-only specialists at a time. The coordinator,
   not this runtime, enforces that host lifecycle.
5. Give each specialist the objective, governing references, read or write scope, fixed decisions,
   expected result, and one focused proof. Do not require a runtime-specific envelope.
6. Do not permit nested delegation, automatic retries, provider cascades, or an automatic second QA
   wave.
7. Integrate through the primary and reject stale, unidentified, or scope-expanded output.
8. Reuse proof from the integrated subject. One finding permits one focused repair and one affected
   recheck; it does not restart delegation or broad validation.

## Evidence

Report the roles used, their scopes, the integrated subject, relevant proof, unresolved findings,
and any operator-authorized worktree path plus whether it was retained or removed.
