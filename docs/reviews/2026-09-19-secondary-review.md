---
id: research.decision-first-harness.secondary-review
title: Decision-First Harness - Secondary Review
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Independent review of the draft harness contracts and phased plan, with implementation blockers and concrete corrections.
---

# Decision-First Harness: Secondary Review

## Recommendation

Proceed with a bounded measurement experiment after tightening its evaluation design. Revise the
contracts before treating Phases 1 onward as implementation-ready. The direction is useful, but
several child contracts contradict the umbrella or leave execution ownership undefined.

Keep the deterministic fact layer, advisory model decisions, conservative fallbacks, file-based
storage, and separation from the governance kernel. These are the strongest parts. The next pass
should resolve the seams below, not add more architecture or another approval process.

## Review Boundary

Reviewed the concept note, four supporting research notes, all twelve substantive specifications,
the specification index, the master plan, and all six phase plans. Cross-checked the charter,
governance kernel and test-execution contracts, plus the context producer's source implementation.

The research tree was untracked when reviewed. The checkout HEAD was
`96e6a331998d9897ad7490ae055c8ebfdd4451da`; that commit does **not** identify the untracked proposal.
References below identify the files and sections reviewed on 2026-09-19. This review adds only this
document and does not revise or approve the proposal.

This is a contract and plan review, not implementation certification. No provider benchmark,
adopter repository, host integration, or remote staging environment was exercised. Provider pricing,
latency, availability, and external research claims were not independently verified.

Priority: **P1** means resolve before implementing the affected capability. **P2** means a material
design or delivery correction. A Phase 5 P1 need not delay a Phase 0 experiment.

## Findings

### R1 — P1: Model-selected evidence can weaken a release gate

**Sources:** [Release Management: Gates and Evidence Catalog](specs/release-management.md),
[Harness Core: Fixed Decisions](specs/harness-core.md),
[Plugin Contract: Gate Invariant](specs/plugin-contract.md).

The release contract makes “which evidence types apply” a decision-model output. Complete catalog
coverage is then checked against that selection. A model can omit a required evidence type and
still present a complete packet. Human approval at the end does not restore a missing requirement.
This conflicts with “narrowing … never a release gate.”

**Correction:** Compute the mandatory evidence set from repository policy and exact change facts.
The model may recommend additional evidence or order collection; it cannot subtract requirements.
Unknown applicability widens the set or leaves an explicit unresolved requirement. Name the policy
baseline against which “may not lower a gate” is evaluated, including configuration version.

**Proof:** Force a confident wrong model answer that omits mandatory evidence. The gate must still
require it. Change policy after plugin loading and show that execution uses the current authorized
policy or rejects the stale evaluation. Static load validation alone cannot prove live gate facts.

### R2 — P1: Mandatory recording and optional recording are incompatible

**Sources:** [Harness Core: Invariants](specs/harness-core.md),
[Decision Record: Failure Modes and Validation](specs/decision-record.md),
[State Store: Failure Modes and Validation](specs/state-store.md).

The umbrella requires every decision to be recorded before its action. The record spec says a
failed write does not stop the action; both storage contracts require unchanged behavior with
recording disabled. These cannot all hold. The gap matters most when task state, retry counts, or
transition evidence depend on the same files.

**Correction:** Separate optional measurement from the minimum execution state required for safe
actions. Ordinary checks can continue without analytics. A state-changing action that depends on
durable identity, retry accounting, or approval evidence must persist that state or return control
without executing. This can use the same file store; it does not require a database.

**Proof:** Inject a write failure immediately before an action, then restart the process. Show that
checks remain available and that the action cannot be duplicated or lose its retry bound.

### R3 — P1: The task lifecycle and apply/verify boundary have no owner

**Sources:** [State Store: Scope and Behavioral Requirements](specs/state-store.md),
[Host Integration: Two Steps](specs/host-integration.md),
[Worker Invocation: Worker Contract](specs/worker-invocation.md),
[Phase 3](plans/phase-3-harness-as-tool.md).

The store claims task lifecycle ownership but defines only record operations. The host is said to
write, while the worker returns a diff. No contract states who applies that diff, detects intervening
edits, preserves unrelated changes, or ties verification to the applied result. A subprocess returning
JSON also needs a continuation protocol when the host does the writing outside that process.

