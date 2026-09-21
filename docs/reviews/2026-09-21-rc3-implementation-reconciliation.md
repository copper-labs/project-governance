---
id: review.rc3-implementation-reconciliation
title: RC3 Implementation Review Reconciliation
type: review
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Reconciles the Opus 5 high-effort implementation review and focused recheck of bounded decision experiments.
---

# RC3 implementation review

The implementation follows the [experiment specification](../specs/engine-decision-experiments.md)
and N0–N6 in the [delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md).
Claude Opus 5 reviewed the completed source at high effort, with fallback disabled and read-only
permissions. A focused recheck verified the repaired seams and reported no remaining publication
blocker. Both wrapper audits confirm the requested model/effort, successful completion and no
reviewer repository edits. Raw prompts, reports, audits and execution logs remain in the external
qualification packet. Review is independent source assessment, not test execution.

## Findings and disposition

| Finding | Resolution |
| --- | --- |
| Advice-only entry consumed the episode and migrated the ledger before any probe. | First-entry capability, cancellation/deadline and target checks precede the diagnostic write. Refusal preserves schema 2 and permits a corrected retry. Existing episodes still reconcile their children. |
| Unobservable simulator consumed a first episode. | Refuse before claim; reuse that observation in the first iteration. Re-observe after inference to reject a changed target before submission. |
| History omitted classification denominators and known-cost ranking. | Add explicit unclassified reasons, representative episodes, known/missing native durations, measured/unknown manifest usage and separate frequency/cost rankings. No avoided-cost estimate is inferred. |
| Scope overrides could produce conflicting pilot joins. | Withdrawn after source verification: the existing scope owner rejects a conflicting override before any request. A regression test proves zero new calls and a valid no-call episode. |
| The new store submission caller did not share all input validation. | Move identity checks into the common transactional submission method. |
| Failed/uncertain child, cleanup-overrun and installed migration assertions were missing. | Add focused owned-child fixtures and installed schema-3/reopen assertions. The published prior binary's refusal is separately checked against a copied ledger. |
| Attention fallbacks were undercounted. | Count every eligible observation without a valid classification as unassessed; a classified shadow result remains assessed. |
| Malformed classification flags now fail in launcher admission. | Retain the fail-closed behavior; malformed input does not mark a write or launch the child. |

The recheck also accepted both long functions as cohesive ownership boundaries. Their narrow
architectural dispositions explain why preserving the report fold and coordinator lifetime earns
its cost; no check is disabled and no new permission layer is introduced.

## Small residuals reconciled after recheck

- Experimental observation IDs identify immutable captures, independently of replay-safe diagnostic
  workflow IDs. Reusing a capture ID after changing configuration already failed visibly and retained
  the original evidence. Clarify that failure as `episode-id-already-used`, document a fresh capture
  ID for a new observation, and test refusal followed by execution without overwriting the first
  capture. This preserves failed-attempt evidence instead of skipping it. It is a telemetry usability
  correction, not a change to execution, capture identity or overwrite policy.
- A conflicting decision scope now reports `decision-scope-conflict` rather than generic unavailable
  advice, keeping configuration errors distinguishable in the pilot.
- A disabled entry can return its capability refusal before checking revoked candidate grants.
  Retain this ordering: manifest/catalog resolution still occurs first, and bindings are checked
  before any reservation. No disabled invocation needs grant authority merely to explain its refusal.
- Once an episode has been claimed, even an interrupted attempt-free episode retains its identity
  and allowance. A subsequently unavailable target can close it. Document this narrower resume
  boundary; first-entry retry behavior does not reset already persisted work.

## Validation and release boundary

The repaired source passed 463 engine tests, 72 continuity tests, four release-metadata tests,
type checking and the installed-package fixture. The affected review suite passed 17 tests. The
final telemetry reason changes have a further focused checkpoint. The retained legacy owner passed
468 Python runtime tests and clean-wheel proof. Installed tests exercise all eight earlier consumers
plus episode capture, explicit history classification, incompatible-effect refusal, native child
execution, replay and schema migration. Fixtures use bounded inference responses, not paid provider
quality measurements.

The release workflow independently repeats its required checks on the tagged source and publishes
the exact archive, lock and update metadata. Publication readback remains an external release
receipt. Native SDK simulator/device adoption and real JEV quality, cost and accepted-work benefit
remain subsequent work. An operator-requested active bundle is supported by bounded effects,
ordinary-code fallback and interleaved off tasks; bundle results do not establish individual
consumer savings.
