---
id: spec.engine-decision-experiments
title: Next RC Decision Experiments
type: spec
status: draft
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Optional attention routing, bounded read-only diagnostic sequences and offline history analysis, evaluated against ordinary automation before adoption.
---

# Next RC decision experiments

## Purpose and ownership

Remove routine LLM participation where a workflow can safely proceed with code and a bounded
classification. Ship experiments in a new RC, keep them disabled by default, then compare ordinary
development with shadow and controlled activation. Publication is not promotion to default use.

The [shared decision contract](engine-decision-layer.md) owns provider access, modes, budgets,
fallback and qualification. The [consumer catalog](engine-decision-use-cases.md) owns DL05, DL06
and DL12; this specification defines their next bounded slices. The
[delivery plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#next-rc-experiment-batch)
is the sole progress owner. No second scheduler, approval system, budget database or model runtime
is introduced. This document authorizes design, not host activation or publication.

The motivating hypothesis is complex evidence in, a small declared choice out. A classifier can
still be wrong. Cheap calls do not establish cheap accepted work. Public examples and the source
video motivate experiments; they are not this project's performance evidence.

## Starting point and scope

The 3.0.0-rc.2 source has eight optional consumers. Workflow selection, optional-check selection
and device diagnosis return advice; their settings do not grant execution. Context and output
consumers can shape optional text. The workflow worker already executes declared stages without
LLM supervision. Do not count that existing automation as a new JEV benefit.

| Experiment | Existing consumer | Next RC delivers | Deliberately later |
| --- | --- | --- | --- |
| Attention routing | DL06 iteration supervision | Observe code-only event filtering; classify only demonstrated ambiguous updates in shadow/advice | Live coalescing after a separate host/traffic qualification; worker steering and model-tier changes |
| Diagnostic sequences | DL05 device diagnosis | Up to three eligible read-only probes, with fresh evidence between choices and one compact diagnostic result | Repairs, rebuilds, app relaunch, cache resets, device interaction/navigation |
| History analysis | DL12 process improvement | On-demand classification of selected episodes and an evidence-linked improvement report | Automatic procedure installation, learned scheduler, online policy tuning |

Local and remote CI use the same question semantics and evidence identities. Local capacity,
mandatory checks, placement, cache/proof validity and merge eligibility remain code-owned. This
batch does not implement the full [local-CI planner](engine-decision-local-ci.md). It records useful
workflow costs and can diagnose an eligible CI failure without introducing predictive test omission.

Task-intake sufficiency, action-intent checks and exploratory UI navigation remain candidate research
outside this RC. Existing DL01–DL04, DL07, DL09 and DL13 remain independently usable.

## Common controls

Reuse `continuity.decisions.consumers.<DLxx>.{mode,effect}` and the global ceiling. DL06 and DL12
are new registrations, omitted means off; existing DL05 keeps its advice default. Add only the
qualified effects below. Upgrading a profile never activates them.

| Consumer | Advice/shadow | Explicit live effect | Missing provider or unsupported host |
| --- | --- | --- | --- |
| DL06 | Shadow/advice on eligible supplied observations; preserve original delivery and timing | None in this RC | Deliver through the ordinary host path |
| DL05 | Existing diagnosis/probe advice; shadow never executes a model-selected probe | `choose-read`: select a registered read-only diagnostic recipe under existing authority | Deterministic runbook, otherwise compact LLM handoff |
| DL12 | `advise`: on-demand historical labels/report; no workflow action | No execution effect | Native cost/outcome aggregates and unclassified episodes |

Do not add a `route-attention` effect to this RC's schema. DL06 and DL12 register advice as their
only supported effect, including the common omitted default. DL06 can run in shadow or return
advice, but cannot change delivery timing. A future live attention revision would need its own
explicit effect, host qualification and versioned question before activation.

All calls share the existing SQLite workspace/task/revision allowance; no per-event refresh or
extra historical spending pool. Historical analysis uses an explicit analysis task/revision,
retaining each source episode's own identity separately. Selected analysis input changes require a
new declared analysis revision; rerunning unchanged inputs reuses recorded decisions. Use existing
payload limits, credential handling, source/data permissions, cancellation and health suppression.

Freeze `max_calls: 16` and `max_request_bytes: 131072` in both pilot arms. Keep unrelated semantic
consumers off for an isolated comparison; do not increase the budget to rescue a treatment result.
An operator may instead predeclare a balanced active bundle, with interleaved off tasks and the full
consumer set recorded. Such a pilot measures the bundle; attributing improvement to one consumer
requires a later focused comparison.
A diagnostic episode makes at most three selection calls, one per candidate probe step. DL06 assesses only the
first eligible ambiguous observation per run, using fixed event identity
`attention:<run-id>:iteration.attention-needed/1` in the existing decision reservation owner. Later
polls/excerpts cannot mint a new event key; unchanged evidence can reuse its result, changed evidence
is recorded as unassessed under this cap. Count those unassessed eligible events separately from
classified ones; this is first-observation sampling, not classification of every update. Therefore
DL06 makes at most one transport call per run; the entire history analysis still shares its
analysis-task allowance. Report budget exhaustion and partial/unclassified work in reach denominators.
If this bound prevents useful exposure, conclude constrained/inconclusive and predeclare a later
budget experiment rather than silently changing it mid-window.

A genuine change to the selected history input or reviewed question set may create an explicit new
analysis revision under the same task identity. Rerun, timeout or spent allowance is not such a
change. This follows the shared no-budget-refill rule; it is not a blanket exception for reports.

New execution-relevant questions start with new versioned identities. In particular, keep
`runtime.next-probe/1` advisory and introduce `/2` for eligible executable recipe IDs; old
calibration/receipts cannot authorize the new effect. Only the explicit diagnostic entry may
instantiate `/2`, and only with the explicitly resolved `choose-read` effect. `auto` permits its
qualified selection to reach execution; `shadow` may score the same `/2` candidates but executes
only the baseline and never records a model-selected action. Advice-only profiles continue to use
`/1` and cannot emit `/2` requests. The caller enforces this before `DecisionRuntime.ask`, whose
question allowlist alone does not enforce effects.

Add a registered, code-supplied entry kind to the ask, decision receipt and episode: at minimum
`workflow-observe` and `workflow-diagnose`. Enforce the entry/question/effect compatibility matrix
inside request validation before transport, not only by caller convention. `workflow-observe`
permits advisory `/1` only and resolves to advice even if DL05's configured limit is `choose-read`;
`workflow-diagnose` may ask `/2` only under explicit `choose-read`. Record the configured limit,
question-applicable effect and actual delivered exposure separately; shadow has no delivered action.
Enforce registered question effect ceilings with explicit compatible-effect sets, not a numeric
permission ladder. Existing callers retain their registered entry/default until migrated. Unknown
entries or a `/2` ask attributed to observation fail closed. The existing catalog's static caller
label cannot stand in for the actual entry. Register exact rubrics and unknown handling
in code. No runtime-generated question or executable is installed by a model answer.

## A — Attention routing

### Existing events and the next RC boundary

`WorkflowStore` currently emits `submitted`, `claimed`, `startup-blocked`, `stage:<state>`,
`cleanup-continuation-reserved`, `worker-recovery-observed`, `run:<state>` and `cancel-requested`.
These are structured events; code can classify their delivery significance. The worker does not
request a completion wake for each stage. The existing push path in `completion-delivery.ts` sends
terminal command evidence, which this experiment protects. There is no demonstrated ambiguous
nonterminal push-wake callback in the current engine.

Therefore this RC ships DL06 observation/shadow/advice only. Its concrete read boundary is the
existing `workflowObservationCommand` after `workflowWaitCommand` returns its native result. Retain
status, event ordering, cursor and timing semantics. Optional shadow work is bounded by the existing
decision deadline/cancellation; its added latency is measured. `workflow-status` remains observation
only. Advice returned after a wait does not establish an avoided model turn.

N0 enumerates real host deliveries and the residual ambiguous updates after exact code filtering.
If that residual is empty, do not call JEV or manufacture new semantic events: record zero eligible
traffic. A proposed host-supplied excerpt must be bound to a real native event and permitted by data
rules; no generic interception of IDE logs or extra daemon is introduced to create reach.

### Question and future promotion gate

Register `iteration.attention-needed/1`: Choice among `covered-by-active-procedure`,
`needs-investigation`, `needs-operator-input` and unknown. Supply bounded task purpose, current
phase, recent delivered boundary, event excerpt and declared ongoing procedure. The answers are
recommendations only; none starts a worker or asks a new permission question.

Always bypass semantic deferral for terminal results, failed required work, crashes/exceptions,
cleanup/ownership uncertainty, cancellation, expired deadline, required approval, direct operator
requests and new actionable deterministic findings. Native command/provider completion delivery
stays intact, including its uncertainty/retry semantics. JEV cannot certify a failed event as routine.

Only a later explicitly scoped effect promotion may change when a wait returns. Before that work:

- Show material residual ambiguous traffic and independent labels from real observations.
- Name a supported pre-wake host boundary and its real delivery receipts. For the existing engine,
  the candidate is inside `workflowWaitCommand`, before it returns, not a nonexistent push callback.
- Prove a code-only filter is insufficient and that host return/wakeup usage is observable.
- Specify durable pending event/cursor ownership, unknown acknowledgment handling and flush behavior
  without changing the raw result, event order, terminal delivery or cleanup.

The existing wait caps at 30,000 ms. A future coalescing window cannot exceed the original caller
wait deadline, and new updates cannot extend it. Explicitly amend the native observation timing
contract if this effect is later implemented. The next RC adds no queue, pending cursor, new effect
string or modeled delay merely to prepare for that possible future.

### Qualification and claims

Compare code-only filtering with code plus JEV on the eligible residual, retaining all original
delivery. Label whether an event needed attention before the next ordinary boundary, rather than
whether its wording looked routine. Record calls, unknowns, false routine recommendations and added
latency. No live savings claim follows from shadow/advice.

A later live comparison must measure actual host deliveries/LLM turns and attention delay. Missing
host timestamps or usage makes that benefit inconclusive; a recommended suppression or fewer returned
characters is not an observed avoided turn. Do not broaden eligibility to mandatory failures to
increase reach. Lack of a useful residual is a valid result and leaves the live opportunity deferred.

## B — Bounded read-only diagnostic sequences

### Entry and ownership

Add an explicit diagnostic entry through the existing workflow command/worker owner, proposed CLI
`workflow-diagnose`, with equivalent typed host entry. Invocation binds the existing task/revision,
failed parent run/stage, captured evidence, reviewed probe-manifest digest and host-approved child
bindings. Add `workflow-diagnose` to managed write admission before any ledger/receipt/budget write;
retain generation ownership across its worker and children.
Status/wait calls remain observations; repeated status reads cannot execute probes.

The first implementation is a post-run diagnostic sequence. The parent remains terminal and its
failure notification remains unchanged. Start only after its command outcomes and cleanup are
reconciled. An unresolved parent keeps its normal recovery path; this experiment does not borrow
its held leases or delay required cleanup. The sequence can reduce subsequent diagnostic turns;
it cannot claim to remove the initial failure notification.

Run one read-only workflow recipe per selected probe. The existing catalog contains operations,
not recipes. Define the input probe manifest as version 1 with at most eight unique probe IDs,
descriptions, complete recipe documents and per-probe host-approved binding references. Its digest
binds full recipe bodies and references, not only the IDs. The engine owns this manifest schema;
the adopter owns reviewed contents. Resolve each document through `resolveWorkflowRecipe` against
its existing operations catalog. Require bounded output, explicit deadlines and every resolved
operation's reviewed effect to be read.

The trusted host prepares a distinct policy-authorized local `check` action (null destination) and
calls `authorizeWorkflow` for each candidate before invoking diagnosis. Each binding has its own
action ID and deterministic episode/probe operation ID; the parent's action is never reused or
rebound. At most eight actions are prepared, at most three selected. `workflow-diagnose` verifies
those bindings and the still-open task/version; it never calls `authorizeAction` or manufactures a
grant from the model choice. Unselected actions are retired by the same host under its normal action
lifecycle. Bindings cover immutable commands/inputs/target; candidate changes require renewed host
binding, not modification of a prior approved action. Strings supplied in the diagnostic
envelope are descriptions, never executable authority. Reject unknown or duplicate IDs. Do not
modify the parent's immutable recipe or teach the general executor dynamic model-written stages.

The selected initial adapter binds target identity from native observations, source/artifact
identity from existing records, and each evidence capture time. Caller-supplied target labels in
the current advisory envelope are insufficient for execution. A post-cleanup endpoint observation
describes current state, not proof of what was running before cleanup. Preserve that distinction.

### Sequence

1. Capture valid parent evidence and a current target snapshot. Code follows an exact applicable
   runbook step first. Only unresolved interpretation is sent to JEV.
2. Remove already attempted, unauthorized, stale or unavailable probes. Supply at most eight
   reviewed candidates, their purpose and prior native results. `/2` chooses one recipe ID or unknown.
3. Revalidate task/revision, source, target, catalog/policy, authority and resources immediately
   before binding the choice to its distinct already approved action and child run. A changed snapshot stops this
   sequence with a compact handoff; it does not silently restart with a fresh allowance.
4. Execute via the existing process/resource owner. Persist native result, input validity,
   cleanup and evidence references. Re-capture before a dependent decision; never precompute a
   recovery choice from evidence that does not yet exist.
5. Finish on a native runbook stopping condition, unknown choice, unchanged evidence, exhausted
   limit, cancellation, invalidation or failed/uncertain probe. Return one packet with parent
   failure, observations, attempts, remaining uncertainty and references. Diagnosis is not repair.

Default bound: three probe submissions per diagnostic episode, at most one submission of a given
recipe within one diagnostic episode. A deterministic runbook probe also consumes this
bound. A submission blocked before its command runs still consumes one slot and stops the episode.
Each recipe supplies its own deadline; the caller supplies the total diagnostic deadline.
Missing total deadline refuses live entry. Store one absolute episode deadline at creation;
re-invocation never renews it. The coordinator checks it before each selection/submission and on
resume; child execution deadlines are clamped to the remaining time by the worker from the
persisted episode limit, without editing its host-approved recipe or binding digest. Queue time, inference and
execution consume
that deadline. Expiry cancels/settles the active child using existing bounded termination/cleanup
handling; it stops new probes but cannot abandon ownership to meet a time target. Any cleanup overrun
is recorded separately and the episode remains unresolved until native reconciliation completes.
Provider calls cannot outlive remaining time. The existing JEV call/byte budget is
an additional cap, not a replacement for the operation bound.

An episode is identified by workspace, task revision, parent run/stage and catalog revision.
Store its attempted choices, reserved child identity and remaining bound transactionally in the
existing workflow SQLite store. Reservation precedes dispatch. A repeated invocation observes the
existing episode. Crash after reservation/dispatch reconciles that child; it never spends a second
submission because acknowledgment is missing. Exhausted episodes stay exhausted. A changed catalog
cannot reset attempts for the same parent: an explicit host-authorized new request must record the
prior exhausted episode and reason; automatic retries/revisions cannot mint a new allowance.

Use one small operational reservation record with compare-and-set ownership in the canonical
workflow store. Unique child operation IDs prevent duplicate child dispatch, but do not alone enforce
an aggregate three-probe limit across concurrent coordinators. Keep that transaction rather than
reconstructing a cap from an unlocked scan. Reserve before dispatch, retain the coordinator owner
fingerprint, and reconcile owner loss through the existing worker recovery mechanism.

Create/stamp engine schema version 3 atomically on the first diagnostic episode/reservation write,
not ordinary store open. Existing v1-to-v2 behavior may remain; opening a v2 store with diagnostics
off must leave its engine version at 2. The new constructor accepts and preserves version 3 rather
than unconditionally stamping 2. Add the diagnostic table and episode record in the same migration
transaction, preserving old rows. The prior RC intentionally refuses version 3.

Drain prior generation readers before adoption and before any diagnostic migration. After new
writes, disable the consumer and forward-repair; do not restore an old snapshot over new task history.
Inactive staging/migration proof uses a copy. Existing runtime-generation write markers still govern
rollback even before schema 3: preserving version 2 does not prove no writes occurred. Downgrade
requires the existing no-new-writes restoration boundary and the matching old profile; this RC does
not promise mixed-version ledger writers.

A first invocation refused for advice-only configuration, cancellation, an expired deadline or an
unobservable target creates no diagnostic episode and does not migrate the ledger. Correcting that
entry condition permits a retry. A persisted episode retains its identity, deadline, allowance and
existing cleanup obligations; later refusal cannot reset them.

Global disable stops new semantic choices; the existing owner settles already launched probes and
cleanup. With no JEV token, the deterministic runbook or compact handoff still works. Do not require
the LLM to generate a replacement diagnostic plan after every individual unavailable model call.

### Initial adapter and evidence

Qualify one RN iOS simulator lane before other devices. Useful probes may inspect captured exception
details, current bundle endpoint identity/reachability, or the installed artifact binding. Their
actual commands and version-pinned code-only baseline runbook belong to the adopter, outside
this repository. Bind the baseline runbook digest in the external comparison record. Read-only is an audited
capability,
not a promise established by an `effect: read` label alone. No arbitrary URL or shell text comes
from JEV; credentials and allowed destinations retain their existing owners.

App repair, Metro restart, cache clearing, build, install, relaunch and UI input are outside this
slice. A later recovery capability can reuse the same observations but requires separate effect
qualification. Real devices follow simulator qualification; physical removal/reconnect remains deferred.

## C — Offline history analysis

Extend `telemetry decisions --outcomes-manifest <file>` with explicit `--classify-history`.
The version-2 manifest has an optional `analysis` block containing analysis task/revision, input
digest, bounded excerpt references keyed by episode, and optional reviewed procedure candidates.
Require this block only when classification is requested. Code derives a fixed task ID
`decision-history` within the canonical invocation workspace and derives the analysis revision from
the canonical selected-input digest plus registered question/preparation/model identities. Verify
any manifest task/revision against those derived values; reject caller-minted replacements. Do not
include arbitrary manifest formatting, output path or assignment labels in this identity. This
makes identical analysis inputs share one budget scope across invocations. Close that scope with
`closeDecisionScope` when a report that reserved calls reaches a terminal outcome, including a
partial/cancelled report. Rerenders reuse retained receipts and never reopen its allowance. A crash
can resume the same identity and remaining allowance before finalization. No-call reports need not
create a scope merely to close it; report closure failures and current capacity through existing
budget diagnostics. This single manifest replaces separate analysis scope flags or a second manifest
format. Carry `withDecisionCancellation` through the classification path. Without that flag the report remains
provider-free, even when DL12 is enabled.
Before dispatch, `runtime-invocation.ts` marks `telemetry decisions --classify-history` as a write
using its existing argument-sensitive admission pattern. Plain `telemetry decisions` remains a
read. Use the command's shared argument parser for admission, including accepted flag spellings;
do not inspect mutable consumer configuration or use a substring test to choose admission. Classification uses
explicitly selected, permitted excerpts from an outcomes manifest, not recursive
search of repositories or private session history. Native aggregation never requires classification.

Register `episode.work-class/1` with a fixed initial vocabulary: context discovery, environment
diagnosis, application diagnosis, useful verification, coordination, repeated approach, mixed and
unknown. Add `episode.procedure-match/1` only when the caller supplies reviewed procedure candidates;
otherwise omit that question. Several episodes can be batched within existing limits. A repeated
approach is not automatically wasted work; its prerequisites, new information and later outcome matter.

Produce class counts, measured durations/usage where known, representative episode references,
missing-data counts and matched reviewed procedures. Rank investigation candidates using code-owned
frequency and known cost, not JEV-invented savings estimates. Human or LLM review can turn those
examples into a proposed improvement. The report cannot install a procedure, edit a rule or activate
a feature. Retain earlier question/model versions when reclassifying history.

Human labels and native outcomes used to evaluate a live consumer remain separate from JEV's
historical labels. Do not train and evaluate against the same incident or promote a feature because
its own model labels say it helped. If excerpts are gone or not permitted, report unclassified;
do not reconstruct missing source or usage.

## D — Measurement and experimental assignment

### Extend the existing outcome report

The current version-1 outcome manifest requires at least one decision receipt. That is inadequate
for a true no-call baseline. Add a version-2 manifest reader, retain version-1 reading unchanged,
and allow `decisions: []` when a hash-bound native caller/episode record establishes identity.
Do not manufacture JEV receipts to make an off episode join.

N1 adds a small caller-side episode recorder invoked by the existing workflow observation wrapper
and diagnostic entry before their global/consumer-off early returns, when an explicit pilot
assignment is supplied. No assignment means no new pilot collection. The recorder writes under
`contextStateRoot(workspace)/episodes/<episode-id>.json` using `durableJson` from `core.ts`, before returning
the native response; this is an immutable episode artifact, not a budget
backend or second event database. Managed write admission applies even when JEV is off.

The record's version 1 minimum fields are episode ID, canonical workspace/task/revision, assignment
ID/digest and capture time, caller kind, native run/event IDs and artifact digests, actual exposure
(including off/no-call), and a decision receipt ID array that may be empty. A caller response exposes
that episode reference; the v2 manifest hash-binds it. Source outcomes/labels can be joined later
without rewriting that episode. If recording fails, preserve native behavior and report collection
failure through a distinct collection-status field, outside the optional-advice catch; exclude no
failed treatment from the assignment denominator. The prewritten assignment
manifest retains the expected episode ID so missing captures remain detectable.

The existing `decisionTelemetry(...).pilot` already reads version-2 files from `decisions/` and
counts reasons/reservations. Reuse it. Extend only caller/episode joins and new consumer recognition;
do not add a duplicate decisions collector. The manifest-based report owns complete assigned-arm
comparisons; the directory summary remains a bounded, potentially incomplete operational view.

| Added record | Required meaning |
| --- | --- |
| Episode identity | Explicit workspace/task/revision, caller/native run IDs and digests; analysis scope stays separate |
| Assignment | Experiment and definition version, assigned arm, assignment time, grouping unit and source revision; written before treatment |
| Actual exposure | Resolved mode/effect, eligibility, fallback, host capability, delivered attention disposition or selected probe |
| Decision/action links | Existing receipt/reservation IDs, event ranges, diagnostic episode/child run IDs; empty decision list is valid |
| Outcome | Native status and cleanup, independently supplied acceptance/reopen label, failures and cancellations retained |
| Usage/cost | Native model usage where available; wake/delivery IDs, elapsed episode time and summed build/probe time kept distinct |

Assignment records are host/operator-owned facts, not JEV answers. Retain assigned arm even if
treatment falls back; report actual exposure separately. Missing assignment permits operational
analysis but excludes the episode from an assigned comparison. Missing usage remains null, not zero.
Hash binding establishes local file identity, not independent authentication or acceptance.

Use the existing manifest size/read bounds. Version 2 retains structured receipt links for nonempty
decision lists and validates explicit episode scope against every bound caller/decision/native
record that declares it; reject contradictions. Report join gaps and retention loss in denominators.
Deduplicate native costs report-wide by command request digest or check result digest, not merely
within each episode; retain relationship references in each episode without summing twice. Parent
elapsed time and summed child process time are separate metrics. Count each JEV reservation once.
Record provenance for host-measured, operator-supplied and unavailable metrics.

### Comparison sequence

1. **Ordinary baseline:** same candidate, improved deterministic automation, feature off. Record
   eligible and ineligible episodes as well as failed/cancelled work.
2. **Shadow:** same ordinary behavior plus bounded classifications. Test accuracy, reach, preparation,
   latency and overhead. Shadow does not prove avoided turns, compute or elapsed time.
3. **Controlled activation:** DL05 read-only execution first; DL06 remains shadow/advice in this RC.
   One live experiment at a time on the qualified lane, retaining an
   interleaved off arm. Assign whole tasks/incidents before work, stratified by task type and cold/warm
   environment where useful. Never split attempts from one incident across tuning and evaluation.
4. **Disposition:** adopt within the qualified scope, refine, retain optional/inconclusive, or retire.
   Stable launch need not wait for every experiment to show a benefit.

Use five working days and approximately 10–20 tasks per condition as an initial directional window
when normal workload permits, not as a statistical guarantee or a reason to create artificial work.
Freeze error tolerances, primary benefit, permitted delay, sample window and stop conditions in the
external pilot record before activation. Report counts and uncertainty; extend or conclude
inconclusive when eligible events or usable usage are too sparse. Do not keep sampling until positive.

Primary measures: A eligible traffic and independently labeled decision quality (actual LLM turns
and attention delay only in a later live effect); B LLM turns/usage and time to native probe results
relative to the pinned code-only runbook plus current advisory `/1`; C independently confirmed
improvement candidates per review effort. B's new capability is executing an eligible probe and
returning its result without another LLM orchestration turn, not the already shipped probe advice. Shared
measures include total model cost, accepted completion, rework, missed issues and
developer disruption. Cost reductions from code changes remain separately attributed.

Stop the affected live effect on lost protected evidence, false success, unauthorized/duplicate
dispatch, lost cleanup ownership, or a missed urgent intervention. Ordinary wrong recommendations
follow the predeclared tolerance. On stop preserve assignment and failed evidence, use the baseline,
and reconcile in-flight work. Provider-free development continues.

## Functional proof and release boundary

The delivery plan lists suites and checkpoint commands. Require a small representative successful
path and the critical fallback/replay boundaries for each experiment; do not add every platform,
device or failure permutation. Fixture answers prove wiring, never provider judgment quality.

A release candidate may include disabled experiments without positive savings evidence.
New DL06/DL12 profile keys and v2 manifests are not readable by rc.2. Off and treatment arms use
the same new RC. Release notes must describe profile/schema/data compatibility; disabling a feature
is not binary downgrade. Retain v1 report reading; do not rewrite old artifacts into v2 automatically. It must
prove safe fallback, explicit effect opt-in, receipt integrity and the actual claimed entry points.
If the selected host has no attention callback or a target lacks native diagnostic observations,
publish honest unsupported/advisory capability, not an automatic effect claim. Record the missing
host qualification before controlled activation; do not silently remove a promised experiment.

Publish an immutable new RC under the existing release process, then pin that exact artifact in the
selected existing adopter worktree. Validate real entry, original completion delivery and cleanup
before collecting a live treatment. No extra branches, source hotpatches, SDK/app release or broad
device matrix is required by this specification.
