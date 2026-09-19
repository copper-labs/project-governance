---
id: review.reconciliation-2026-09-19
title: Reconciliation Of The Secondary Review
type: research
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Per-finding disposition of the secondary review, what changed in the contracts and plans, and what remains open.
---

# Reconciliation Of The Secondary Review

> **Phase-plan references below are historical.** The six-phase plan this review discusses
> was replaced by the five-step sequence in [the master plan](../exec-plans/README.md);
> the superseded files remain in git history.

Response to [the secondary review](2026-09-19-secondary-review.md). Ten findings accepted, one
accepted with a variation, none declined. Six of the eight P1 findings were contradictions between
contracts I wrote, not differences of opinion, and are corrected rather than argued.

The review's revision order is followed. No richer store, second provider, or plugin framework was
added; every fix is a contract correction plus a counterexample test.

## Disposition

| # | Finding | Disposition | Where the fix landed |
| --- | --- | --- | --- |
| R1 | Model-selected evidence can weaken a release gate | Accepted | [Release Management](../specs/release-management.md), [Plugin Contract](../specs/plugin-contract.md) |
| R2 | Mandatory and optional recording are incompatible | Accepted | [Harness Core](../specs/harness-core.md), [Decision Record](../specs/decision-record.md), [State Store](../specs/state-store.md) |
| R3 | Task lifecycle and apply/verify boundary have no owner | Accepted with variation | New [Task Lifecycle](../specs/task-lifecycle.md) |
| R4 | Build locking does not cover its promised concurrency | Accepted | [Build Orchestration](../specs/build-orchestration.md) |
| R5 | A repeated failure is not evidence of a source defect | Accepted | [Failure Triage](../specs/failure-triage.md) |
| R6 | One low-confidence answer has three outcomes | Accepted | [Decision Interface](../specs/decision-interface.md), consumers aligned |
| R7 | Phase 0 cannot support an honest go/no-go | Accepted | Phase 0 *(superseded phase plan)*, [master plan](../exec-plans/README.md) |
| R8 | Ledger provenance insufficient for calibration | Accepted | [Decision Record](../specs/decision-record.md) |
| R9 | Packet depends on an unimplemented subject seam | Accepted | [Context Packet](../specs/context-packet.md) |
| R10 | Packet misses and passing lanes are incomplete signals | Accepted | [Context Packet](../specs/context-packet.md), Phases 3 and 4 |
| R11 | Batches require work scheduled later | Accepted | All six phase plans |

## The One Variation

**R3.** The review asked for a worked task protocol inside existing contracts rather than another
spec family. The protocol is added as one new child, [Task Lifecycle](../specs/task-lifecycle.md),
rather than inside the store.

The reason is the finding itself: the store was already claiming lifecycle ownership it did not
implement. Putting the apply and verify boundary there would repeat that error and leave the store
owning two unrelated things. One additional child in an existing family is not a second family, and
the contract map still has one umbrella. If the reviewer still prefers it inline, it folds into the
store without changing any requirement.

## What Changed, By Finding

**R1.** The mandatory evidence set is now computed from repository policy and exact change facts.
A decision may add evidence or order its collection and can never subtract. Unknown applicability
widens the set or records an explicit unresolved requirement. Gate evaluation binds the policy
version in force at evaluation time; a stale evaluation is rejected rather than honored. Load-time
structural validation is retained but is no longer claimed to be sufficient.

**R2.** Recording is split by criticality. **Execution state** — task and request identity, remedy
accounting, approval evidence, applied-result references — must persist or the action does not run.
**Analytics** — calibration inputs, timings, probability detail — is best-effort and its loss never
blocks. The umbrella invariant now applies to execution state only, and the "identical with
recording disabled" acceptance is corrected to "ordinary checks remain available"; it never promised
that state-changing actions proceed without their state.

**R3.** One task protocol: request identity, starting subject, next action, result submission,
resulting subject, verification outcome, and terminal, cancelled or needs-input states. The writer
is chosen explicitly per mode — the host writes in host-driven work, the harness applies in
dispatched work — and the two are separate acceptance claims. A result generated against a subject
that has since changed is refused or regenerated. Restart and duplicate submission are defined.
Verification binds the resulting subject, not the originating packet.

