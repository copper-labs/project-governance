---
id: exec-plan.shared-test-execution
title: Shared Test Execution With Model-Free Waiting
type: exec-plan
status: active
owner: project-governance
created: 2026-09-10
updated: 2026-09-10
summary: Plan one reusable test execution skill and deterministic batch runner with Codex and Claude CLI handoff, proactive adoption, and bounded cost.
---

# Shared Test Execution With Model-Free Waiting

## Final State And Authority

An agent selects necessary proof, uses direct execution for quick checks, and transfers eligible
long batches to a deterministic supervisor. The supervisor itself never invokes a model. A verified
host handoff also eliminates model polling and delivers the result to the selected provider session.
Codex CLI and Claude Code CLI are both first-release acceptance requirements.
Repository instructions and existing lifecycle routes make this the normal decision when testing
work benefits, without loading the full skill for every task.

The operator approved this plan, full implementation, final Claude Fable 5.1 review and reconciliation,
and publication as a new feature release. Implementation and host acceptance are in progress.
Named adopter mutation remains separate from this source release; fixtures use isolated temporary
projects. This plan records the contract; only completed proof supports delivery claims.

- Delivery: authorized feature implementation and release from the released 2.6.6 baseline.
- Proposed release: next available compatible minor release, expected 2.7.0 if the baseline holds.
  This is a new optional capability, not another guidance-only patch.
- Planning review: independent review, reconciliation and final simplification complete; ready for implementation.
- Implementation proof state: focused runtime fixtures in progress; live host and release proof pending.

## Problem And Existing Owners

Reported long-test supervision repeatedly returned to the model for short status polls, repeated
context reads, and premature turn endings. Guidance release 2.6.6 addresses those behaviors but
cannot force a host to stop invoking its model. A model-free execution interval needs a real
ownership transfer outside the preparation invocation's subprocess tree.

