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
planned -> dispatched -> submitted -> prepared -> in-progress -> applied -> verified -> accepted
                     \-> needs-input                  \-> outcome-unknown    \-> refused
                     \-> cancelled
```

`prepared` and `in-progress` exist because a durable record does not make an effect atomic. A crash
between two file writes leaves the ledger saying one thing and the world another, and replaying from
the record duplicates the effect.

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
- **Restart.** After an interruption, a request in `in-progress` is **not** resumed from the record
  alone. Its actual effects are inspected first. If they can be established, the state is corrected
  to match the world. If they cannot, the request becomes `outcome-unknown` and stops there; the
  uncertainty is retained rather than resolved by assumption.
- **Transition ownership is atomic.** A state change carries the revision it expected to find.
  Two processes reading the same prior state cannot both act: the second one's expected revision no
  longer matches and its transition is refused. Preventing interleaved writes is not sufficient.
- **Effects declare their retry behavior.** Each is idempotent, or explicitly non-retryable. The
  harness does not attempt exactly-once execution across files or remote systems.
- **Cancellation needs evidence**, not just a flag: owned work is shown to have stopped.
- **Verification binds the resulting subject**, never the starting subject or the packet alone. A
  verification result that names a different subject than the one produced is invalid.
- **Verification is not acceptance.** Checks passing says the declared checks passed on that
  subject. It does not establish that the outcome in the brief was reached. A task reaches
  `accepted` when the brief's declared obligations are satisfied, which may be automatic where those
  obligations are fully covered by evidence, and needs review where they are not.
- **Guard against circularity.** A worker can change the implementation, its tests, and the policy
  selecting which checks run. Mandatory acceptance requirements bind to the **authorized baseline**,
  not to the subject the worker produced. A worker's proposed change to those requirements is
  reviewable output, never authority for accepting the same work.
- Every verification records the claim being checked, the exact subject, the evidence produced, and
  any acceptance obligation still open.
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
| Crash during application | Inspect effects; correct state or become outcome-unknown |
| Expected revision no longer matches | Transition refused; the racing caller does not act |
| Effect succeeded, receipt lost | outcome-unknown; never replayed on an assumption |
| Untested claims remain | Left explicitly open rather than closed by a partial run |

## Validation Requirements

- One task walked end to end in host-driven mode and one in dispatched mode, each with its own
  acceptance claim.
- Interruption after generation and after application, in both modes, resumed without overwriting a
  concurrent edit and without applying the same result twice.
- A result generated against a stale subject refused, then regenerated and applied cleanly.
- A crash between two file writes, a crash after an effect but before its receipt, and two callers
  racing to resume: each yields an observed outcome or explicit uncertainty, never a fabricated
  clean restart.
- A patch that deletes a failing assertion does not satisfy the obligation that assertion covered.
- A prose-only task completes without compilation pretending to verify its content.
- Verification demonstrably referencing the resulting subject.

## Open Questions

- Whether a refused stale result should regenerate automatically or always return to the caller.
- Whether declared scope should be derived from the packet or stated by the request.

## Change Log

- 2026-09-19: First draft, in response to finding R3 of the secondary review.
