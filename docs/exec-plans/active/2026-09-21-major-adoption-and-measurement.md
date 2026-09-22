---
id: plan.major-adoption-and-measurement
title: Decision Layer Delivery, Major Release and Pilot Measurement
type: exec-plan
status: active
owner: project-governance
created: 2026-09-21
updated: 2026-09-22
summary: Prioritized JEV implementation batches delivered through release candidates into a real development pilot, with ordinary-automation baselines and a measured stable-major launch scope.
---

# Decision layer delivery, release and pilot measurement

The active post-RC4 corrective batch is [ordinary task context and selection adoption](2026-09-22-task-context-entry.md): reuse session-bound task intent, deliver context automatically, and repair adopter route coverage before measuring ordinary use.

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
architecture reviews at major seams. The first implementation batch covers **S0–S2 and S3 local release
preparation**. It stops
with a frozen implementation, functional proof and review packet. The operator and coordinating
agent then perform code and architecture review, reconcile findings, and decide publication/adoption.
Neither implementation nor review implies permission to publish or activate automatically. Later consumer batches
use the same handoff boundary after the preceding pilot has supplied useful observations.

The shared runtime, eight original caller integrations, budget migration and outcome joins are
implemented. The source release candidate is now `3.0.0-rc.4`, including the N-series experiments
and the R0–R4 features below. Published asset identities, adoption status and runtime evidence remain in the external
release/pilot record. Real host/device qualification and measured JEV benefit remain distinct
from source and release completion.
Historical S0–S3 checklists below retain the original acceptance criteria; unchecked entries are
not instructions to redo completed work. Reconcile them against retained evidence when adopting.

