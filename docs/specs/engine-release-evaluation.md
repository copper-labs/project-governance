---
id: spec.engine-release-evaluation
title: Governance and Harness Release Evaluation
type: spec
status: approved
owner: project-governance
created: 2026-10-04
updated: 2026-10-04
summary: Defines reproducible release comparisons and passive field scorecards with explicit denominators, evidence coverage and whole-task outcomes.
---

# Governance and Harness release evaluation

## Outcome and boundaries

Measure whether a release makes development more reliable, accurate and efficient. A working
installation, successful provider call or smaller packet is a component result, not that conclusion.
The operator requested routine comparisons with prior releases across all installed projects.

This contract defines evaluation and reporting. It does not introduce another runtime, scheduler,
index, approval gate or database. Existing receipts remain the source of operational proof; bounded
SQLite projections accelerate discovery. A scorecard never accepts a task or waives required checks.
The [delivery plan](../exec-plans/active/2026-10-04-release-evaluation.md) owns implementation order.
The [major plan](../exec-plans/active/2026-10-04-major-verification-feedback.md) still owns release
execution and qualification. The [validation strategy](../governance/validation-strategy.md) owns
check cadence. Product identities, private cases and runtime reports remain outside this checkout.
The [measurement and qualification contract](../../components/harness/docs/specs/measurement-and-qualification.md#durable-evaluation-manifest-and-bounded-dimensions)
continues to own evaluation-manifest fields, capture bounds and retention. This contract adds release
scorecard interpretation through that owner; it does not create a competing manifest or widen capture.

## Two complementary views

1. **Controlled release comparison:** run the same frozen cases from isolated starting states under
   exact old and candidate packages. Freeze expected outcomes before seeing the candidate's answers.
   This can identify a regression or improvement on those cases.
2. **Passive field scorecard:** read existing development evidence, categorize incidents and summarize
   observed usage/outcomes by installed generation. This finds operational problems and missing
   measurement. Different real tasks in different releases do not establish a causal improvement.

Keep deterministic wiring tests, live semantic tests, actual host/adopter tests and ordinary accepted
work separate. Fixture host events cannot certify desktop delivery; simulator success cannot certify
physical-device behavior; published asset identity cannot certify development benefit.

Use the existing four-hour monitor for passive review. It must not launch tests, provider calls,
repairs, upgrades or device sessions to fill a metric. Controlled comparisons run at planned source
checkpoints and release qualification, not on every prompt or monitoring tick.

## Evaluation units and provenance

Use the owning unit for each question: native eligible prompt, context family, delivered packet,
check run, workflow attempt, provider assignment, recovery attempt or complete development task.
A decision batch or replay receipt is not another task. Link units through existing identifiers.
Declare the population before observing outcomes. Keep assigned, started, terminal and nonterminal
episodes, including consultations refused during context preparation before a provider starts.
Completed receipts alone are not the denominator for successful development or consultation.

Every aggregate retains:

- Metric-contract and suite version; case/input/expected-label digests; original receipt references.
- Canonical checkout and worktree identity, exact package/archive and observed runtime generation,
  relevant source subject, effective configuration and host/toolchain/provider versions.
- Fixed coding model/effort, JEV model/question versions and mode, permissions, effective budgets,
  cache state, timing window and trial identity. Keep raw credentials/prompts out of summaries.
- Expected, observed and unknown counts; exclusions with reasons; scan/retention limits; attribution
  owner and confidence; accepted outcome evidence when available.

Record runtime identity at execution, not just the checkout's current lock. A task spanning an
upgrade is mixed-generation; preserve its whole-task cost but do not assign it entirely to the newest
release. Configuration changes are a separate comparison, not silently a runtime improvement.
Changed model, prompt, schema, permission or expected labels can invalidate a causal comparison.

Deduplicate by owner namespace and immutable unit identity, checking receipt hashes and linkage.
For usage, respect native response IDs, provider request identities and JEV reservations. Do not add
cumulative usage to its increments or add per-model totals to the same aggregate a second time.
Usage from a native turn spanning several tasks remains turn-level/unallocated unless a qualified
observer can allocate it. A later task binding must not retroactively own the entire turn's cost.
Preserve failed/retried attempts and their costs. Follow verified referenced provider artifacts,
including explicit output directories; scanning only a default job directory is incomplete.
Do not follow arbitrary paths found in model text as trusted receipt references.

## Scorecard dimensions

Each row shows a rate or measured value, its numerator/denominator or sample count, evidence
coverage, previous comparable result, difference and verdict. Do not combine the rows into one
weighted grade in the first iteration. A critical integrity failure must remain visible regardless
of speed or token improvements. A dimension without a qualified label/oracle is unscored.

| Area | Primary measure | Important diagnostics and qualification |
| --- | --- | --- |
| Installation and continuation | Expected installed journeys satisfied / declared journeys | Fresh project, existing project, exact upgrade, trusted same-session continuation, concurrent worktree isolation. Separate synthetic and host-observed proof. |
| Entry and actual adoption | Correct governed deliveries / eligible native prompts with known observation coverage | Task/worktree identity, task switch, requested consumer reach, delivery before relevant model reads, bypasses proved by trusted host evidence. Enabled flags and missing logs alone prove neither use nor bypass. |
| Index and metadata | Current verified entries / expected eligible inventory; semantic descriptor coverage among permitted entries | Add/delete/rename/change reconciliation, warm reuse, description availability, stale/unavailable sources, disclosure exclusions and cold/warm cost. Inventory presence is not description accuracy. |
| Selection and final packet | Essential evidence units delivered / predeclared essential units | File recall and decisive-span recall separately; required guidance retention; validated source ranges, complete sections, stale references, omission reasons and original access. Fully labelled cases also measure useful selected units / selected units. |
| Checks, workflow and CI | Correct expected execution outcomes / declared cases | Required/affected check selection, dependency order, known fault detection, false findings, exact staged/candidate inputs, reuse validity and unnecessary repeated work. Local, VM and remote lanes remain separate. |
| Device and build loop | Expected round-trip outcomes satisfied / eligible scenarios | Target identity, build/install/launch/observation, supported crash/bad-state detection, bounded recovery and cleanup. Separate simulator, physical device, app defect and signing/infrastructure limits. |
| Consultation and control | Expected consultation/control outcomes satisfied / declared assignments | Requested model/effort, supplied context, actual source access, justified tool requirements, refusal diagnostics, no unauthorized delegation or silent model substitution. Completed prose alone is not accepted review proof. |
| Cleanup and recovery | Confirmed release of owned resources / terminal attempts requiring cleanup | Failed, cancelled and interrupted attempts, live reservations, stale owner recovery, sibling preservation, process identity and unknown cleanup. A live held owner is not a leak; process exit alone does not prove Metro, simulator or device cleanup. |
| Whole-task quality and efficiency | Verified accepted tasks / adjudicated tasks; total tokens and elapsed time per matched accepted task | Outcome-observation coverage, first-attempt acceptance, rework, extra reads, provider calls and all failed attempts. Include all-arm spending and failures alongside accepted-task efficiency to prevent survivorship bias. |

Differentiate syntax-derived description presence from authored description quality. Audit a small
preselected sample against actual source; do not use the selector's own score as its accuracy label.
Unknown descriptor quality remains unknown even when metadata coverage is 100 percent.

### Context measurement at each boundary

Measure the complete chain independently: eligible inventory, permitted descriptors, submitted and
answered descriptors, body permission, captured/judged passages, final delivery, observed model
consumption and task outcome. Report the count lost at each stage and the owner's reason.

For frozen cases, labels name source-backed essential evidence units and acceptable alternatives
before evaluation. Score equivalent sources as one evidence group where they satisfy the same need;
do not reward duplication or require a particular tool name when multiple authorized tools suffice.
Essential evidence absent upstream still counts as a final end-to-end miss. Also show conditional
selection quality on available, permitted evidence to locate the cause. Disclosure denial stays
visible; fixing recall must never override permission.

A selected filename is not a hit for a decisive span that was clipped out. Define the minimum complete
section/function/assertion needed by the case. Score source/range identity, sufficient surrounding
context and original-reference validity. Do not declare every unlabelled passage irrelevant to make
precision look high. No-match cases are explicit cases, not a divide-by-zero recall score.

Classify positive, uncertain, negative, invalid, unavailable and omitted judgments separately.
Uncertainty and correct fallback are not automatically failures; a labelled essential unit lost
through either still counts as an end-to-end miss. High probabilities are not correctness proof.
Record independently labelled misses/false selections, packet bytes, expansion/readbacks and source
staleness. Required instructions, failures and cleanup uncertainty must survive every presentation.

## Scoring and interpretation

Keep five report verdicts: **improved, regressed, unchanged, mixed, insufficient evidence**. Operational
incidents additionally state confirmed facts, hypothesis, likely owner and evidence needed to decide.
A critical violated invariant is red; less severe findings are amber. Unobserved metrics are gray,
not green or zero. Not-applicable capabilities show their declared reason rather than an inflated pass.

- Reliability percentages use explicit expected outcomes and denominator identities. Expected
  refusals/negative tests are passes only when the intended refusal and cleanup are observed.
  Unknown/unobserved cases appear separately, never as passes. Show observation coverage and, when
  the expected population is known, verified successes / all expected cases alongside the assessed rate.
- Semantic scores show raw case counts and per-family results. Repeated trials are nested within
  cases; do not inflate confidence by treating hundreds of related passages as independent tasks.
- Durations show samples and median; upper-tail estimates require adequate samples or are labelled
  preliminary. Split cold/warm index, preparation, provider admission, selection and delivery.
  Parallel summed provider work is not elapsed wall time. Missing or unfinished durations remain unknown.
- Usage separates fresh input, cached input, cache creation, output and provider usage using each
  provider's documented accounting. Do not count reasoning tokens twice when already included in
  output. Do not convert bytes into claimed tokens. Estimated prices and billed spend are distinct.
- Set practical change thresholds and any uncertainty method before the comparison. With small
  samples, report observed differences and inconclusive evidence rather than inventing statistical
  certainty. Fixture invariant violations can establish a regression on that case without a large study.
- Aggregate across stacks only with a fixed case mix/weights and common metric definitions. Always
  retain per-stack, task-family and execution-lane results so a changed workload cannot hide regression.

Do not score governance's reliability from application-test pass rate. Record expected application
failures, environment/provider availability, operator cancellation, unsupported capability and
unresolved ownership separately. The harness may handle an app failure correctly; incorrect
handling is its own defect. Costs from unsuccessful work still belong in whole-task accounting.

## Fair release and JEV comparisons

For a release comparison, hold the case, starting source, profile, model/effort, permissions,
acceptance criteria, provider/question identity and environment fixed where supported. Use the old
release's actual archive and candidate's frozen archive. A required configuration migration gets a
separate declared comparison; never pretend old and new settings are identical when they are not.

For JEV contribution, compare deterministic selection with active JEV within the same candidate.
Shadow evaluates advice without live delivery and cannot establish changed task outcomes. These two
comparisons answer different questions. Do not attribute every release improvement to JEV.

Reuse existing representative case sets and installed journeys. Include a small development set for
iteration and a separately frozen holdout; old misses become lasting regression cases. Reserve
labels from tested agents and freeze expectation changes as a new suite version. Prefer deterministic
outcome checks and operator/source-backed labels. A model can assist rubric review, but cannot be
its own sole grading authority or replace executed behavior evidence.

Fresh trials get isolated disposable worktrees, stores and budgets with declared cold/warm states.
Randomize/interleave comparison order where provider/environment drift matters. Do not reset a real
ongoing task's shared spending or mutate active projects for measurement. Record provider drift and
unsupported old-release fields. Do not launch an exhaustive platform/model/device cross-product.
For ordinary development pilots, assign the condition before the outcome and retain unsuccessful
assignments. Replaying the same task can teach the agent or operator the answer; use equivalent fresh
tasks or report that familiarity when comparing completion time and whole-task efficiency.

Savings for a matched accepted task are `(baseline tokens - candidate tokens) / baseline tokens`
only with complete comparable usage and a positive baseline. Report unsuccessful trials, retries and
all-arm spending alongside it. Different unmatched field tasks support trends, not that causal
percentage. Unknown acceptance, usage or additional reads remain explicit limits on the conclusion.

## Passive monitoring and release report

Maintain one immutable baseline/report per observation window outside source and adopters. Reports
include installed identity, effective configuration, activity, evidence cutoff, scorecard, new or
changed incidents and source links. No development yields no new evidence, not a healthier release.
Maintain both the last observation window and a retained baseline for each release; updating the
former must not overwrite the latter. Report reader caps and projection eviction before denominators.

The release report contains the exact candidate, previous release, suite/metric identities,
comparison eligibility, dimension table, critical regressions, quality/efficiency tradeoffs and
unknowns. Show changed field configuration and mixed-generation activity in separate panels.
User-visible summaries should answer what improved, what regressed, what remains unknown and what
change to try next. Reporting adds no per-prompt ceremony or blanket test cadence.

## Existing owners and implementation gaps

`context-evaluation.ts` already provides frozen file/span comparisons and deterministic/lexical
baselines. `context-evaluation.test.ts` distinguishes selected files from decisive lines. Extend
these owners for full-chain/complete-unit labels; do not implement another retrieval evaluator.
`decision-outcomes.ts` already validates explicit evaluation manifests and outcome/receipt linkage;
extend it where necessary rather than creating a parallel manifest validator. `decision-episodes.ts`,
`context-observations.ts`, check/provider telemetry, original result receipts and
`telemetry-projection.ts` own existing identity and observations. Projections are not proof.

The missing work is a thin read-only scorecard reducer, cross-release use of existing manifests,
verified outcome/readback links where host observation exists, and qualifications of missing evidence,
retention, mixed generations and custom provider locations. The implementation plan must name which
fields are available now and which require a real host adapter. Do not claim the scorecard is built,
that all active projects can be scored, or that current telemetry establishes savings.

## Research basis

Anthropic's January 9, 2026 engineering guidance distinguishes task/trial/outcome, recommends repeated
trials and treats regression protection separately from capability exploration. It supports combining
executed outcome checks with trace inspection and production monitoring. It does not establish our
accuracy, operating thresholds or token benefit. This contract applies those principles through our
existing owners. [Primary engineering guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
