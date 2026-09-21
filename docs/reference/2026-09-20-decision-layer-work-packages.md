---
id: reference.decision-layer-work-packages
title: Decision Layer Technical Work Packages
type: reference
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-21
summary: Technical requirements and qualification detail for P0-P8, referenced by the single S0-S10 delivery roadmap.
---

# Decision layer technical work packages

## Authority and use

The [integrated implementation plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md)
is the sole delivery order and progress checklist. This reference preserves P0-P8 technical
requirements and future qualification boundaries; it does not schedule a second implementation
programme or require all future effects in RC1. The former delivery-order recommendations are
superseded. Implementation remains unstarted and operational activation retains its existing owner.

Read the [shared contract](../specs/engine-decision-layer.md),
[consumer catalog](../specs/engine-decision-use-cases.md), and
[local-CI detail](../specs/engine-decision-local-ci.md) for owning interfaces and invariants.
Use the [functional validation plan](2026-09-21-decision-layer-functional-validation.md) for required
RC1 suites and cadence. Qualification statements below apply when their particular effect is
implemented; they are not extra first-handoff gates. Existing E3 evidence retains its original scope.

## Package-to-delivery map

| Package | Technical concern | Delivery owner |
| --- | --- | --- |
| P0 | Source reconciliation and real comparisons | S0 |
| P1 | Typed decisions, configuration, SQLite budget, receipts and small offline report | S1 |
| P2 | Test/code/context/output/claim consumers | S2; later refinement in S5 |
| P3 | Registered workflow selection | S2 advisory entry; S6 execution effects |
| P4 | Device diagnosis, probes and recovery | S2 advice; S7 qualified execution effects |
| P5 | Local/remote CI advice, planning, reuse and optional predictive research | S2 advice; S6 deeper effects |
| P6 | Supervision and model routing | S9 |
| P7 | Release advice and post-release signal grouping | S10 |
| P8 | Offline semantic process analysis and memory projection | S10; basic measurement capture/reporting already belongs to S1 |

The first RC contains eight consumers at their declared advice/text-selection effects. Keep future
interfaces flexible without implementing a later package solely because this reference describes it.
Dependencies within packages constrain the relevant implementation; S0-S10 owns when it is delivered.

## P0 — Reconcile the design and choose real comparisons

- Read the then-current engine decision, configuration, context, workflow, capability and
  telemetry owners. Record the inspected revision and any working-tree differences externally.
- Accept or revise the proposed effect levels, initial consumers and migration treatment.
  Reconcile D8/E3 advice limits only for the questions/effects actually accepted.
- Identify the LLM/code step each initial consumer will replace and record a representative
  current episode. Choose the device question from recurring observations, not invented frequency.
- Inventory local-CI applicability, reuse, admission and supersession already owned by the core.
  Choose one expensive recurring check-selection workflow, distinguish iteration from merge proof,
  and capture compute, host contention and current LLM coordination before changing its planner.
- For the S6 local-CI foundations, project existing per-command timing into stable check history,
  identify unknown input closure, and expose remaining proof. Reuse current output archives and claim
  applicability checks for DL13/DL09. RC1 advice uses available history; S6 owns fuller planning/reuse implementation.
- Freeze code baseline, current LLM workflow, task/incident splits, labels and minimum evidence.
  Include failed, unknown, fallback and missing-context episodes, not just successful demonstrations.
- Declare each experiment's primary benefit, error tolerance, latency budget and stop condition.
  Select model/version and permitted data scope. Keep proprietary cases and receipts host-owned.

**Qualification:** a reviewable consumer brief for each initial comparison, a bounded source batch, and an
explicit list of unchanged current authorities. No need to label every future use case before P1.
If representative data is missing, finish the shared contract and collection seam; do not fabricate
quality claims or block independent consumers.

## P1 — Shared typed decisions and measurement

- Replace the live single-Choice request with the versioned primitives needed by the selected
  consumers; preserve the later Choice/Boolean/Score contracts without implementing unused shapes. Preserve
  native distributions, distinguish unknown/unavailable/invalid, and validate answer groups.