**R4.** One request-level claim replaces the workspace lock. Commands within a request are
serialized by default; parallel lanes require declared independent resources or build-tool-owned
scheduling. Reclaim requires process identity and cleanup evidence, not holder death alone. The
relationship to the existing test-execution claims is stated, and the limit is explicit: callers
that bypass the harness are not protected. Reuse stays disabled and its identity now binds command
and arguments, selected lanes, adapter and configuration versions, relevant environment, toolchain,
and resolved input bytes, with input drift and missing-output behavior defined.

**R5.** Forced reclassification is removed. The observed class is preserved and `remedy-exhausted`
is attached. Remedies are bounded per failure episode rather than per class, so rotating classes
cannot multiply retries. Cleaning and resource adjustment require declared authorized scopes and
exclusive ownership, reconciled with the build contract's rule against deleting artifacts.

**R6.** Each catalog entry declares a typed disposition for a below-threshold answer: proceed with
a safe fallback, request bounded additional state, or return needs-input. Consumers assert the same
disposition the interface does. Provider outage does not block ordinary checks and no longer
promises autonomous completion of every task. Tier 2 diagnosis is bounded and explicitly permitted
only where the catalog entry says so.

**R7.** Phase 0 is rebuilt. Labels are outcome-based, not agreement with the prior actor. An
evaluation split is held out from question design and threshold tuning. Per-class coverage, a
harmful-error tolerance, and an explicit inconclusive result are declared before the run. Two
comparators are required: a deterministic rule and the existing workflow. Abstentions, unresolved
outcomes, per-class errors, calibration uncertainty, latency and total cost per accepted task are
all reported. Question, provider and threshold versions are frozen per comparison. Phase 1 no longer
depends on the Phase 0 verdict.

**R8.** Records now carry producer and provider versions where available, catalog and policy
digests, effective thresholds, subject and packet references, and outcome provenance. Unreported
versions are marked unknown rather than assumed. Configuration artifacts needed for rollback are
retained rather than referenced by digest alone. Corrected preferences are distinguished from
verified-wrong classifications. Each record states whether it is identifiable only or replayable.

**R9.** The packet contract no longer assumes the context producer is subject-bound. A named bridge
from the immutable subject to materialization is now required work, and its absence is a blocker
rather than an assumption. Mandatory authority and constraint items are named and cannot be dropped
by narrowing; when they do not fit, the packet returns a budget blocker or a bounded expansion
request instead of silently dropping. Determinism is scoped to a frozen subject, catalog, history
snapshot, budget and recorded selection. A route for new work with no diff is added, since impacted
selection cannot locate an edit that does not exist yet.

**R10.** Miss rate is a diagnostic split by cause — candidate generation, ranking, or budget — and
is no longer the phase's success measure. Accepted task results, later-detected defects, rework, and
total time and cost against the existing workflow replace it. Map narrowing requires dependency and
coverage evidence, periodic broad comparison is retained, and non-failing history prioritizes
investigation rather than proving removal.

**R11.** Every conflicting dependency is corrected: a minimal fixture adapter precedes real identity
tests, one implemented ecosystem plus offline fixtures carries Phase 2, host transport is proven on
a fixed fixture with real packet equivalence moved to phase closeout, Phase 2 hands source defects
back to the existing host workflow until dispatch exists, and Phase 5 separates local preparation
from explicitly authorized staging execution. Host support and provider portability are demonstrated
capabilities with their own acceptance claims, not consequences of shared instruction text.

## Decisions Settled Since The Review

- **Repository.** The harness lives in its own repository, `project-harness`. It consumes the
  governance runtime through its published CLI and JSON surface only. Anything it needs beyond that
  surface is an upstream contribution, never a fork or a vendored copy. This closes the review's
  concern about implementation starting before repository ownership was settled.
- **Relationship.** Parallel and permanent. The harness never replaces or absorbs the governance
  runtime, in any phase.

## Still Open

- **Host language.** Unsettled, and the review is right that it blocks Phase 1 writing source. It
  does not block Phase 0.
- **Repository bootstrap.** Charter, agent instructions, governance adoption and hooks for the new
  repository are Phase 1 Batch 0 work and are not yet written.
- **Provider access.** The Phase 0 probe still awaits credentials; no provider measurement exists.

## Editorial Follow-Through

The flow note presented the deferred substrate as installed and recorded decisions after
verification. Both passages are corrected to match the umbrella: files are the store, and execution
state is recorded before the action it covers.
