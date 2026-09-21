---
id: plan.major-adoption-and-measurement
title: Decision Layer Delivery, Major Release and Pilot Measurement
type: exec-plan
status: active
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Prioritized JEV implementation batches delivered through release candidates into a real development pilot, with ordinary-automation baselines and a measured stable-major launch scope.
---

# Decision layer delivery, release and pilot measurement

## Objective and current status

The main programme is to implement and evaluate the optional JEV decision layer: reduce repetitive
LLM reading and decisions, improve accuracy, and shorten development, testing and build work.
Core adoption, publication and telemetry enable that programme. They are not a separate first
product whose completion postpones all wider JEV implementation.

The [unified engine closeout](2026-09-20-unified-development-engine.md#implementation-closeout)
records completed implementation for explicit preview use. Reuse that engine and its qualified
execution/evidence owners. Do not reopen E0–E5 merely to begin this plan. The
[technical work-package reference](../../reference/2026-09-20-decision-layer-work-packages.md) supplies P0–P8 detail;
this plan is the sole delivery order and progress checklist for implementation, release and evaluation. The
[consumer catalog](../../specs/engine-decision-use-cases.md) owns all thirteen consumer contracts.

The operator requested this implementation plan and clarified that wider JEV use is the principal
work to monitor. The plan is finalized for implementation, including the accepted simplifications
below; implementation is in progress. Publication, shared host activation
and adopter changes retain their existing authorization boundaries. This document performs none.
Keep exact target identities, paths, tasks and runtime receipts in the external pilot record.

The operator subsequently moved implementation ownership to Codex, with Claude providing code and
architecture reviews at major seams. The first implementation batch covers **S0–S2 and S3 local release preparation**. It stops
with a frozen implementation, functional proof and review packet. The operator and coordinating
agent then perform code and architecture review, reconcile findings, and decide publication/adoption.
Neither implementation nor review implies permission to publish or activate automatically. Later consumer batches
use the same handoff boundary after the preceding pilot has supplied useful observations.

The shared runtime, legacy scope/budget migration, all eight caller integrations and offline outcome
joins are implemented. All-eight compiled and installed-candidate smoke tests have passed with
fixture inference. Full source suites and Python-wheel installation proof have also passed. These
establish local functionality, not live provider benefit, device readiness or adopter acceptance.
RC review identified evidence-binding and telemetry defects; repairs and focused regressions are
under review. Final source freeze, refreshed exact-archive proof, release/staging qualification and
slice-by-slice acceptance reconciliation remain open. Checklist completion requires those artifacts.

### Accepted implementation choices

- SQLite transactions own the shared JEV call/byte budget; no JSON budget backend or custom lock protocol.
- S0–S10 owns delivery and progress. P0–P8 is a technical reference, not another schedule/checklist.
- DL01/DL02 share evidence capture/preparation/rendering, while retaining independent controls and
  selectively batching only compatible questions.
- Runtime receipts capture essential facts; one small offline report joins outcomes and calculates
  comparisons without adding an analytics service to the execution path.
- Per-feature effect defaults to advice. Doctor/receipts expose the resolved value, and later execution
  effects still need explicit configuration and qualification.
- Existing bound task/revision context travels automatically through supported caller integrations;
  manual entry retains explicit flags and honest missing-scope fallback.

These choices preserve all eight first-RC consumers and their required functional proof. Their owning
details are in the shared spec and consumer catalog; this list records the accepted scope decisions.

## Release and evaluation strategy

**Finish the needed foundation → implement the first useful JEV consumers → publish a release
candidate → adopt it for real development → compare JEV off/enabled → improve and add the next
consumer batch → publish/update/measure again → qualify stable 3.0.0 for the selected launch scope.**

The first published RC contains real JEV functionality. It is not just a core-only adoption release.
The first RC now includes **eight independently controlled consumers**: tool-output selection,
completion advice, test-quality advice, focused code review, context selection, workflow recommendations,
optional-check recommendations and device diagnosis. Workflow/CI/device judgment begins as advice
delivered through existing planning/diagnostic paths. Existing deterministic execution remains active;
new model-driven dispatch, test omission and recovery actions are not implied by these flags.

This broader implementation shares the provider, evidence, fallback and measurement work. It does
increase implementation/test scope: optional flags limit exposure, but do not isolate a broken shared
parser, configuration migration or budget owner. Qualify those shared boundaries and each actual
consumer. Later slices deepen these capabilities or add the remaining five consumer areas.

Ship the eight together; enable a small selected subset at a time for measurement. Implementation
scope and experimental assignment are different decisions. Use one shared task/caller budget and
meaningful eligibility boundaries; do not run all eight questions on every event. The first pilot
can compare useful subsets without another release just to add an already shipped consumer.

Recommended first published pilot version: `3.0.0-rc.1`, subject to tag availability and candidate
selection. Repairs and later batches use new RC identities. These are proposed names, not created
or reserved tags. Never overwrite the local preview or promote its receipts to a new artifact.

Current [release policy](../../governance/release-process.md) and `release-assets.mjs` accept stable
publication only. Compiled locks accept exact prerelease strings, which does not prove publication
or end-to-end RC adoption. S3 includes a narrow proposed policy/tooling extension. Until that is
accepted and implemented, current stable-only publication policy remains effective. A pinned local
pilot remains possible if the extension is declined; do not call it a published release.

## Slices in priority order

| Order | Slice | Delivered outcome | Technical packages / dependencies |
| --- | --- | --- | --- |
| 1 | S0 — Freeze first consumers, target and comparisons | Bounded scope, useful tasks, source baseline and measurement criteria | P0; existing engine closeout |
| 2 | S1 — Shared decisions, host entry and measurement | Optional typed decisions work through real caller paths with observable outcomes | Minimum P1; S0 |
| 3 | S2 — First JEV feature batch | Eight consumers: output, claims, tests, code, context, workflow advice, optional-check advice and device diagnosis | P2a–d plus advisory P3/P4/P5 consumers; S1 |
| 4 | S3 — First RC and pilot adoption | Published candidate including S2, pinned and activated in the selected existing worktree | S1/S2 qualification; explicit publication/adoption |
| 5 | S4 — First real-work comparison | Per-consumer keep/revise/stop decision and fixes in a new RC when needed | S3; actual development tasks |
| 6 | S5 — Refine code, test and context decisions | Broaden useful rules/languages and improve ranking based on first-RC observations | P2a/P2b refinements; S2/S4 |
| 7 | S6 — Promote workflow and local-CI decisions | Move qualified advice into bounded workflow dispatch/plan shaping; add useful history/reuse foundations | P3/P5a–c; evidence and action/resource prerequisites |
| 8 | S7 — Promote device-loop decisions | Move qualified diagnosis/probe advice into permitted probes and bounded recovery | P4; evidence, stable workflow owner and S6 routing |
| 9 | S8 — Stable major launch decision | Stable 3.0.0 with a bounded, measured initial decision-layer scope | Selected launch consumers have S4-style dispositions |
| 10 | S9 — Supervision and model routing | Detect unproductive iterations and compare cheaper-model/verification routes | P6; reliable host events and outcome/usage attribution |
| 11 | S10 — Optional release and learning consumers | Release preparation, related-signal grouping and offline process improvement | P7/P8; real adopter consumers and suitable history |

S5–S7 are follow-on refinements/effect promotion, not the first implementation of those consumers.
They repeat the S3/S4 release/update/measurement cycle when code or supported effects change.
Prepare later evidence or code-only
foundations while a pilot runs, but avoid enabling multiple unmeasured features in the same treatment
arm. A later slice may move earlier for a documented high-volume opportunity; update the ordering
and comparison before activation. This is not an instruction to create more worktrees or agents.

Recommended initial launch scope: the eight S2 consumers with qualified per-feature modes and honest
experimental labels. S5 refinements and S6/S7 execution effects enter only when justified; automated
model-driven recovery is not required to release an advisory feature. S9/S10 are later experiments.
All thirteen need not mature before the major release. A negative result can lead to a disabled or
revised consumer, but it must be an explicit launch disposition rather than a hidden omitted goal.

## S0 — Freeze first consumers, target and comparisons

- [ ] Read back the implementation closeout and target source. Inventory the installed owner, active
  jobs, custom hooks, native trust, instructions and generated/native changes. Preserve detached
  commits and dirty qualification work before any integration or cleanup.
- [ ] Use the existing authorized pilot worktree. Confirm its base supports the chosen real tasks.
  Any required base update is a declared integration with affected evidence reconsidered, not a
  silent switch to another checkout or another full SDK release.
- [ ] Freeze S2 consumer briefs: the exact main-LLM reading/decision step replaced, ordinary-code
  baseline, preparation, integration point, labels, error tolerance, latency/cost bounds and fallback.
- [ ] Use the S2 order for implementation. Start from supplied diffs, rules, context and existing
  workflow/check catalogs; broader source graphs, all-language support and complete historical data
  are not prerequisites for initial advice. Declare unsupported inputs explicitly.
- [ ] Select genuine bugs/features from the target backlog. Retain representative build/test logs
  and honest complete/partial/blocked reports, including failed cases, under existing data rules.
- [ ] Declare task assignment, comparison window, matching strata, usage coverage and acceptance
  criteria before observing candidate results. Keep offline labels separate from held-out evaluation.
- [ ] Reconcile the proposed RC channel, launch scope and the existing qualification boundaries.
  Retain deferral of physical removal/reconnect, unqualified platforms, real Mnemos and live fleet/
  release-provider adoption. Optional release advice does not require a new deployment controller.
- [ ] Route routine reading to this plan and the engine closeout, preserving historical checkpoints.

**Exit:** one coherent first batch and its comparisons. Missing data is a collection task, not a
reason to invent labels or claim a benefit. No broad proof is rerun merely because planning resumed.

## S1 — Shared decisions, real host entry and measurement

- [ ] Implement the minimum P1 contract for the selected consumers: registered/versioned questions,
  validated native answer shapes, evidence/source identity, per-consumer modes/effects, bounded
  provider calls and no-token/off/error fallback. Preserve current E3 compatibility deliberately.
  Use the [first-RC configuration and budget contract](../../specs/engine-decision-layer.md#first-rc-configuration-and-aggregate-budget):
  one `continuity.decisions` owner, independent consumer settings, global mode ceiling, explicit
  old-profile mapping, advice as the omitted effect default, and transactional SQLite task/revision
  accounting across processes. No fresh per-command budget. Pass authoritative invocation identity
  automatically where the caller has it; expose flags for manual/unbound entry and reject conflicts.
- [ ] Use the existing adapter, cancellation and provider-health owners. Add only needed question/
  group controls; avoid a plugin registry, generic question editor or new execution supervisor.
- [ ] Complete demonstrated normal-entry gaps through the existing installer, runtime generations,
  startup and host-instruction owners. Preserve custom handlers and prepare one backed transition.
- [ ] Qualify actual native host events/result delivery in the declared scope. Configuration files
  and direct CLI success are not proof of native event delivery. Unsupported behavior stays explicit;
  do not synthesize events and report them as normal host operation.
- [ ] Select one supported caller for each first consumer before coding. For output selection, name
  the owned command/result boundary whose text is actually delivered to the coding model; for claims,
  name the completion/review path that consumes the advice. Do not claim interception of arbitrary
  host tool output or final messages. If a host control is unavailable, expose a supported explicit
  caller and report the limitation. Native shared activation belongs after review in S3.
- [ ] Capture essential decision/caller facts and join keys in existing receipts: identity, eligibility,
  calls/reservations, fallback, timing, delivered effect and available native usage. Preserve native
  follow-up, intervention and cleanup observations when available; do not invent missing data.
- [ ] Deliver one bounded offline report using the existing telemetry/projection owners to join later
  task/check/provider outcomes and reviewer labels. Report reach, coverage and accepted/reopened work;
  deduplicate receipts and shared batch usage. It must run without inference or workflow dispatch.
  Keep aggregation out of the main execution path and avoid a new analytics service.
- [ ] Preserve main/child/JEV usage scopes separately. Cumulative and per-turn usage cannot be added.
  If native host usage is unavailable, report that gap; byte reduction alone cannot claim token savings.
- [ ] Keep telemetry local/bounded and nonblocking. Prove missing telemetry does not alter execution
  or acceptance. Full operational evidence retains its owner and declared retention rules.
- [ ] Prove the supported caller reaches the actual consumer. A model answer with no delivered effect
  is not a completed feature. Advice-only/shadow observations and enabled effects remain distinguishable.
- [ ] Keep global and per-consumer disable controls, separate eligibility/call/delivery records and
  one aggregate budget. No-token/global-off paths dispatch no provider requests across all eight.
  Enabling one feature must not enable another or change native execution and acceptance rules.

**Proof:** focused typed-answer/budget/fallback fixtures, existing E3 compatibility, telemetry joins,
installed entry points and actual scoped host readback. Apply normal broader checks when changed hook,
selection or process boundaries require them. Reuse applicable device evidence.

**Exit:** selected consumers can be invoked and measured through the real workflow, with their
fallbacks and authority limits intact. Shared host activation still follows its adoption scope.
The local handoff distinguishes implemented caller behavior from any native host readback that still
requires live activation. That remaining observation must not be marked passed by a fixture.

## S2 — First JEV feature batch

### S2a — Tool-output selection (DL13)

- [ ] Preserve complete outputs and native machine parsing before selecting text for the coding LLM.
  Code protects status, failures, required warnings, cleanup uncertainty and diagnostic continuations.
- [ ] Implement the bounded keep/relevance question and declared output-selection consumer. Preserve
  ambiguous/unscored material, exact source ranges, omissions and access to the original output.
- [ ] Compare current delivery, improved ordinary filtering and ordinary filtering plus JEV. Use the
  same source output and task context; include hostile/misleading logs and overflow/fallback cases.
- [ ] Measure decisive-evidence recall, actual delivered text/native usage, further reads, diagnosis
  mistakes, task completion and all provider cost. Shorter logs alone are not sufficient.

### S2b — Completion-claim advice (DL09)

- [ ] Reuse native receipt/applicability checks first. Use JEV only for unresolved claim meaning and
  whether evidence supports the specific assertion. Keep proof and final acceptance deterministic.
- [ ] Return one focused correction to the caller. Handle honest partial/blocked/read-only reports;
  do not introduce a default semantic stop blocker, new approval queue or automatic broad test run.
- [ ] Measure unsupported claims caught, false alarms, additional turns, unnecessary tests and
  corrections. Qualify off, missing-token, stale-evidence and unavailable-provider behavior.

### S2c — Test-quality advice (DL01)

- [ ] Establish one exact-diff capture, evidence preparation and advice rendering path shared with
  S2d. Retain separate questions, flags, coverage and results. Batch compatible questions only when
  evidence/data scope, mode and limits agree; otherwise reuse preparation with separate calls.
  Deduplicate related findings with source references intact; charge native batch usage once.
- [ ] Assess a small initial set of changed-test assertions, mocks and weakened expectations against
  the supplied implementation/requirement. Start with the pilot's JS/TS tests and declared evidence.
- [ ] Deliver source-linked, deduplicated advice in the existing review path at a coherent edit
  boundary. Do not edit tests, certify their quality or add a model call to every deterministic pack.
  Use the engine's `check` result presentation with a separate advisory projection alongside
  `checker-results` findings; advice cannot change checker results, exit status or required proof.
- [ ] Record actionable versus false findings and added review work. Unknown setup or an unsupported
  language returns an explicit coverage limit rather than invented confidence.

### S2d — Focused code-review advice (DL02)

- [ ] Compare an exact diff with the task and a small supplied set of established rules. Identify
  likely rule concerns or unrelated changes without asking the model to infer all project policy.
- [ ] Return source/rule references through the existing review presentation, independently of DL01.
  Deterministic findings, required checks, action authority and code acceptance are unchanged.
  Reuse DL01's capture/preparation and `check` presentation owner; independent feature control does
  not require a duplicated review pipeline.
- [ ] Cover a useful concern, legitimate intentional change, ambiguous evidence and misleading source
  text in compact fixtures. Do not promise a complete security review or all-language coverage.

### S2e — Context selection (DL03)

- [ ] Extend the existing context consumer coherently for the new contract. Rank supplied files,
  documentation and procedures while retaining mandatory and conflicting evidence and source identity.
- [ ] Retain the lexical baseline and earlier E3 receipts. Use independent candidate relevance where
  useful; candidate-generation misses remain distinct from ranking errors. No vector database needed.
- [ ] Deliver the chosen packet to the existing caller. Record required-content retention, missing
  coverage and later expansion. Broader retrieval-method experiments follow real observations.

### S2f — Workflow recommendations (DL04)

- [ ] Match task intent to supplied, currently eligible existing workflow IDs plus unknown. Return a
  recommended workflow in the actual planning/context path; mixed intent preserves unresolved scope.
  The RC1 caller is `context-route`, with a separate `workflowAdvice` result and route-receipt field.
  The caller supplies bounded registered recipe candidates through `--workflow-candidates <file>`
  (versioned IDs and recipe references in the selected project subject); resolve their operation references
  through `config/governance/operations.json` using `resolveWorkflowRecipe`. Each candidate's
  workspace realpath must equal the context-route root or it is rejected as out of scope. The
  catalog contains operations, not a workflow inventory: do not invent workflow IDs from operation names. Candidate
  IDs and digests bind the supplied recipes; filter only declared compatibility/eligibility facts.
  Missing candidates or unknown eligibility yields coverage-limited advice/unknown, not dispatch.
- [ ] RC1 is advisory: the model does not submit work or generate commands. Existing callers and
  code still apply their normal authorization, selection and execution behavior.
- [ ] Record whether the recommendation was delivered and selected by the existing caller. An
  accurate recommendation does not by itself establish avoided orchestration turns.

### S2g — Optional-check recommendations (DL07)

- [ ] Start from the existing applicable check/scenario catalog and required-check plan. Recommend
  useful optional checks, diagnostic order or a visible coverage gap for the current change.
- [ ] Deliver a separate advice projection alongside the original plan. Required checks, actual
  execution order, reuse validity and CI publication rules remain unchanged in this first profile.
  Do not infer full dependency/coverage closure from semantic relevance.
- [ ] Support the same advice for local/remote plans without deploying a CI publisher. Use known
  history/cost where available and mark missing values; no full history warehouse is required.

### S2h — Device diagnosis (DL05)

- [ ] Interpret bounded launch/runtime evidence already captured by the existing RN iOS loop. Return
  a supported diagnostic category, relevant log spans and a suggested eligible next probe, or unknown.
- [ ] Attach advice to the existing failure/diagnostic report. Preserve the target/artifact identity,
  native classifications, failures and cleanup state. Known exact conditions remain ordinary code.
  Extend the failed-stage `{run, stages}` projection of `workflow-status` and `workflow-wait` with
  one `deviceAdvice` projection; share its preparation owner and deduplicate by stage/evidence digest.
  Read bounded ranges from the stage result's recorded `log` (currently a combined command log),
  bound to the run, stage, task revision, source validity and worker request. Do not assume separate
  stdout/stderr paths. Supply target kind/ID, app/build artifact digest and captured runtime/probe
  facts through a versioned evidence envelope whose references/digests are validated against the
  run and permitted artifacts. Preserve omitted/missing fields explicitly.
  If an adopter has not emitted that envelope, support `--diagnostic-evidence <file>` on those same
  observation commands. Treat it as caller-supplied evidence with checked binding, not newly proved
  device state. This real explicit path and missing-evidence fallback must work in the installed
  smoke; automatic RN evidence delivery remains an adoption observation, not a claimed SDK edit.
- [ ] Do not dispatch probes, reset Metro, rebuild or recover a device based on JEV in RC1. Retain
  existing deterministic operations; S7 owns any later model-selected execution effects.
- [ ] Cover an unfamiliar failure, healthy slow launch, stale/missing/wrong-target evidence and
  misleading logs with captured/synthetic fixtures. This advisory feature needs no new device matrix.

All eight consumers have independent flags and qualification dispositions and belong to the first
Claude assignment. Work through S2a–h in that order, sharing evidence preparation where appropriate.
If one cannot be delivered through a supported caller, report the precise issue and a scope
recommendation; do not quietly omit it or call an unused helper a completed consumer.

**Exit:** all eight consumers are ready at the effects stated above, or the operator has explicitly
revised that scope. This means installed integration, fallback and small representative functional
cases; it does not require an exhaustive offline benchmark or establish live quality/savings.

## S3 — Publish the first RC and adopt it for the pilot

### Release preparation

- [ ] Accept the narrow prerelease-policy extension and implement it in the existing compiled
  release path. Keep the stable and 2.x paths intact; do not introduce another package or updater.
- [ ] Extend `components/engine/scripts/release-assets.mjs` and its tests for the explicit RC form,
  exact tag/manifest/dependency-lock/source/archive matching and mismatch rejection.
  Accept only stable versions and `-rc.N` with positive integer N; keep preview/arbitrary prerelease
  publication rejected. After checking identity availability, set the root manifest and relevant lock
  entries to the selected RC version before freezing/packing; normally `3.0.0-rc.1`. This local bump
  creates no tag. Do not review a preview-version archive and silently rebuild it as the RC afterward.
- [ ] Use the existing GitHub release assets, prerelease status and non-latest disposition. Retain
  deliberate metadata (`automatic: false`, `integration_change: true`). Verify destination immutability
  support before dispatch. Normal stable/compatible discovery must exclude RC adoption.
  For RC metadata set `from_version` to the exact RC tag and retain the next-major upper bound;
  it is descriptive for deliberate installation, not a stable-startup compatibility promise.
  Stable metadata retains its existing semantics. RC creation uses prerelease/non-latest flags.
- [ ] Prove exact deliberate RC installation/update, archive verification and offline installed
  invocation. Do not assume that the lock parser's acceptance proves updater/channel behavior.
  RC1 uses the existing direct archive/lock verification, `stageRuntimeArchive` and deliberate
  runtime-generation transition owners. Stable startup inventory and candidate validation continue
  rejecting RCs; do not add a permissive startup override. Local proof stages a hash-bound archive
  outside the checkout. Later adoption fetches the exact published archive and lock, verifies their
  identities, then uses the same deliberate transition. RC-to-RC changes remain explicit.
- [ ] Freeze the first batch, run the declared source/package proof and return the review packet.
  The operator/coordinating agent owns the subsequent code and architecture review. Reconcile named
  findings with focused rechecks; do not start an extra model-review loop during implementation.
  Source-readiness currently does not run on every repair push. Run its declared local equivalents
  for this handoff; triggering remote proof of the integration candidate belongs to the later
  authorized integration/publication step, not this no-push assignment.
- [ ] Prepare migration notes, known consumer limits, usage coverage and recovery instructions.
  Compare candidate inputs/artifact members with device-qualified evidence. First-handoff reruns
  cover affected source/installed suites. Record required native/device readback for later adoption;
  this bullet does not dispatch a new device build or scenario before review.

### Publication and readback

- [ ] With explicit authorization, integrate/tag/publish the exact certified RC. Verify release-built
  archive applicability before publication; a matching version string does not establish identical bytes.
- [ ] Read back published source/tag, RC/non-latest status, hashes, exact lock, metadata and immutability.
  Fetch what the adopter will consume. A repair publishes a new identity; never overwrite an RC.

### Pilot adoption

- [ ] Install the published archive in the selected existing pilot worktree and pin its exact lock.
  Do not consume the mutable governance source checkout or a floating latest tag.
- [ ] Drain/reconcile old work under its owner, back up coherently and transition runtime, hooks and
  instructions together. Preserve custom handlers, generated files and prior evidence. Perform the
  native trust review where required, within the authorized host scope.
- [ ] Start a fresh session and verify runtime discovery, required checks, result delivery and
  cleanup. Exercise a representative simulator path and relevant available wired-device proof,
  reusing unaffected receipts by explicit applicability. Do not add disconnect/reconnect testing.
- [ ] Verify both provider-free and selected enabled consumer paths on this published build. Start
  baseline episodes with JEV off, then use the predeclared assignment for enabled comparison episodes.
- [ ] Before new writes, use the qualified restoration path if needed. After writes, stop dispatch
  and forward-repair without overwriting new history or assuming unknown effects were undone.

**Exit:** the pilot uses an exact published release containing JEV features through normal entry
points. This updates development tooling in the adopter; it does not publish the adopter's SDK/app.
Activation and collection failures remain evidence, separate from ordinary development episodes.

## S4 — Measure real work, decide and iterate

Use genuine assigned work, not invented code changes to fill a quota. Telemetry begins during
preparation; the live comparison begins once artifact, entry points and coverage are verified.

- [ ] Compare three layers where useful: prior/current behavior, improved ordinary automation, and
  the same improved automation plus JEV. Isolate JEV's incremental effect with the same RC and
  per-consumer flags. Do not attribute runner fixes or a different model to the JEV arm.
- [ ] Use predeclared randomized/interleaved assignment where practical, stratified by task kind,
  cold/warm state and environment. Replays can assess label quality; actual delivered effects are
  needed for main-model usage/accepted-work benefit. Shadow-mode calls alone do not prove savings.
- [ ] A proposed first window is five working days, targeting 10–20 accepted tasks per condition as
  a directional screen when workloads permit. Keep failed/cancelled/reopened tasks in denominators.
  Final window and stop rules are selected in S0; do not manufacture work or run until results look good.
- [ ] Enable one consumer at a time initially. Use independent flags or a declared comparison for
  combinations later. Do not execute two runtime owners against the same side effect or run every
  development task twice merely for evaluation.
- [ ] Record usage coverage, decisive-evidence omissions, errors, rework, interventions and elapsed
  accepted-work cost. Evaluate total main/child/JEV cost, not JEV's request price alone.
- [ ] Diagnose product bugs, environment failures, harness defects and decision errors separately.
  Fix the owning layer, qualify the affected seam and use a new authorized RC/update when necessary.
  Never hotpatch the installed package or silently mix candidates in one measurement arm.
- [ ] Stop the affected consumer/lane on false success, missed required evidence, lost history,
  duplicate effects, unowned cleanup or broken required checks. Fall back under the existing owner,
  reconcile unknown effects and preserve the failed observation.
- [ ] Record per-consumer promote, revise, inconclusive or stop. Ordinary baseline/fallback remains
  usable. Negative results narrow a hypothesis; they do not justify declaring all JEV uses ineffective.

**Exit:** a useful baseline and an honest per-consumer disposition. Every S5–S7 batch reuses this
procedure through another RC/adoption cycle, without repeating unchanged foundation qualification.

## S5 — Refine code, test and context decisions

Refine the delivered DL01 test-quality, DL02 diff-review and DL03 context/procedure consumers using
first-RC observations. Ordinary rules and lexical retrieval remain baselines. Broaden languages,
rule sets or ranking methods only when captured cases establish a useful next target.
Check assertions/mocks/weakened expectations against intended behavior; route substantive findings
for review without accepting code or suppressing deterministic findings.

Use real changes and independently labeled cases. Separate retrieval candidate misses from ranking
mistakes. The previous four-case E3 screen is retained as an inconclusive prior result, not erased
or reused as proof for a new question. Compare pooled/isolated layouts and rank fusion only where a
consumer needs them. Publish the qualified batch and apply S4; measure reading/review repair as well
as findings and model usage. No full source/coverage graph is a prerequisite for every consumer.

## S6 — Promote workflow and local-CI decisions

Promote qualified DL04/DL07 recommendations to bounded workflow dispatch and optional-plan shaping.
RC1 already supplies their advice; new execution effects need separate qualification and enablement.
First project per-check history from existing receipts, declare complete inputs for valid reuse,
retain required checks and respect machine capacity. That ordinary-code foundation may be prepared
in S0/S1. JEV then addresses ambiguous relevance and workflow intent, not cache validity or authority.

Compare ordinary planning against the same planner plus JEV. Measure useful feedback time, compute,
missed coverage and the main LLM's planning turns. Use exact failure normalization before semantic
same-symptom grouping; retain all failures. Prefer the cheapest useful next observation within the
declared permitted operations. Required merge/release proof cannot be omitted by a relevance score.

Both developer-local and remote CI remain required placements. Integrate already authorized provider
paths deliberately; live publisher/VM activation is separate from evaluating the planner. Speculative
builds and predictive omission are later P5 experiments, not prerequisites for this batch.
Publish/update/measure using S3/S4 with the same required proof in comparison arms.

## S7 — Promote device-loop decisions

Promote the delivered DL05 diagnosis to eligible read probes first on the qualified RN iOS simulator
path, then selected wired-device use. Native
code still detects exact known conditions, binds the target/build and owns process/resource cleanup.
JEV interprets unfamiliar bounded evidence, identifies useful log spans and selects a permitted probe.
Qualified selection of a preapproved recovery procedure follows; model output never grants authority.

Use separate decisions after each new observation, bounded recovery attempts and immediate ordinary
fallback. Include misleading logs, slow healthy launches, stale artifacts and target uncertainty in
focused qualification; no model-favored rebuild without declared prerequisites. Measure completed
scenarios, LLM diagnostic turns, rebuilds, failed recovery and intervention—not just classifications.
Publish/update/measure through S3/S4. Preserve deferred physical transport disruption and other platforms.

## S8 — Stable major launch decision

Freeze the launch set after the eight first-RC consumers have explicit dispositions. Recommended
scope is those consumers at their justified advice/context-delivery effects; add later workflow/CI/
device execution effects only when qualified. Every advertised enabled feature needs its own evidence and reliable fallback.
An inconclusive consumer stays opt-in/experimental or is revised; do not advertise unmeasured savings.

- [ ] Resolve adoption and required-proof defects. Review useful simplifications without deleting
  telemetry, source identities, ownership or extension boundaries. Keep 2.x recovery guidance reachable.
- [ ] Select stable `3.0.0`, compare its contents/inputs with the accepted RC and qualify changed
  installed/adoption paths. Version/metadata changes create a new artifact; do not rename an RC.
- [ ] Perform normal stable release certification, authorized publication and asset readback.
  Deliberately update the pilot lock and verify normal operation. Other adopters migrate separately.
- [ ] Publish scoped migration notes and an external measurement disposition. Company content uses
  the journey runbook; content publication and runtime publication have separate authorization.

**Exit:** stable major delivery with a measured first decision-layer scope. Stable release is not
conditioned on positive savings from every idea, and the broader programme continues afterward.

## S9 — Supervision and model routing

Deliver DL06 repetition/scope-drift advice and DL08 model-tier/produce-verify-escalate comparisons.
Start with observation/advice; native host ownership, explicit model choices and required verification
remain intact. Count all attempts, verifier/escalation cost, wrong interventions and repair. A healthy
worker must not be interrupted because a provider failed or a build was quiet. Use real outcomes and
separately qualified effects, then release/update/measure as above.

## S10 — Optional release and learning consumers

Deliver DL10 release preparation, DL11 related post-release signal grouping and DL12 offline episode/
procedure analysis when an actual host supplies the necessary inputs. These share the decision/evidence
contract; they do not require every project to install release automation or a memory platform.

Verify migration-note/claim support, preserve original incidents and let reviewed history suggest
improvements. No model changes policy or installs its own procedure. Measure avoided review/duplicate
investigation and downstream errors. A semantic-feature predictor is a comparison against a cheap
metadata baseline, not a new mandatory learning service. Publish each justified optional capability
through a bounded adopter slice.

## Measurement and source owners

Follow the existing [measurement contract](../../../components/harness/docs/specs/measurement-and-qualification.md)
and [validation strategy](../../governance/validation-strategy.md). Missing native usage does not
block reliable core use, but it does block a quantified token-saving claim. Preserve honest null results.
The [functional validation plan](../../reference/2026-09-21-decision-layer-functional-validation.md)
names the required suites, commands, first-batch acceptance and deferred evaluations. Basic working
behavior and fallback are pre-pilot requirements; wider statistical quality/cost research follows real
telemetry. Do not create an exhaustive model/platform/failure combination matrix before collecting it.

| Concern | Existing owner | Qualification boundary |
| --- | --- | --- |
| Decision definitions and consumers | Decision-layer spec/catalog; existing decision/context modules | Each complete consumer, fallback and effect |
| Installation and host transition | Engine install/startup assets, generation/lifecycle, host API and instruction owners | Actual scoped host entry plus published artifact readback |
| Measurement | Native workflow/task receipts, check/provider/decision telemetry and projections | Outcome joins, missing data, total-cost comparison |
| RC/stable delivery | Existing release-assets builder/tests, release workflow, package manifests/locks | Exact archive/source/metadata plus remote readback |
| Candidate readiness | Existing source-readiness workflow and installed-package verifier | The actual integration candidate, with device applicability |
| Target tasks and operations | Adopter-owned backlog, catalog/profile and integration files | External pilot record, unchanged proof obligations |

This is one integrated programme. Completed core proof is its foundation; repeated RC-to-adopter
measurement makes the JEV work concrete. No new scheduler, plugin platform or universal device matrix
is needed to begin the first consumer batch.