- Register reviewed question definitions and consumers with baselines, effect ceilings, minimum
  evidence and qualification identity. Begin with built-in modules, not a dynamic plugin loader.
- Extend configuration and doctor: global off, per-question enablement, existing modes, explicit
  effect limit, model pin, budgets and source/data scope. RC1 effect defaults to advice; new
  questions and execution effects remain disabled. Use the shared SQLite budget and bound invocation
  context from the owning spec; flags serve manual callers, not repeated LLM bookkeeping.
- Migrate existing context consumers and configuration coherently. Preserve the current public
  meaning of enabled questions. Keep historical receipt reading without two live implementations.
- Reuse cancellation/provider health and add same-snapshot question batching. Account for the
  exact transmitted payload, coverage, failures, and one usage total per batch.
- Distinguish same-object batching from candidate-isolated request groups, with total call/token/
  concurrency/deadline bounds. Validate both provider token constraints and per-definition option caps.
- Make interpretation regions versioned workload data with explicit uncalibrated defaults, label
  provenance and separate calibration/evaluation splits. Preserve full distributions and Score semantics.
- Extend existing receipts with decision interpretation, delivered result, eventual action/outcome
  references and label provenance. Capture essential facts during execution; one small offline
  report joins outcomes using existing telemetry owners. Keep raw sensitive evidence with its owner.
- Add event reach, eligible/called/usable/delivered counts, assignment and exclusion reasons.
  Keep decision-time inputs separate from future outcome labels; JEV cannot supply its own ground truth.
- Add a replay evaluator for frozen cases with deterministic fake-provider fixtures and bounded
  optional live calls. Threshold sweeps reuse recorded valid answers; only changed questions/models
  need new inference. Replay of answers is not a fresh quality measurement.
- Provide a documented no-JEV route for every included consumer and operational visibility without
  network calls. An answer cache is optional; add it only if measured repetitions justify it.

**Focused checkpoint:** core criteria CL1–CL4, CL7 and CL9–CL10; multi-primitive semantics, no-call paths,
partial/malformed batches, cancellation, scope/redaction, usage preservation and changed-model refusal.
**Integrated checkpoint:** one installed-artifact context consumer in off/shadow/auto, configuration
migration and rollback, doctor visibility, historical receipt readback. Qualify CL8 at this boundary.
No native app rebuild is required for this provider contract batch.

Keep P1 small: support the first active definitions through one envelope and existing configuration
owner. Do not build a generic question editor, online training service or dynamic extension loader.
Advice retains source/model/preparation/policy identity; action binding is required only where an
operational consumer can act. Early read-only delivery does not wait for all later action consumers.

## P2 — Read-only consumers with immediate practical value

P2 groups four technical concerns. The integrated plan selects their implementation order and
release boundary. Section letters preserve references, not a separate schedule. No positive context
ranking result or broad test-coverage collector is a prerequisite for test-quality advice.

### P2a — Test integrity and semantic diff review: DL01, DL02

- Share one exact-diff capture, evidence preparation and rendering path for DL01/DL02, retaining
  independent flags/questions/results. Batch only compatible enabled questions on the same bounded
  evidence/data scope and mode; otherwise share preparation and send separate requests. Record
  native batch usage once. Declare unsupported languages or unresolved dynamic setup explicitly.
- Implement a small initial question set: assertion support, weakened expectations, and one
  recurring semantic rule that is not already enforced well by code.
- Return source-linked, deduplicated advice through the existing review consumer. Do not add a
  model call to every deterministic pack or make annotations a merge gate.
- Compare against ordinary checks and current review on held-out real changes. Confirm selected
  important findings with source review and targeted pre-fix/mutation proof where practical.

**Qualification:** DL01-A and DL02-A assessed; useful precision/recall and actual review burden reported. A
no-benefit result disables the question rather than expanding the rubric to manufacture a win.
**Expensive proof:** only the focused test needed to check a substantive finding, not a full rebuild.

### P2b — Independent context relevance: DL03

