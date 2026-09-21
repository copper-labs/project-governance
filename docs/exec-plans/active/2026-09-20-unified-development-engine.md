---
id: plan.unified-development-engine
title: Unified Development Engine Transition
type: exec-plan
status: active
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Decision-first transition to a shared development engine, proving a real workflow before broad migration.
---

# Unified development engine transition

The operator accepted the unified direction. The [architecture decision register](../../specs/unified-development-engine.md)
owns the target planning baseline. The operator refined it to design Mnemos integration now, adopt
later, decide migration aggressively by category, and qualify RN iOS simulator then real devices.
The [inventory and N1–N13](../../reference/2026-09-20-engine-migration-inventory.md) are the next decision
set. The operator subsequently approved the specifications and this plan and authorized autonomous
implementation through E5, including E3/JEV and wired iPhone qualification. Use the recorded
recommendations for the approved decisions. External publication remains separate from local
implementation, preview adoption and installed-artifact qualification.
Further host projects pressure-test the architecture; they do not add full host adoption or release
management to the first iteration. Both traditional remote and local CI are required, and the operator
reports GitHub local-CI authorization already exists. Preserve that established integration.

The prior [S1–S9 adoption plan](../../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md)
retains useful requirements and source evidence. It no longer prescribes the next implementation
order. Existing runtime owners/contracts remain effective until their explicit replacement. Do not
repeat the completed monorepo migration or represent older review receipts as approval of this design.

## E0 — Settle the architecture and preserve requirements

- [x] Inspect current ownership, the existing TS continuity core and Python execution boundary.
- [x] Prepare decisions with recommendations, costs and alternatives, including TS and optional JEV.
- [x] Route active planning here while preserving existing implementation and historical evidence.
- [x] Inventory all tracked runtime/payload/control/test source in scope; categorize 352 files and
  account for all 13 shipped packs, optional KMP validation, Git/task hooks and source CI.
- [x] Record intent, proposed treatment and category-specific cutover proof in C01–C18.
- [x] Specify Mnemos identity/scope/projection/freshness/withdrawal/lifecycle needs now; defer adoption.
- [x] Specify RN iOS simulator then RN iOS physical round-trip and recovery matrices.
- [x] Investigate existing local-CI/container/VM work read-only and specify execution placement,
  environment trust and protected merge evidence in the [local-CI contract](../../specs/engine-local-ci-and-merge-contract.md).
- [x] Pressure-test a second stack and its multi-component releases; record the minimum
  [capability boundary](../../specs/engine-capability-boundaries.md) without adding full release implementation.
- [x] Record category dispositions and N1–N13 before dependent implementation; distinguish retained
  intent from an intentional enforcement/feature change.
- [x] Audit the authorized adopter's actual installed hooks, target packs, policies, runner/resource
  owners and legacy integrations; source inventory is not proof of installed adoption.
- [x] Record accepted N11 in charter, AGENTS and the owning specification for explicit preview
  execution: shipped schemas retain machine constraints, code enforces them, and Markdown owns
  rationale, judgment and rule-change authority. Existing installed owners remain active until
  deliberate cutover; no threshold change or automatic startup activation is implied.
- [x] Map S1–S9 requirements to E1–E6 and retain live source contracts for existing behavior.
- [ ] Before each category cutover, complete clause-level parity/change cases, migration/readback,
  retired-file list and any deliberate consumer/configuration update.

Decisions gate only dependent work: E1a may prove seams under the current policy without settling
all categories. N11 gates promoting C14's new authority; N1/N2/N3/N5 and category dispositions gate
their replacements; N4 gates physical scope; N8–N10/N13 gate the selected CI pilot; N12 gates
activation/recovery design. N7 gates real memory scope in E6, not fake-port proof.

Exit for E0 closure: category/release decisions, current authority and target architecture are unambiguous. No
feature retirement, default enforcement change, or installed migration is inferred from planning approval.

## E1 — Prove the risky boundaries and first workflow contract

### E1a — Source-only seams

Uses the E0 planning baseline and current authority; unrelated pending cutover decisions do not block
this experiment. Validate the selected TS/Node/storage/process boundary with focused source proof:
critical transaction plus event, competing observers, interrupted submission, child process cleanup,
worker restart, same-job resumption, runtime-validation failure and packaged invocation. Define the
[memory port](../../specs/engine-memory-boundary.md) and test fake-provider lag, scope, withdrawal and
unavailable behavior before freezing core records; include stable projection-intent/withdrawal identity
and the provider watermark contract, without requiring provider storage in the critical transaction.
No Mnemos package dependency. Establish pure-output
comparison fixtures for C02/C05/C08/C14 so faster construction cannot change gates unnoticed. Select the
Node/SQLite combination from that proof. Keep one active execution owner throughout any experiment.