**Correction:** Add one small worked task protocol to the existing contracts: task/request identity,
starting subject, next action, result submission, resulting subject, verification outcome, and
terminal/cancelled/needs-input states. Explicitly choose the writer for host-driven versus dispatched
work. Applying a stale result must refuse or regenerate against the new subject. Include restart and
duplicate-submission behavior; host authorization must remain bound to the action it covers.

**Proof:** Walk one task through host writing and one through returned-patch application. Interrupt
after generation and after application. Resume without overwriting a concurrent edit or applying
the same patch twice. Checks must reference the resulting subject, not the original packet alone.

### R4 — P1: Build locking does not yet cover the concurrency it promises

**Sources:** [Build Orchestration: Workspace Lock, Ladder, Failure Modes](specs/build-orchestration.md),
[Phase 1: Batches 2–3](plans/phase-1-build-hygiene.md),
[existing Test Execution: Inputs and Resources](../../specs/test-execution.md).

The spec allows one build per workspace, but Stage C starts remaining lanes in parallel. It does
not distinguish one lock-owning orchestration request from its child tool invocations or declare
which children can safely share outputs. A dead lock holder also does not prove that its children
or resources are gone. Existing test execution already owns workspace/root claims through cleanup;
an independent lock can duplicate that ownership or deadlock against it.

**Correction:** Define the relationship to the existing execution owner. Use one request-level
claim, with serialized commands by default; permit parallel lanes only with declared independent
resources or build-tool-owned scheduling. Reclaim only after checking process identity and cleanup,
not merely holder death. State the limit that bypassing callers are not protected by this lock.

Keep reuse disabled initially. Before enabling it, bind identity to command/arguments, selected
lanes, adapter/configuration versions, relevant environment, toolchain and resolved input bytes.
Define input drift and missing output behavior. A historical pass can be valid evidence while an
artifact requested by a later consumer no longer exists.

**Proof:** Exercise overlapping lanes, a holder that dies with a live child, cancellation by one of
two waiting callers, input drift, and deleted outputs after a recorded pass. Test composition with
the existing execution claims before claiming collision prevention.

### R5 — P1: A repeated failure is not evidence of a source defect

**Sources:** [Failure Triage: Behavioral Requirements and Retry Bound](specs/failure-triage.md),
[Phase 2: Batch 2](plans/phase-2-decision-interface.md).

The forced `source-defect` reclassification is wrong for a persistent disk shortage, dependency
outage, or toolchain mismatch. It can send a worker to change correct source. It also conflicts with
the failure table's instruction to escalate when the retry bound is reached. “One per class per
task” allows several retries as the classifier changes classes, rather than the claimed one wasted
cycle. A task reset could erase that bound unless R3 is resolved.

**Correction:** Preserve the observed class and attach `remedy-exhausted` or an equivalent status.
Escalate with evidence instead of manufacturing a diagnosis. Bound remedies across one failure
episode, independently of classification changes. Cleaning and resource adjustment need declared,
authorized scopes and exclusive ownership; a class label alone does not authorize those effects.
Reconcile cleaning with the build contract's “deletes no build artifacts” rule.

**Proof:** Repeat a resource failure and alternate predicted classes. Neither case should trigger
an unsupported source edit or exceed the episode's remedy allowance.

### R6 — P1: The same low-confidence answer has three different outcomes

**Sources:** [Harness Core: Fixed Decisions](specs/harness-core.md),
[Decision Interface: Escalation Ladder](specs/decision-interface.md),
[Context Packet: Failure Modes](specs/context-packet.md),
[Failure Triage: Failure Modes](specs/failure-triage.md).

The umbrella says a below-threshold answer takes a deterministic fallback and continues. The
interface says it stops for a human. Packet selection widens; triage hands over as unknown. Thus
the provider-disabled “full run completes” acceptance has no single meaning.

**Correction:** Define typed dispositions per catalog entry: proceed with a safe fallback, request
bounded additional state, or return needs-input. Provider outage must not block ordinary checks,
but it cannot promise autonomous completion of every task. Specify escalation attempt and cost
bounds, including when Tier 2 diagnosis is allowed under the generation-only rule.