- Run lexical, existing Choice ordering, and independent relevance on identical frozen pools,
  excerpts and delivery budgets. Keep prior E3 cases as regression material, not the only evaluation.
- Compare candidate-isolated versus pooled preparation and one lexical-plus-JEV rank-fusion arm.
  Count repeated shared input and all requests; use independent labels and an untouched evaluation set.
- Integrate ordering into the existing packet builder; retain required/conflicting content,
  stale-source refusal, coverage and expansion behavior.
- Compare downstream accepted tasks and native model usage. Separate candidate-generation
  failures from ranking, excerpt and packet-capacity failures.

**Qualification:** DL03-A plus a scoped live-benefit result. Ordering can be promoted independently of filtering;
relevance-threshold exclusion needs a later question/consumer revision and separate omission proof.

### P2c — Claim support: DL09

- Compose exact applicability checks with atomic claim/evidence classification.
- Add concise findings to one completion/review path; preserve original evidence and contradictions.
- Evaluate false support, overbroad platform claims and unnecessary escalation.
- Integrate one completion-reporting path early: native evidence first, semantic claim meaning
  only where unresolved, then one concise caller correction. Cover unsupported read-only claims,
  honest partial/blocked reports and passing checks unrelated to the claim.
- Preserve existing acceptance gates without adding a semantic stop blocker or automatic broad
  test rerun. Optional operator input is a separately configured capability for unresolved decisions.

**Qualification:** DL09-A. This batch is useful independently of a complete release controller. It can follow
another early consumer if its observed reach is too low to justify first priority.

### P2d — Tool-output selection: DL13

- Reuse the process owner's immutable logs and redaction boundary. Add range/block references,
  protected native facts and complete-block segmentation for one supported caller interface.
- Compare ordinary delivery, deterministic reduction and JEV optional-block selection on captured
  real output. Freeze decisive-evidence labels independently of JEV; measure unknown/unscored cases.
- Deliver shadow/advice first, then qualified display reduction with archive retrieval and an
  omission manifest. Never alter machine parsing, native results, cleanup evidence or stored originals.
- Compare actual downstream usage, later retrieval, diagnosis accuracy and total task completion.
  Archive failure or unsupported host interception leaves the existing delivery path intact.

**Qualification:** DL13-A. Use frozen-output replay and one supported live host interface; no native rebuild is
needed merely to evaluate text selection. A high byte-reduction number alone cannot qualify activation.

## P3 — Registered workflow and probe selection: DL04

- Expose eligible reviewed workflow/probe descriptions through the existing operation/capability
  owners. Direct explicit requests take the code route; mixed or unsupported requests stay visible.
- Bind the selected ID, eligibility snapshot and decision receipt to existing action intent.
  Recheck source, policy, grant and resource generation at dispatch.
- Deliver read-only routing first. Qualify local effects only for a named existing grant/recipe;
  do not let `auto` or a skill suggestion become mutation permission.
- On duplicate events or restart, observe the bound operation before choosing another one.
  Integrate cancellation and a single compact fallback handoff.

**Focused checkpoint:** DL04-A and CL5–CL6, including wrong IDs, stale choices, lost ownership,
revocation, replay and restart after dispatch. Use fake operations for fault injection.
**Integrated checkpoint:** installed engine executes one real permitted read workflow; missing token
uses the existing workflow. Local-effect proof occurs with P4's first concrete consumer.

## P4 — Device-loop decisions: DL05

This slice consumes the ongoing engine's device qualification; it must not create another device
runner or repeat that entire program as a prerequisite to every JEV change.

- Select one recurring unresolved decision from real RN iOS simulator episodes. Start with a
  read probe such as bundle reachability or targeted exception collection when native facts leave
  an ambiguity. Known error-code handling remains deterministic.
- Optionally compare bounded line/block localization before diagnosis, with a companion presence
  question. Report useful evidence location, not a proven root cause; preserve stack context and fallback.
- Implement evidence preparation against the existing device/Metro adapter. Qualify absent,
  delayed and contradictory observations; retain actual target and artifact identity.
