---
id: plan.release-evaluation
title: Governance and Harness Release Evaluation Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-10-04
updated: 2026-10-05
summary: Orders scorecard reporting, full-chain context evaluation and outcome-linked release comparisons through existing evidence owners.
---

# Release evaluation delivery

## Scope and relationship

The operator requested rigorous, routine Governance/Harness evaluation with direct release comparisons.
The [evaluation contract](../../specs/engine-release-evaluation.md) owns metrics and interpretation.
This plan owns that workstream within the [next-major delivery](2026-10-04-major-verification-feedback.md).
That plan remains the release qualification/publication owner. No publication, adopter change,
provider experiment or completed automation is claimed by authoring this plan.

Build a thin report from current receipts, not another evaluation platform. Keep runtime evidence,
private cases, installed identities and reports outside source. Source may contain generic synthetic
fixtures and metric contracts. Use fixed models and existing selection/outcome owners.
The [measurement contract](../../../components/harness/docs/specs/measurement-and-qualification.md#durable-evaluation-manifest-and-bounded-dimensions)
retains manifest-schema and retention ownership. Extend its existing `decision-outcomes.ts` reader
and validation where needed; do not introduce a second manifest format or collection policy.

## E0 — Freeze the evaluation contract

- [x] Separate controlled comparison from passive field observation.
- [x] Define dimensions, units, denominators, unknowns and comparable-release requirements.
- [x] Separate release benefit from JEV contribution and successful transport from semantic quality.
- [x] Record source owners, research basis and initial qualification boundaries.
- [x] Freeze the first executable manifest and case labels after reviewing current adapter coverage.
- [x] Declare assigned/started/nonterminal episode populations and comparison conditions before outcomes.

Checkpoint: one metric contract and one delivery workstream; no overall weighted score or new runtime
acceptance gate. Protect all existing concurrent source edits.

## E1 — Read-only scorecard over existing evidence

- [x] Inventory available fields and receipt owners for every dimension; mark missing adapter fields.
- [x] Implement one pure reducer and bounded reader using existing telemetry/receipt readers.
- [x] Resolve exact per-event runtime/configuration/worktree identity and verify digest linkage.
- [x] Follow trusted referenced custom provider-job locations; report inaccessible or unmatched links.
- [x] Deduplicate units/replays, preserve failed attempts and report retention/discovery truncation.
- [x] Include pre-provider refusals and unfinished assignments rather than sampling only completions.
- [x] Emit a compact JSON/Markdown report with counts, sample sizes, source references and gray unknowns.
- [x] Integrate the report into the existing passive monitor without provider/test calls or adopter edits.

Required tests: duplicate receipt, conflicting digest, mixed generation, missing outcome, partial token
usage, inaccessible provider artifact, evicted projection, no activity, expected refusal vs unexpected
failure, live-held owner vs leaked/unknown cleanup, and all-failure spending. A missing eligible-prompt
population must prevent an invented 100-percent adoption rate. Repeated monitoring of unchanged
receipts must neither change counts nor create calls. Process exit without owned Metro/device cleanup
must remain unqualified. Reuse existing manifest validation and outcome linkage tests.

Checkpoint: publish the first observed baseline with known evidence gaps. Do not invent retrospective
scores for an older release whose identities or denominators cannot be verified.

## E2 — Full-chain context quality

- [x] Extend `context-evaluation.ts` and its owning tests for source-backed essential-unit groups.
- [x] Freeze labels for file discovery, permitted descriptors, passages and actual final delivery.
- [x] Score decisive spans/complete units, required guidance retention and original-reference validity.
- [x] Report useful selection precision only for fully labelled scopes; unlabelled is unknown.
- [x] Include no-match, short follow-up, explicit task switch, weak description, stale index and source,
      budget clipping, no-token/provider refusal and unauthorized source cases.
- [x] Retain a holdout separate from the development cases; changes to labels version the suite.

Required tests: relevant filename but missing decisive lines; labelled evidence absent upstream;
positive section clipped during packing; duplicate equivalent evidence; source hash/range mismatch;
correct fallback that still misses optional essential evidence; permission denial; no-match;
uncertain advice that must not be counted as confirmed correctness. Fixtures must exercise the
ordinary installed inventory-to-packet route for the full-chain claim, not only the packet helper.

Checkpoint: reuse the installed journey and current semantic cases rather than cloning their suites.
Qualify metadata accuracy on a small preselected source-backed sample, separately from coverage.

The separate bound-continuation proof helper freezes the short raw prompt, actual harness-owned
requirement and acceptance criteria, source-backed complete next-action unit, and code-only/JEV
conditions before native submission. Thirteen focused offline helper tests passed, including rejection of extra/duplicate native evidence
and bounded exact-parent cleanup. Corrected pure reassessment of completed live originals passes
without making another provider call. New shutdown branches have mock coverage; original native
cleanup evidence is retained. They cover binding,
source identity, final hook clipping, required retention and unknown consumption. The helper uses
the generated installed hook and existing task/session store. Native/live execution passed against
the final archive in code-only and JEV arms; the JEV wire carried the full bound task intent. This condition does not replace the original short-prompt proxy failure
or consume the four reserved holdouts.

## E3 — Outcome and whole-task measurement

- [x] Join task/attempt, native entry, route, checks/workflows and provider receipts through owned IDs.
- [x] Record verified acceptance at the existing task owner; do not infer it from a check or final prose.
- [x] Link additional original reads where an actual supported host observer exists; report blind spots.
- [x] Count all observed model usage, retries, fallback and review work with provider accounting intact.
- [x] Deduplicate native/provider/JEV identities; keep mixed-task turn usage unallocated where needed.
- [x] Split observed index extraction/reuse and preparation/admission/selection/packet-assembly timing;
      absent cache observations, receipt persistence and host consumption remain unknown.
- [x] Preserve unavailable host entry/delivery-before-read and bypass observations as unknown;
      synthetic hooks remain separate. Actual host coverage is a deferred qualification limit.

Required tests: out-of-order usage arrival, cancelled/failed retry, incomplete agent usage, cached vs
fresh input, reasoning included in output, mixed-release task, task switch without budget reset,
parallel work time vs wall time, accepted task with rework and command pass without task acceptance.
Include cumulative/incremental duplication, per-model/aggregate duplication and a multi-task turn
whose entire usage must not be assigned to its final binding.
Unsupported observation stays unknown; no new transcript authority or background service.

Checkpoint: a correctly linked real development task is more valuable than an invented aggregate.
No savings percentage until comparable acceptance and usage exist.

## E4 — Controlled release comparison

- [x] Freeze exact old/candidate archive identities, compatible profile, source/case snapshots,
      fixed model/effort, question definitions, permissions, cache states and environment.
- [x] Reuse representative multi-stack cases and installed journeys; start with a small balanced set.
- [x] Run old vs candidate on the same cases; separately compare candidate code-only vs JEV.
- [x] Freeze one characterization trial per development case/condition before execution; retain
      stochastic failures and holdouts. No statistical improvement verdict is claimed from one trial.
- [x] Produce per-family paired wins/losses, quality metrics, samples and whole-task costs/unknowns.
- [x] Preserve field trend panels separately from the controlled improvement/regression conclusion.
- [x] Assign pilot conditions before outcomes; distinguish repeated-task familiarity from improvement.

Required tests: changed case/suite/question/profile/model makes comparison ineligible or separately
labelled; disabled JEV vs unavailable JEV differ; trial order and environment drift are visible;
unsafe/failing low-token trial cannot win a composite score; changed workload cannot silently change
aggregation weights. Reuse isolated proof environments, never real task spending or active worktrees.

Live comparisons need existing disclosure authorization and caller-owned credentials. This document
adds no billable call on its own. A mocked provider proves reporting/transport, not semantic benefit.
Device/VM/remote lanes run only when qualified and relevant; no exhaustive cross-product.

## E5 — Release and routine operation

- [x] Review the first complete report, reconcile flaws and retain the immutable release baseline.
- [x] Include the scorecard in the major's existing sign-off/readback package; no extra approval gate.
- [x] Update passive monitoring to emit only meaningful changed findings and latest comparable rows.
- [ ] Keep release baselines across windows and label all configuration/mixed-generation changes.
- [x] Add discovered operational failures to owning regressions without exposing private adopter data.

Focused owning tests run per slice. At the major boundary use the existing package/installed proof
cadence; do not repeat a passing broad suite solely to format a report. No adopter upgrade is implied.

## Simplification and completion

Use one source-backed contract, existing stores/readers, one report reducer and a small set of frozen
cases. No weighted executive index, periodic LLM grader, duplicate collector, broad watcher or second
scheduler. A field metric may remain unknown when the host lacks observation; missing instrumentation
must be explicit rather than declared implemented by writing a placeholder.

Completion means the same frozen report inputs produce the same dimension results, passive updates
preserve evidence and privacy, and one exact release comparison has qualified results and explicit
unknowns. It does not mean universal benefit, automatic grading of every task or a token-saving claim.


## Current implementation checkpoint

The read-only report, original identity producers and bounded outcome/cost joins are implemented.
The final installed producer reports the exact executing archive with matched generation and no
provider calls. Report commands read untouched originals. Mixed-task native usage remains
unallocated, failed/nonterminal work stays visible and missing observations stay unknown.

The full-chain comparison uses exact published RC10.9 and final 4.0.0 archives on seven frozen
development cases, with code-only and active JEV arms. There are 28 rows and 28 live provider calls.
Required evidence/source integrity passes. Candidate JEV fixes irrelevant no-match delivery, while
one unbound short-prompt proxy loses its optional next-action checkpoint. The original failure and
thresholds remain intact. A separately frozen existing-task/session native continuation passes both
arms with two real JEV calls and full bound intent; it does not replace the proxy or consume the
four unused holdouts. These are synthetic characterization results, not accepted-task savings.

The live multilingual review has 20 unique cases and eight seeded defects. Batched advice delivered
all eight but produced two false findings and five unsupported judgments. Capture limitations and
order-permutation results remain visible. Review advice cannot waive deterministic findings or
establish acceptance. The explicit installed long-log pilot preserves failures/results/cleanup and
original references under controlled transport; live semantic usefulness is unqualified and default
automatic output does not activate it.

Current: the exact archive's source, installed and live characterization report is prepared with its
known misses and gray dimensions. Actual model consumption, extra original reads, ungoverned
bypass population, complete ordinary-task costs and accepted outcomes are unknown. Next: retain
this baseline in the existing major release package after immutable readback, then collect matched
ordinary-development evidence through the existing passive monitor. No adopter was changed.
