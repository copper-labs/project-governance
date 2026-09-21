---
id: spec.unified-development-engine
title: Unified Development Engine — Architecture Decisions
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Accepted unified direction with explicit recommendations and unresolved architecture decisions before implementation.
---

# Unified development engine

Fresh-checkout installation uses the same backed installer as deliberate initialization. An explicit
`lockedCheckout: true` init request accepts an existing compiled lock only when its parsed identity
exactly equals the requested artifact, the backup includes its current bytes, and no installed
launcher or registry exists. The existing lock bytes are preserved. Resuming the same recorded
operation remains supported; this option does not authorize replacing an installed runtime.

## Direction and decision status

The operator accepted the move toward one development engine, even where it costs more engineering.
Governance policy, task continuity, execution, context and evidence should share a coherent model.
The objective is better accepted work with less repeated reading, model coordination, testing waste
and operator intervention. Flexibility with a credible benefit takes precedence over fewer components.

Use the TS unified core and D1–D14 recommendations below as the detailed planning baseline. The
operator's latest direction requires Mnemos design now/adoption later, a more aggressive category-led
migration, preservation of established intent, and RN iOS simulator followed by RN iOS real devices.
Traditional remote CI and developer-local CI are both required; the operator reports GitHub local-CI
authorization already exists. Integrate its established contract. Additional adopter stacks pressure-test
the core and extension boundary without making all their workflows first-iteration requirements.
Category dispositions and release/policy choices are explicit proposals in the
[migration inventory](../reference/2026-09-20-engine-migration-inventory.md), especially N1–N13.
They are not authorization for silent feature removal or enforcement changes. Existing runtime and
charter rules stay effective until the relevant accepted contract/owner cutover. This assignment
updates specifications and plans; it does not execute the migration.

The [transition plan](../exec-plans/active/2026-09-20-unified-development-engine.md) owns forward
planning. The prior S1–S9 adoption sequence is retained as a coverage inventory, not a competing
execution order. Earlier independent reviews certify their recorded candidates, not this design.

## Recommended shape

One host-facing API presents the current change: intent, revision, source, applicable policy,
required claims, running work, evidence and unresolved questions. It is a view over owned records,
not a second mutable copy of task state. Existing Task, Action, Artifact and Evidence concepts remain.

| Component | Owns | Does not own |
| --- | --- | --- |
| Host adapter | User intent, coding-agent interaction, source edits, approvals and acceptance | Process babysitting or invented proof |
| Policy and proof planner | Applicable requirements, permitted operations and explanations | Semantic judgment disguised as a hard rule |
| Context service | Bounded current source, structural map and optional relevance ranking | Permissions or dependency-completeness claims inferred from similarity |
| Workflow engine | Approved dependencies, durable transitions, owner handoff and intervention requests | Undeclared actions, arbitrary generated commands or product-specific assertions |
| Execution adapters | Qualified local/VM/hosted placement, processes, services, resources, assertions and cleanup | A second competing owner of the same process/device or reduced proof coverage |
| Optional capabilities | Versioned workflow families using shared lifecycle/evidence, such as later release management | Mandatory release services for every project or duplicated project deployment controllers |
| Merge integration | Authorized publication of validated evidence, candidate freshness and protected merge readback | Self-certified worker green, permission bypass or implicit merge authorization |
| Operational store | Critical task/action/evidence identity, history and recovery | Unbounded telemetry or automatic semantic-memory authority |
| Decision adapter | Bounded semantic answers and abstention; JEV preferred initially | Gates, permission, cache validity or final acceptance |
| Measurement/evaluation | Cost, coverage, outcomes and controlled comparison | Authority to change policy or delete live proof |

## Decisions before the first runtime slice

### D1 — Core language and runtime

**Recommendation:** standardize new shared runtime code on strict TypeScript running on a qualified
Node LTS release. Compile the release artifact to JavaScript with declarations/source maps; do not
make production behavior depend on runtime type stripping. Validate external data at runtime as well
as typechecking internal calls. Keep CPU-heavy tools and long-running builds in owned subprocesses.

Why: the continuity core already uses TS, and typed async contracts fit host integration, workflow
state and SDK adapters. Mnemos exposes a TS package-root API, so a TS adapter can consume that public
surface directly. Mnemos itself is Kotlin Multiplatform; matching the host language does not establish
storage semantics, release freshness or platform parity. These remain qualification work.

