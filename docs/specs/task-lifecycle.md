---
id: spec.harness.task-lifecycle
title: Task Lifecycle
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: One task protocol covering request identity, who writes, staleness, verification binding, restart and terminal states.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Task Lifecycle

## Purpose

Say who does what to the working tree, and when a result is still valid. The earlier drafts left
this unowned: the store claimed a lifecycle it did not define, the host was said to write, and the
worker returned a diff that nobody applied.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** none.
- **Evidence:** none.
- **Known limits:** Two writer modes exist and each needs its own acceptance evidence. Neither is
  a consequence of the other.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- Request identity and the states a task moves through.
- Which actor writes, per mode.
- Staleness, restart, duplicate submission, and verification binding.

## Non-Goals

- Storage mechanics, which belong to [State Store](state-store.md).
- Deciding anything, which belongs to [Decision Interface](decision-interface.md).
- Merge machinery or conflict resolution beyond refusing to proceed.

## Definitions

- **Request**: one unit of work with a stable identity, belonging to a task.
- **Starting subject**: the content-addressed state the request was planned against.
- **Resulting subject**: the content-addressed state after a result is applied.

## States

```
planned -> dispatched -> submitted -> applied -> verified -> terminal
                     \-> needs-input      \-> refused
                     \-> cancelled
```

- `needs-input` and `cancelled` are ordinary outcomes, not failures.
- `refused` means a result could not be applied safely. It is never silently discarded.

## Who Writes

Chosen explicitly per mode, and each is a separate acceptance claim.

| Mode | Writer | Harness responsibility |
| --- | --- | --- |
| Host-driven | The host agent | Provide the packet, record execution state, verify the resulting subject |
| Dispatched | The harness | Apply the submitted result, detect staleness, verify the resulting subject |

The harness never writes in host-driven mode, and the host never applies a dispatched result. A
request declares its mode at creation and cannot change it.

## Behavioral Requirements

- Every request carries a stable identity, its task, its mode, its starting subject, and the packet
  identity it was planned against. All of these are execution state.
- A submitted result names the request identity and the starting subject it was generated against.
- **Staleness.** If the working tree no longer matches the starting subject, an applied result is
  refused. The request either regenerates against the new subject as a new request, or returns
  `needs-input`. It is never applied to a subject it was not generated for.
- **Unrelated changes are preserved.** Application touches only the paths the result names. A result
  naming a path outside the request's declared scope is refused.
- **Duplicate submission.** A second submission for a request already applied is refused and
  recorded. Identity, not content comparison, decides this.
- **Restart.** After an interruption, a request resumes from its last durable state. A request
  interrupted between submission and application resumes as submitted, not as dispatched.
- **Verification binds the resulting subject**, never the starting subject or the packet alone. A
  verification result that names a different subject than the one produced is invalid.
- Host authorization stays bound to the action it covers. An approval granted for one request does
  not carry to a regenerated one.

## Continuation Across A Subprocess Boundary

The harness is invoked as a subprocess and does not stay resident between steps. Continuity is
therefore carried by request identity in durable execution state, not by process lifetime. Every
invocation is resumable from that state alone, and an invocation that cannot read it does not act.

## Invariants And Constraints

- No result is applied to a subject it was not generated against.
- No request proceeds without durable execution state.
- Applying and verifying are distinct steps with distinct records.
- The harness performs no merge, rebase, or conflict resolution. It refuses and reports.
- Cancellation is recorded as cancellation, never as failure.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Starting subject changed | Refuse; regenerate as a new request or return needs-input |
| Result names out-of-scope paths | Refuse the whole result; do not apply partially |
| Duplicate submission | Refuse, record, leave the applied result untouched |
| Interrupted mid-application | Resume from durable state; never re-apply an applied result |
| Verification names a different subject | Invalid; re-verify against the produced subject |
| Execution state unreadable | Do not act; return control with the reason |

## Validation Requirements

- One task walked end to end in host-driven mode and one in dispatched mode, each with its own
  acceptance claim.
- Interruption after generation and after application, in both modes, resumed without overwriting a
  concurrent edit and without applying the same result twice.
- A result generated against a stale subject refused, then regenerated and applied cleanly.
- Verification demonstrably referencing the resulting subject.

## Open Questions

- Whether a refused stale result should regenerate automatically or always return to the caller.
- Whether declared scope should be derived from the packet or stated by the request.

## Change Log

- 2026-09-19: First draft, in response to finding R3 of the secondary review.