Prove the [host resource owner](../../specs/engine-workflow-and-device-contract.md#host-resource-authority)
across two repositories and independently pinned engine versions: canonical registry identity,
compatible protocol, competing acquisition, stale-generation refusal, interrupted handoff and owner
loss. No repository-local lease may substitute for that resource authority. Existing qualified project
owners can supply it; otherwise use the small host registry, without a daemon or second supervisor.

Define local/VM/hosted capability and profile bindings now, alongside exact head/base/integration
candidate identity and the optional result-publisher interface. Use fixtures for stale candidate,
missing capacity, worker loss, untrusted evidence, publisher credential reachability and publication
recovery. Fixtures test the contract; actual isolation is qualified in the CI pilot. Keep one proof planner
and project command catalog; reuse the same durable job/evidence records. Do not require a VM,
GitHub App or hosted credential for ordinary local operation.
Use one small fake external-operation adapter to pressure-test version/availability, authority,
lost-response observation and cancellation with outstanding effects. Distinguish local critical
state from an optional capability's stronger shared custody/admission needs. This is contract proof;
do not build a distributed store, cloud deployment adapters or a plugin registry for E1.

Define the C16 preparation surface (`harness prepare`, or its explicit major-version mapping),
public executor/adapter field requirements and host wake/no-wake modes. Reuse sufficient owner
artifacts rather than inventing a protocol version. A fake host proves both observation paths;
actual host capability and usage coverage are recorded in E1b.

Exit: seam fixtures, owner/protocol decisions, failure cases, migration limits and a compiled preview
artifact. No device, adopter access, provider account or GitHub credential is required to close E1a.
Record the registry protocol/schema compatibility matrix, minimum supported reader/writer window,
sole maintenance/migration owner and blocked-older-client remediation. Prove that ordinary resource
acquisition cannot upgrade the registry or silently strand a participating pinned engine. Include a
schema-independent version probe and concurrent initialization: only one initializer may create the
registry; a loser re-reads and refuses an incompatible version instead of overwriting it.

### E1b — Authorized runner and baseline assessment

In an explicitly authorized adopter assignment, assess the actual first runner and record its
reuse/repair/replacement decision. The recommended first lane is RN iOS on a simulator, including
Metro/service identity, stale state, changed bundle and host interruption. RN iOS physical devices
follow the simulator; native iOS is later. Follow the [workflow contract](../../specs/engine-workflow-and-device-contract.md).
Capture the current coordination/time/usage baseline and a minimal structural map. A source fixture
cannot close actual runner or device evidence. No adopter identity or runtime receipt belongs here.

Record the actual host's wake capability and instrumentation coverage: accepted/reopened outcomes,
whole-loop wall time, attributed interventions and native token totals across host/children/providers.
Mark unobservable fields unknown; any manual timing/labels declare their collection method. After
the baseline and before candidate comparison, freeze meaningful improvement/regression thresholds
and uncertainty assumptions in the evaluation manifest. Missing token coverage cannot justify a token
savings claim; it does not invalidate independently measured reliability or elapsed-time benefit.

Exit: bounded recipe, trusted operations, actual resource-owner/host capability map and a usable
baseline for the selected comparison. This is a small workflow assessment, not a framework project.

### Preview execution before installed cutover

E1a builds the compiled Node package locally. Authorized E1b/E2/E4 work invokes its exact entrypoint
from an isolated preview directory, with artifact/dependency digests and a separate preview ledger.
Do not replace default commands, hooks, the installed lock or the existing runtime. The preview
manifest records experiment identity; it is not a second editable product lock or an updater.
Do not copy or adopt live jobs from the old ledger. Both versions use the qualified resource owner;
only one may own each effect. If the old runner cannot participate, drain its conflicting resources
and verify that fact before the preview starts. Existing installed checks still use their owner.

Preview evidence names its artifact, environment and limited installed-product coverage. E5/D must
prove the final package/activation path and rerun affected workflow claims before product activation;
it cannot inherit preview qualification just because source files match. No preview publication or
adopter execution is authorized by this document.

## E2 — One complete provider-free workflow

Depends on E1a and the selected E1b assessment. Deliver one coherent user-visible path: task/source binding, basic working context,
required proof, approved workflow dispatch, stage progress, assertions, cleanup, interruption/resume
and review handoff. Implement only the necessary vertical slice of the shared model and adapters.

Its worker advances known permitted transitions and records meaningful change/completion/intervention
events. Qualified wake-capable hosts receive those events. Without wake support, use a bounded explicit
wait/inspect operation; no model-driven polling loop or LLM decision per transition. Report delivery
and observation latency separately from workflow execution. Stage controls are capability-based. Missing resources become actionable blocked states;
unconfirmed cleanup remains unresolved. Native result parsers preserve failure/unknown distinctions.
Measure actual host reads/turns where available, native usage coverage, wall time, recovery and rework.

Exit: one actual workflow completes and recovers under the named ownership contract without repeated
LLM management of ordinary lifecycle transitions. Record wake-capable or explicit-wait acceptance
and measure against that actual mode; do not claim unattended host wake where unavailable.
Correctness and required proof cannot regress.
No-model and no-account operation are tested. Exercise every simulator acceptance case in the workflow
contract; bind separate native binary and JS bundle identities. No general relevance engine or Mnemos
adoption requirement. This slice does not claim whole-runtime migration completeness.

### Local-CI pilot alongside E2–E5

After E1a and the remaining N8–N10/N13 integration choices, in a separately authorized adopter assignment.
This pilot collects its own baseline; it need not wait for the RN baseline or a device:

1. Inventory actual CI checks, required statuses/rulesets, merge methods/queue availability, credentials,
   environment qualification and remaining provider work. Read-only source cannot establish live settings.
2. Qualify one existing Linux check and one narrow macOS VM check using immutable candidates and the
   canonical commands. Compare cold/warm timing, profiles, assertions, cleanup and local/hosted residuals.
   Reuse qualified project adapters; do not build a general VM image factory or runner fleet.
   Candidate processes stay inside isolated execution and do not control host Metro, simulators,
   devices or shared mutable outputs. The controller owns host capacity. Host-device CI delegation
   remains a separate qualification; this does not narrow the native RN development lanes.
3. Integrate one existing authorized local-CI producer/check path and retain traditional remote CI.
   Name the actual executor/publisher isolation boundary and prove candidate code cannot reach a
   canary publisher credential or bypass result validation. Separate same-user processes alone are
   insufficient. Test result provenance, candidate replacement, bounded fallback and ambiguous publication; do not
   require a new App or runner registration merely because the engine changes.
4. Verify adapter parity and source/candidate readback. Only if the remote integration must change,
   use an authorized non-required pilot followed by deliberate required-check cutover. Prove protected
   merge freshness and destination readback. Avoid redundant execution for equivalent coverage.

Recommended first scope is publication/observation of protected merges performed by the operator or
existing platform automation. N13 settles any engine-initiated merge requirement before pilot scope
freezes. Server-enforced candidate freshness is required either way; custom merge orchestration is
not implied by CI integration, and existing authorized host/platform merge paths remain available.

This lane does not postpone RN simulator-to-physical progression and is independent of JEV/Mnemos.
E5 includes the agreed core interfaces and only the declared qualified provider scope. Fleet operation,
all-platform VM proof and remote merge activation are not implicit gates for the first core release.

## E3 — Early JEV and context improvement lane

Implementation begins after E1a supplies stable question/evidence identities; comparison requires its
own frozen retrieval baseline, which can be collected independently of RN E1b/device completion.
Package one preferred JEV adapter behind the narrow interface. First compare optional
context ranking; test another mapped recurring question only where it has a concrete consumer/cost.

Use offline and owned live shadow comparisons, then an explicitly enabled workflow comparison.
Measure candidate omissions separately from ranking errors; include abstention, stale inputs, rate
limits, timeout and native usage. Compare question batching where supported without replacing quality
or latency limits with a price-only decision. Test zero-network off/missing-token behavior and bounded
cross-process outage suppression. Paid calls/private-data export need their applicable authorization.

E3 owns `continuity.decisions` schema/default validation, doctor visibility, configuration migration,
and bounded nonsecret cooldown storage outside critical ledger transactions. Select evaluator-owned
and/or runtime-owned shadow execution explicitly; prove cancellation, bounded concurrency, usage
accounting and no late packet mutation. The detailed decision and operational-store contracts apply.

Exit: qualified benefit, explicit no-benefit or inconclusive result per question. Provider-free E2
continues independently. Retain versioned evaluation cases for later question/retrieval tuning.

## E4 — Extend proof and platform coverage

Depends on E2 for the initial actual device qualification; independent of E3/JEV. Qualify **RN iOS on
real devices next**, with pairing/unlock/signing, source/binary/bundle binding,
resource contention and cleanup. Physical removal/disconnect/reconnect testing is deferred by the
operator for this iteration; it is not an E4/E5 completion or activation gate. Worker interruption,
cancellation and cleanup remain in scope. Recommended E4a is wired RN iOS, E4b is wireless RN iOS if selected
by N4. No simulator substitution. Exercise the physical acceptance matrix; device unavailability leaves
that proof pending while independent work proceeds. Native iOS and broader platforms follow. Carry the required
native/RN/Flutter/other platform matrix into successive authorized adopter slices; not all platforms
must wait for one another, and none inherits another lane's proof.

Extend the structural map where it improves retrieval or required-proof planning. Add completed-result
reuse only for an owner-qualified claim and complete applicable inputs; independent CI/release gates
retain their trust boundaries. Adopted local/VM execution can satisfy CI under the local-CI contract;
independence does not mandate GitHub-hosted compute. A simulator cannot substitute for physical proof.

## E5 — Migrate remaining owners and qualify one product

Recommend one coordinated major core release after N1 and the C01–C18 dispositions are accepted.
Build by category in this order; merge coherent source work without releasing permanent mixed-runtime
wrappers. Each implementation checkpoint has its own focused proof and a declared cutover disposition.

| Batch | Categories | Acceptance before inclusion in the candidate |
| --- | --- | --- |
| A — Shared identity/policy/state | C01, C02, C14, C16; C17 identity seam | Current/dirty/staged subjects, task/evidence history, findings, exceptions, schema/version refusal; projection-intent/withdrawal identity and provider watermark contract before schema freeze; N11 before promoting policy authority |
| B — Execution/host/device path | C03, C04, C05, C18 | One lifecycle owner, hook boundaries, native providers, same-job recovery, RN simulator/selected physical proof, declared local/VM capability and cleanup scope |
| C — Checkers and knowledge | C06–C11, C17 JEV seam | All selected pack semantics, native adapters, KMP opt-in, required context and immediate no-token fallback; no mandatory paid provider |
| D — Product activation | C12, C13, C15 | Package/lock transition, init/update/repair, authored content, isolated activation, accepted N12 recovery and soak policy, retained telemetry, measured benefit and installed-workflow requalification, release proof and any explicitly adopted CI authority cutover |

A supports B/C; package proof begins in E1 and is consolidated in D. This table decomposes E5 work,
not a second independent roadmap. E2/E4 supply B's actual workflow evidence and E3 supplies optional
model evidence. Actual platform claims must match completed proof; all-platform support is not a
first-release gate. A deferred existing capability must be an explicit product decision, never an
unreported casualty of language migration.
The optional release capability is new future scope, not an existing generic capability silently
removed by migration. E5 carries the qualified extension contract; no first-core-release gate requires
another host's production deployment, shared release store or complete release controller. Later adopter
plans reconcile their current owners and older runtime assumptions before invoking the new boundary.

Before activation, reconcile/drain jobs under the old owner, migrate preserved records/artifacts,
verify imported identities and rule/waiver semantics, and take a coherent recoverable backup. Rollback
must account for schema changes and post-cutover writes; do not just swap executables. Retire the
replaced source after owner cutover and readback. The current installation remains usable during
construction. No compatibility shims or live dual supervision.

Activation requires both category parity/declared changes and the E1b/E2/E4 outcome evidence against
predeclared thresholds. At least one selected workflow must demonstrate useful accepted-work benefit,
with no required-proof or correctness regression; unmeasurable or inconclusive benefits stay explicit.
If this fails, keep the installed product, repair or reduce the ineffective intervention and repeat
the affected comparison. Revisit scope explicitly if needed; do not silently default to permanent
Python/TS wrappers or justify adoption by effort already spent. This is release acceptance evidence,
not a new per-task approval layer, and does not authorize publication.

Before activation, qualify the final installed artifact's invocation, dependencies/offline behavior,
host attach, build/install/bundle identity, observation and cleanup on the selected RN targets. Rerun
scenario assertions whenever changed packaging/runtime/adapter inputs can affect them; otherwise
record the owner's applicability evidence for their reuse. Do this before replacing a live store.

N12 must select recovery before activation design closes. Recommended policy: coherent backup and
reversible activation before new writes; after new writes, quiesce dispatch and forward-repair while
preserving new history/artifacts and unresolved effects. Never restore an old backup over new proof.
Declare soak duration/workload, success/abort criteria and responsible recovery owner before rollout;
exercise a defect after new writes, restart, export/readback and no-loss recovery. Exports preserve
inspectability, not proof that the old runtime can execute new records. If post-write downgrade is
required instead, qualify a supported reverse path before activation. This remains an explicit
operator release choice, not a claim of implemented reversibility.

Transition packaging only after the accepted D11 contract has installed-artifact/update/repair proof.
Retain one release identity and one lock authority throughout. Run broad proof at the applicable
release/schema/process-isolation boundaries under the validation strategy, not after every edit.
Publication and adopter rollout remain separately authorized. Release claims name exactly what is
qualified; test counts from previous snapshots are not transferable proof.

## E6 — Mnemos integration when its first consumer is defined

The [projection contract](../../specs/engine-memory-boundary.md) is specified now and receives fake-port
proof in E1; it is not delayed to this stage. Adopt/install a real adapter only here, after a concrete cross-task or procedural
retrieval need exists. Compare the exact public TS package artifact with the baseline context provider.
Qualify cancellation, lifecycle, scope, freshness and degraded behavior. SQLite retains execution
state; a critical-store replacement is a separate decision and durability/migration exercise.

## Coverage carried from S1–S9

| Previous requirement | New owner |
| --- | --- |
| S1 install/repair/host lifecycle | Minimal packaged proof E1/E2; full cutover and release E5 |
| S2 telemetry/evaluation | Manifest/fixtures E1a, RN baseline/thresholds E1b, observations E2, independent retrieval comparisons E3 |
| S3 deterministic packet | Basic context E1/E2, retrieval quality E3/E4 |
| S4 runner reliability/coordination | E1a protocol seams, E1b actual runner assessment and E2 workflow |
| S5/S6 simulator/physical workflow | E2 simulator and E4 physical/platform qualification |
| S7 optional JEV | E3 early independent lane |
| S8 source discovery/index | Shared modest map E1/E2, evidence-led extensions E4 |
| S9 release/adoption | E5 per declared scope |

For each slice, deliver updated owning contracts and one compact receipt for source, outcomes,
measured overhead, limitations and next action. Review at a coherent boundary. The decision map,
no-token fallback, evidence limits and balanced flexibility requirements remain applicable.

## Active implementation — 2026-09-20

The operator approved the full plan through E5. N1–N13 use their recommended dispositions: one
coordinated TS product, preserved checker semantics, retained provider helpers, wired RN physical
proof, deliberate major adoption, fresh source CI, deferred Mnemos, both CI paths, isolated pilot
execution, bounded fallback, explicit rule ownership, no-loss forward repair and publication/merge
observation first. E6 real Mnemos adoption and full release orchestration remain later scope.

Implementation checkpoints: E1a core/package/resources; E1b actual runner and baseline; E2 complete
RN simulator; E3 optional JEV with measured comparisons; E4 wired device; E5 category parity, product
activation and recovery. Core-flow tests are required, without exhaustive combinatorial matrices.
Only after implementation and qualification complete, request Claude Opus 5 extra-high architecture
and code review and reconcile findings before final completion. The current goal remains active until
all requirements are supported by actual evidence. No source fixture substitutes for device proof.

## Operator-approved adoption boundary

The operator approved finishing and reviewing the upgrade in the existing isolated adopter
worktree, with shared automatic startup cutover as a separate, deliberate adoption step.
Explicit invocation of the new engine remains the qualification path. Shared native-hook
registration, host trust/event delivery, and the related startup-instruction replacement are
not implementation-completion or final-review gates for this iteration. They remain unfinished
adoption work owned by the operator and the adopting project's maintainer.

Do not change shared registration or partially replace startup instructions during this iteration.
Automatic startup retains the existing setup; do not claim native automatic adoption, dual-runtime
cutover, or a completed activation soak. The deferred cutover must still qualify ownership,
backup, trust, event delivery, coherent instruction transition, readback and recovery before use.
This deferral does not waive implementation, explicit installed execution, core device flows,
category semantics, optional-decision evaluation, or the final extra-high review.

## Current completion work

Latest coherent source boundary: 407 engine tests, 72 continuity tests and two release-metadata
tests pass, with type checking. Ten new capability/CI contract assertions also pass against installed
compiled modules, and 38 JEV/context assertions pass against the rebuilt package.
The current preview archive installs offline and passes the installed workflow evidence-environment
tests. Packaging now selects only the compiled engine and continuity trees, excluding historical
wheel artifacts and the obsolete root distribution lock. Prior public/continuity help and stdin-import
proof remain recorded separately.
The formatter scope correction and optional-decision tests have compiled archive proof. This
is source/package evidence; installed adopter activation, native event delivery and final device
applicability remain open. Exact artifact identities and logs are retained externally.

Implementation is ready for the final extra-high architecture/code review after the bounded
completeness consultation and focused recheck closed the identified source gaps. Acceptance through
E5 remains pending that review and reconciliation. Use the stage requirements above as gates;
unchecked early boxes need evidence reconciliation, not automatic reimplementation. Historical
proof is retained in the [checkpoint record](../records/2026-09-20-unified-engine-checkpoints.md).
Runtime receipts and adopter-specific evidence remain external.

| Next batch | Required result | Current disposition |
| --- | --- | --- |
| E3 exit reconciliation | Per-question outcome plus coverage of the E3 implementation clauses | [Evaluation disposition](../../reference/2026-09-20-e3-evaluation-disposition.md) consolidated; source integration audit passes 37 focused tests; installed context-assembly comparison completed with zero incremental hits or losses; final-candidate revalidation belongs to E5 |
| E0 and E5 A/B/C closure | Current category dispositions, installed-owner inventory, required semantics and consumer mappings | Audit current evidence and close specific gaps; legacy byte-for-byte wire compatibility is not a separate goal |
| E4 remaining physical proof | Final-candidate device qualification | Latest-beta installed simulator and wired-device scenario runs pass. Reusable device commands now publish durable run identity; a separate cleanup stage consumes execution-bound predecessor evidence. Installed wired cancellation after app launch passes with valid inputs, verified app absence and released resource generations. Final artifact applicability still requires reconciliation. Physical removal/disconnect/reconnect remains deferred; no transport-recovery claim |
| E5 D preparation and activation | Coherent backup, preserved data, ownership transition, repair/readback and declared soak | Implementation and explicit execution remain in scope. Operator deferred shared automatic startup and related instruction cutover to a separate adoption step; live activation/soak must not be claimed |
| E5 workflow benefit | Useful accepted-work benefit without correctness or proof regression | One matched simulator workflow comparison accepted: both versions passed initial readiness; baseline failed owned-Metro replacement after abrupt supervisor interruption, while candidate replaced Metro and passed post-relaunch readiness. Valid inputs and confirmed cleanup for both; no generalized speed, token or reliability-rate claim |

Latest-beta workflow reconciliation found two project-runner defects before benefit acceptance:
simulator bundle recovery selected a physical-only installed-app reuse path, and one selected native
composition bypassed dependency freshness checking. Both have focused corrections and regression
coverage. The first comparison stopped during preparation on the stale native composition and
reported changed generated inputs; it contributes no performance or reliability measurement.
The selected composition was rebuilt and a rejected stale compiled module was quarantined.
The paired sample-readiness/owned-Metro-replacement comparison then completed with valid frozen
inputs. Graceful-exit preparation failed to preserve Metro and is not counted as a comparison;
the accepted case uses abrupt supervisor interruption identically for both versions. Keep source-runner
corrections, actual device scenario proof, comparison acceptance, and native host activation distinct.
| Final review | Opus extra-high architecture/code review and reconciliation after implementation completion | Completed; substantive corrections received focused Opus 5 extra-high rechecks. The final managed recovery-route finding is closed. Installed package/API/guidance proof and SDK commit checks pass. Final requirement and artifact-applicability reconciliation remains open |

Stop additional simulator comparison preparation until it closes a specific unmet requirement.
The live sample readiness probe has passed, but does not establish recovery or comparative benefit.
The current archive also passes all 81 installed checker assertions after dependency changes.
No prior evidence is deleted or promoted to a broader claim by this change.

Local-CI publisher/merge and unavailable VM infrastructure remain separately scoped pilot work;
retain the core contracts and report unavailable proof without making fleet activation an implicit
first-release requirement. E6 and all-platform rollout remain later scope.