- Compare code/current-LLM/JEV choice for that probe. Run a small live lane with unchanged
  scenario acceptance and observe actual turns, rebuilds and outcome time.
- If useful, qualify one local recovery recipe with exact preconditions, existing grant, total
  attempt budget, no-repeat-on-unchanged-state guard, postconditions and cleanup ownership.
- Exercise cancellation, restart, source change and provider failure at the decision/execution seam.
  Keep native outcome and cleanup validity independent of JEV's answer.
- Extend the qualified consumer to an attached real device after the owning baseline path is
  qualified. Record transport/platform scope; do not infer device parity from simulator success.

**Qualification:** DL05-A, CL5–CL6, usable fallback and demonstrated benefit for the named decision, or a clear
no-benefit result with the baseline retained. Expanded recovery families remain separate consumers.
**Expensive proof:** one coherent simulator scenario batch after the seam is stable, then a distinct
attached-device batch. Reuse valid baseline artifacts. Do not repeat broad native builds for changes
to report formatting or question-only replay. Transport removal/reconnect remains deferred here.

## P5 — Local CI planning, selection and feedback: DL07

This is an early delivery area. Begin P5a alongside P0/P1 and P5b alongside the first read-only
consumers. Reuse the core planner and scheduler; do not start a competing CI implementation.

### P5a — Applicable work, reuse and developer-machine budgets

- Project native pack/command outcomes into stable per-check history, adding only missing timing.
  Bind definition/source/environment identity; expose sample counts, p50/p95 and last-failure age.
- Declare check inputs through one owning schema/resolver, reusing recipe mechanisms. Include
  command/config/dependency/toolchain/policy and relevant external state; unknown closure forbids reuse.
- Extend the existing plan's visibility for required/conditional/optional checks, current intent,
  impact coverage, input-bound reuse and explicit non-execution reasons. Implement only missing seams
  identified in P0; do not rebuild capabilities that the concurrent core work already supplies.
- Map tests/scenarios, build targets and declared inputs using current catalogs and the shared
  structural map. Preserve known/observed/inferred relationships and unresolved input closure.
- Add a narrow JS/RN observed-coverage adapter where useful. Reuse current collection or declare
  a bounded instrumentation checkpoint. Unmapped/unexecuted paths stay unknown; no full-suite rerun
  per edit and no inferred native/device coverage.
- Identify reusable proof separately from reusable build artifacts. Validate exact applicability;
  a warm cache or old successful log alone cannot satisfy a check.
- Use existing host/VM resource profiles, ownership and configured optional-work budgets for
  admission. Defer new work under contention; retain required work as pending. Add only missing
  resource measurements/admission behavior through the existing execution owner.
- Declare actual host workload classes and slot/memory limits; keep exclusivity in the existing
  registry. Unknown capacity uses a configured conservative profile or pending state.
- Coalesce edits and suppress duplicate or superseded work through the existing lifecycle while
  retaining independently applicable results. Preserve remote publication/merge trust unchanged.

**Qualification:** LCI1–LCI2, LCI9 and affected lifecycle cases in LCI4–LCI5; useful local plans without JEV.
Record the deterministic improvement over the current baseline before crediting JEV with savings.

### P5b — Focused scenario selection and earlier useful feedback

- Implement independent optional-scenario relevance and captured-map coverage-gap questions.
  Keep the required minimum determined by stage/policy; model absence uses normal impacted planning.
- Compare current workflow, improved code planner and code-plus-JEV on frozen candidate pools.
  Report new-test/cross-package recall, false gap alarms and unassessed coverage.
- Integrate qualified optional selection and priorities into the existing workflow owner with
  actual operation grants, resource admission and decision references. Required checks cannot vanish.
- Qualify a narrow live local lane; compare actual compute, useful-feedback time, full accepted
  completion and developer contention. Verify equivalent question semantics on a configured remote
  profile using existing applicable proof, rather than repeating every expensive platform case.

**Qualification:** DL07-A and LCI3, LCI6–LCI7; a measured incremental benefit or an explicit no-benefit disposition.
No positive JEV result is needed to retain useful deterministic local-CI improvements.