The current release candidate is [RC4 quality, routing and CI](#rc4-quality-routing-and-ci-batch).
It brings bounded S5/S6/S9 work forward: connected evidence/quality advice, opt-in category routing replacing
agent-selected work-class tables, richer CI advice, and required governed delegation for the pilot.
The [RC4 specification](../../specs/engine-decision-rc4.md) owns that scope. R0–R6 below owns the next
implementation sequence, with existing-consumer delivery in R2a moved ahead of routing; N0–N6
retains the preceding RC3 contract and its field qualification.
This document update plans implementation; it does not activate features or install another project.

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
- RC4 disables automatic Markdown-table model choice. Fixed provider bindings and explicit operator
  choices remain; DL08 is the sole optional automatic routing owner and defaults off.
- The RC4 pilot requires governed delegation. An agent-supplied model argument is not an operator
  override; permitted fallback and missing or bypassed feature exposure must be distinguishable.

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

The first published candidate is `3.0.0-rc.2`; RC3 is the source baseline for this batch. Target
`3.0.0-rc.4` after checking that identity is unused at freeze; this document reserves no tag.
Never overwrite an existing artifact
or transfer its proof to changed package bytes without applicability checks.

The [release policy](../../governance/release-process.md) now supports immutable RC publication
with prerelease status and `latest: false`. Reuse its exact-source, archive, metadata and readback
qualification. There is no new publication mechanism in the experiment batch.

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

Recommended initial launch scope remains the eight S2 consumers with qualified per-feature modes and honest
experimental labels. S5 refinements and S6/S7 execution effects enter only when justified; automated
model-driven recovery is not required to release an advisory feature. The bounded N0–N6 subset below brings
selected S9/S10 experiments forward; their remaining scope stays later.
All thirteen need not mature before the major release. A negative result can lead to a disabled or
revised consumer, but it must be an explicit launch disposition rather than a hidden omitted goal.

## RC4 quality, routing and CI batch

**Status (2026-09-22): implementation resumed at the operator's request.**
The focused evidence-delivery, field-repair, routing and continuation suites pass. Detached workers
now revalidate admission; trusted follow-ups preserve the restricted profile. Source includes
passive assignment preflight, deliberate legacy-policy review, native outcome joins and a
same-input CI comparison. Real Claude checks established read denials and successful baseline and
alternative workers for one bounded read-only class. This does not qualify unrestricted parents.
Compiled caller integration, the final frozen review and release proof are still in progress.
No RC4 publication or adopter upgrade has occurred.
R0–R6 owns feature progress; the S/P maps are references, not competing schedules. Installed profiles
and releases remain unchanged.
The [design reconciliation](../../reviews/2026-09-21-rc4-design-reconciliation.md) records the
source-grounded review findings and their changes to this sequence. The subsequent
[September research](../../research/2026-09-21-jev-agentic-development.md) and
[simplification pass](../../reviews/2026-09-21-rc4-simplification.md) prioritize existing context/output
selection and operator-defined task categories. Fixed models stay the default; category dispatch
requires opt-in. A category maps to the operator's chosen pair, not a JEV-generated model ranking.

The operator wants new features exercised through the actual development path, not bypassed by an
agent choosing another model/tool. Make that exposure and authority boundary a prerequisite for
the pilot. Do not interpret it as mandatory successful inference: legitimate no-token, uncertainty,
budget and provider-failure fallbacks must still complete through the governed baseline.

| Priority | Slice | Concrete outcome | Dependency |
| --- | --- | --- | --- |
| 1 | Field repairs and R0a — Trace real work and establish exposure | Preserve approval identity; address observed recovery gaps; map actual reads, callers and missing links | Current RC3 source and external adopter observations |
| 2 | R2a — Deliver compact evidence before reading | Code-owned summaries and existing DL03/DL13 reach normal callers; preserve originals and required evidence | R0a binding/source scope for JEV; deterministic summaries need neither routing nor new questions |
| 3 | R1 — Unify model policy and configuration | Fixed baseline by default; explicit operator overrides; one disabled-by-default routing owner and deliberate migration | R0a scope and proposed R0b admission contract |
| 4 | R2b — Add requirement-linked quality evaluation | Test/change/claim advice reuses the connected evidence and existing outcome reader | R2a delivery and R1 question controls |
| 5 | R0b / R3 — Qualify governed delegation and category mapping | One bounded provider/caller; optional task classification applies the operator's preselected pair | R0a/R1; same qualified host class for routing |
| 6 | R4 — Improve local and remote CI advice | Meaningful scenario descriptions, optional recommendations and catalog-gap advice with unchanged required execution | R0a identity/exposure and R1 question controls; existing DL07/native planner |
| 7 | R5 — Freeze, review and publish RC4 | Qualified immutable candidate, independent review, installed proof and readback | Field repairs and R0–R4 required functional proof |
| 8 | R6 — Deliberately adopt and measure | Governed ordinary development with active selected features and independent outcome assessment | R5 and operator-selected existing adopter checkout |

Implement sequentially in the existing working branch unless isolation becomes necessary for a
concrete conflict. No extra worktree or delegated implementation lane is required. Discovery is
small and shares one policy owner, so start with one writer; use the authorized Claude review at
the architecture/frozen implementation seams. Do not add a review ceremony after every slice.

### Current implementation checkpoint

The full R0–R6 scope remains required. Source implementation now covers R0–R4, with focused tests
for native identity, approval transport, recovery, bounded context/output delivery, question controls,
requirement-linked quality and CI advice, routing fallback, explicit reviewer choice and continuation.
Installed normal-caller delivery and native mapped dispatch have been exercised. Native continuation
checks reject expired qualifications and changed source before another child starts. Consolidated source and installed-package proof are complete, and the independent implementation
review is reconciled. RC4 publication and exact asset readback are complete. R6 deliberate adoption
and accepted-work measurement are next; publication does not activate an adopter. R6 adoption follows publication;
keep the coding model fixed for initial measurement. Runtime evidence and host-specific qualification
receipts remain in the external release dossier.

### Immediate field repairs before release

- [x] Preserve explicitly supplied `GOVERNANCE_WORK_ID` from check preparation through the durable
  detached request to Apple approval checking. Pass the same bound value to custom checker commands;
  do not widen ambient environment inheritance or infer authority from decision-task identity.
- [x] Reproduce the missing identity and prove matching approval passes while missing, mismatched
  and expired approval fails. Focused source tests, typecheck, build and a compiled public CLI smoke
  cover the handoff; transient test fixtures are cleaned and evidence retained externally.
- [ ] Include the fix in the frozen release candidate and verify the published/adopted artifact.
  Source proof does not patch an installed RC3 or establish an adopter's build/feature result.

This is a deterministic context-transport repair, not a JEV feature or a change to approval policy.
Keep separate approval-check evidence from native application build/test outcomes.

- [x] Add a supported detached-check reader recovery path in source. Release only the exact bound generation
  after retained command/member cleanup is verified. Keep the original failed result; a dead PID or
  expired wait cannot establish cleanup. Refuse live, mismatched and unresolved owners; replay must
  be harmless. Reuse the existing command reconciler and installation registry.
- [x] Add an opt-in deterministic capacity preflight for a declared emulator lane before install.
  Repeated insufficient-storage failures justify an early actionable refusal, not automatic erasure,
  uninstall, device replacement or extra rebuilds. Platform/app requirements remain adapter-owned.
- [x] Support exact Android emulator cleanup observation through the existing resource boundary,
  using target absence, port closure and adapter lock evidence. Reuse the established host readback;
  do not infer resource release from command completion or expand first-release platform claims.
  Confirmed command cleanup and resource cleanup are separate facts.

These are bounded repairs justified by recorded operational friction. Application compiler/UI-test
defects, project file-size findings, source-proof registration and changed-document inventory belong
to their project owners. They are not reasons to weaken shared policy or extend the RC4 feature list.

**Proof:** focused identity/recovery cases, captured low-capacity/unknown-capacity preflight cases,
exact-target cleanup present/absent/unreadable cases, and one installed seam at release. Do not run
device removal, a platform matrix, or repeat adopter builds for a planning or read-only monitoring pass.

### R0 — Establish governed entry and real exposure

**R0a — Identity and exposure, shared by all features:**

- [x] Trace an ordinary post-adoption development cycle using existing checks, native workflow
  results, decision receipts and ownership readback. Separate setup/negative tests from new work.
  The external monitoring record shows source-scope fallback with missing identity, optional
  context never supplied, large repeated output, and repeated environment/resource recovery work.
- [x] Inspect actual RC3 caller behavior and external adoption evidence. Map check/plan,
  provider submission/completion, native subagent tools, direct provider CLIs/APIs and child delegation.
  For each path record existing owner, task/revision source, permitted source capture and enforceability.
  Count real eligible assignments by class before expanding routing; report absent traffic honestly.
  Identify where context/output selection can run before the worker reads the same full material.
- [x] Carry already bound task/revision, requirement and selected source identity through one normal
  check caller and one provider assignment/completion caller. Missing native integration remains
  unsupported or explicit entry; never invent a global current-task state or broad source permission.
- [x] Extend existing episode/outcome evidence to show reached/called/delivered/used, approved fallback,
  explicit override, outside coverage and attempted bypass. Required-governed completion cannot
  claim full exposure with missing receipts; no semantic judgment becomes a required pass verdict.
  Ratios cover governed-entry assignments. Off-entry use by an unrestricted coordinator is an
  unobserved inventory gap, not complete coverage or a zero-bypass result.

**R0b — Governed admission and one bounded host path:**

- [x] Qualify the Claude Code prototype using native restricted mode, safe mode and a narrow tool
  allowlist. Do not rely on a shell hook alone. Start with a read/search-only worker class submitted by a trusted host; deny native child
  agents, shell, network and unapproved tools. Reject assignments needing absent tools. Existing
  full-access workers and unrestricted coordinators remain outside runtime enforcement coverage.
  The pilot must route that same qualified worker class; qualifying an unused class is insufficient.
- [x] Bind approved route, baseline, config realpath/content, executable identity, host tool profile,
  category mapping and operator overrides through existing `record` actions with `destination: null`.
  These carry provenance; provider admission owns dispatch. Refuse agent
  executable overrides and unapproved binding/registry/access/root/tool/environment changes.
- [x] Carry inherited constraints into child admission. Add guarded permission identity to native
  launch/follow-up validation without weakening legacy identity checks. Prompt prose alone cannot
  confine a worker or authenticate an operator; protect policy, credentials and authority evidence
  against worker changes. Governed-entry failure visibly stops the assignment.
  Resolve the protected hook/policy outside workspace, additional roots and job directory; constrain
  source reads and deny credential reads. Retain launch argv/settings bytes, loaded-settings readback
  and actual denial events. A child-reported permission string proves only identity consistency.
- [x] Produce reusable adapter code and a dry-run host-policy proposal in this repository. Installing
  project/managed settings requires deliberate operator adoption, with scope and effective settings
  inspected. Do not install global policy or write another checkout during implementation planning.
  Qualify any later shell-capable class using supported host isolation, not command-name filtering.
- [x] Apply source/destination permission before every cloud decision or generation call. Reject a
  local-only request with no eligible local provider; fallback cannot broaden data-sharing permission.

**Owners:** existing host API/adapter and task/action authority, `provider-job-command.ts`,
`provider-job.ts`, `provider-assignment.ts`, `decision-scope.ts`, `decision-episodes.ts`, check
observation/context and the existing outcome reader. Do not add harness operations, destinations or
broader authority policy for this feature. R0b also touches `claude-command.ts`, provider permission/identity
and continuation validation. Add only narrow adapter glue after identifying a real capability.

**Proof:** RC4-F1/F2 in the [functional matrix](../../reference/2026-09-21-decision-layer-functional-validation.md#rc4-required-proof).
Prove a normal governed launch, rejected alternate route and config/executable override, a forged
operator choice, inherited child admission, absent/conflicting task identity and a no-token fallback.
Inspect actual host denials and failed policy-tampering attempts before claiming enforcement for
the bounded worker. A fixture cannot qualify an unrestricted parent or worker. Unsupported coverage
blocks that enforced pilot path, not independent R2/R4 advisory implementation.

**Exit:** a concrete host/caller contract with a reusable exposure record. Preserve unknown capability
and unbound inputs explicitly. Close R0a and R0b separately; do not assume every host can be intercepted.

### R1 — Unify model policy and configuration

- [x] Implement the [single-owner selection contract](../../specs/engine-decision-rc4.md#model-selection-one-owner-routing-off-by-default).
  Default to the fixed provider binding. Preserve explicit model/effort/provider choices only with
  trusted provenance in enforced assignments; a matching baseline argument is not an override.
- [x] Register DL08 mode/effect and one typed category map: description plus exact model/effort for
  each category, scoped to an eligible assignment class/provider. Default it off, with
  advice as the omitted effect; live selection requires explicit `route-model`. Preserve the global
  off/shadow ceiling, current budgets and immediate provider-free baseline.
- [x] Add explicit per-consumer question allowlists. Omission preserves each existing RC3 question
  set through frozen `DECISION_CONSUMERS.defaultQuestions`, not the live definition list. Pin the
  exact RC3 sets in proof. Empty means no questions. Reject unknown/mismatched definitions.
- [x] Keep profile parsing pure: include the category mapping in `configDigest`. Provider submission
  separately freezes `bindingDigest` for approved config realpath/content, executable, loaded host
  profile and operator constraints. Reuse `providerBinding` compatibility validation.
- [x] Replace the installed Markdown table's automatic-selection instructions with fixed baseline,
  explicit-choice and optional-router guidance. Reconcile planning/delegation/provider skills and
  catalog references in this same slice; no two live model-selection authorities.
- [x] Add a deliberate legacy-policy migration preview. Preserve project-owned Markdown overrides;
  never infer routing consent or modify them during update. Report incompatible instructions before
  auto activation. Legacy helper bindings remain usable and do not gain a second router.
  Explain that RC3 ignores sibling routing declarations but rejects a new DL08 consumer/question
  selector/effect inside decision settings; neither behavior establishes routing activation.
- [x] Add optional workspace/assignment-scoped routing preflight to provider doctor; keep ordinary
  binding checks compatible. Report effective policy, coverage and qualification without secrets
  or paid probes. Invalid baseline/authority/required host boundary fails preflight; absent optional
  candidates or JEV reports a fallback condition. Qualification uses explicit assignments in R3.

**Owners:** `decision-settings.ts`, `decision-configuration.ts`, decision catalog/runtime/schema,
profile schema assets, `provider-binding.ts`, provider doctor, canonical installed
`resources/model-selection.md` and its existing skill references. Keep provider connection/executable
configuration under its current owner; do not duplicate it in a model catalog.

**Proof:** RC4-F1/F3: old profiles, global/per-feature ceilings, exact question opt-in, explicit partial
choices, incompatible effort, old table preservation, unsupported model/capability and fixed baseline
without JEV. Check the installed guidance and runtime behavior together, not just schema parsing.

**Exit:** routing off never triggers model classification or changes the selected pair; enabled
routing has one policy owner and cannot be bypassed through an agent-authored explicit-model field.

### R2 — Connect evidence selection and quality evaluation

**R2a — Deliver less evidence before reading, ahead of model routing:**

- [x] Make terminal `check-status` compact by default, with explicit `--full` retrieval. Reuse the
  existing summary owner; retain native status, all blocking/advisory finding text, command failures,
  cleanup uncertainty and a content-bound reference to the complete original. Running/incomplete
  observations, native persisted results and exit codes retain their meaning. No JEV call is needed.
- [x] Wire existing DL03 context capture/selection before prompt assembly for one supported provider
  caller; reuse DL13 at its existing completion/observation projection. Preserve required evidence,
  contradictory facts, stale-source refusal, retrieval references and unchanged off/shadow delivery.
  No new index, MCP server, compactor or selector. Reuse DL04 advice where a supplied recipe applies.
- [x] Prove the actual delivered payload changes where eligible, and retain captured/omitted IDs,
  delivery bytes and observed later expansion reads in existing outcome evidence. If material was
  already read upstream, record that limit instead of claiming it as avoided reading.
- [x] Connect existing DL13 to a bounded governed command/check output delivery point. Its current
  provider-completion caller does not cover arbitrary build/test logs. Use trusted task/revision,
  approved diagnostic capture and original receipt identity. No raw log disclosure follows merely
  from enabling context selection. Preserve off/shadow/fallback semantics for optional filtering.

**R2b — Requirement-linked quality, after R1 question controls:**

- [x] Reuse immutable review capture and applicable claim evidence to join an explicit requirement,
  changed subject, relevant implementation/tests and native outcomes. Use current source permissions;
  expand an adopter allowlist only through an explicit reviewed adoption change.
- [x] Implement the two new atomic requirement-support questions under DL01/DL02. Reuse DL09 for
  completion support and existing DL12 for selected history; do not add an overall quality score,
  a new judge agent, automatic policy learning or a second completion gate.
- [x] Integrate check and terminal provider projections. Repeated status reads reuse receipts;
  unchanged compatible questions are not paid for again at another milestone. Unavailable inputs
  report unknown coverage. Off/unknown cases are recorded through the same episode path.
- [x] Keep compatible batching in the existing preparation owner, with independent consumer controls
  and one native usage count. Preserve native status, failures, cleanup and original evidence.
- [x] Deliver compact source-linked concerns only in auto/advice; shadow cannot steer the caller.

**Owners:** `check-summary.ts`, public check/status delivery, existing context-route/output projections,
`decision-review.ts`, `decision-check-advice.ts`, `decision-provider-advice.ts`,
`decision-claim-evidence.ts`, registered question definitions, episode/outcome joins and renderers.

**Proof:** RC4-F1/F4/F6/F8: actual selected context/output delivery, mandatory and contradictory
evidence preserved, unknown retrieval coverage, requirement addressed, plausible unrelated fix, meaningful versus ineffective
test, legitimate behavior change, partial or wrong-platform proof, unknown setup, mixed feature
modes, replay and changed source. Use a small fixed corpus and fake transport for functional proof;
independent real-work labels follow during the pilot.

**Exit:** one ordinary check and one provider assignment/completion path expose selected evidence and
applicable quality advice without extra LLM identity bookkeeping or a changed native acceptance
outcome. Semantic quality and net reading savings stay experimental.

### R3 — Apply category mappings to eligible new assignments

- [x] Extend the existing file-backed submission boundary and resolve the fixed baseline before
  asking JEV. Apply R0's trusted route/override constraint; raw model flags must not bypass it.
- [x] Implement `assignment.category/1` over the operator's category descriptions plus unknown.
  Code applies each category's fixed model/effort binding; JEV does not rank models or predict which
  model can solve the task. Uncertainty or an ineligible binding uses the authorized baseline.
  Missing/mixed input must not force a category, and unavailable models must not relabel the work.
  Start with one provider, one qualified guarded class, baseline plus one alternative. Validate
  native capabilities; executable discovery alone is not proof that a candidate works.
- [x] Bootstrap candidates using explicit operator-authorized fixed-model qualification assignments
  through the governed entry. Existing native receipts/episodes retain exact pair/capability/host
  proof. Do not require prior router selection to qualify a first candidate; declaration alone is
  not proof. Record later capability failure and require requalification before reuse.
- [x] Bind category and mapping to assignment, scope, source where applicable, policy, approved candidate set
  and baseline. Freeze the resolved pair into the native job request and verify reported identity.
- [x] Short-circuit durable replay before JEV: a persisted request reuses its original category,
  pair/receipt and lifecycle reconciliation with no new call or worker. An existing directory with
  no request returns unresolved-submission before JEV; reconcile ownership before a deliberate new
  job identity, and count any extra decision cost. Reject changed input/policy rather than reroute it.
  Qualify permitted baseline fallback and cancellation; never replace an unknown or started worker.
- [x] Bind continuation to the original assignment, requirement/acceptance digest and class. Keep
  its model and useful cached context. New scope needs a new governed submission; arbitrary
  follow-up prose does not establish a same-task exemption.
- [x] Capture all available JEV, generation, review and repair usage. An authorized later escalation
  links to the original assignment; there is no automatic cheap-model retry cascade in RC4.

**Owners:** a small selection function beside existing provider binding/submission, the shared
decision runtime/catalog, provider request/identity evidence and existing lifecycle/coordination.
Do not recreate a provider client or rebuild the native agent loop.

**Proof:** RC4-F2/F3/F5/F6, including a lower-cost eligible pair, uncertain route, explicit reviewer,
forged override, missing token, unavailable candidate, candidate bootstrap, configuration drift,
zero-call replay, new-task follow-up rejection, native identity mismatch and clean shutdown.
One bounded live qualified host/provider dispatch establishes actual
route feasibility; deterministic fake-native fixtures cover edge cases without a provider matrix.

**Exit:** optional auto plus `route-model` applies the operator's category binding to an eligible
authorized new assignment. Fixed-model default and off/shadow/advice retain the baseline; every
attempt has evidence and unchanged acceptance requirements. Live adoption is a separate choice.

### R4 — Improve local and remote CI recommendations

- [x] Reuse existing pack descriptions and add optional bounded `decision_context` only where useful.
  Capture requirement/changed behavior under normal source permissions. No parallel scenario
  registry or blanket metadata rewrite; target expensive optional integration/device scenarios first.
- [x] Implement explicitly opted-in DL07 v2 questions against those descriptions and exact native
  applicability facts. Reuse the existing advice projection and supported metadata/usage owners.
- [x] Return eligible optional check recommendations and catalog-limited gaps. Use existing measured
  timing only where identity matches; missing history remains unknown. Keep the actual required
  plan, execution order, proof reuse, resource admission and merge rules unchanged.
- [x] Include the original plan identity and whether a caller used the recommendation in outcomes.
  Do not count generated advice or a changed recommendation order as reduced build compute.
- [x] Join advice to already-required completed runs with matching source/pack/input identity. Report
  failed packs advice would have omitted/deprioritized and unknown comparisons. No additional full
  suite, per-test coverage service or actual skip effect follows from this counterfactual analysis.
- [x] Retain applicable platform, tools, source/destination and existing machine-resource facts as
  code-owned eligibility. Local inference must not imply free capacity alongside builds or devices;
  unknown contention stays unknown. No new scheduler/resource monitor is required for this advice.

**Owners:** existing pack declaration/schema, `planning.ts`, `decision-validation-advice.ts`, check/
plan caller preparation and decision outcome reporting. The broader P5 scheduler/reuse work stays later.

**Proof:** RC4-F3/F6/F7: relevant optional scenario, missing description, misleading or incomplete
catalog, required-check preservation, wrong-platform candidate, absent history and local/remote
equivalence of proof requirements. No simulator build is needed merely to prove recommendation logic.

**Exit:** normal plan/check advice supplies useful declared check IDs and scoped gap evidence;
no new test dispatch or omission effect is implied by enabling this feature.

### R5 — Freeze, review and publish RC4

- [x] Freeze R0–R4 implementation and documentation on one exact source candidate. Record supported
  callers, actually enforced host routes, explicit gaps, migration and off/fallback behavior.
- [x] Complete the [RC4 functional matrix](../../reference/2026-09-21-decision-layer-functional-validation.md#rc4-required-proof),
  one complete release-candidate suite/typecheck and installed archive proof. Reuse unaffected
  evidence; no mandatory full device/platform/model cross-product or synthetic productivity benchmark.
- [x] Have Claude perform the independent code and architecture review at the frozen major seam.
  Reconcile material findings and run their affected checks. A design review does not replace this
  implementation review. Keep exact model/effort, reviewed content identity and receipt externally.
- [x] Perform a simplification check against the agreed scope: no duplicate router, new database,
  background evaluator, model-ranking service or always-on per-tool classifier. Keep useful boundaries.
- [x] Under explicit publication authority, use the existing prerelease process for unused
  `3.0.0-rc.4`: exact candidate/archive/lock agreement, non-latest prerelease publication and readback.
  If the tag is occupied, select a new immutable candidate identity rather than overwrite it.
- [x] Prepare migration/adoption instructions naming defaults, opt-in questions/effects, approved
  delegation route, fixed baseline and candidate qualification. All new effects remain off by default.

**Release floor:** functional feature behavior, source/data boundaries, default compatibility,
truthful coverage and one qualified guarded worker/launch path for the same class DL08 can route
are required for the full planned RC4.
R2/R4 advisory implementation and proof can finish without R0b. If no host path can be qualified,
return an explicit scope decision before releasing an advisory-only subset; do not silently drop
the operator's enforcement requirement or build a universal sandbox to close it. Missing comparative
savings does not block an experimental RC. Publication, pilot installation and whole-session
enforcement remain separate claims; an unrestricted coordinator is not qualified by a guarded child.

### R6 — Adopt through real work and decide

- [ ] Use the operator-selected existing adopter checkout. Verify its exact RC4 archive/lock,
  baseline binding, legacy policy disposition, route enforcement, allowed source and task capture.
  Do not create more branches/worktrees merely to adopt, or enroll other repositories implicitly.
- [ ] Activate selected context/quality advice on the supported source scope. Keep the fixed coding
  model initially; DL08 may run explicitly requested shadow category classification. If live routing
  is approved, name the single simultaneously guarded/routable class and the operator's category
  mapping before enabling auto/`route-model`. Explicit reviewer choices stay fixed. CI v2 is
  auto/advice. All arms use the same governed entry; no uncontrolled comparison route.
- [ ] Collect genuine development tasks, including failures and approved fallback. Review missing
  exposure, unexpected model use and bypass attempts early; correct wiring before interpreting ROI.
  Retain budget-exhausted and all other fallback assignments in total outcomes, with separately
  reported actual routed exposure. An exhausted routing arm proves no classifier-quality result;
  inspect demand/assignment timing before changing the shared allowance or adding quotas.
  Keep category accuracy, suitability of the configured mapping, and total accepted-task token usage
  separate. Cheap classification cannot establish cheap execution; include failed/repeated attempts.
- [ ] Independently label a small representative set, including apparently successful cases. Compare
  accepted outcomes, errors, repairs, time and total model usage. Keep separate quality/routing/CI
  comparisons; not all features need activation in the same task.
  Include available cache/cold-start/context-transfer and local contention evidence; a local-request
  percentage or lower per-call price alone is not an accepted-task savings claim.
- [ ] Record keep/revise/disable decisions per consumer and the next bounded release scope. Do not
  claim improved accuracy, fewer tokens or faster builds from feature flags, inferred usage or JEV scores.

Tool-risk classification, cross-provider routing, model switches within live sessions, predictive
check omission, automatic recovery, physical-device removal and full platform expansion remain later.
The R-series adds no release-management or Mnemos adoption prerequisite.

## Next RC experiment batch

This section records the preceding RC3 batch. RC3 implementation and independent review are complete
on the existing implementation branch.
The [implementation reconciliation](../../reviews/2026-09-21-rc3-implementation-reconciliation.md)
records fixes, focused recheck and qualification. Exact publication/adoption readback belongs to the
external release/pilot record; R0 checks that state rather than relaunching release work from this
historical checklist. RC3 contains shared consumers and fixture-qualified boundaries. Installation,
real simulator/device scenarios and measured host benefit retain their separate evidence scopes.

Implemented source now includes assignment-aware off capture, version-2 outcome joins, explicit
DL12 history analysis, entry/effect enforcement, the transactional diagnostic coordinator and native
child dispatch, and DL06 native-bound residual advice. Source tests, type checking, legacy owner
compatibility and installed-package proof passed; Claude Opus 5 high-effort recheck found no remaining
publication blocker. Release readback determines publication completion. The detailed boxes below retain the
programme's field-qualification requirements; they are not all claims made by fixture proof.


This was the RC3 implementation order. S0–S10 remains the programme map; N0–N6 is one bounded
follow-on batch, not a second schedule. The [experiment specification](../../specs/engine-decision-experiments.md)
owns semantics; this section owns dependencies, deliverables, tests and acceptance.
Implementation starts only when assigned. Publish/adopt through existing S3 authority and evaluate
through S4. Do not restart E0–E5 or all first-RC implementation work.
The [review reconciliation](../../reviews/2026-09-21-next-rc-experiments-reconciliation.md) records
source-checked fixes and closure; the [simplification
pass](../../reviews/2026-09-21-next-rc-experiments-simplification.md)
records applied reductions and retained flexibility.

| Priority | Slice | Concrete outcome | Dependency / existing programme |
| --- | --- | --- | --- |
| 1 | N0 — Establish real boundaries and baseline | One supported host event path, one probe catalog and explicit experiment comparison | Current RC; bounded S9/S7 discovery |
| 2 | N1 — Capture comparable episodes | Off/no-call, shadow and treatment episodes survive the same report | N0; extends S1/S4 |
| 3 | N2 — Analyze selected history | Useful native report plus optional DL12 classification | N1; small S10 subset |
| 4 | N4 — Run bounded diagnostic probes | DL05 read-only sequence with replay/authority/cleanup proof | N0/N1; read-only S7 subset, no broad S6 prerequisite |
| 5 | N3 — Observe attention decisions | DL06 shadow/advice only; traffic gate before any later live effect | N0/N1; small S9 subset |
| 6 | N5 — Freeze, review and publish candidate | One qualified immutable RC containing supported experimental capabilities | N2–N4 local proof; existing S3 release process |
| 7 | N6 — Adopt, compare and decide | Real-work baseline/shadow/one-effect activation and individual dispositions | N5; existing S3 adoption/S4 measurement |

N3 and N4 are independently gated. An unavailable host event boundary does not block offline
analysis or read-only diagnostics. Record attention as shadow/advice/unsupported in this RC; do not invent a
background supervisor to make the release look complete.
Full local-CI plan shaping, automatic recovery, model-tier routing and release automation remain
in their existing later slices. This batch adds no predictive omission of required checks.

The design review has fixed the initial scope: N3 has no live suppression/coalescing effect in this
RC. Current engine events are code-classifiable and its push path carries protected terminal results.
N0 may identify a later useful host boundary, but cannot silently expand this release's scope. N4
is the first controlled execution experiment. N2 is on-demand; it does not perturb live task routing.

### N0 — Establish boundaries before adding hooks

- [x] Read the current RC's `workflow-executor.ts`, `workflow-wait.ts`, `completion-delivery.ts`,
  `host-api-v1.ts`, `decision-device-advice.ts` and `decision-outcomes.ts`. Record the current
  owners, known automatic progression and gaps. Inspect the selected adopter read-only first.
- [ ] Select an existing authorized worktree and host adapter. Capture at least a healthy progress
  episode, an ambiguous update and a failed/unclean outcome from available traces or bounded wiring
  proof. Distinguish actual LLM wakeups from events that the worker already handles internally.
- [ ] Enumerate current event kinds and actual host deliveries; quantify the residual after code-only
  filtering. The RC read boundary is `workflowObservationCommand` after `workflowWaitCommand` returns.
  No residual means no classifier call. Record missing turn/timestamp observations as unknown.
  A future live effect needs a supported pre-wake boundary and separate qualification; this RC does
  not add a push adapter, cursor queue or change mandatory terminal notices.
- [ ] Select one RN iOS simulator adapter and a digest-bound manifest of at most eight reviewed read-only
  recipes. Resolve
  exact source/artifact/target observations and action grants. Mark unavailable observations unknown.
  Decide which useful observations survive parent cleanup; captured logs and current state differ.
- [ ] Define one code-only runbook, the optional JEV choice, and one compact handoff. Freeze the
  initial three-probe/three-selection-call limit and persisted absolute episode deadline. No
  reset/rebuild/relaunch in this slice.
- [ ] Freeze both arms at 16 calls/131072 bytes per task revision, keep unrelated consumers off, and
  retain budget-exhausted counts. Freeze the pilot assignment and error tolerances in the external pilot
  record, retaining
  no-token/off baseline and actual usage coverage. Keep target paths, native commands and evidence
  outside this checkout. Missing episodes are a collection gap, not invented baseline data.

**Exit:** an implementation-ready integration map and representative inputs. No broad test run,
paid inference, device build or new worktree is needed solely for this discovery checkpoint.

### N1 — Comparable episode evidence

- [x] Extend `decision-outcomes.ts` with the version-2 manifest contract; continue reading version 1.
  Accept zero-decision baseline episodes only with bound caller/native identity. Reject conflicting
  workspace/task/revision links. Preserve failed/cancelled, unsupported and fallback episodes.
- [x] Add the assignment-aware episode recorder to `decision-workflow-observation.ts` and the diagnostic
  entry before consumer/global-off early returns. Write immutable `episodes/<id>.json` under the
  existing state root; bind identity, assignment, native refs, exposure and empty-or-populated
  decision IDs using existing `durableJson`. The prewritten assignment record exposes missing
  captures. Native behavior survives optional recording failure; expose a collection-status field
  outside the broad optional-advice catch. Extend existing caller/telemetry records with native delivery IDs,
  diagnostic child links and known usage/timing provenance. Keep capture bounded and reuse current
  receipt stores. Assignment occurs before treatment; never rewrite it when JEV falls back.
- [x] Keep analytics failure separate from operational safety. Failure to persist a diagnostic reservation
  disables that effect; failure to project an optional report does not
  stop a healthy job or erase its required evidence.
- [x] Reuse `decisionTelemetry(...).pilot`, which already reads version-2 `decisions/` receipts.
  Add assigned-episode joins rather than another collector. Deduplicate native command request/check
  result digests report-wide, event/receipt/reservation IDs and nested child costs. Retain unknown metrics and
  reader/retention gaps. Do not derive LLM tokens from log bytes or classify model labels as truth.

**Checkpoint T1:** focused outcome/telemetry tests: old manifest compatibility, off episode,
invalid/mixed binding, failed/cancelled inclusion, duplicate child spend, missing usage and loss.
**Exit:** one report can compare both arms without requiring successful JEV calls in either arm.

### N2 — Offline history analysis

- [x] Register DL12 questions under the existing provider interface and shared analysis-task budget.
  Wire `telemetry decisions --outcomes-manifest <file> --classify-history` to the v2 manifest's
  optional analysis block (task/revision, input digest, selected excerpt refs, procedure candidates).
  Use existing cancellation and the shared command argument parser for managed write admission. No new scope flags or
  analysis manifest format. Derive fixed `decision-history` task identity and the revision from
  canonical selected-input/question/preparation/model digests; reject manifest identity mismatches.
  Terminal reports close scopes that reserved calls; rerenders reuse receipts, crashes resume the
  same remaining allowance, and scope-closure failures stay visible. Reporting without that option stays
  read-only and makes no provider call.
- [x] Produce native aggregates regardless of credentials, optional work-class labels, and reviewed
  procedure matches only when supplied. Report unclassified/mixed/unknown and versioned labels.
- [x] Rank candidates from measured frequency/cost and cite representative episodes. Label
  classifications as proposals; never automatically edit policy or install a procedure.

**Checkpoint T2:** focused history tests: provider-free report, bounded selected inputs, repeated
analysis reuses receipts, source permission/withdrawal, mixed/unknown, malformed response and
no execution; identical inputs cannot mint a fresh task/revision allowance. Manually adjudicate a small
real-history sample later; fixtures prove plumbing only.
**Exit:** an independently useful report, without a new analytics service or historical warehouse.

### N4 — Read-only diagnostic sequences

- [x] Register `runtime.next-probe/2` separately from advisory `/1`. Only diagnostic entry with
  explicit `choose-read` may instantiate `/2`; auto may execute, shadow scores the same choice but
  executes the baseline. An advice-only profile cannot send `/2`. Enforce entry/question/effect compatibility
  in shared request validation as well as the caller.
  Add registered ask/receipt/episode entry kinds and separately report configured, question-applicable
  and delivered effects. Observation remains advice under a choose-read profile; forged observation
  `/2` requests fail before transport. Keep current `workflow-status`/`workflow-wait` observations non-dispatching.
- [x] Add `workflow-diagnose` through the existing command/worker owner and typed host entry. Bind
  parent/task/revision, native snapshot and full probe-manifest digest; require reconciled parent
  cleanup. Define the engine-owned manifest schema (up to eight IDs/descriptions/recipe documents/
  host-approved bindings). Resolve operations through the existing operation catalog. Before inference,
  the host prepares each distinct authorized local-check action and exact workflow binding. Never
  reuse the parent's action. Retire unused actions through the normal host lifecycle. Add the command
  to managed write admission; record the selected scope before any model call or child submission.
- [x] Add a small transactional diagnostic reservation/attempt record to `WorkflowStore`, migrating
  engine schema 1/2 to 3 atomically on the first diagnostic episode/reservation write, not store open. Keep
  aggregate slot reservation and coordinator owner fencing;
  deterministic child IDs alone do not protect the shared cap. Persist the absolute deadline before
  dispatch. The new constructor preserves schema 3; ordinary opening with diagnostics off leaves
  schema 2 intact. Older binaries must refuse schema 3; adoption drains old readers and uses forward repair
  after new writes. Prove migration on a copied ledger without modifying the adopter during staging.
  Reuse ordinary child workflow recipes, process handles and resource
  leases; never mutate parent recipes or create a second execution daemon.
- [x] Drive code-first, then bounded-choice selection, revalidation, durable reservation, child
  execution and fresh observation. Maximum three submissions, at most one per recipe, including
  blocked-before-run submissions.
  Clamp child execution deadlines to the remaining persisted episode deadline without mutating
  host-approved recipe/binding digests. Expiry stops dispatch
  and settles children; cleanup cannot be abandoned to meet the deadline. Restart observes prior
  children and remaining limit; it never renews the deadline or resets attempts.
- [x] Stop on unknown/stale/failed probe or lost ownership; preserve parent failure and return one
  compact diagnostic packet. A completed diagnosis does not claim the app is repaired or tested.
- [ ] Implement one adopter-owned simulator evidence/probe adapter when the selected host worktree
  is authorized for edits. Record exact adapter/package identities outside this repository.

**Checkpoint T4:** focused workflow tests: useful two-probe sequence, code-only/no-token route,
unknown handoff, source/target/grant change before dispatch, malicious/unregistered recipe,
advice-only never emits `/2`, shadow never dispatches a model choice, three-probe/deadline exhaustion,
restart after expiry, two concurrent coordinators, crash after reservation/dispatch, duplicate invocation,
failed/unclean child and global disable while a child is active. Test critical boundaries once,
not their full Cartesian product. Simulator proof is one happy and one controlled diagnostic case;
reuse unaffected build artifacts where valid. No physical unplug/reconnect test.
**Exit:** one bounded sequence executes eligible probes and returns their results without extra LLM
orchestration turns. Current probe advice is the comparison starting point, not a new benefit.

### N3 — Attention observation (after N4)

- [x] Register DL06 with advice as its only supported effect and off as its default. Register
  `iteration.attention-needed/1`; freeze rubric/unknown handling. Do not add `route-attention` to
  the schema for a capability that has no qualified live caller.
- [x] At the existing workflow observation boundary, count code-classifiable events and genuinely
  ambiguous eligible supplied observations. Use fixed `attention:<run-id>:iteration.attention-needed/1` as
  decision event identity; assess
  only the first eligible observation. Later changed excerpts are unassessed, not a new call; count
  them separately. Existing SQLite event reservations enforce this sub-bound across processes. No eligible
  residual means zero calls. Retain native wait/status results and timing contracts.
- [x] Record shadow labels or return advice using the shared mode behavior. Capture independent
  reviewer labels and available host delivery/turn timestamps. Unsupported observations stay explicit.
- [x] Record the live-promotion prerequisite as a later candidate: actual residual traffic, supported
  pre-wake boundary, protected-event bypass, original wait deadline (currently at most 30 seconds),
  durable delivery/replay owner and observed benefit. Do not implement that machinery in this RC.

**Checkpoint T3:** focused tests: structured events need no classifier; real supplied ambiguous
observation; protected events bypass; no-token/unknown/timeout; unchanged native outcomes and
shadow presentation; repeated polling with different excerpts still has one transport call; missing host
metrics remain unknown. One host wiring observation
at N6 proves actual exposure only, never suppressed wakes.
**Exit:** a bounded answer to whether attention routing is worth pursuing, without speculative
notification infrastructure. No claim of avoided LLM turns from this RC's attention experiment.

### N5 — Freeze, review and release

- [x] Freeze the coherent implementation. Run T1–T4 and existing decision tests at their checkpoints;
  at the release boundary run `npm run typecheck`, `npm test`, `npm run pack:engine`, then
  `node components/engine/scripts/verify-package.mjs <exact-archive>`. Extend that verifier with
  installed off/shadow/effect opt-in, version-1/2 reporting and bounded child dispatch fixtures.
  Use the release workflow's declared legacy Python/wheel proof if its boundary is affected.
- [x] Independent Claude architectural/code review focuses on unchanged attention delivery and action
  reservation seams plus evidence validity. Reconcile meaningful findings; rerun only affected
  proof during repair, then certify the frozen release candidate under the release process.
- [x] Verify conservative write admission for `workflow-diagnose` and classification-enabled telemetry,
  with ordinary reporting still read-only. Prove schema 1/2 migration, rejection by older binaries,
  first diagnostic-write stamping, open-with-off preservation, and no-new-writes restoration versus
  post-write forward repair under existing generation markers. Release notes state that new
  DL06/DL12 profile keys and v2 manifests are not readable by rc.2; both experiment arms use the same
  new RC. Restoring old configuration alone does not downgrade a migrated ledger.
- [x] Separate deterministic fixture results, live provider assessment and native host/device
  evidence. Record unsupported capabilities and default-off flags in release notes. Prove disabling
  effects preserves in-flight cleanup and original terminal completion delivery.
- [ ] Under publication authorization, select an unused RC, bind the exact source/archive/metadata,
  publish prerelease/non-latest and read back hashes. No new publishing tool or stable release here.

**Exit:** an immutable candidate with honest capability limits and a reproducible proof packet.
Positive JEV savings are not a prepublication requirement. Missing safety/wiring proof is not
excused by default-off configuration; unsupported host effects must remain unavailable.

### N6 — Adopt and decide using ordinary work

- [ ] Pin the exact candidate in the selected existing worktree; reconcile current hooks/jobs and
  verify normal entry, required checks, delivery and cleanup before treatment. SDK/app publication
  is outside tooling adoption. Do not create another branch just for this pilot.
- [ ] Retain code-only baseline assignments and enable qualified bounded effects actively when the
  operator chooses that pilot. Shadow remains useful for unqualified callers, not a mandatory delay
  for every consumer. Use a small independent labeled sample for
  semantic quality; publish coverage and unresolved cases. If no useful attention traffic remains
  after code filtering, record no demonstrated need and keep that live effect off.
- [ ] Activate qualified effects with interleaved off assignments. The operator may start with a
  balanced active bundle; retain its complete consumer set and reserve individual attribution for
  later focused comparisons. Use the same RC, comparable
  tasks/environments and required proof. Preserve assignments through failures/fallback and include
  reopened work. Do not run every development task twice for a comparison.
- [ ] Inspect initial attention labels and all diagnostic episodes for wrong advice, wasted probes,
  stale inputs and rework. Stop on the specification's critical conditions; ordinary errors use
  the predeclared tolerance. Report actual usage/turn coverage rather than projected savings.
- [ ] At the predeclared window, choose adopt, refine, optional/inconclusive or retire per experiment.
  Preserve reasons and representative evidence in the external runbook. Change defaults only via
  a deliberate later release/configuration decision, never automatically from a model score.

**Exit:** a bounded field decision. Negative or sparse results are useful outcomes and do not block
unrelated RC consumers. Return to S5–S10 according to demonstrated value; full local-CI planning
and recovery remain available opportunities, not implicit requirements for this batch.

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
  Use the [first-RC configuration and budget
  contract](../../specs/engine-decision-layer.md#first-rc-configuration-and-aggregate-budget):
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
- [ ] Use independent flags or a declared active bundle initially. A bundle comparison measures the
  combined intervention; use a focused comparison for individual attribution and a declared comparison for
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

N4 brings the read-only post-run sequence forward. It requires existing recipe dispatch and action
authority, not completion of every S6 local-CI planner feature. Remaining recovery scope follows here.

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
device execution effects only when qualified. Every advertised enabled feature needs its own evidence and
reliable fallback.
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

N3 brought bounded optional-event attention observation/advice forward. RC4 R0/R1/R3 now brings
DL08 routing of new assignments forward under its single-owner policy and required-governed pilot.
Worker steering, live attention suppression and produce/verify/retry cascades remain later; do not
duplicate N3 or R3 implementation here.

Deliver DL06 repetition/scope-drift advice and DL08 model-tier/produce-verify-escalate comparisons.
Start with observation/advice; native host ownership, explicit model choices and required verification
remain intact. Count all attempts, verifier/escalation cost, wrong interventions and repair. A healthy
worker must not be interrupted because a provider failed or a build was quiet. Use real outcomes and
separately qualified effects, then release/update/measure as above.

## S10 — Optional release and learning consumers

N2 brings the small DL12 offline history report forward. Release preparation, signal grouping and
more advanced historical prediction below remain later.

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