Cost/alternative: Python already owns much of the runtime and could implement this architecture.
Choosing TS incurs migration and process-supervision qualification; it is not a claim of faster builds
or intrinsically safer code. Select the exact Node minimum and SQLite driver through E1 durability,
process and packaging proof. The current dependency-free/no-build arrangement is not a permanent goal.

### D2 — Migration and existing runtime investment

**Revised recommendation:** inventory and decide by category, build the selected TS replacement in
coherent source batches, then make one coordinated breaking core cutover. Avoid a prolonged sequence
of mixed-runtime wrapper releases. Keep the currently installed Python owners intact during construction.
Reuse proven TS concepts/code; port, redesign or replace other categories according to their intent.
The [C01–C18 inventory](../reference/2026-09-20-engine-migration-inventory.md) includes all shipped checks,
hooks, processes, configuration, evidence, provider helpers and release machinery, plus their required
proof. N1 selects release shape; each category can receive its own disposition.

For every cutover inventory inputs/outputs, policy behavior, active jobs, retained evidence and
upgrade/downgrade limits. Drain or reconcile old jobs under their original owner; never silently adopt
a live process from an incompatible owner. Compare pure planning/results in shadow; never run both
executors for the same side effect. Retire the replaced owner after readback and rollback proof.

Why: construction stays testable in batches while the installed product moves decisively to one core.
A coordinated release is not an untested one-shot rewrite. Temporary development use of current public
owners is bounded; no copied implementation, permanent compatibility shim or dual authority.
Existing tests, migration receipts and provider-agent capabilities are assets to preserve.

### D3 — Workflow ownership and permitted autonomy

**Recommendation:** one durable workflow owner per run, started on demand, with inspectable stages
and event-driven progress. A versioned recipe declares dependencies, preconditions, input/output
bindings, resource requirements, deadlines and bounded permitted recovery. Ordinary schema and
adapter code suffice; no general workflow language or agent framework is required.

Once authorized, code advances known transitions through build, install, launch, scenario, assertions
and cleanup. The host handles novel diagnosis, changed scope, missing authorization and acceptance.
The worker survives an observer disconnect where supported. Reconnect observes the same job; unknown
side effects require reconciliation, not blind retry. Cancellation is complete only after owner cleanup.