### P5c — Adaptive validation and bounded escalation

- Declare exact widening rules and eligible next probes/scenarios. Handle known errors in code;
  ask the escalation-match question only where interpreting existing evidence is necessary.
- Preserve separate iteration/review/merge/release completeness. A focused green iteration can
  provide applicable receipts but cannot replace remaining merge or release proof.
- Reuse diagnostic consumers and existing retry/recovery budgets. Distinguish infrastructure
  recovery from a genuine assertion failure; do not relocate or quarantine a failing test to seek green.
- Normalize failure signatures before residual semantic symptom matching. Preserve each result,
  including a new regression in a historically flaky test. Evaluate match precision on this workload.
- Compare one reviewed cheap-probe order with a semantic next-probe choice. Use measured costs
  and native outcomes; do not label model confidence as information gain or intervention success.
- Exercise changed candidates, stale reuse, scarce resources, provider absence, cancellation and
  publication outage. Publishing retries must not trigger a completed test batch again.

**Qualification:** LCI1–LCI7 and the failure-grouping portion of LCI10 at the selected integration seam, including source/resource revalidation and native
proof of any qualified action. JEV never signs or publishes merge eligibility itself.
**Expensive proof for P5a–c:** replay first, then one coherent local candidate batch and the narrow
remote-equivalence cases actually changed. No full hosted/local matrix just to compare model answers.

### P5d — Optional later experiment: predictive omission

- Propose the eligible check family, protected floors, conservative unknown handling, workload,
  missed-regression budget, full-validation triggers and rollback criteria for explicit policy review.
- Evaluate against incident-separated complete-result history and bounded independent audits of
  proposed omissions. Include audit/rework cost, new tests and dependency-map gaps in net benefit.
- Keep the experiment off until the owning policy and evidence are accepted. Do not add a
  permanent duplicate remote execution lane or weaken established required proof during observation.

**Qualification:** LCI8 and a separate acceptance decision before activation. This research preserves potential
upside; it is not a gate for P5a–c, the first delivery or the core major release.

### P5e — Optional early research: useful work during spare capacity

- After capacity/ownership works, replay a code-only speculative build/check policy using known
  input changes, actual setup costs and a declared low-priority allowance. Add JEV features only as
  a separate comparison if semantic demand prediction can improve it.
- Qualify one already permitted operation with isolated outputs, safe cancellation, normal
  applicability checks and no interference with required or interactive work.
- Measure useful-result rate, wasted compute, contention and net accepted-completion time.
  Keep speculation off when its measured tradeoff fails the configured objective.

**Qualification:** speculative-work portion of LCI10. This slice depends on P5a capacity, not P5d omission.
It neither invents authorization from idle capacity nor introduces another background scheduler.

## P6 — Supervision and assignment routing: DL06, DL08

- Label completed iteration windows offline; distinguish slow useful work from semantic loops.
- Deliver bounded advice at meaningful boundaries, with exact counters still owned by code.
- Where the host exposes a supported worker-control port, test one scoped steering operation
  with deduplication and grace. Do not add automatic termination/replacement as incidental scope.
- Separately evaluate procedure/small-model/larger-model routing within explicit allowed tiers.
  Preserve operator-requested model, effort and review independence.
- Compare pre-routing with a produce/verify/escalate cascade for one bounded artifact. Preserve
  native acceptance and a single configured escalation; count all generation, checking and repair.
- Count all fallback/escalation attempts and rework when comparing cost and accepted quality.

**Qualification:** DL06-A and DL08-A separately; useful intervention/routing coverage with acceptable disruption
and rework. Unsupported host controls remain advice-only. A positive model-cost result cannot excuse
lower acceptance quality or unauthorized delegation.

## P7 — Optional release judgments: DL10, DL11

- Register a release-preparation consumer with a host-owned component/API/note input adapter.
  Begin with read-only candidate inspection; no release controller is required for this step.
- Implement impact/migration-note questions and reuse DL09 for claim support. Preserve exact
  artifact/version/proof policy outside semantic answers.
