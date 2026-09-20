---
id: spec.harness.execution
title: Execution
type: spec
status: current
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Current architecture-reset contract; implementation and qualification limits are explicit.
---

# Execution

## Public seam

`GovernanceExecutor` invokes the existing `harness-agent batch --request-file` and `result`/`wait`
JSON commands. Production code does not import its implementation or supervise the batch's child
processes. The declared executable defaults to the adopter's pinned
`.governance/runtime/bin/harness-agent`; an explicit path is allowed. No fallback runner exists.

`governance plan` separately invokes the public governance `plan --stage ... --mode impacted
--json` surface and preserves the response as an artifact. The harness neither reimplements
selection nor converts a plan into proof. Required release gates remain unchanged.

## Batch input

The version-1 request declares workspace, positive deadline, input roots or manifest, output roots,
cleanup requirement, host and 1–100 ordered cases. Each case has exact argv, a positive deadline,
expected native exit codes and dependencies on earlier cases. Executables are absolute; every
root is an existing directory inside declared scope. Manifest members have exact hashes and must
match before submission. The owner performs its own normalization and before/after validation.

The harness binds an action-specific idempotency key. Continue that action using result observation;
create a new action only for deliberate new execution. This is not a verdict cache. A source label
from the host does not certify execution inputs. Declared roots establish limited scope, not
complete dependency coverage. A manifest still needs a project-owned completeness claim and does
not detect every edit-and-restore operation.

## Result

The owner must return the bound job, workspace, case identities, terminal readiness, confirmed
cleanup and usable input-validity posture. Preserve blocked/not-run/infrastructure outcomes as
unconfirmed where assertions were not established. Persist the complete structured result and
references to owner-retained full logs. Never turn truncated output into a complete receipt.

A result records checks, not task acceptance. Late results remain historical even if intent changes.
A second observer cannot duplicate terminal evidence or usage. Changed executor identity fails
closed until the original owner can reconcile it.

## Waiting and CLI outcomes

Submission returns promptly; result can wait up to 30 seconds per call. The existing owner can
provide its native completion path separately after host qualification. This adapter does not
claim automatic turn wakeup, dispatch notifications or poll with a model in the background.
CLI exits: 0 success, 1 established unsuccessful result, 2 invalid/refused/blocked/unconfirmed, 3 pending.
JSON and shell exit status must agree. An uncertain submission never exits as success.

## Resources

Use governance's existing claims and project-owned device/service locks. Worktrees do not isolate
ports or devices. No second claim manager, build cache, test scheduler or cleanup daemon is added.

## Owner protocol and recovery details

Supported submission protocol versions are 1 and 2; cleaned terminal results require version 1.
The raw submit response is recorded before linking the job. Recovery may reconstruct a failed
local link from that acknowledged response, never by resubmitting. If storage itself fails, the
CLI error retains the action and known response for owner-side investigation.

`--wait` uses the owner's completion waiter, bounded by an observer-process timeout; timing out
the observer does not cancel the job. Pending output includes owner stage and elapsed time, so
project cleanup can be distinguished from ordinary execution.

`check cancel --action ID --authority-ref REF` cancels undispatched work locally or requests
cancellation from the linked owner. A live or uncertain action is not marked cancelled until
its owner's cleaned receipt establishes that outcome. Lost owner state needs investigation;
a caller cannot assert cleanup simply to remove a warning.

The 0/1/2/3 verdict mapping applies to check run/result. Check cancel reports cancellation status:
0 acknowledged or already terminal, 3 still pending, 2 refused/unknown. Observer wait/status errors
retain known action/job identity; a failed progress lookup does not change pending into failure.

## Coordinated proof workflow

[Development Loop](development-loop.md) defines the accepted next-proof and hook integration. The
explicit executor override above is a development/qualified governance seam, not support for another
executor product. First adoption uses the bundled pinned governance executor. Automatic hook receipt
linking, proof-plan refresh and device adapters are not yet delivered by this batch adapter.