**Proof:** One table-driven fixture per disposition, including outage, malformed probabilities,
budget overflow, and low confidence. Assert the same disposition at interface and consumer levels.

### R7 — P1: Phase 0 cannot yet support an honest go/no-go decision

**Sources:** [Phase 0](plans/phase-0-measure.md),
[Decision Record: Calibration Reads](specs/decision-record.md),
[Phase 4: Batch 1](plans/phase-4-tighten-on-evidence.md).

Agreement with the prior actor is not correctness. The plan leaves sample size, error tolerance,
holdout data, and the baseline comparator undefined. Reusing the same small examples for question
design, threshold tuning, and acceptance can produce a misleadingly strong result. Excluding
unresolved outcomes also hides the tasks on which the system cannot establish correctness.

**Correction:** Before running the probe, define outcome-based labels, an untouched evaluation
split, per-class coverage, acceptable harmful-error rates, and an inconclusive result for insufficient
evidence. Compare against a deterministic rule and the existing workflow. Report abstentions,
unresolved outcomes, per-class errors, calibration uncertainty, latency, and total cost per accepted
task, including repairs and human intervention. Freeze question/provider/threshold versions for
each comparison. Do not force a threshold change merely to finish Phase 4.

**Proof:** A reproducible evaluation manifest and results on held-out cases. A provider no-go should
stop model adoption, not automatically cancel independently justified deterministic build hygiene.

### R8 — P2: The ledger lacks enough provenance for its calibration promise

**Sources:** [Decision Record: Record Shape](specs/decision-record.md),
[State Store: Retention](specs/state-store.md),
[Phase 4: Rollback](plans/phase-4-tighten-on-evidence.md).

Question version and a state digest are insufficient to distinguish provider changes, threshold
changes, packet-generator changes, or policy changes. The plan also promises rollback to old maps
and thresholds, but no record shape requires retaining their values or retrievable artifacts.
A digest identifies bytes; it cannot reconstruct missing bytes. A human correction may change a
preference without proving that a factual classification was wrong.

**Correction:** Record producer/provider version where available, catalog and policy digests,
effective thresholds, subject/packet references, and outcome provenance. Mark unreported versions
as unknown. Preserve retrievable configuration artifacts for rollback and protect unresolved
action references from ordinary analytics retention. Separate corrected preferences from verified
outcomes. Specify which records are identifiable only and which are actually replayable.

**Proof:** Calibration keeps differently configured cohorts distinct, retention preserves pending
references, and rollback restores exact prior configuration from retained evidence.

### R9 — P1: Packet correctness depends on an unimplemented subject seam

**Sources:** [Context Packet: Invariants and Failure Modes](specs/context-packet.md),
[Phase 3: Batches 2–3](plans/phase-3-harness-as-tool.md),
[existing context producer](../../../src/project_governance_runtime/context.py),
[Governance Kernel: context contract](../../specs/governance-kernel.md).

The proposed packet must read the governance runtime's immutable subject. The existing
`resolve_context(root, task, changed_paths, ...)` reads route files and content through the supplied
filesystem root; `_file_bytes` reads those files directly. The immutable check-subject contract
does not automatically make the context command a subject-bound source. A dirty worktree can
therefore supply different bytes from the selected staged or branch subject unless a bridge is
explicitly built.

Budget handling has another gap: “widen on uncertainty” and “drop lowest-ranked items” cannot
both guarantee required context when it exceeds the budget. The current runtime explicitly blocks
when a required skill cannot fit. Finally, identical changes do not guarantee byte-identical packets
when live provider choices and prior records are inputs.

**Correction:** Add a concrete supported path from immutable subject to context materialization;
do not assume the current command provides it. Name mandatory authority/constraint items that
narrowing cannot drop. Return a budget blocker or bounded expansion request when those do not fit.
Define determinism over frozen subject, catalog, history snapshot, budget and recorded selection.
Add a route for new work with no diff; impacted-change selection alone cannot locate a future edit.

**Proof:** Differ staged and worktree bytes, overflow mandatory context, replay a recorded selection,
and submit a task in a clean checkout. Validate both the bytes and their subject attribution.

### R10 — P2: Packet misses and passing lanes are incomplete quality signals