Why: removing repeated LLM status/recovery decisions directly addresses coordination cost. This is a
larger core than passive continuity. Qualify host exit, process tree cleanup, crash/restart and recovery
limits before unattended claims. Existing worker/guardian responsibilities must transfer, not duplicate.
Resource leases remain with the named adapter/owner; cross-worktree and cross-repository device/port
conflicts need a shared ownership protocol, not an assumption that repository-local locks suffice.
The [host resource authority](engine-workflow-and-device-contract.md#host-resource-authority) owns
that registry independently of repository histories and pinned engine versions. E1a proves its seam;
E1b/E2 qualify the actual runner. Single-workspace-only operation is not the target safety claim.

### D4 — Durable state and the Mnemos boundary

**Recommendation:** SQLite owns critical operational records; content-addressed files hold large
artifacts. Transactions update current state and its audit event together; do not require an entire
application to reconstruct itself from an unbounded event log. Scope repository state and machine-wide
resource identities explicitly. Separate task intent, observed facts, inferred relationships and advice.

The [memory boundary](engine-memory-boundary.md) defines the needed integration contract now: scope,
identities/provenance, typed records, freshness/watermarks, withdrawal, budgets, cancellation, degradation
and lifecycle. Include these fields/fixtures before core schema freeze, without adopting the dependency.
Later compare Mnemos as a provider of bounded
cross-task retrieval and procedural context behind that interface. Use its public package root,
not internal graph tables or a shared physical database. A missing/degraded memory provider leaves
task execution and ordinary retrieval complete.

Why: TS facilitates integration while this boundary preserves replaceability. Making Mnemos the
execution store now would couple adoption to a separate durability/migration proof. Reconsider that
only if it offers a demonstrated benefit and meets all critical-state requirements.

### D5 — Executable policy versus human guidance

**Recommendation:** keep rationale and judgment in Markdown; give each machine-enforceable rule one
validated declaration or code owner. Generate effective-policy explanations from that owner. Existing
profiles/schemas are the starting point; do not author a second independent copy of the same rule.

Why: an agent should not repeatedly interpret prerequisites that code can check. Human judgment,
exceptions and authority remain explicit. This changes the current Markdown-authority formulation:
amend the charter and affected contracts together only after this decision is accepted. A model's
interpretation can propose a rule; it cannot silently modify enforcement.
N11 records that specific acceptance, separate from agreement with the unified direction. The proposed
boundary leaves rationale, judgment and authority to change a rule in Markdown, with typed declarations
or code implementing the accepted machine rule and explicit exception semantics. Amend CHARTER,
AGENTS and the owning contract with the first promoted owner, not ahead of it as editorial cleanup.

N11 is accepted for explicit preview execution: shipped schemas remain the constraint owner,
`components/engine/src/schema-validation.ts` enforces those declarations, and captured policy plus
exact exception identity govern findings. CHARTER and AGENTS now state this boundary. Promotion of
a preview owner does not activate it in an existing installation; shared startup cutover remains a
separate operator-approved adoption step. No threshold or exception semantics change is implied.

### D6 — First proving workflow and platform scope

**Recommendation:** first qualify one real React Native iOS bug-fix/verification workflow on a
simulator, including Metro readiness, stale state, source/bundle identity, disconnect from the host,
reconnect and bounded recovery. Then qualify the same RN iOS workflow on real devices, with explicit
transport evidence. Native iOS follows these RN lanes; it is not a prerequisite to physical RN proof.
The [workflow contract](engine-workflow-and-device-contract.md) owns stages, resources and acceptance
matrices. Maintain the broader native/RN/Flutter/platform matrix as required
progressive scope. One framework or simulator result does not qualify the others.

Why: the known category of runner trouble should influence architecture early. Do not wait for the
complete working-packet product to investigate it. The first trace includes basic context and metrics;
context ranking is not a prerequisite for workflow reliability. Choose reuse, repair or replacement
from observed runner behavior. Adopter identity, commands and runtime evidence stay outside this repo.

## Decisions to carry into the first slices

### D7 — Shared repository context

**Recommendation:** establish a modest structural map alongside the first workflow: package roots,
owners, relevant docs, tests, runnable targets and declared relationships. Reuse existing metadata;
keep lexical search as a complete fallback. Both working packets and proof planning consume it.

Why: shared facts reduce independent rediscovery. Cached entries are disposable, source-bound and
workspace-aware; source changes invalidate them. Add symbols and embeddings when measured misses or
preparation cost justify them. A map is not proof of complete dependency closure.

### D8 — JEV priority and operating policy

**Recommendation:** make JEV the first and preferred semantic adapter, and evaluate it early alongside
the deterministic baseline. Keep a narrow provider-neutral request/response boundary, explicit enablement,
a single off switch, and immediate no-account/no-token fallback. Do not build multiple providers first.

Its low input price makes wider experimentation reasonable: optional-context ranking first, then
other recurring questions selected from the full decision map, such as ambiguous intent/skill advice
and diagnostic ranking. No JEV answer may change `context-router` outcomes, mandatory instructions
or which validation packs apply. Compare bounded related questions over one evidence snapshot where the provider supports it;
do not require a fresh call for every event or hard-code an arbitrary one-question product ceiling.

Protect user latency, data scope and answer quality. Bound request count/bytes/time; disable hidden
SDK retries on the interactive path. Use shadow comparison with explicit lifecycle ownership, then
measure actual avoided host work. Pin model/question versions, record native usage and abstentions,
and retain cross-process failure suppression. Do not reject a useful experiment merely because code
could theoretically imitate it; compare actual implementation and maintenance cost as well.

Published pricing checked 2026-09-20 is $0.042 per million input tokens, with free output. For illustration,
1,000 requests averaging 4,000 billed input tokens total $0.168 at that rate, excluding any intermediary
fees. This is arithmetic, not a workload measurement or billing receipt. [Official models/pricing](https://docs.typesafe.ai/models).
The same documentation states customer-specific weight fine-tuning is not offered; initial tuning
means inputs, questions, thresholds and workflow policy, not a promised JEV training capability.

### D9 — Proof applicability and reuse

**Recommendation:** model required claims and result applicability from the first workflow. Distinguish
unknown, running, failed, satisfied and stale evidence. Bind source/dependency coverage, check/policy
versions, configuration, environment, binary, target and expiry where applicable. Unknown completeness
must remain unknown. Show why another run is required.

Why: this supports correct resumption immediately and selective reuse later. Initially attach to running
jobs and use project-owned build reuse. Reusing a completed verdict needs explicit owner/policy support;
local checks never automatically replace CI or release proof. Qualified local execution can become
CI through the explicit [local-CI contract](engine-local-ci-and-merge-contract.md); GitHub-hosted
compute is not mandatory. This is not a universal green-result cache.

### D10 — Telemetry and evaluation

**Recommendation:** use common task/attempt/action/decision/job identities from the first slice.
Emit a bounded analytics projection from observed transitions; failure of analytics cannot prevent
critical state recording or trigger another execution. Keep private frozen evaluation cases separate
from rolling aggregates. Decide physical storage from retention, joins, isolation and report cost.

Why: we need to attribute total accepted-work cost, including all models, failures, recovery, omissions,
reopened work and operator time. Report native-token coverage rather than infer tokens from bytes or
messages. Compare cold/warm/stale-service conditions. Declare benefit thresholds after baseline
variability is known and before evaluating candidates. This applies to the engine migration itself,
not only JEV. E1b records coverage and thresholds; E5 activation needs measured workflow benefit and
correctness/parity evidence. Missing measurements remain unknown. If benefit is absent or inconclusive,
keep the installed product and refine the intervention before cutover. Replaying decisions never
replays side effects.

### D11 — Installation and release unit

**Recommendation:** retain one product, one pinned release identity and one init/update/repair/doctor
experience. Target one compiled Node package after TS cutover; prefer a pinned npm artifact over a
new custom binary distribution system. Qualify the artifact, integrity, dependency/runtime resolution,
private-registry behavior and offline installed operation. No floating startup package download.

Why: core language standardization should eventually remove the dual runtime requirement. During
migration, the existing wheel remains the release authority until explicit package/lock transition;
never introduce two independently editable product locks. The transition plan defines isolated
compiled preview invocation for E1b/E2/E4 and final installed-artifact requalification in E5/D. N12
selects post-write recovery before activation; a backup alone cannot reverse new evidence. Native
project tools can still have their own runtimes. Installation language and one-product ownership are separate choices.

### D12 — Host support and user surface

**Recommendation:** one CLI plus a versioned structured API, qualified first with the current host.
Expose task state, preparation, workflow start/observe/cancel and evidence explanation through the
same core. Capability-detect event delivery and stage controls; keep explicit operation when unsupported.

Why: this preserves later host/UI flexibility without building a custom IDE or a second agent loop.
Provider-agent delegation remains available through its existing authorized routes. Engine setup must
preserve authored instructions. The host still owns edits, new work authorization and acceptance.

### D13 — Local CI and protected merge integration

**Settled direction:** support both traditional remote CI and developer-local CI. Separate proof
planning, execution location and merge authority. Use the
same required claims and project commands on qualified local hosts, macOS VMs, Linux containers/VMs
or hosted capacity. Retain protected GitHub review/checks while allowing heavy compute to move local.
Consume the already authorized local result path. Ephemeral Actions workers and direct trusted
publishers are integration options, not a mandatory migration sequence or competing product choices.

Why: a pre-push mirror followed by full hosted repetition preserves much of the current delay and
cost. Conversely, accepting arbitrary local green reports loses candidate/environment assurance.
The [local-CI and merge contract](engine-local-ci-and-merge-contract.md) defines the middle path:
exact integration candidate, trusted validation/publication, bounded capacity fallback and remote
readback. Do not make weak hosted resource limits a universal cap on local throughput. Choose host
trust and required profiles explicitly; simulator, VM and physical-device proof remain distinct.

### D14 — Optional capabilities, pressure-tested with releases

**Recommendation:** expose a small versioned capability/adapter contract. Later release management
is optional and uses the shared engine for identity, permitted workflow execution, observation and
evidence. Projects retain component inventories, deployment commands, branch/version policy and
business checks. Do not build a marketplace, a second workflow engine or a full release product now.

Why: multi-component release work exposes core assumptions that the first device workflow may miss:
external effects can outlive a process, environment ownership can cross machines, and evidence may
need stronger custody than one local SQLite database. The [capability boundary](engine-capability-boundaries.md)
records these needs and a small E1 fake-adapter pressure test. Choose the real shared admission/store
and release adapters later. The second adopter informs design; its full release cutover is not an
E2/E5 acceptance condition. Existing project release authority remains effective.

## Acceptance priorities and options left to engineering

Use the [next decisions N1–N13](../reference/2026-09-20-engine-migration-inventory.md#next-operator-decisions)
to settle the category dispositions, breaking cutover and remaining product choices before dependent
implementation. Mnemos design timing and RN simulator-to-device order are now explicit operator
requirements. D1–D14 retain design rationale; do not ask the same broad direction questions again.
N11 explicitly settles policy-authority wording, N12 cutover recovery and N13 first-pilot merge
execution scope. None requires all E0 decisions to block source-only E1a fixtures. Concrete
libraries, schema field names, timeout defaults and storage adapters can be selected through focused
proof rather than another operator decision list. Strong typing does not remove runtime validation,
resource ownership, process isolation or crash-consistency obligations.

Preserve no-token operation, optional privacy-scoped model use, stage inspectability, exact evidence,
separate physical proof, bounded telemetry and progressive platform support from the accepted design.
The implementation plan must carry them forward explicitly before retiring old acceptance criteria.

## Contract ownership and coverage

- [Migration inventory](../reference/2026-09-20-engine-migration-inventory.md) owns category decisions,
  hook/check/rule intent, source coverage and N1–N13.
- [Workflow/device contract](engine-workflow-and-device-contract.md) owns approved stage transitions,
  resource/recovery behavior and the RN simulator/physical acceptance matrices.
- [Memory boundary](engine-memory-boundary.md) owns integration requirements now and later adoption.
- [Local CI and merge evidence](engine-local-ci-and-merge-contract.md) owns execution profiles,
  trusted result publication, candidate freshness and local-to-required-check rollout.
- [Capability boundaries](engine-capability-boundaries.md) owns early optional-extension requirements
  and the release pressure test; full release orchestration stays outside the first-iteration scope.
- Existing module measurement, decision and evidence contracts retain their detailed invariants;
  the transition plan maps them to current slices rather than duplicating their full definitions.

## Evidence and limits

Current local owners inspected: [TS continuity](../../components/harness/docs/specs/harness-core.md),
[Python launcher](../../src/project_governance_runtime/continuity.py),
[batch executor](../../src/project_governance_runtime/provider_agents/test_batches.py),
[task/evidence schema](../../components/harness/src/store/schema.ts),
[policy runtime](governance-kernel.md), [current decision seam](../../components/harness/docs/specs/decision-interface.md)
and [measurement contract](../../components/harness/docs/specs/measurement-and-qualification.md).
External SDK source documentation was read only; no dependency was installed or exercised.

[Node SQLite documentation](https://nodejs.org/api/sqlite.html) describes synchronous database calls
and version-specific API stability. This supports qualifying the selected Node/driver combination;
it does not justify choosing a runtime version merely because its documentation is newest.
No paid inference, production performance comparison, published package adoption or device run was
performed for this decision brief. Recommendations remain distinct from those proofs.


### Qualified preview host API

The package declares `@organta/project-governance/host/v1` with JavaScript and TypeScript
declarations. Trusted host adapters create tasks, authorize actions, bind exact recipes through
`WorkflowStore.authorizeWorkflow`, then use the public workflow CLI for dispatch and observation.
The API exposes the task store, action authorization, workflow binding, recipe resolution and
resource observation primitives; internal file paths are not a supported import surface. The host
must obtain operator authority before calling approval methods. No model-facing self-approval
command is introduced. Breaking this surface requires a new API version.

Workflow recipes use `policyRevision`, the identifier compared with the authorized action's
policy revision. This is not a content hash. CI candidate `policyDigest` remains a SHA256 binding.
Pre-release recipes using the former misleading field name must be regenerated and reauthorized;
historical receipts remain historical evidence and must not be rewritten.


### Lost-command verification and release transition

An independently confirmed command cleanup does not prove the command's result. If an owner was
lost, its immutable command receipt stays `unknown`. The workflow records failed verification with
`commandOutcome: unknown` and the recovery evidence digests. This permits only declared cleanup;
dependent ordinary stages remain blocked. Resource release still requires the resource adapter's
separate cleanup observation. A missing or mismatched cleanup proof retains the obligation.

Until deliberate adopter cutover, CI exercises both runtime implementations and verifies the wheel
as well as the compiled package. The 2.x tag channel retains wheel release support; the 3.x tag
channel publishes the unified package. Neither channel runs without an explicitly authorized tag,
and this implementation work publishes neither. Existing wheel installations are not migrated by
a source change or by publication of a new major version.