- Test multi-component identity, stale evidence, behavior breaks and partial migration guidance.
- If the host has a useful authorized observation source, add signal-grouping advice with original
  alerts retained. Grouping must not suppress distinct incidents or trigger rollback.
- Verify disabled/absent release capability leaves ordinary development intact, and explicit
  unsupported release requests are not falsely reported as complete.

**Qualification:** DL10-A; DL11-A independently for the optional observation extension. Measure preparation
effort and corrections. No deployment, migration execution, release publication or rollback is needed
to qualify these read-only decisions. Such operations remain a separate adopter assignment.

## P8 — Process learning and reviewed procedure reuse: DL12

- Reuse P1 receipts to produce one bounded offline episode report with stable denominators,
  unknown usage, label provenance and links to outcomes.
- Identify one recurring high-cost question or repair pattern and estimate its avoidable work
  from evidence, separating required reruns from waste.
- Research history-only versus history-plus-JEV predictors on separate training/calibration/test
  splits. Preserve feature definitions and avoid future-outcome leakage. This can begin with P5 data.
- Consider a reviewed test/target regrouping proposal where observed build dependencies create
  recurring waste. Exact graph analysis remains code-owned; no automatic source or policy rewrite.
- Propose a question/preparation/threshold revision or a reviewed deterministic procedure.
  Evaluate it on incident-separated held-out cases before enabling it.
- Define an optional projection of inferences, outcomes and reviewed procedures for the existing
  memory port. Defer actual Mnemos dependency/adoption to its own plan.

**Qualification:** DL12-A and a reviewable improvement proposal. This slice does not grant the layer permission
to rewrite rules, train provider weights, install procedures, or continuously tune its own thresholds.

## Source ownership and migration map

| Existing seam | Proposed treatment |
| --- | --- |
| `components/engine/src/decisions.ts` | Split types/catalog/adapter only as needed for clarity; one live provider contract |
| `decision-configuration.ts`, `decision-doctor.ts`, `decision-cancellation.ts` | Extend existing configuration/visibility/lifetime; preserve no-token behavior |
| `context-packet.ts`, `context-command.ts`, `context-route-command.ts` | First typed consumer; mandatory routing remains deterministic |
| `decision-excerpts.ts`, `context-discovery.ts` | Reuse preparation and discovery; add explicit evidence coverage and shared relationships |
| `context-evaluation.ts`, `decision-telemetry.ts` | Generalize consumer-aware replay/observations; preserve historical result interpretation |
| `workflow-catalog.ts`, `workflow-types.ts`, workflow executor/store | Existing registered operation and action owner; add decision references and qualified checkpoints |
| Existing proof planning, integration candidate and resource admission | Explicit selection/reuse reasons, qualified optional scenarios and escalation; reuse current scheduling and publisher ownership |
| `check-telemetry.ts`, native command receipts and `pack-configuration.ts` | Per-check projections and explicit input declarations; run totals and selection globs alone cannot provide these contracts |
| `capability-contract.ts`, local-CI and memory contracts | Optional consumer registration and provenance; no new execution or custody owner |
| Governance checkers | Continue deterministic rules; explicit separate consumers provide semantic review advice |

This is a reconciliation map, not a frozen file-creation mandate. Recheck names and ownership before
implementation because the core is evolving concurrently. Prefer extending a coherent existing module
over introducing wrappers solely to match this table. Never copy package code into another payload.

## Validation and release ownership

The [functional validation plan](2026-09-21-decision-layer-functional-validation.md) owns required
suites and proof cadence. The [integrated plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md)
owns release, adoption, review stops and progress. Follow the existing
[validation strategy](../governance/validation-strategy.md); documentation work needs impacted
documentation proof, not device builds or live inference. Retain failed evidence and apply broader
checks only at the declared boundary or when a changed owner requires them.

Speculative work, predictive omission, model routing, release consumers and Mnemos adoption keep
their explicit later qualification and authority boundaries. The prior
[review reconciliation](../reviews/2026-09-20-decision-layer-reconciliation.md) preserves rationale;
it does not replace the current delivery order.