Use the existing [validation strategy](../../governance/validation-strategy.md),
[runtime execution contract](../../specs/governance-kernel.md#selection-and-execution),
[provider lifecycle](../../specs/provider-agent-skills.md), and
[context routing](../../governance/context-routing.md). Preserve their authority and required gates.
The provider helper already supplies durable jobs, idempotency keys, checked process identities,
guardian cleanup, workspace/session coordination, private artifacts, and runtime-use protection.
It currently executes model assignments. Its Git snapshot is an observation, not a manifest of
every test input. The ordinary check runner is synchronous and its change packet does not make
arbitrary tools execute against immutable inputs.

| Responsibility | Owner and boundary |
| --- | --- |
| Proof selection and direct/external/attended choice | Shared Test Execution skill, using the existing proof budget and valid prior evidence |
| Job lifetime, duplicate claims, deadlines, process cleanup, atomic result | Shared runtime lifecycle; no model inside deterministic execution |
| Native tests, expected outcomes, source-manifest membership, device locks/cleanup | Adopter-owned runners and adapters |
| Exact session, provider/model/effort/configuration, permissions, completion delivery | Optional host adapter; ordinary governance checks never invoke it |
| Meaning of evidence and completion of the original task | Primary agent, using the existing review and acceptance boundary |

## Settled Execution Choice

| Situation | Required choice |
| --- | --- |
| Quick focused check or usable existing proof | Reuse valid proof or run directly; no preparation/resume pair |
| Long deterministic batch with a verified host and runner adapter | Launch the shared batch from the current session when supported; use verified native completion or the managed CLI cycle for automatic return |
| Long batch with useful independent primary work | Direct completion-aware waiting may be cheaper; record the brief reason in the existing proof budget |
| Human prompt, interactive device step, unavailable credentials | Mark the attended boundary or blocker; do not loop retries or silently substitute a device |
| Unsupported host or missing safe execution prerequisites | Use the existing bounded-wait path and state the missing capability; do not claim zero model calls or stronger evidence |

Use known duration, prior supervision cost, and setup/resume overhead; do not add a fixed minute
threshold, token estimator, or benchmark before every command. No skill may weaken an assertion,
skip a delivery gate, restart a healthy job, or infer a pass from a successful launcher exit.

## Minimal User Journey And Host Support

Use one deterministic batch implementation with two entry routes. Agents should not need another
model to restate a batch they already selected.

1. **Current session:** the primary agent prepares the request and starts the shared job through the
   installed harness. After ownership/startup acknowledgment, it uses a verified native completion
   notification or the longest supported completion-aware wait. The waiting command only observes
   the job; losing that command does not itself cancel or duplicate the batch. The same agent reads
   the compact terminal result. No preparation/assessment agent pair is added to this route.
2. **Managed CLI cycle:** an operator-launched harness invocation outside the provider's tool tree
   owns prepare, one batch, and assessment. It accepts the existing provider binding configuration
   instead of requiring repeated model/effort entry. Preparation is an ordinary harness provider job;
   assessment is its exact-session follow-up. A prepared request plus its recorded terminal preparation
   job can enter at execution, avoiding a second preparation call. Otherwise one preparation job is
   created. Reject a busy session, recency selection, silent forks, and mismatched bindings.
   A bare interactive session ID does not qualify for skipping preparation; that path needs the
   terminal harness preparation job and its validated request.

If the current agent already holds a conflicting harness workspace claim, it prepares the request
for execution after its job exits; it must not start a child and wait while retaining that claim.
Do not weaken workspace exclusion or add a lease-transfer protocol to avoid this deadlock.

The managed cycle starts tests only after preparation process exit and prerequisites are confirmed.
The deterministic job runs canonical commands sequentially, owns deadlines/cleanup, and atomically
publishes the result. It then permits at most one assessment follow-up. Valid failure/timeout evidence
can be assessed; malformed or uncertain evidence blocks dispatch. Assessment diagnoses authorized
next work, but no automatic repair/retry/new-batch loop is added. Ordinary task authority still applies.

Validate the current-session route on both native CLIs, including turn completion and host cleanup.
`setsid`, reparenting, and a guardian alone do not prove survival: a host may terminate detached
descendants. A native background waiter is useful only after its batch owner is proven safe for
the claimed lifetime. If that fails, retain bounded foreground execution or the externally started
managed cycle; do not add a daemon or bypass the host's process controls.

Claude's native background completion is a candidate integration, not proof of zero model calls.
Codex bounded waits can still cause model turns and are not equivalent to the managed cycle's zero-call
interval. Do not end a working turn merely because tests remain active. Explicit operator handoff or
a real host interruption may leave a durable job/result pointer; manual recovery is not automatic return.
Desktop/IDE discovery works through the same guidance, but automatic return requires a verified adapter.

## Shared Implementation Contract

### Entry Point And Reuse

Extend the existing `harness-agent` entry and runtime-use guard with a deterministic batch job kind
and managed-cycle subcommand. Reuse status/result/cancel/list/events/wait, the registry, publication,
identity checks, and cleanup. No separate console script or duplicate command plumbing. Fix exact
flags in the owning specification. The batch kind has no provider/model requirement; preparation
and assessment remain ordinary provider jobs outside it.

Do not fake a shell job as a new model provider, copy the provider supervisor, or introduce a second
workspace-lock authority. Adapt the existing worker by request kind: normalization skips provider
binding for batches; execution/result handling selects the batch behavior; guardian ownership uses
the existing root/descendant records. Also check provider assumptions in initialization, heartbeat,
events, conflict checks, storage and recovery. These are localized compatibility changes, not a
claim that those helpers are already kind-neutral. Existing provider jobs retain their public behavior; a general
plugin framework, scheduler, task graph, service daemon, RPC/MCP transport, or distributed queue
is unnecessary. Do not split modules just to introduce this feature.

### Small Request And Result

Use one versioned batch request and the existing job's durable state/result records. No separate
approval ledger, event database, or per-test planning file is needed.

The request contains a unique batch/idempotency key, declared input binding, explicit workspace,
ordered canonical runner invocations as argument arrays, their declared deadlines and expected
outcome contracts, fresh evidence destinations, and adapter references for input/cleanup ownership.
Reference existing runner manifests instead of copying their cases or interpreting product semantics.
Host session/configuration metadata is separate from the deterministic request. Never serialize
credentials into either record; reuse existing credential channels and redaction.

Validate bounded schema, absolute/resolved workspace and executable identities, argument shapes,
permitted artifact destinations, and actual caller authority before execution. Argument arrays avoid
shell interpolation; they are not a security sandbox or authority to run arbitrary commands. Execute
only the canonical commands chosen for the authorized batch, not shell prose from model output.

The terminal result identifies the batch, input binding/fingerprint, per-case outcome/evidence references,
overall outcome, termination reason, input validity, and cleanup status. Reuse existing result
envelopes and target manifests wherever they express these claims. Expected negative cases remain
project-defined; never infer pass solely from exit zero or normalize all nonzero exits into success.
Preserve raw failures and not-run cases. Compact summaries disclose omissions and link full permitted
records; the approximately 1,000-token routine output goal remains soft, with full finding inventory
available before repair. Sensitive output and retention remain governed by the existing owners.

### Input And Resource Ownership

Start with adopter-declared input roots, output/resource claims, the canonical command, and exclusive
workspace ownership. Record this limited scope as `declared-roots`, with source validation/fingerprints
where the runner provides them. Do not require every adopter to build a full dependency manifest.
When an existing runner supplies a complete manifest, bind its membership and content and label that
stronger evidence `manifest`. The project decides whether the recorded scope proves its acceptance
claim; neither label proves completeness by itself. Missing binding is not silently treated as valid.

Declared roots do not certify unstated dependencies, toolchain, compiled artifacts, or the staged tree
when commands actually read the working tree. Stronger candidate/reuse claims must cover the relevant
tracked/unstaged/untracked inputs and outputs. HEAD or the provider helper's Git snapshot alone cannot
establish that identity. Keep test outcomes even when input uncertainty prevents a stronger proof claim.

Hold cooperating workspace/output ownership for the whole execution and cleanup interval. Use
immutable inputs where the existing runner supports them; otherwise require exclusive ownership
coordinated with every known writer plus runner-owned source validation. Before/after hashes cannot
detect an edit-and-restore during execution, and runtime locks cannot constrain noncooperating tools.
If the required input stability cannot be established, do not certify current-candidate proof.
Do not create a checkout per test or silently copy an adopter's dirty tree to obtain isolation.

Duplicate protection is atomic: the same idempotency key and request returns the existing job;
changed request content or a supplied input fingerprint under that key fails. An unchanged roots
declaration does not prove unchanged source or authorize evidence reuse. Different keys must not bypass an overlapping workspace
or mutable-output claim. Use the project's existing device-lock owner once, from admission through
confirmed device cleanup. Do not add a second device registry or kill shared build/device services.

### Deadlines, Cancellation, And Recovery

Reuse the existing overall/idle deadline facilities and project case limits. A declared total budget
covers build, installation, execution and evidence, with bounded cleanup after termination. Overall
job time retains the current admission-inclusive meaning; do not add another queue timer. Quiet tests
need not have an idle timeout. Expected duration is advisory. Projects/operators choose limits and
the runtime enforces them; expiry is a failed outcome.

Track checked process identities and descendants. Reuse the guardian for supervisor death and the
existing bounded termination/reap behavior. TERM, hard supervisor death, launch/publication crashes,
permission-denied signals, orphaned descendants, and host restart require explicit recovery tests.
Unknown process or device cleanup retains ownership and blocks conflicting work. Never recover a
stale lock by assuming the device is clean. A missing result is not a pass and does not authorize
rerunning a possibly live batch.

For ordinary assertion failures, preserve existing runner semantics: stop declared dependent work,
allow explicitly independent cases if their runner contract permits it, and report all outcomes.
Infrastructure, integrity, timeout, or uncertain cleanup stops dependent use of the affected resources.
Do not turn this feature into a new test-dependency scheduler.

### Completion Handoff

For the managed route, assessment is a follow-up of the terminal preparation provider job, with the
immutable batch-result reference as context. Reuse its binding, authority, native resume and session
serialization. Pass an idempotency key derived from the batch ID/result identity through `follow_up`
to the existing locked `start` operation; use deterministic task text referencing the immutable result.
The deduplicated follow-up job record is the durable dispatch claim. No extra reservation file or
continuation state machine is needed. Recovery looks up that same job, including a failed/cancelled
launch, without launching another assessment. Corrupt or uncertain ownership still blocks through
existing recovery rules. This is at most one automatic dispatch, not an exactly-once delivery service.
The current-session route uses its host waiter and does not also schedule a follow-up.

Terminal test evidence survives failed authentication, missing session, host/configuration drift,
permission failure, failed analysis, or cancellation. Inspection and explicit recovery remain
possible without rerunning tests. Cancellation disables pending automatic continuation; if an
analysis process already started, cancel and reconcile that owned process too. Completion/cleanup
and successful assessment are separate claims.

The adapter records provider, exact session ID, executable/version identity, model, effort, cwd,
effective configuration references/digests, and applicable authority. Pass required overrides again
on resume; do not assume inheritance or globally modify user settings. Preserve normal hooks and
project instructions. Disable conflicting per-invocation goal/delegation behavior only with supported
flags and observed need. CLI updates require a bounded compatibility check, not an automatic upgrade.

## Make Agents Actually Use It

Awareness is part of delivery acceptance, not optional documentation after the runtime ships.

1. **Repository entry:** extend the existing managed instruction installer in
   `harness_integration.py` with one sentence in its existing marked block: before a substantial build/test
   batch, consult the installed Test Execution skill and choose the cheapest reliable path. Preserve
   authored AGENTS/Claude content, symlinks, empty override behavior, and current delegation routing.
   Preserve its cross-model delegation sentence. This changes managed instruction content across the
   supported entry files and requires the existing explicit integration-compatibility disposition.
2. **Lifecycle routes:** Plan references Test Execution when defining proof; Work consults it before
   the first eligible batch or a material change; Review checks actual execution choice using existing
   receipts. Fold the choice/reason into the existing proof budget. No new mandatory form per command.
3. **Discovery:** add one governed `test-execution` catalog entry and narrow task terms such as long
   test batch and device qualification. The managed block and lifecycle reads carry ordinary requests
   like run the tests; catalog keywords alone do not establish awareness. Unknown duration routes
   to assessment, not automatic detachment. Avoid matching every source edit or forcing external
   execution whenever the word test appears. Retain exact skill-ID access; add no new path-glob routing.
4. **Portable content:** reuse the efficient-execution resource as the detailed waiting/output owner;
   remove superseded wording when the new skill owns a rule. Keep host-specific launch/resume details
   in two thin resources or adapters. The instruction entry only points to the shared skill. Its normal
   path is select, prepare, execute, assess; load host/recovery details only when needed, not this plan.
5. **Visible readiness:** add one line to existing doctor/setup harness readback for route presence,
   available batch capability and the needed launch action. Doctor remains local inspection, never
   a live model test or new live-verification cache. Actual host proof belongs in release/adoption
   evidence. Recheck relevant changes, not every test.
6. **Adoption:** deliberately update the adopter's wheel and managed routes through the existing
   upgrade flow, account for integration metadata changes, and start a fresh host session. Verify
   root instructions, materialized bytes, selected packet, and behavior on both providers. Missing
   awareness or a host that cannot launch the managed cycle is an adoption gap, not successful delivery.

Use the host the operator selected: Codex returns to Codex, Claude returns to Claude. Do not silently
choose another provider, model, or effort. Do not add generic model-selection policy to this feature.

## Implementation Batches And Source Map

### Batch 1: Deterministic Execution And Both Host Adapters

- Depends on: approval to implement this reconciled plan.
- Ownership: one primary writer; runtime lifecycle, test batch adapter, host handoff, owning spec.
- Execution: sequential commands; no new platform parallelism or task scheduler.
- Parallel support: solo implementation; only bounded readers that replace a concrete investigation.
- Semantic contract: settled after planning review; exact schema/flags documented before code.
- Fixed decisions: one registry/command, project-owned tests, no model in deterministic jobs, two
  entry routes and two CLI hosts, one automatic terminal dispatch, explicit unsupported-host fallback.
- Acceptance: request/results, input/resource ownership, both CLI cycles, and recovery satisfy the
  contract above; no unrelated process, provider, or permission behavior changes.
- Development checkpoints: focused request/runner/cleanup fixtures and existing provider lifecycle
  regressions when common code changes; then controlled host adapters against fake native CLIs.
- Build and integration point: one installed-wheel exercise after the host boundary is stable.
- Review boundary: one integrated independent QA after Batch 2; earlier consultation only for a
  specific unresolved process/authority risk, not after every helper.
- Proof budget: focused changed owners, one shared lifecycle seam, deterministic fault fixtures;
  logs remain in existing external evidence and waits use supported completion-aware bounds.
- Invalidates prior proof when: relevant execution/host/input contracts or candidate bytes change.
- Split early or stop when: safe reuse needs a general lifecycle rewrite, a new service, broader
  permissions, automatic source copying, or unsupported native-session takeover.
- Documentation: owning spec and portable guidance move with the relevant contract, closeout once.
- Acceptance milestone: both managed host cycles work and current-session limits are verified before
  adoption claims; no live device matrix here.

Inspect `process_identity.py`, `runtime_access.py`, `state_io.py`, and `provider_agents/` jobs,
storage, worker, guardian/process cleanup and native adapters. Adapt the named kind-dependent seams;
do not generalize every provider helper. Reuse `entry.py`/`cli.py` and `jobs.follow_up`. Preserve
`runner.py`, `execution_flow.py`, and `execution_commands.py`
semantics; a test batch can invoke existing governed commands without changing check selection.

### Batch 2: Routing, Adoption Proof, And Release Candidate

- Depends on: Batch 1 contract and installed capability.
- Ownership: same primary writer; skill catalog/lifecycle routes, managed integration, documentation,
  focused installation fixtures, minimal usage telemetry, release compatibility declarations.
- Execution: one coherent routing/integration batch; one candidate freeze and independent QA.
- Parallel support: independent reviewer consumes frozen source and existing proof; no extra manager.
- Semantic contract: settled; awareness is required, execution choice remains proportional.
- Fixed decisions: no new collector, global settings edit, per-test approval, copied adopter runner,
  or inferred claim of desktop/IDE support.
- Acceptance: fresh Codex and Claude sessions discover/use the skill without being named in their
  task prompt; quick checks remain direct; eligible long work chooses external execution; unsupported
  and attended paths report the correct boundary. Authored root instructions survive install/update.
- Development checkpoints: changed skill-selection, materialization, managed-entry/doctor and upgrade
  fixtures; focused telemetry filtering/retention/failure fixtures; tiny live current-session and
  managed-cycle proofs per provider, with awareness and usage capture included.
- Build and integration point: one clean wheel before live proof; source readiness and tagged proof
  remain required independent release boundaries if publication is later authorized.
- Review boundary: independent frozen-candidate QA, grouped repair and affected recheck only.
- Proof budget: discovery is checked inside the necessary host scenarios; use fake CLIs for fault
  permutations. No live cross-product matrix and no repeated broad suite while editing.
- Invalidates prior proof when: candidate content/base, packaging, instructions, host settings or
  tested executable identity changes; unrelated edits do not invalidate all evidence.
- Split early or stop when: either required CLI cannot meet handoff/awareness acceptance or the
  upgrade would silently change an adopter's authority or suppress its instructions.
- Documentation: spec, skill, operator guide, catalog, release notes and plan closeout together.
- Acceptance milestone: verified publication plus authorized pilot adoption, clearly reported as
  separate outcomes. Adopter-specific paths and evidence remain in the adopter, never this source.

## Acceptance And Cost Evidence

| Claim | Smallest meaningful proof |
| --- | --- |
| Quick path stays cheap | One focused check selects direct execution and starts no external cycle |
| Shared execution works | Ordered two-case deterministic batch, per-case evidence, stable inputs, accurate terminal result |
| Failures stay honest | Assertion failure, blocked dependent, allowed independent case, expected negative, malformed/missing result |
| Processes are owned | Timeout, cancellation, supervisor hard kill, spawn/publication crash, surviving child, denied cleanup |
| No duplicate work | Concurrent same key, changed request under same key, different keys on shared outputs, busy exact session, enclosing owner cannot wait on its blocked child |
| Evidence remains valid | Declared-roots scope stays limited; manifest mode detects relevant staged/unstaged/untracked/config/binary drift; no false proof from unchanged HEAD |
| Handoff is bounded | Crashes around dispatch, missing auth/session, changed configuration, cancellation after completion, failed assessment; no automatic retry |
| Both hosts actually use it | Fresh Codex and Claude sessions receive an ordinary testing task without a skill hint; current-session route selects correctly, host-exit/cleanup limits are recorded, managed cycle returns to its exact session |
| Waiting is model-free | Preparation exits before first test starts; analysis starts after result publication and cleanup; launcher/process evidence shows no supervising-model invocation between them |
| Installation is real | Exact wheel bytes, preserved root instructions including overrides/symlinks, catalog route, doctor readback and fresh host instructions |
| Usage can be evaluated later | One reported skill decision per coherent batch, one observed external result, correct deduplicated aggregates, unknown coverage explicit, bounded content-free writes that cannot block execution |

Use tiny synthetic commands and explicit short fixture deadlines, not production device journeys.
For each provider, perform one current-session smoke and one managed cycle; combine awareness and
quick-versus-long selection within those scenarios. The managed run is also the external arm of the
cost comparison below. Reuse existing tests for unchanged guarantees and fake adapters for recovery
permutations. Attended/unsupported decisions use routing fixtures. If native cleanup prevents detached
survival, prove/report the bounded fallback without claiming that native host supports detachment.
Both managed CLI cycles remain required; an unavailable provider is unverified, not passed.

Measure launcher process times and available preparation/resume input, cached input and output
usage. JSONL events show reported activity, not every hidden request: corroborate with controlled
provider launch boundaries: preparation is terminal, its checked process is gone before batch start,
and assessment starts after cleanup/publication. Existing owned-process records contain no provider
launch by the deterministic worker; that descendant record alone cannot rule out calls by a still-live
host. Verify native notification separately; bounded model-driven waits carry no zero-call claim. Test
commands in this fixture make no model calls. The claim concerns supervising-model calls, not any
intentional AI calls inside an adopter's own product tests.

Use one small matched direct-versus-external comparison per provider with the same accepted outcome
and relevant settings. Include both preparation and assessment cost, errors and rework; do not count
reasoning tokens twice. Unknown usage stays unknown. Zero supervising-model calls during waiting is
a functional acceptance claim; lower total cost is measured separately and not guaranteed for every
batch. If setup/resume dominates a class of work, adjust its selection guidance toward direct runs.

### Light Usage Telemetry

Record enough to assess adoption and operational impact later, using the existing local telemetry
file and on-demand `telemetry status` view. This is an explicit, narrow addition to the current
validation-only contract, which excludes skill/agent activity. Update the owning kernel specification,
sanitizer, aggregation and tests together; do not restore retired event families or export job evidence.

- Once when Test Execution is applied to a coherent batch, report the fixed skill ID, runtime version,
  timestamp, known host (`codex`, `claude`, or unknown), execution choice (reuse, direct, external,
  attended, or bounded fallback), and a small reason enum. Use an opaque decision/batch ID to correlate
  records. This is an agent-reported decision, not proof that the host read or followed the skill.
- The external runner adds one terminal observation using its existing result: outcome, elapsed time,
  cleanup and handoff outcome when known. Reuse already available preparation/assessment token totals
  when reported; unknown usage stays absent. Direct/reused proof need not supply unobserved durations
  or token counts. Do not inspect provider transcripts or add measurement calls to fill those gaps.
- Piggyback reporting on the command or existing batch closeout the agent already performs. No new
  model turn, polling, per-test event, or repeated skill-read event. Keep at most one decision and one
  external completion event per batch; aggregate by their stable identity so recovery cannot inflate use.
- Keep the current concurrency-safe, fail-open retention bounds: 1,000 records and one mebibyte shared
  with validation telemetry. No prompts, commands, paths, source/test output, native session IDs, or
  model-specific configuration. Telemetry write failure never delays or changes the test result.
- Extend the existing status view with retained use counts by host/choice, external outcomes/durations,
  and known token totals. Reuse date/runtime-version filtering. State the retained time window and
  coverage limits: direct skill reads, unreported decisions and aged-out events are unobserved.

This measures reported skill use and observed execution, not all opportunities where the skill should
have been used. Counts and duration do not prove causal token savings; use the matched comparison above
when evaluating cost. A later on-demand snapshot can preserve the bounded report for comparison. No
collector, dashboard, background audit, separate history ledger or mandatory export is added.

Use the already planned host scenarios to verify capture. Focused deterministic fixtures cover field
allowlisting, duplicate aggregation, retention and write failure; no extra live provider matrix.

## Release And Adopter Sequence

1. Freeze one reviewed source candidate with both CLI and routing evidence; run the existing source
   readiness workflow and verify the proposed merge content/base before merge/tag.
2. Publish the next authorized minor version through the current immutable-wheel process; read back
   version, source, wheel/lock/update metadata, hashes and clean installation. Managed instruction
   changes need an explicit integration-compatibility disposition; do not promise automatic adoption.
3. In separately authorized adopter work, update its exact lock and managed routes, bind its existing
   runner adapters, and verify the real operator launch route. The earlier 2.6.6 guidance is reused,
   not reimplemented. Reassess only invalidated prior proof.
4. Audit the first real long batch once: correct route, no short model polling, trustworthy result,
   one handoff, cleanup, and useful cost observations. Consolidate in existing evidence. No recurring
   audit job or per-batch accounting ledger is added.

## Simplification Guardrails And Final Review

Before closing planning, challenge each addition against an existing facility or simpler path.
Keep only what earns a distinct guarantee: direct execution, one deterministic job kind, two thin
host adapters, one skill, existing managed routing, and failure-safe completion delivery.

Defer desktop/IDE automatic return, other providers/operating systems beyond the current helper's
macOS/Linux boundary, remote executors, parallel batch scheduling, dashboards, predictive routing,
cross-batch caches, automatic retries/repair loops, universal test discovery, and telemetry infrastructure.
Do not add a separate training phase, coordinator agent, or full review for each test case.

Final parent pass, after Claude's approving recheck:

| Cost challenged | Final decision |
| --- | --- |
| Another runtime, command or state machine | Use the existing harness, registry, worker and follow-up job; pass the existing idempotency key through rather than add a reservation record. |
| Extra model preparation | Current-session launches need none; managed execution can consume an existing terminal preparation job/request. A bare session ID cannot stand in for that record. |
| Heavy setup and repeated context | Declared roots are sufficient for limited evidence; one managed route and a short shared skill lead to details only when needed. No new settings, path-routing system or verification cache. |
| Repeated live tests and reviews | One native smoke and one managed cycle per provider, awareness inside them, managed evidence reused for cost comparison, fault permutations simulated, one implementation QA boundary. |
| Two entry routes | Retain both because the current-session route enables everyday use and the managed cycle supplies verified model-free automatic return on both CLIs. Both use the same batch implementation. |
| Later impact evaluation | Add two small observations per eligible batch to existing bounded local telemetry. Reuse status/retention and available results; no collector, transcript analysis, or extra model calls. |

Necessary crash/ownership checks remain because they establish safe execution. Idempotency prevents
duplicate launches; it does not validate unchanged inputs or make old test evidence reusable. No
additional architecture is needed for that distinction. The final pass adds no implementation batch.

## Rollback

Disable external selection and use the established direct path without losing test proof. Stop or
reconcile owned jobs before replacing their runtime. Keep results inspectable and preserve uncertain
ownership until cleanup is confirmed. Remove obsolete guidance/code through normal source changes;
do not retain compatibility aliases or silently downgrade an adopter's lock.

## Review Record

- Independent proposal review: Claude Fable 5.1 requested at high effort returned REVISE. The native
  result confirmed the model; it did not independently report an effort value. Focused recheck returned
  APPROVE with no remaining material concern and one low-priority simplification, applied below.
- Parent reconciliation: applied the changes below; no runtime implementation or live proof performed.

| Finding | Reconciled decision |
| --- | --- |
| Current-session usability | Added it as the normal entry; kept the managed cycle for guaranteed model-free automatic continuation. Rejected the claim that detachment, a 60-second polling loop, or ending a turn proves that guarantee. |
| Extra executable and broad lifecycle extraction | Reuse harness-agent commands and localized request-kind handling. Source inspection found provider assumptions beyond the review's proposed four locations; the plan names those seams. |
| Separate continuation mechanism | Reuse preparation-job follow-up. The approving recheck identified the smallest seam: pass a deterministic idempotency key into start's existing locked deduplication; its job record is the claim. |
| Mandatory complete manifests | Accept declared roots and exclusive ownership with an explicit limited evidence claim. Complete manifests remain an adopter capability; stronger proof still needs adequate input identity. |
| Managed routing and discoverability | Add one sentence to the existing block, preserve authored routing, declare integration impact, use lifecycle reads as the primary ordinary-task route; remove path-glob expansion. |
| Extra deadline/readiness/settings machinery | Keep existing timeout semantics, one doctor line, existing provider binding configuration, and live proof in normal evidence. |
| Interface and process evidence | Existing OpenAI link retained: the suggested developers URL redirects to it. Defined the observation boundary and added native host-cleanup evidence. |

- Final simplification pass: complete after the approving recheck; dispositions recorded above.
- Operator follow-up: added light usage telemetry for later impact evaluation. Parent checked it
  against the live validation-only telemetry owner and repeated the simplification check. This
  addition was made after Claude's approval and has not received a further independent review.
- Planning validation: documentation pack and whitespace check passed. Runtime and live-host
  acceptance remain unexecuted; this approval covers the plan, not an implemented candidate.

## Interface Evidence

The locally inspected Codex CLI and Claude Code CLI expose exact-session continuation. These
interfaces do not by themselves prove the managed cycle, authority preservation, or zero model calls.
The implementation must recheck supported invocation flags and actual behavior on its candidate.

- [Codex non-interactive execution and exact-session resume](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude programmatic execution, session resume and background-task lifecycle](https://code.claude.com/docs/en/headless)
- [Claude interactive background tasks and detached-descendant cleanup](https://code.claude.com/docs/en/interactive-mode#background-bash-commands)
