---
id: spec.engine-decision-use-cases
title: Decision Layer Use Cases and Qualification
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-09-21
summary: Proposed consumer contracts for test quality, context, workflows, device iteration, CI, supervision, evidence, release, and process learning.
---

# Decision layer use cases

## How to use this specification

Implementers use this catalog to build one consumer at a time. Reviewers use its observable outcomes
and failure cases to decide whether a consumer earns activation. The
[shared decision contract](engine-decision-layer.md) owns request types, modes, fallback, authority
and telemetry; this file owns domain-specific inputs, effects and qualification.

RC3 implements the eight original subsets plus DL06 attention advice and DL12 history analysis;
DL05 also has qualified read-only diagnostic selection. Broader listed effects
remain proposals and ceilings to qualify, not permissions granted by this document. New consumers start disabled, then observe or advise. The
[implementation plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md) deliberately delivers useful
subsets before every use case is implemented.

The [RC4 contract](engine-decision-rc4.md) brings connected DL01/DL02/DL09 quality evaluation,
DL08 opt-in routing and richer DL07 advice forward. It requires governed delegation in the selected
pilot and preserves an immediate fixed baseline. Its proposed question additions require explicit
configuration; an existing auto consumer does not silently acquire them on upgrade.

The [integrated first-RC plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#s2--first-jev-feature-batch)
selects DL13, DL09, DL01, DL02, DL03, DL04, DL07 and DL05. Its initial callers are concrete:
DL01/DL02 advice accompanies `check` findings; DL03 uses context assembly; DL04 adds
`context-route.workflowAdvice` from supplied, catalog-resolved recipe candidates; DL07 accompanies
the existing validation plan; DL05 adds `workflow-status`/`workflow-wait.deviceAdvice` from bound
stage logs and target/artifact evidence. DL13 and DL09 use the selected owned output/completion
presentation boundary recorded in S0. An explicit diagnostic evidence argument supports adopters
without an emitted envelope; that does not prove automatic integration with their native loop.

The first released RC permits optional text selection and delivered advice only. Workflow/check/device execution
effects described below are later qualifications, not required first-handoff implementations. Keep
their contracts and tests scoped to the slice that activates each effect.

DL01/DL02 share one review preparation/rendering pipeline with independent controls and results.
The [shared contract](engine-decision-layer.md#batching-transport-and-caching) governs selective
batching, scope/mode compatibility and counting native usage once; combining preparation does not
combine the features or their activation decisions.

## Catalog

Question names are proposed stable IDs. Suffix `/1` identifies the first semantic version; a changed
meaning, rubric or evidence interpretation requires a new identity. Several instances of a question
may assess separate candidates within one batch.

| ID | Area and initial questions | Proposed effect capability | Primary benefit |
| --- | --- | --- | --- |
| DL01 | `test.assertion-support/1`, `test.mocked-behavior/1`, `test.expectation-weakened/1`; RC4 adds `test.requirement-support/1` | Advice | Fewer ineffective tests and review cycles |
| DL02 | `diff.rule-concern/1`, `diff.task-relevance/1`; RC4 adds `change.requirement-support/1` | Advice | Less repeated semantic review |
| DL03 | `context.relevance/1`, `procedure.relevance/1` | Automatic optional-context assembly | Less LLM reading with sufficient evidence |
| DL04 | `workflow.match/1` | Choose read/local workflow within a grant | Fewer orchestration turns |
| DL05 | `runtime.diagnostic-match/1`, `runtime.next-probe/1` (advice), `/2` (qualified reads), `runtime.recovery-match/1` | Choose read/local operation within a grant | Fewer investigations and avoidable rebuilds |
| DL06 | `iteration.attention-needed/1` (initial shadow/advice), `iteration.repetition/1`, `iteration.scope-drift/1`, `iteration.next-review/1` | Advice, then scoped steering | Less unproductive work |
| DL07 | `validation.scenario-relevance/1`, `validation.coverage-gap/1`; RC4 adds opt-in `/2` evidence; later `validation.escalation-match/1` | RC4 advice; later choose optional checks and eligible escalation or reorder work | Less CI planning work; later compute and feedback gains |
| DL08 | RC4 `assignment.category/1`; later complexity/procedure comparisons only if warranted | Opt-in mapping of an operator-defined category to its fixed model/effort pair | Category accuracy and total accepted-task usage measured separately |
| DL09 | `claim.support/1`, `claim.completion-scope/1` | Advice; opt-in operator input for unresolved decisions | Fewer unsupported completion claims |
| DL10 | `release.caller-impact/1`, `release.migration-note/1`, `release.note-support/1` | Advice | Faster, more accurate release preparation |
| DL11 | `release.signal-match/1` | Observation/advice | Less duplicate post-release investigation |
| DL12 | `episode.work-class/1`, `episode.procedure-match/1` | Offline observation | Better priorities and reusable procedures |
| DL13 | `output.keep-block/1` | Bounded optional-output selection for the caller | Less repetitive log reading with decisive evidence retained |

Optional context assembly is an advice effect on model input, not an action grant. Scoped steering
uses an existing worker messaging capability under the registered local-effect limit; automatic worker
termination is outside initial DL06.
IDs with Choice answers include a supplied unknown option; Boolean/Score answers use the shared
unknown interpretation when evidence or calibration is insufficient.

## DL01 — Test integrity

**Problem:** a green test can assert a mock, swallow the failure, or change its expected result in
lockstep with an incorrect implementation. A coding LLM then spends another expensive cycle reviewing
tests that never protected the behavior.

**Inputs:** immutable before/after diff, explicit requirement or bug behavior, selected test bodies,
relevant implementation, fixture/setup and dependency seams. Code extracts test boundaries and exact
changes. Missing fixtures or unresolved dynamic setup are recorded as coverage gaps.

**Questions:** independent Booleans for assertion support, mocked behavior, and weakened expectations.
Assess each suspicious test/rule separately. A generic “are these good tests?” score is insufficient.
Use a supplied reason/evidence ID for each concern, not generated rationales.

**Consumer:** a focused review step after a coherent edit and before expensive integrated proof when
the inputs are already available. Return deduplicated findings with test, assertion, requirement and
implementation references. Changed expectations are observations; an intentional behavior change is
not automatically a defect. Findings do not edit or delete tests and do not constitute a test pass.

**Fallback:** existing static test-quality checks and normal review. Absence of a semantic finding
must be displayed as no concern found in the assessed scope, never proof of adequate coverage.

**Acceptance DL01-A:** include real boundary tests, appropriate mocks, parameterized fixtures,
legitimate expectation changes, vacuous assertions, swallowed errors and incomplete implementation
context. Adjudicate findings against source; use pre-fix execution or a targeted mutation where it
can cheaply confirm that an important regression test distinguishes the bug. Report precision and
recall separately. Measure reviewer time and rework, not the number of warnings generated.

Public precedent: [lgtm](https://github.com/stardeckai/lgtm) is a direct JEV test-quality experiment.
Its author-run results motivate this consumer; its thresholds and findings are not our qualification.

## DL02 — Semantic code and governance review

**Inputs:** one rule with its rationale and examples, a bounded diff, directly relevant surrounding
code, task scope, and existing deterministic findings. Exact import/path/API rules run in code first.

**Questions:** does this change exhibit the specific concern, and is this hunk materially related to
the assigned task? Examples include swallowing an error that callers need, duplicating a declared
authority, or bypassing a documented boundary. Do not ask JEV to discover all project policy.

**Consumer:** produce review annotations grouped by rule and affected behavior. Claims identify
their source range and unknown dependencies. Rank attention without accepting, waiving, suppressing,
or changing deterministic findings. Optional annotations do not become required merge checks through
installation. A future semantic blocking rule would need a separate policy/fallback decision.

**Fallback:** existing code checks and normal review. Numeric limits, forbidden imports and required
file presence remain deterministic even when JEV is enabled.

**Acceptance DL02-A:** harmless refactors, legitimate exceptions explicitly bound by governance,
cross-file context missing from a hunk, quoted hostile instructions, and actual boundary violations.
Count repeated false alarms and reviewer overrides. Compare avoided review reading with missed
important concerns and new review burden.

Source of the proposed pattern: [TypeSafe semantic linting](https://docs.typesafe.ai/concepts/use-case-map).

## DL03 — Context and procedure retrieval

**Inputs:** explicit task purpose, required context from its deterministic owner, and optional
candidates from paths, symbols, owners, tests, task history and reviewed procedures. Each candidate
retains source identity, excerpt coverage and freshness. Query generation first reuses known task
terms and structure; it need not add another LLM call.

**Questions:** one independent Boolean or relevance rubric per candidate. More than one can be useful;
all can be irrelevant. Candidates for a procedure are suggestions, not execution eligibility.

**Consumer:** compare the existing lexical order, current single-Choice ordering, and independent
relevance on the same pool and packet budget. Preserve all required material. Keep a declared
lexical fallback for unassessed candidates; if missing scores prevent a coherent selection, fall back
for the selection as a whole. Do not translate missing scores into low relevance.

Include a lexical-plus-JEV rank-fusion comparison (for example, a code-owned reciprocal-rank merge).
Evaluate pooled and candidate-isolated evidence under the shared layout contract; freeze the winning
preparation before live use. Keep equivalent candidate universes and delivery budgets while reporting
actual request/token costs. Labels must be independent of JEV; a model judging its own relevance
results is not qualification. A benefit on one corpus does not justify replacing every retrieval path.

The first qualified revision changes ordering only. Optional filtering by a calibrated relevance
floor is a separate revision because it can remove useful evidence. Retain omitted IDs and a bounded
expansion path. Mandatory and known conflicting evidence bypass semantic exclusion.

**Fallback:** current lexical packet and discovery. If required content cannot fit, report the
existing capacity problem rather than truncating it to make a model comparison pass.

**Acceptance DL03-A:** several jointly necessary files, no relevant candidates, unseen decisive
evidence, stale files, misleading names, duplicates, conflicting documents and changed budgets.
Measure decisive-evidence recall, expansions, native downstream tokens and accepted-task outcomes.
A smaller packet without sufficient evidence is a loss, even if its input token count decreases.

The [Aera study](https://aerabrowser.com/news/agent-memory-doesnt-need-a-generator-typesafes-jev-vs-llm-on-400-real-tasks)
motivates the independent-relevance comparison. Its single-profile study does not validate our
repository corpus or explain the earlier E3 result by itself.

## DL04 — Established workflow selection

**Inputs:** developer request, explicit task binding, current facts and registered workflow descriptions.
Code first removes workflows whose platform, prerequisites, authority or resource conditions fail.
Explicit commands bypass semantic routing. A workflow registry describes behavior without embedding
untrusted executable strings in model state.

**Question:** Choice among the eligible workflows plus unknown. Multi-intent requests that do not
match one declared workflow go to normal planning; JEV cannot silently discard half the request.

**Consumer:** start with advice, then qualified read-only dispatch. Local mutation requires an
existing scope-specific grant and post-selection revalidation. Use the current operation catalog,
recipe resolver and action lifecycle. Do not create a natural-language command generator.

**Fallback:** existing explicit workflow selection or one compact LLM handoff. An unmatched workflow
can become a future reviewed implementation; it is not automatically authored and activated at runtime.

**Acceptance DL04-A:** ambiguous/mixed intent, explicitly requested workflow, unavailable platform,
stale registry, changed grant, duplicate invocation and provider outage. Measure full turns removed,
misroutes and recovery cost, including any clarification now required.

[Stanley](https://github.com/devagrawal09/stanley-code) provides an experimental public example of
bounded workflow routing and later procedure reuse; this proposal keeps activation under governance.

## DL05 — Device/simulator development loop

The [next RC diagnostic slice](engine-decision-experiments.md#b--bounded-read-only-diagnostic-sequences)
selects read-only post-run probes first. It uses new `runtime.next-probe/2` semantics for executable
recipe IDs; advisory `/1` remains unchanged. Repairs and relaunch remain later.

**Inputs:** existing run/attempt identity; actual simulator or device identity; native build and
installed artifact identity; app state; structured crash/exception signals; Metro endpoint, owner and
bundle observations where applicable; bounded unresolved logs; prior probes and their results.
An adapter declares which observations it can obtain. Missing observations remain unknown.

Before full diagnosis, an optional `diagnostic.relevant-line/1` Choice and `diagnostic.present/1`
Noul can locate useful supplied line/block IDs in one bounded window. Code retains stack/continuation
context and exact source ranges. This localizes evidence, not a proven root cause. A per-definition
larger option budget needs its own proof; missing or uncertain spans use existing parser/LLM handling.

**Questions:** classify an unresolved diagnostic, select the next read-only probe, and match a known
recovery recipe. These are separate questions/stages. Recovery requiring a probe result cannot be
selected from the pre-probe snapshot. Exact error signatures and ownership checks remain ordinary code.

**Consumer progression:**

1. RN iOS simulator: return useful diagnostics and select a permitted read probe.
2. RN iOS simulator: select one narrowly scoped, already granted recovery recipe.
3. RN iOS attached device: qualify the same question against the device adapter's actual observations.
4. Other platforms/frameworks: reuse the contract but supply and qualify their own observations/recipes.

A possible episode is failed launch → inspect bundle reachability → confirm an owned service problem
→ apply one eligible local repair → relaunch → verify the declared scenario. The outcome must be
established by the native probe/assertion, not by the model's classification of a log.

The workflow owns simulator lifecycle, application launch, process groups, resource leases and cleanup.
Never kill an unowned Metro process, reset an unrelated simulator, replace the selected device by name,
or infer device identity from a probability. A service/process being alive is not app readiness.
Classify RN exceptions and native crashes from captured evidence; do not claim universal launch-error
detection or screenshot understanding. Current JEV takes text/structured text inputs.

**Fallback:** existing deterministic runbook and compact LLM diagnosis with actual probe results.
Retry budgets and unchanged-condition guards are enforced in code. Exhaustion cannot trigger a fresh
worker that resets the same retry counter. No rebuild is requested solely because a model favors it;
the selected workflow still needs its declared prerequisites and authorization.

**Acceptance DL05-A:** genuine app error, bundle unavailable, healthy slow launch, known owned service
failure, healthy unowned service, stale installed artifact, source changed during advice, wrong target,
missing logs, hostile or misleading log text, cancellation, restart and cleanup unknown.
Measure time to verified scenario completion,
LLM turns, rebuild minutes and repair success. Include cold/warm runs separately. Physical transport
removal/reconnect testing stays outside this slice unless a future recovery capability requires it;
disconnect observations still stop affected work without claiming cleanup or success.

The [workflow/device contract](engine-workflow-and-device-contract.md) remains the execution owner.
The public [jev-browser pattern](https://github.com/Ying-Kai-Liao/jev-browser) suggests how to hide
routine interaction steps from the LLM, but is not evidence of native-device qualification.

## DL06 — Iteration supervision

The [next RC attention slice](engine-decision-experiments.md#a--attention-routing) brings
`iteration.attention-needed/1` forward in shadow/advice at the existing workflow observation
boundary. Live coalescing is deferred until actual residual traffic and a supported pre-wake boundary
justify a separately qualified effect. It cannot steer workers or change terminal delivery. Other questions below remain later.

**Inputs:** task intent, bounded recent attempts, actual source/proof deltas, active job progress,
previous advice and its disposition. Code supplies elapsed time, duplicate requests and retry counts;
JEV does not calculate them.

**Questions:** is an approach repeating without useful new evidence, does the current work drift
from the task, or does a specific unresolved concern warrant review? Evaluate at completed attempt
or meaningful evidence boundaries. Silence during a build is not a semantic failure signal.

**Consumer:** begin with offline labels, then advice. A later enabled policy may send one bounded
steering message through the existing worker owner, with a grace period and no duplicate steering
for the same observation. A progress event resets an appropriate observation window, not a global
attempt limit. Provider failure cannot interrupt a healthy worker.

**Fallback:** ordinary worker lifecycle, exact timeouts and existing host judgment. Automatic killing,
spawning replacement workers, declaring completion, or deleting work is not included in the first
qualified effect. Those would need their own accepted contract and permission.

**Acceptance DL06-A:** slow successful build, legitimate repeated measurement, actual circular repair,
delayed logs, productive refactor and partially observed work. Measure useful interventions against
disrupted good work. Read-only replay cannot prove that an intervention would have saved elapsed time.

[Foreman](https://github.com/thruwire/foreman) is a relevant architectural experiment; its own
documentation says its semantic assessment quality remains unproven.

## DL07 — Build/test feedback and CI

Developer-local CI is an early consumer, not a hosted-runner afterthought. The detailed
[local-CI decision specification](engine-decision-local-ci.md) defines planning records, twelve
decision points, host behavior, check-reduction levels and acceptance cases LCI1–LCI10.

**Inputs:** immutable candidate, required proof plan, candidate tests/scenarios and dependency graph,
changed behavior, applicable prior proof/artifacts, observed durations and failure history, current
validation intent, environment availability, developer-machine load and resource costs.
Declared dependencies take precedence over inferred relationships. Candidate recall is measured:
a model cannot select a relevant test missing from its shortlist.

**Questions:** independent scenario relevance, a bounded coverage-gap concern over declared behavior
categories, and a choice among eligible next validation/probe steps after new results arrive.
JEV can flag “no visible scenario for this boundary” but cannot invent an executable test or establish
absence outside the captured catalog. Exact escalation rules run directly in code.

**Consumer:** build the applicable plan for iteration, review, merge or release. Code resolves required
checks and valid proof/artifact reuse. JEV selects useful optional focused scenarios within the declared
budget, flags missing coverage, and helps order or widen validation through existing permitted rules.
Preserve every applicable mandatory check. A short iteration run does not satisfy a complete merge
claim. Record why each check ran, reused evidence, was inapplicable, stayed pending or was optional
and not selected. A generic green “skipped” hides distinctions needed for trust and measurement.

Schedule useful eligible feedback first, respecting dependencies and shared resources. A reorder
reduces useful-failure latency; it does not by itself reduce total compute. Exact input-based reuse,
impact selection and superseded-work suppression can reduce compute without predictive omission.
Apply fresh host resource limits in code and retain cleanup ownership when work becomes obsolete.

Placement is decided from capabilities, queue/cost/resource facts and trust requirements in code.
Do not ask JEV to guess whether a laptop or VM has an SDK, signing identity, attached phone or enough
memory. Apply the same question version and interpretation on local and hosted CI; differences in
observed environment are explicit inputs. JEV never certifies local evidence as merge-eligible or
publishes a check on its own. Follow the [local-CI contract](engine-local-ci-and-merge-contract.md).

**Fallback:** existing impacted selection and scheduling. Full required proof remains mandatory for
the corresponding acceptance or merge claim. Prediction-based omission remains a later explicit
experiment: it needs a declared eligible check set, protected coverage floors, reliable history,
measured missed-regression rates, independent audit samples and accepted risk ownership. Keep this
opportunity in the roadmap without making it a prerequisite for useful local CI.

**Acceptance DL07-A:** cross-package changes, new tests with no history, flaky failures, stale coverage,
slow high-value tests, stale proof, edits during builds, local/remote capability mismatch, host/VM
contention and ordering starvation. Measure first useful failure, total compute, developer disruption
and accepted completion separately; confirm required coverage does not shrink.
Train numerical predictors on historical outcomes if useful; JEV's textual features are optional.
Compare current behavior, an improved dependency/reuse/duration/history planner, and that planner
plus JEV before attributing benefit to JEV. Qualify LCI1–LCI10 with DL07-A at the corresponding slice.

For repeated failures, normalize exact signatures first and use `failure.same-symptom/1` only for
unresolved supplied pairs. Group investigation context without suppressing any failed result or
asserting common cause. Historical flakiness never makes a new failure harmless. Measure grouping
precision on each workload before a reviewed retry rule uses it; keep original observations visible.

[Develocity](https://docs.gradle.com/develocity/predictive-test-selection) provides a deployed
predictive-selection precedent, not a JEV benchmark.

## DL08 — Assignment and model routing

**RC4 slice:** the [single-owner routing contract](engine-decision-rc4.md#model-selection-one-owner-routing-off-by-default)
replaces automatic coordinator choice from the Markdown table. Fixed bindings are the default;
DL08 is off unless enabled. Its first question is Choice `assignment.category/1` over operator-defined
task categories plus unknown. Each category has a description and one preselected model/effort pair;
code applies that mapping. No model ranking or guessing which model will solve a task. Unknown or
an ineligible mapping retains the fixed baseline. Only explicit `route-model` may affect dispatch,
within one already selected provider. Required-governed assignments reject agent-authored overrides and
unmanaged routes through the qualified host boundary. Operator choices retain trusted provenance.
Existing sessions and same-assignment follow-ups keep their model; new scope needs a new submission.
The Score/procedure/cascade proposals below are unscheduled research alternatives, not additional
RC4 requirements or a recommendation to enable automatic model optimization.

**Inputs:** bounded assignment, available reviewed procedure IDs, allowed model tiers/capabilities,
explicit operator selection, prior attempts and task sensitivity. Exact capability availability and
price arithmetic belong to code.

**Questions:** Score the kind of reasoning needed and independently assess fit for an existing
procedure. Code maps qualified outcomes to a configured allowed tier. Do not put arbitrary provider
model names or automatic delegation authority into JEV's answer space.

Compare that pre-routing approach with a verification cascade: an already allowed cheaper model
produces a bounded artifact, JEV checks supplied fields/claims against source, and unresolved cases
escalate once through the configured model policy. Use `assignment.output-supported/1` per explicit
claim/field. Native tests and schema validation still run; a high support value is not code acceptance.
Count initial generation, all verification, escalation and repair. The
[provider's extraction cascade](https://docs.typesafe.ai/cookbooks/sde_cascade) motivates the pattern
but does not establish coding-task quality. Both alternatives require their own accepted-work comparison.

**Consumer:** route eligible routine work to a procedure or an allowed smaller model, then apply the
same acceptance requirements. Respect explicit model/effort choice. A requested second opinion cannot
be silently downgraded. Do not retry repeatedly through cheap models when one escalation is warranted.

**Fallback:** the existing configured model policy. If the host cannot route models or start workers
through supported controls, return advice and mark automated routing unsupported.

**Acceptance DL08-A:** apparently simple but cross-cutting change, security/data change, unavailable
tier, explicit requested reviewer, failed cheap attempt and ambiguous assignment. Evaluate all-model
cost plus rework and accepted quality. Do not qualify by predicted difficulty agreement alone.

## DL09 — Claims and evidence

**Inputs:** one atomic completion/review claim, its quoted source and surrounding evidence, and
code-produced applicability facts for candidate, platform, test scope and freshness.

**Question:** Choice: supported, contradicted, insufficient, unrelated, or unknown. Code checks exact
quote presence, identifiers and receipt applicability first. A valid receipt for one platform cannot
support another through a semantic score.

**Consumer:** annotate unsupported assertions and route only the unclear claim for review. Assemble
routine reports from native facts and templates. Do not create a second model-written narrative to
explain every successful check. A model support label never replaces execution or final acceptance.

**Fallback:** exact applicability checks and the existing review process. An unavailable verifier
does not certify the claim. Known contradictory evidence remains visible even if the model disagrees.

Make completion reporting an early consumer. Code first compares the claimed scope with applicable
native receipts, failures and cleanup. A passing check after the latest edit is insufficient if it
does not cover the claim. A read-only task can still make an unsupported claim; do not require file
edits merely to assess it. Exempt honest partial/blocked reports and tasks with no applicable checks.
Use `claim.completion-scope/1` only for unresolved natural-language meaning and existing `claim.support/1`
for its evidence. Return one concise correction to the caller; it can narrow the report or perform
already required work. Do not create a semantic stop blocker or automatically demand a broad test run.

Optional `request-input` applies only to an unresolved operator decision through a supported interface,
with a cap and deduplication. It is not the default response to missing proof. Model failure preserves
normal reporting and existing deterministic acceptance gates. Evaluate false warnings, needless tests,
operator interruptions and how often the consumer applies, as well as false completion caught.

[jev-belay](https://github.com/valentynkit/jev-belay) supplies an early public example. Its reported
quality used a 100-stop proxy-labeled audit subset; 2,694 stops described the broader source corpus.
It tunes on that audit set and has explicit blind spots. Treat this as a hypothesis for our own
receipt-grounded comparison, not evidence to install its blocking behavior or adopt its thresholds.

**Acceptance DL09-A:** claim broader than proof, negated source, fabricated quote, partial success,
simulator versus real device, source-only versus installed proof and failed cleanup. Measure false
support as well as unnecessary escalation. Prioritize critical proof over prose style.

The [citation-check cookbook](https://docs.typesafe.ai/cookbooks/citation_check) demonstrates this
decomposition on a small example; application to execution receipts is our proposed extension.

## DL10 — Optional release preparation

**Inputs:** frozen candidate and component manifest, public API/schema comparisons, behavior diff,
project version policy, proposed notes, applicable proof and explicitly available migration guidance.

**Questions:** caller-visible impact, possible missing migration instructions, and support for each
material release-note claim. Use independent Booleans or rubric levels rather than asking for a
single “safe to release” answer. Deterministic compatibility failures always retain their handling.

**Consumer:** produce a release preparation packet: classified changes, flagged claims, missing
information and suggested review areas. A human or generative model writes prose if needed. Semantic
classification can recommend a version category; project policy owns the actual version calculation.
Keep this an optional capability using the common decision catalog and evidence schema.

**Fallback:** existing release checklist, API checks and review. Missing release support does not
affect normal development; an explicit release request cannot be treated as completed without it.

**Acceptance DL10-A:** behavior break without signature change, migration with partial notes,
multi-component release, unchanged artifact promotion, target-specific rebuild, stale smoke receipt
and misleading “internal-only” commit text. Verify no model result publishes, tags, merges, signs,
waives proof or authorizes rollback. Measure preparation time and review corrections.

The [release capability boundary](engine-capability-boundaries.md) owns future external operations.
This consumer neither requires that controller nor implements production deployment.

## DL11 — Post-release signal grouping

**Inputs:** authorized bounded error/incident excerpts, normalized fingerprints, release/component
identity and code-computed metric changes. Deterministic deduplication and metric thresholds run first.

**Question:** do these supplied unfamiliar signals refer to the same symptom or known incident?
Return candidate IDs and uncertainty; shared wording alone is not a common root cause.

**Consumer:** group likely duplicates and prioritize investigation. Retain original signals, distinct
environments and disagreements. No group suppresses a required alert or overwrites an incident owner.
Canary success, rollback and production mutations remain outside this consumer.

**Fallback:** existing alerting and fingerprint grouping. Provider failure must not delay urgent
notifications or break the established release observation path.

**Acceptance DL11-A:** same error with different causes, multiple components, new severe symptom,
time-window mismatch and missing release identity. Measure duplicate investigation avoided and missed
distinct incidents. JEV does not compute time windows or statistical significance.

## DL12 — Telemetry analysis and procedure improvement

The [next RC history slice](engine-decision-experiments.md#c--offline-history-analysis) brings a
small on-demand classifier and native report forward. The provider-free report remains available;
classification requires explicit invocation and cannot become an online policy tuning service.

**Inputs:** explicitly selected completed episodes with task/source identity, decision receipts,
operation outcomes, expansions and available model usage. Deduplicate completion notices and repeated
observations. Retain the distinction between same-looking work and actually unnecessary work.

**Questions:** classify work into a supplied set such as context discovery, environment repair,
diagnosis, useful verification, or repeated unproductive approach; match a supplied reviewed procedure.
Allow unknown and mixed episodes instead of forcing a flattering savings category.

**Consumer:** an on-demand offline report proposes the next optimization, question revision or
procedure. It cites representative episodes and denominators. Training a downstream predictor or
promoting a new procedure is separately reviewed; no automatic online self-modification is introduced.

**Fallback:** native telemetry aggregates and targeted human/LLM inspection. Missing transcripts or
usage cannot be reconstructed from model estimates and represented as measured cost.

**Acceptance DL12-A:** duplicate notices, missing native usage, legitimate required reruns, overlapping
jobs, hidden failure after apparent success and procedure revisions. Verify incident-separated splits,
label provenance, source withdrawal, namespace isolation and stable repeatable offline scoring.
Outcome projections preserve the [memory boundary](engine-memory-boundary.md) for later adoption.

Two early research outputs are useful without changing runtime authority. First, compare a predictor
using cheap history/dependency features with the same predictor plus bounded JEV semantic features;
record feature definitions, data splits and marginal benefit. The
[feature-discovery cookbook](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery)
demonstrates that pattern in another domain, not CI qualification. Second, use measured build-graph
costs to propose reviewed test/target regrouping that removes unnecessary dependencies. Code/coverage
analysis owns graph facts; JEV may classify behavioral relationships. Neither experiment installs its
own procedures, changes provider weights or silently tunes live selection policy.

## DL13 — Tool and log output selection

**Problem:** the coding LLM repeatedly reads long, mostly routine output. Selecting the useful parts
could save more reading than another improvement to repository search.

**Inputs:** one immutable completed tool-output object or sealed stream segment, command/run identity,
native outcome, current task, source block/range IDs and existing redaction rules. The process owner
retains the full original output under its normal retention/access policy before optional reduction.
No raw secret is sent to JEV to ask whether it is a secret. This is not a log-redaction service.

**Question:** `output.keep-block/1`, a Noul per complete optional block with enough surrounding context.
Compare isolated blocks against bounded same-output batches; neither random fixed-size chunks nor a
larger combined state are assumed safe. Unscored, ambiguous, suspicious or incomplete blocks are kept.

Like optional context assembly, output selection is an advice effect on model input under `auto`,
never an action grant.

**Consumer:** start with measured advisory selection, then qualified reduction of the text delivered
to the coding model. Code always protects native status, failures, warnings required by the caller,
structured results, resource/cleanup uncertainty, contradictions and relevant stack/continuation blocks.
The model cannot rewrite text, alter machine parsing or change native evidence. Keep exact ranges,
an omission manifest and a retrieval reference with the selected output. If protected content exceeds
the caller's hard limit, report overflow and required retrieval rather than claiming a complete view.

**Fallback:** existing unmodified output delivery and its documented capacity handling. Archive failure,
unsupported host interception, redaction uncertainty, timeout or missing credentials cannot activate
semantic dropping. Later retrieval of omitted content counts against savings. Retention expiry must
remain visible; a reference is not a promise that the content remains available forever.

**Acceptance DL13-A:** decisive warnings amid success text, split stack traces, interleaved processes,
failed cleanup after apparent success, multi-line structured output, missing native outcome, hostile
text, cancelled streams, missing archive and all-important output. Measure decisive-evidence recall,
follow-up reads, actual downstream model usage, diagnosis accuracy and total completion time. Do not
qualify on bytes removed alone. Native check results must be identical with the display consumer off.

[jev-pruner](https://github.com/tamaratran/jev-pruner) motivates this experiment. Public implementation
presence and illustrative pruning are not evidence of preserved accuracy across our build/device logs.

## Shared structural map

Extend the existing context-discovery surface with references to package roots, owners, symbols where
available, tests/scenarios, build targets, workflow/operation IDs, reviewed procedures and evidence.
Each edge declares whether it came from a manifest, static analysis, observed execution, or inference.
Cache by source/tool/extractor identity and expose missing coverage. Inferred edges cannot create
mandatory execution dependencies or proof-reuse claims.

Start with manifests, existing test metadata and lexical lookup. Add symbol extraction or embeddings
only when a consumer's measured misses justify them. The same map serves context, test-priority and
procedure consumers; avoid three competing indexes. Every consumer works through bounded lookup and
can fall back without the index. Mnemos integration remains later.

Add per-test observed coverage through an adapter where the runner supports it, initially a narrow
JS/RN test lane. Reuse existing coverage collection where possible; budget any new instrumentation
at a declared validation boundary rather than running a new full suite per edit. Record test/source,
tool/target identity, collection scope and freshness. Observed execution adds positive edges; absence
does not prove independence or complete input closure. Dynamic loads, new branches and unmapped files
retain conservative impact handling. This map improves candidates but is not a prerequisite for
DL01, DL09 or DL13, and does not establish native/device coverage from JS tests.

## Cross-consumer qualification scenarios

| Scenario | Required result |
| --- | --- |
| No account/token, offline CI, or global off | Ordinary development and required proof complete through baseline paths |
| Hostile log or diff asks for a command/policy change | Content stays evidence; no new executable, grant or rule |
| Several independent Boolean questions return high values | Treat them as independent findings, not a single-winner distribution |
| Partial evidence contains no observed violation | Unknown scope remains visible; no universal clean verdict |
| Source, resource or task changes after evaluation | Old advice cannot drive a new action without revalidation |
| Duplicate completion or agent restart | Observe the existing operation; do not repeat a side effect |
| Enabled provider fails during an active device run | Existing executor and cleanup continue under their owner |
| Local and hosted CI assess the same candidate | Same semantics; actual environment/trust facts remain distinct |
| Model, question, preparation or interpretation version changes | Requalification scope is explicit; old results remain historical |

External patterns were researched as of September 20, 2026. They establish feasibility hypotheses,
not acceptance. Adoption uses the engine's own measured workload and the shared core criteria.