**Sources:** [Phase 3: Final State and Batch 3](plans/phase-3-harness-as-tool.md),
[Phase 4: Batch 2](plans/phase-4-tighten-on-evidence.md),
[Context Packet: Escape Hatch](specs/context-packet.md).

A worker can miss an essential constraint without asking for it. A lower request rate therefore
does not establish better packets. Likewise, a lane that never failed may cover a rare but important
failure; passing history alone cannot establish that it is unnecessary. Candidate omissions and
budget omissions are also currently charged to narrowing even when the model never had the item.

**Correction:** Keep miss rate as a diagnostic, split by generation, ranking, and budget cause.
Measure accepted task results, later-detected defects, rework, and total time/cost against the
existing workflow. Require dependency/coverage evidence for map narrowing and retain periodic or
declared broad comparison; use non-failing history to prioritize investigation, not prove removal.

**Proof:** Include a fixture where a worker does not request an omitted critical constraint and a
rare-failure lane that appears redundant in routine history. The evaluation must expose both.

### R11 — P2: Several plan batches require work scheduled later

**Sources:** [Master Plan](plans/README.md), [Phase 1](plans/phase-1-build-hygiene.md),
[Phase 2](plans/phase-2-decision-interface.md), [Phase 3](plans/phase-3-harness-as-tool.md),
[Phase 4](plans/phase-4-tighten-on-evidence.md), [Phase 5](plans/phase-5-release-plugin.md).

These dependencies need correction before batches are called settled:

| Conflict | Smallest correction |
| --- | --- |
| Phase 1 Batch 2 runs real builds using adapter-declared inputs; the first adapter arrives in Batch 3. | Supply a minimal adapter before real identity/build tests, then add ladder behavior. |
| Phase 2 requires real failing builds across both repositories; the second ecosystem adapter arrives in Phase 4. | Use one implemented ecosystem plus offline fixtures, or move only the required second adapter work earlier. |
| Phase 3 Batch 1 requires equivalent real packets from three hosts; packet assembly arrives in Batch 3. | Test transport with a fixed fixture first; move real packet equivalence to phase closeout. |
| Phase 2 source-defect remedies need packets and workers delivered in Phase 3. | Hand back to the existing host workflow explicitly until the dispatch path exists. |
| Implementation starts before repository and language ownership are settled. | Resolve those two choices before Phase 1 writes source, outside this runtime unless its charter changes. |
| Phase 5 says local-only but requires a real remote staging promotion. | Separate local preparation from explicitly authorized staging execution and its destination readback. |

The host-driven conversation and a stateless dispatched worker also need separate acceptance claims.
Instructions cannot erase the current host conversation. Two providers passing one fixture proves
that seam for that fixture; failure does not, by itself, prove statelessness was lost. Treat support
for each host as a capability to demonstrate, not a consequence of sharing instruction text.

## Suggested Revision Order For The Author

1. Correct the Phase 0 evidence design (R7). Keep it a small experiment with an inconclusive option.
2. Resolve execution, recording, locking, and retry ownership (R2–R6), plus the provenance needed
   by Phase 1 records (R8). Show one worked lifecycle rather than adding another spec family.
3. Repair the batch dependencies (R11). Start with one host and one ecosystem for the integrated
   path; prove other hosts and adapters at their declared boundaries.
4. Define the subject-to-packet seam and outcome metrics before Phase 3 (R9–R10).
5. Resolve mandatory evidence selection and live gate checks before Phase 5 (R1). Keep existing
   checker code where it expresses real behavior; catalog declarations need not replace it all.

Retain the current conservative defaults and phased delivery. Do not add a richer store, a second
provider, or a plugin framework to fix these findings. Each issue can first be resolved as a precise
contract and a small counterexample test.

## Editorial Follow-Through

Once the contracts agree, update the explanatory notes. The flow still presents the deferred
substrate as installed and records decisions after verification, while the umbrella selects files
and requires recording before action. Remove or label those passages as superseded so a later
implementer does not follow a different architecture from the plans.

Keep adopter identities and operational evidence in adopter-owned or ignored research state, as
the charter requires. The review deliberately uses generic examples and makes no adopter-readiness
claims.
