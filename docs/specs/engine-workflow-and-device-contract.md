---
id: spec.engine-workflow-and-device-contract
title: Development Workflow and Device Round Trip
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-10-30
summary: Approved workflow execution with explicit resource ownership, RN iOS simulator then physical-device proof, and bounded recovery.
---

# Workflow and device round trip

This is the target engine contract, not a claim about the current executor. Existing
[test execution](test-execution.md) and [continuity execution](../../components/harness/docs/specs/execution.md)
remain current until cutover. The initial platform order is **RN iOS simulator → RN iOS physical
device → broader native/framework/platform coverage**. Native iOS is not an intervening prerequisite.
Wired first, wireless next is recommended for the physical phase; the operator chooses transport scope.
The [local-CI contract](engine-local-ci-and-merge-contract.md) separates execution environment from
test target and defines when qualified local evidence can satisfy a protected merge check.
The [capability boundary](engine-capability-boundaries.md) tests later external/release operations
against this shared lifecycle. Those operations are not required in the first RN workflow.

## Native custom checker executable paths

The native check owner validates that a declared executable resolves to an executable regular file.
It launches the absolute declared path, or the absolute path selected from explicit PATH directories.
It does not replace that path with the symlink target: environment-aware interpreters can select
their dependencies from the invoked location. Empty and relative PATH entries remain ineligible;
missing, broken, non-executable and directory targets refuse dispatch.

The existing durable command request records the actual launch path. Credential filtering, admission,
deadline, cleanup and observation without replay remain with the native command owner. Existing
recorded commands remain bound to their installed generation; this change neither migrates their
identity nor retries uncertain effects. This narrow behavior does not change separate test-batch
executable fingerprint requirements.

## One change, one workflow view

A change binds objective/constraints, task revision, current source and policy revisions, required
claims, active work, results and unresolved questions. This is a view of owned records. Avoid an
independent mutable copy in the packet, hook runner and device runner.

The host proposes edits and resolves novel uncertainty. The planner applies declared policy and
project recipes; the workflow owner advances authorized transitions. The project adapter knows
build, bundle, target and assertion semantics. There is one execution owner for each side effect.
An existing canonical runner can remain that owner when qualified; integration does not require
splitting its internal stages into competing supervisors.

## Recipe and run contract

A versioned recipe declares stage IDs/dependencies, trusted operations, applicable input and artifact
bindings, required claims, target capabilities, resource claims, deadlines, cleanup and permitted
recovery. It is ordinary validated data plus adapter code, not arbitrary model-generated executable
text or a general orchestration language. A recipe selects known operations; user authority and
current policy determine whether this run may invoke them.

A run binds recipe/version, action/task revision, exact candidate, effective policy, environment,
requested target class/identity, caller authority and owner generation before dispatch. Every stage
records its applicable input binding and artifact/result references. No caller-provided source label
substitutes for owner verification of execution inputs.

Stage states include pending, blocked, running, reconciling, succeeded, failed, cancelled and unknown.
A failed assertion is not an infrastructure failure; a skipped dependency is not pass. Run completion
requires required assertions and confirmed cleanup. Verification is separate from task acceptance.
Process termination is not proof that an external operation stopped. Adapters must identify their
actual effect lifetime and observation/cancellation limits; an unknown effect retains its ownership
obligation. Stronger cross-machine durability is an optional capability requirement, not a property
that the local store or a process lease implicitly supplies.

- Re-read prerequisites before each side effect; changed inputs invalidate dependent stages.
- Requests are idempotent for the same action/run; uncertain submission is reconciled before replay.
- Crash/reconnect observes the original owner and recorded identity; stale owners cannot advance a
  newer generation. The exact fencing/lease mechanism is an E1 proof item.
- Cancellation targets owned work only and remains pending until process/project cleanup is established.
- Incompatible source/policy changes stop dependent execution; they do not mutate historical results.
- Terminal evidence/native usage is recorded once; notification delivery has its own disposition.

Expose one convenient start operation, stage inspection, bounded wait/events, result and cancellation.
Stage retry/resume/reset exists only when the owner supports it safely. Report unsupported controls
explicitly. Meaningful progress or intervention wakes the host; unchanged log polling does not require
an LLM. Direct wait and a queued completion path must not both control the same observation lifecycle.

### Compiled preview command boundary

`workflow-submit` takes an existing task database, task ID/version, authorized action ID,
authority reference, operation ID and recipe file. The recipe declares stages and selects
operation IDs. It cannot define executable commands. The project owns those definitions in
`config/governance/operations.json`, a version-1 object containing an `operations` map.
The engine resolves only selected operations and adds the exact catalog content hash to the
run's input bindings. Catalog changes invalidate subsequent ordinary stages; cleanup retains
the already captured operation definitions so the owner can release its resources.

This is a configuration boundary under the developer account, not an OS sandbox or evidence
that an arbitrary catalog was independently reviewed. Projects must govern catalog edits as
execution policy. The trusted host adapter resolves and reviews the recipe, then calls `authorizeWorkflow`
to bind the existing authorized action to the full run binding in the task database. This includes
commands, catalog/input hashes, task/policy revisions, authority reference and operation ID.
Submission, worker claim and ordinary stage dispatch check that binding. One action cannot be
rebound to another workflow; identical retries are harmless. The public submission command
cannot create this approval. This is host-reported authorization under the same OS account,
not cryptographic proof of human review or protection from direct database modification.

Engine ledger schema 2 adds action bindings. Existing schema-1 records are retained, but
unbound work cannot start new ordinary stages until the host supplies the exact approval.
Already captured cleanup remains available; migration does not synthesize authorization.

Approved operation definitions may declare `credentialEnv`, a bounded list of credential
environment names. The names participate in the approved recipe identity. Values are resolved
from the launching host, forwarded only to the selected operation, and never serialized in
requests or bindings. Missing credentials block a new dispatch before reservation. Reconnecting
to an existing dispatch does not require its credentials again. Ambient credentials remain
excluded by default; inline credential values in recipe environment fields are rejected.
Native tools remain responsible for not printing their credentials into output.

`workflow-status` observes the existing run. `workflow-wait` waits at most 30 seconds for
an outcome, or for a new ledger event when `--after-event` supplies a sequence cursor.
A timeout returns the current state without dispatching or retrying anything. Event batches
retain the ledger's 100-event bound; callers resume from the last returned sequence. `workflow-cancel` records a cancellation request
and its authority reference; the worker confirms termination and cleanup. CLI exit codes are
0 for succeeded, 2 for queued/running/reconciling, and 1 for failed/cancelled/blocked/unknown.
Neither submission nor a cancellation request establishes successful verification.

## Resource ownership

Name the owner for processes, Metro/service ports, shared build outputs, simulator instances and
physical devices. Scope resource identity to the host and actual resource, not just repository path.
Two repositories or worktrees can conflict. Reuse existing project leases where they cover the full
scenario/cleanup lifetime; otherwise repair or replace the owning mechanism in the authorized project.

Acquisition, generation, held resources and confirmed release are durable and inspectable. A vanished
observer, expired timestamp or disconnected device alone cannot certify resource release. If an owner
is lost, reconcile actual process/device state before new execution. Do not hold device leases during
unrelated work where the recipe can safely acquire later.

This boundary coordinates declared resources, not arbitrary host activity. Uninstrumented editors,
processes or devices can cause conflicts; report those limits. It is not a sandbox or permission grant.

### Host resource authority

The target keeps task history repository-scoped but places resource admission with one host-scoped
owner. Its small registry lives outside Git and outside any engine installation at
`<user-state-root>/project-governance/resources/registry.sqlite`. E1a fixes the platform path resolver
and protocol; independently pinned versions and path aliases must resolve to that same registry.
For the initial developer-host trust scope, this coordinates participating processes under the same
OS account. Other accounts, uninstrumented processes and remote machines remain outside that scope.
An isolated CI guest/account cannot acquire host resources independently; the initial
[CI pilot](engine-local-ci-and-merge-contract.md) excludes direct host device/service access and
keeps host capacity with its controller. Later guest-to-host work must delegate through the same
qualified host owner, not create an invisible second lease.

The registry is authoritative only for acquisition, holder/generation and release of named host
resources. Repository ledgers hold references and observations, not independent writable leases.
Resource keys bind the actual host/service endpoint or target identity, not a repository-derived name.
One small on-demand registry owner/API suffices; this does not require a daemon, scheduler or another
process supervisor. A project-owned registry may replace it only if it proves the same namespace,
cross-repository acquisition, crash reconciliation and cross-version contract. Never run both owners
for one resource or bridge them with two independently authoritative lease records.

Use atomic acquisition and generation checks through that owner; project adapters fence mutations
at the actual operation boundary. A generation number alone cannot fence an uncooperative external
process. Unknown protocol/schema or unverifiable ownership blocks the affected resource; it must not
create a version-specific registry or steal a lease. Registry upgrades require compatible readers or
drained holders and explicit migration, never automatic replacement by whichever project starts next.

The current preview uses resource protocol 2 for atomic workspace reader/writer/exclusive and native
session conflict checks. Protocol 1 requires explicit migration with all holders drained; ordinary
opening refuses migration. Older engines must refuse protocol 2 rather than ignore workspace claims.
The proposed initial compatibility window is resource protocol 2 across the first qualified engine
major-release family; this is a minimum compatibility guarantee, not a required protocol bump at
each engine major. Prefer retaining the protocol across families. A genuinely breaking resource
protocol needs coordinated migration for the declared participating projects on that host. Package
versions negotiate capabilities without silently bumping the protocol.
E1a declares the concrete schema/read/write compatibility matrix and tests divergent pinned engines.
The designated engine resource-maintenance entrypoint, invoked explicitly from a qualified pinned
artifact, is the sole schema migrator. Ordinary acquisition may initialize a missing registry at its
supported protocol, but cannot upgrade an existing one. No separate registry updater is introduced.

The preview entrypoint is `resource-maintenance --registry <existing-registry> --from-protocol 1
--authority <operator-reference>`. It atomically refuses held resources, advances protocol 1 to 2,
and records the authority in the same transaction. Repeating it on protocol 2 preserves the result
without another migration event. Missing/unversioned registries are not replacement candidates.
The operator must drain participating legacy runners before invoking this host-wide maintenance.
A breaking migration requires inspected/drained holders, coherent backup/readback, and a declared
participating-engine update/recovery plan; incompatible idle clients are not made compatible by drain.
Do not activate it while an in-scope project still requires unsupported access. That scope comes
from a declared participant inventory; current holders cannot discover every idle pinned project.
An unenumerated incompatible client is safely blocked with the remediation below, not promised
automatic compatibility.

An older engine meeting an incompatible registry reports a stable blocked reason, registry locator,
observed/supported protocols and an actionable inspection/remediation route. Doctor/inspect identify
the qualified maintenance artifact and compatible engine range from nonsecret version metadata.
The remedy is an explicit compatible pinned-engine update or maintenance recovery, never deleting
the registry, stealing resources or automatic downgrade. E1a's exit records this owner, window and
message contract; exact command spelling remains an engineering choice.

Before reclaiming a lost holder, establish actual effect/cleanup state. Preserve unrelated Metro and
device work. Legacy or external activity that cannot join the protocol must be drained or reported as
a conflict; the first lane cannot advertise cross-repository safety from repository-local locks.

E1a proves competing repositories/versions, stale owners, loss and handoff with fixtures; E1b/E2
qualify the actual runner/resource path. Host admission and repository dispatch are not one atomic
transaction: persist intent, acquire by stable operation identity, bind the acknowledgment before
dispatch, and reconcile either interrupted edge without executing twice. Shared release environments
use their later capability's authority rather than a network-shared copy of this SQLite file.

## RN iOS round trip

1. Bind the reported bug, relevant source and an executable reproduction/assertion. Preserve observed
   before-fix failure; if reproduction is unavailable, label the gap rather than inventing a baseline.
2. The coding host investigates/edits. The engine prepares focused context and the required proof plan.
3. Determine native build/install versus JavaScript bundle/refresh needs from project-owned input rules.
   Unknown applicability requires proof, not a JEV guess or a broad cache clear.
4. Build the required artifact and bind toolchain/dependencies/configuration/source. Acquire the named
   target and shared resources through their owner, then install or verify applicable existing state.
5. Establish the correct Metro process/workspace/port/configuration and delivered bundle/input identity.
   A listening port is insufficient. Preserve unrelated running services.
6. Launch into declared app/scenario state; distinguish process start, app readiness and bundle delivery.
7. Run automated regression/native assertions, capture result/log/artifact refs and compare the required
   claim against the fixed candidate. Launch success alone cannot close the bug.
8. Confirm cleanup or explicitly retained development-session resources with their continuing owner.
   A deliberately retained resource is not a released lease; future reuse must name that owner.
   Before terminal cleanup is acknowledged, transfer any retained service to an explicit continuing
   session owner with durable acknowledgment; otherwise the run remains responsible and nonterminal.
9. Run applicable hooks/independent proof once at their actual boundary and present the evidence for
   review/acceptance. Model advice can rank unfamiliar diagnostics; it cannot manufacture a passing result.

The same recipe family must cover real devices next. Record binary and JS bundle identity separately
when either can change independently. Simulator and physical results have distinct target bindings.
Evidence from one cannot silently satisfy the other.

## Simulator acceptance matrix

Exercise cold start; warm healthy service; stale/wrong-workspace Metro; occupied port owned by another
project; changed JS with unchanged native inputs; changed native inputs; unavailable/ambiguous target;
interrupted worker/host; repeated recovery; scenario failure; cancellation and cleanup. Compare actual
observations with the claimed runner behavior. The existing dev loop is not presumed ideal.

Readiness probes and recovery are deterministic owner logic. Automatic recovery must be declared,
limited and justified by observed state. No retry cascade, unconditional cache wipe, arbitrary kill,
unrequested simulator erase or repeated model diagnosis of known lifecycle states.

## Command evidence destinations

Each dispatched workflow stage receives engine-owned environment values:
`PROJECT_GOVERNANCE_WORKFLOW_RUN_ID`, `PROJECT_GOVERNANCE_WORKFLOW_STAGE_ID`, and
`PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR`. The artifact directory is absolute, private to the
run/stage, and separate from command-control receipts. Project operations write their reports there
instead of embedding previous job IDs or artifact paths in the operation catalog. The catalog may
not define the reserved `PROJECT_GOVERNANCE_WORKFLOW_` prefix. Execution binds these values when
submitting the durable command without mutating the authorized recipe. These values identify the
execution; they do not confer additional action authority or turn artifacts into accepted proof.

`PROJECT_GOVERNANCE_WORKFLOW_STAGE_ARTIFACTS_JSON` maps preceding stage IDs to their absolute
artifact directories in the same run. Cleanup operations use this map to locate durable launch
receipts after cancellation or worker loss. Paths remain stable during cleanup continuation;
a path alone does not mean a stage ran or produced a valid receipt. Project cleanup verifies the
receipt's run and resource identity before acting. Later-stage paths are not exposed.

## Physical-device acceptance matrix

After the simulator lane, qualify RN iOS on an actual device: exact target identity/OS, pairing/trust,
unlock/signing/provisioning, installation and bundle delivery, automated scenario assertions,
host/worker interruption, contention, cancellation and confirmed cleanup.

Physical removal/disconnect/reconnect testing is deferred by operator decision for the first
E4/E5 iteration. It does not gate that iteration or activation. Keep it as later transport
qualification; do not infer disconnect recovery from worker interruption or ordinary connected use.

Record cable and wireless transport separately; qualify both if both are declared supported. An
unavailable device blocks that claim and leaves independent work available. Never silently fall back
to a simulator or another device. Attended prompts remain attended; no bypass is implied by automation.
App reset/data-clearing is allowed only when the authorized scenario declares it, not as generic repair.

## Proof, measurement and later platforms

Use one required-claim view across focused tests, build/device work, hooks and review. Preserve exact
subject identity, policy/check versions, completeness limitations, environment, binary/bundle/target,
scenario and expiry. Reuse completed evidence only where the owner certifies applicability. CI and
release remain their own trust boundaries; a common record format does not erase them. CI does not
require GitHub-hosted compute: an explicitly adopted local/VM provider can produce eligible evidence
under the local-CI contract. Dirty-workspace iteration alone does not qualify as merge-candidate proof.

Measure queue/build/install/launch/scenario/cleanup time, actual host coordination where visible,
recovery recurrence, operator interventions, expansions, native usage coverage and reopened work.
Analytics remain best-effort. The [measurement contract](../../components/harness/docs/specs/measurement-and-qualification.md)
retains privacy and evaluation bounds. Performance gains are outcomes to measure, not release promises.

Broader native, RN Android, Flutter and other supported surfaces reuse the shared contract while
qualifying their actual runner/OS/target/transport/scenario. A plugin registry or platform-specific
scheduler is not required merely to preserve this extension boundary.


### Bounded command termination grace

A project-owned operation may declare `terminationGraceMs` from 1 through 30000 milliseconds.
Omission retains the 1000-millisecond default. The value is bound into the approved operation and
input identity; a submitted recipe cannot override it. The command owner and orphan guardian use
this window between graceful termination and forced termination. Workflow observation includes the
window so it does not abandon an otherwise bounded cleanup. This does not extend execution permission
or turn cancellation into success. Device/resource release still requires independent cleanup readback.

### Stopped-worker observation recovery

`workflow-recover-observation --worker-directory <dir> --database <db> --run <id> --revision <n>`
verifies the original worker is absent and binds retained command requests/receipts to their exact
workflow stages. It records observations atomically against the current revision and stage snapshot.
It does not dispatch commands, signal processes or release device claims. Original receipts remain
unchanged. Missing/unknown command evidence remains unresolved; successful observation recovery
leaves the workflow unknown (exit 1) until remaining stage and resource obligations are reconciled.
Repeated recovery uses the current revision; stale revisions and live or reused worker PIDs refuse.
Use `workflow-resume-cleanup` with the same arguments to request cleanup-only continuation after
observation recovery. It requires all original command effects to be resolved and the original resource
generations to remain held. It atomically records the recovery worker identity, blocks pending ordinary
stages, preserves completed results and executes only pending cleanup. Live recovery workers block
further observation takeover. Device release still requires independent readback; unresolved cleanup
retains ownership. The command does not resume ordinary workflow work.


### Initial owner release for local producer and storage claims

The trusted local resource owner can use `workflow-release-resources` before cleanup reconciliation.
It is a write admitted by the normal managed launcher, not a status command or a new grant:

```sh
project-governance workflow-release-resources --database ORIGINAL_LEDGER --run ORIGINAL_RUN \
  --revision CURRENT_REVISION --worker-directory ORIGINAL_WORKER --registry RESOURCE_REGISTRY \
  --authority ORIGINAL_BINDING_AUTHORITY --kind local-host \
  --evidence ORIGINAL_CLOSURE_REPORT --evidence-digest sha256:ORIGINAL_FILE_DIGEST \
  --receipt RELEASE_RECEIPT
```

The command runs from the original worktree and requires its original worker request, current
workflow revision, existing authority and exact acquisition record. The original native requests,
receipts, local-machine launch/guardian records and retained process membership must match the
workflow. Commands must have resolved cleanup. Fresh complete process enumeration must establish
absence of every retained command owner, group, descendant and reported process. Original worker
absence uses the existing qualified reader identity check; ambiguous native command PID reuse
remains refused. The current original generation reader must still match before a new release.

The input is the owner's existing execution/closure report, not a model-written release receipt.
Its selected byte digest must match. `childStarted` is true; `status` is passed, failed or cancelled;
`processClosure.closed` is true with empty `after.group` and `after.observedTree` arrays;
`observedProcessIdentities` maps recorded PIDs to original start fingerprints; `ended` is finite
Unix seconds. At least one identity must match the same original native command whose execution
window contains both report completion and original file modification time. Every additional
identity is also checked absent. The native-launched report writer should capture its own PID/start
fingerprint at entry and merge it into the final report after child cleanup, separately from child
stop/kill targets. That original writer supplies a stable native identity when short-lived or
detached children are not retained in native membership. It is not permission to add identities or
change timestamps in an old report. A reported `legacyLockReleased: false` refuses. Failed assertions,
budget overruns and source failures remain failures; they do not prevent genuine completed cleanup.
Read the unchanged original report; copying or editing it is not a way to pass freshness checks.

`--kind local-host` is the bound owner's explicit selection for local producer/storage obligations.
Opaque names alone do not prove that scope. It cannot replace device, network, remote, emulator or
continuing-session custody readback. Known reserved claims and emulator recipes refuse; custom
external resources still need their owning adapter. This retains the existing trusted same-account
host boundary, not authentication of arbitrary local code or human/API approval.

The runtime constructs the existing `WorkflowCleanupReceipt` and publishes it durably without
replacing any existing file. It then rechecks evidence and uses the canonical workflow store's short
snapshot transaction around the existing registry release. Slow file/process observation happens
outside that writer lock. All original lease owners/generations are checked atomically by the
registry; it never acquires, transfers or steals a claim. Interrupted release reuses the original
receipt. A matching historical release is read back without touching later owners or rewriting facts.
No second registry, schema migration, force option, process signaling, stage dispatch or acceptance
record is added.

Successful release exits 0 for that administrative operation and leaves workflow/stage outcomes
unchanged. Run the separate existing `workflow-reconcile-cleanup` with the same original receipt,
current revision, resource registry and original worker directory. A reconciled failed/cancelled
workflow still exits 1. Cleanup is not ordinary accepted development or API approval.

### Original observation-only mixed iOS owner release

The same `workflow-release-resources` entry has an explicitly selected `--kind ios-observation`
adapter. Its scope is exactly one original `ios-device` claim, the matching `ios-app` claim and
one owner-declared local-storage claim. It accepts no additional network, emulator, remote,
continuing-session or other reserved claims. All operations must be local. The local claim is
selected with `--local-resource`; `--lock-directory` names the existing original host custody
directory through a canonical path with an existing canonical parent. The original trusted owner
asserts that mapping; neither opaque names nor the model establish it. The mapping is bound into
the immutable original release receipt. This remains the existing trusted same-account host boundary.

Use the original hash-selected observation report. It must identify the bound `deviceUdid` and
record `appOrSDKLaunch: false` and `ownedFileLockHeld: false`. Its `observedAt` and original file
modification time must fall within the same original native command's execution window. Original
native request, trusted command outcome/cleanup, machine, process owners and retained descendants
are verified by the shared release evidence owner; source edits and expired test clocks are not
rewritten or renewed. The report is never copied, adapted or backdated into a producer-report shape.

That report is not fresh device/SDK cleanup. The administrative adapter obtains fresh cleanup using
the existing qualified physical observer on the exact original device/app pair. It requires current
hardware/device identity, the single matching installed app container and app-process absence. It
also requires current absence of the original local lock directory and all retained host processes.
It only reads lock state and device-info JSON; it never steals/deletes a lock, launches/stops/installs
an app, runs an SDK lifecycle operation, answers a dialog or resumes a workflow stage. Recorded
`sdkLifecycle` is `unclaimed`: no-launch and app-process absence do not establish SDK shutdown.

All original authority, revision, acquisition generations and installed-generation reader checks
remain. The command collects its fresh observation outside the workflow writer transaction, publishes
the existing create-only release receipt, rechecks host/lock/evidence/generation state, and refuses
if more than five seconds elapsed since completed device readback. The existing short snapshot
fence and atomic registry release retire the complete original claim set. An interrupted retry
retains the journal, obtains fresh closure again, and requires the same original proof, mapping and
device/app identity. A completed historical replay does not disturb later owners. Reconciliation
remains separate and preserves original outcomes. No native API approval or acceptance is created.

The relevant primary-source comparison reuses existing owners. Apple's
[device command-line documentation](https://developer.apple.com/documentation/xcode/interacting-with-devices-using-the-command-line)
(HTTP Last-Modified 2026-09-24; reviewed 2026-10-30) recommends versioned JSON output for automation.
Our physical observer already follows that approach; this adapter composes its readback with the
original host/lock owner instead of changing the device parser. Kubernetes'
[finalizer contract](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/)
(updated 2025-04-27; reviewed 2026-10-30) retains owner-specific cleanup obligations until established.
The overlap here is exact owner/evidence retirement, not a new controller or proof of performance.

### Terminal workflow reader finalization

After original resource cleanup is recorded, `workflow-reconcile-cleanup` with the original
`--worker-directory` also retires its exact detached runtime reader. An already-terminal replay
requires the current revision, original hash-bound cleanup receipt, resolved stages and matching
outcome. It does not release later resource leases or turn failed assertions into success.

Complete process enumeration must prove the original worker absent. The macOS finalizer may also
recognize PID reuse when the saved and freshly observed start fingerprints are calendar-valid and
different, and a fresh C-locale UTC start is strictly later than the unchanged original owner
acknowledgement's filesystem timestamp. A different display string alone is insufficient: legacy
fingerprints have no timezone. Equal, missing, malformed, unreadable or temporally ambiguous
identities refuse. Other platforms retain numeric-PID absence until separately qualified.

The existing trusted local evidence boundary applies to the original request and acknowledgement;
recovery rechecks their bytes and acknowledgement timestamp before retiring the reader. It never
rewrites that evidence, signals/adopts the replacement process, changes outcomes, dispatches work
or relaxes receipt/resource/generation ownership checks. Stopped-worker observation and cleanup
continuation retain their separate conservative PID-absence requirements. No force flag is added.

### Recovery through the managed launcher

The managed runtime admits `command-resume-cleanup`, `command-recover` and `command-reconcile`
as writes against an original command directory and request digest. Resume requires an authority
reference, proven command-worker absence and the original guardian/process identities. Recover
requires independently observed process absence. Reconcile binds existing evidence. None replays
ordinary work. A workflow failed-verification state may contain a stage with `commandOutcome: unknown`;
consumers must inspect stage evidence and must not infer that no external or local effect occurred.

`check-reconcile --run <id>` also uses managed write admission. It releases only the stopped
check's verified runtime reservation after confirmed native command cleanup. Preserve workspace,
reader, request and process identity checks, unrelated reservations and the original failed result.
Recovery does not execute skipped packs or turn that incomplete check into a passing commit gate.

At normal native exit, a recorded descendant may still be finishing outside the original process
group. Observe the group and all recorded descendant PIDs within the command's existing termination
grace before declaring cleanup uncertain. Finish immediately when full enumeration proves absence;
do not add an unconditional delay or another retry. A live or reused recorded PID, invalid membership
record or failed enumeration keeps cleanup unknown. This observation grants no new signaling
authority. The guardian retains its existing independently verified owner-loss recovery path.

### Stable machine identity for native ownership

New command launch acknowledgments and diagnostic owners use the stable local machine identity
specified by [startup ownership](startup-runtime-updates.md#stable-local-machine-ownership).
A changed hostname alone does not defeat local recovery. A mismatched, invalid or missing stable
identity on a machine-bound record still refuses recovery. Legacy records retain their literal host
comparison; they are never relabelled automatically. Recovery evidence remains bound to the original
launch and receipt digests, and complete positive absence of every recorded process is still required.
No execution replay, process signaling or resource release authority is added.

### Configured local development binding (4.4)

The operator may deliberately select `workflow_authorization.mode: task` in
`config/governance/profile.yaml`. The existing host binding adapter then creates an ordinary exact
workflow binding through current task/action authority without a second human dialog. This is an
explicit change in project policy, not authenticated consent inferred from a model-written file.
Installing or updating the package never enables it. Missing configuration uses `operator` mode;
malformed or unreadable configuration refuses. Unknown authorization fields refuse.

```yaml
workflow_authorization:
  mode: task
  resources: []
  credential_env: []
```

`resources` lists exact permitted declared resource identities; `credential_env` lists permitted
credential environment names using the existing credential-name validator. Omitted lists allow none.
A recipe must request only listed resources and credentials and existing `read`/`local` operations.
These declarations do not confine arbitrary project code or authenticate human intent. Host access
controls, user restrictions, project custody guards and the current task's constraints still apply.
Do not claim that a local label or credential filtering provides filesystem/network isolation.

The installed `workflow-bind --request FILE --receipt FILE` command uses its own selected package
and binds the request to the selected launcher's worktree. Direct CLI invocation requires its
current directory to be that exact root. Managed launchers set the child's working directory to
their baked worktree; relative request/receipt paths resolve from that root. It accepts the existing
adapter request fields (`runtimePackage` is optional here and must match if supplied). It creates no
worker. Its receipt supplies the ordinary `workflow-submit` action and authority reference. The
standalone packaged adapter also uses configured selection; existing cycle and workspace enrollment
commands retain their original explicit approval contracts.

Older hosts without the new policy API retain native operator confirmation in the standalone adapter.
Partial or malformed policy API support refuses.

Task mode rechecks the normalized policy before binding, records `approvalRoute: task-policy`,
`policyDigest` and `boundAt`, and uses the existing task ID as provenance. It does not record a human
`approvedAt`, create a reusable grant, add expiry, or introduce a new execution-record format. The
policy digest describes the binding decision, not a new execution-time revocation mechanism. Existing
engines that understand ordinary exact bindings can read these records; no prefix claims otherwise.

Each changed source/catalog/driver or current task revision requires a fresh operation ID and receipt,
with current inputs and a fresh authorized action. It needs no new dialog while the chosen policy
covers the declaration. Exact replay keeps the original action when current selection still permits that route, or when
operator mode only reads back a completed receipt. Narrowed
policy can refuse replay without revoking the underlying action. An operator receipt cannot replay
through task policy: preserve its original route and receipt. Opt-out can read back an already bound
task receipt without creating authority. Do not reuse a receipt for changed
inputs, relabel a prior operator receipt as task policy, mutate in-flight commands, or replay completed
stages. Current task/version/cancellation checks still run at dispatch and each ordinary stage;
withdrawn scope stops later stages and cleanup remains available. Resources, process observation,
deadlines and unknown-cleanup ownership retain their existing executor owners.

Changing back to `operator` stops new policy bindings. It does not revoke already authorized actions.
Use existing task withdrawal/cancellation for those actions and settle cleanup before a successor run.
Interrupted receipt journals retain their existing reconciliation rules. Pending task-policy receipts
retain route and policy digest; recovered binding time records successful readback, not a human click.
Older incomplete receipts may lack that provenance and are never retroactively labelled as approved.
If a task-policy journal has not yet authorized its binding and the project opts out, fresh native
operator confirmation may finish that exact pending binding. The receipt then records the actual
operator route while preserving the original action and opaque task provenance reference.
Public refusal diagnostics name fixed causes without echoing private JSON/YAML/source excerpts. No project policy edit clears
resource ownership, authorizes publication, changes a provider permission or upgrades an adopter.

For a single already configured, demonstrably isolated check, prefer the existing pack/check route.
That route has durable command observation but does not acquire workflow shared-resource leases.
Never migrate a shared build/device command merely by renaming it a check. Structured plans help
coordinated work; ordinary diagnostics require no new cadence exception or admission layer. Existing
explicit project requirements, Git hooks and release qualification remain effective.

### Operator workflow binding adapter

The canonical `components/engine/scripts/workflow-host-binding.mjs` supplies a narrow
macOS operator entry for installations exposing `@organta/project-governance/host/v1`.
It loads that declared export from the worktree-selected installed package. It does
not replace the installed runtime, add a public self-approval flag, or submit work.

The request identifies `runtimePackage`, `workspace`, `taskId`, `taskVersion`,
`sessionId`, `recipeFile` and a stable `operationId`. The adapter derives the ledger
from Git, checks the current task/session/worktree/branch, project pin, local-check
policy and actual input hashes, and resolves commands from the project catalog.
In default `operator` mode, the executable presents the exact commands, claims, resources and recipe digest
in a macOS operator dialog. Cancellation or timeout creates no action. Request text,
stdin, environment variables and chat approval labels cannot answer that dialog.
Only a human may accept it; agent UI automation must not accept its own grant.

After approval, the adapter rechecks identity and inputs, creates one local check
action through the host API and binds the exact workflow. It returns a durable receipt.
A receipt lock serializes concurrent calls. Exact replay validates the existing
binding and returns the original action; it does not create authority. Changed
requests refuse. An interrupted action-creation intent requires reconciliation;
an interrupted binding retains its original action and requires operator review
before binding. A retained lock reports whether its recorded PID exists, is absent,
or is unknown; PID existence is not verified process identity. The adapter never
reclaims it automatically. The operator must inspect the original owner and receipt
journal before recovery, preventing racing reclaimers from deleting a new live lock.
Workspace revocation remains available without that lock. No ledger writes bypass
the published stores.

Run the adapter with `--request REQUEST.json --receipt RECEIPT.json`. The receipt's
binding supplies the existing public `workflow-submit` arguments. Binding creates
no worker and acquires no build/device resource. The workflow owner still checks
candidate identity, disk limits and device custody before submission.

This is an operator-controlled entry, not a qualified native Codex approval callback
or an authentication boundary against malicious code under the same OS account.
The imported callback seam is for trusted hosts; configured selection above is its supported policy caller. Synthetic confirmation
proves plumbing, not human approval. Qualification includes refusal/replay tests,
an installed public-CLI harmless workflow and the actual native operator entry.
No adopter runtime update or remote release follows from these local proofs.

### Bounded local iteration authorization

`components/engine/scripts/workflow-cycle-authorization.mjs` extends the same host
entry for an operator-approved build/fix/retest cycle. It adds no runtime installation
or model self-approval switch. `enroll --request FILE --receipt FILE` presents one
native operator dialog and records the approved envelope through the published
Store ledger. The file is only a locator; ledger contents supply the actual bounds.
A stable enrollment ID recovers a lost acknowledgement without a second prompt.

The envelope fixes task/version/session/worktree, installed runtime identity, exact
catalog operations, resource identities, each operation's required resources,
input roots, immutable resource/custody guards, stage/run deadlines and an expiry
of at most 24 hours. The legacy cycle filter retains its existing direct shell/eval refusals. Source and test hashes
may change within these bounds. Commands, device identities, guard bytes and limits
may not. The host and selected source remain trusted; this is scoped host attribution,
not an OS sandbox or cryptographic authentication against another same-account writer.

`bind --request FILE --grant FILE` checks the ledger envelope and fresh source hashes,
then uses the existing binding journal and installed WorkflowStore to authorize one
exact successor. It does not prompt or dispatch. Operation IDs select stable receipt
paths recorded with enrollment; exact replay returns the original action/binding.
Changed inputs with a reused operation ID refuse. Interrupted creation preserves the
existing reconciliation requirement. Call the normal installed workflow runner to
submit the resulting binding; no tests or result acceptance are waived.

`revoke --request FILE --grant FILE` advances the task revision and records revocation.
That makes earlier task-bound workflow bindings stale, including undispatched ones.
It intentionally invalidates all grants at that task revision. Existing process and
resource cleanup still belongs to the workflow runner; revocation is not a process
kill or permission to discard evidence. Task completion and expiry also refuse new
cycle admission. The current enrollment entry requires a human native confirmation;
chat text or a copied approval label is not an authenticated ingestion route.

### Reusable workspace workflow approval

The explicit `enroll-workspace`, `bind-workspace` and `revoke-workspace` modes use
one reviewed workflow across task revisions and successor tasks in the same
worktree and host session. Task-cycle receipts retain their old scope. They are
never promoted or interpreted as workspace approval.

The trusted host presents the bounded native review before calling
`WorkflowStore.authorizeWorkflowGrant`. The stored grant owns exact operations,
runtime/worktree identity, input roots, immutable guards, required resources,
limits and an expiry of at most 24 hours. The receipt holds a locator. Changing
that file cannot change the database record. Enrollment acknowledgement recovery
reuses the original record; changing bounds requires another enrollment and review.

Each bind still runs current task authority checks and creates a fresh action for
that task and revision. Scope withdrawal, closed tasks or action refusal override
the reusable grant. Exact operation replay retains its original action and run;
it cannot transfer an old task action to a new task.

The workflow store checks the grant at binding, submission, worker claim and
before each ordinary stage. Expiry or explicit grant revocation blocks queued and
later work across all tasks using it. Already-running commands retain the existing
bounded cancellation/cleanup contract. Cleanup is still available after revocation.
Runtime, branch, command, resource, guard or limit changes refuse reuse.

Workspace enrollment adds its table without advancing the shared engine schema.
Each workspace action stores a domain-separated approval digest for the
`workspace-workflow-1` contract. Older engines expect the ordinary binding digest
and refuse these actions at authorization replay, submission, claim and ordinary
stage start. Their existing actions, runs, cleanup and diagnostics remain usable
in the same repository ledger. A reader must never rewrite a mismatched digest or
fall back to task-cycle authority. Unpublished schema-4 preview stores are refused;
there is no automatic downgrade or destructive database restore.

Git identity and guard-file checks run before acquiring the database write lock.
Inside the transaction the store rechecks the immutable grant digest, current task,
policy, revocation and expiry. This preserves revocation races without holding the
shared writer lock across Git subprocesses or bulk hashing. It does not make source
files transactional; the existing executor owns input capture and freshness.

Workspace run receipts live in a separate directory keyed by grant identity.
Both completed and incomplete receipts must match the selected authority reference;
operation replay cannot inherit another approval route. Revocation uses only the
verified Git common database, stored workspace/session and grant locator. It does
not require current task, branch, runtime pin, recipe or source bytes, and takes no
receipt lock. A retained locator can revoke after the original receipt folder is
removed. Revocation never grants execution or manufactures a replacement grant.

Normal source/package proof and deliberate adopter installation remain required.
Existing task-cycle approvals retain their original task/version scope. Known direct shell
executables and inline Node/Python/Ruby/Perl evaluation forms are refused for new
workspace grants. Compiler `-c` and pattern-tool `-e` options remain usable. Indirect
wrappers and arbitrary scripts require operator inspection; this filter is not a sandbox: exact reviewed commands, runtime
identity, guards, and trusted host ownership remain the authority boundary.

The compiled archive ships both operator scripts under `dist/engine/assets/host/`.
Use those entries with the selected installed package. The workspace modes require
the corresponding host API; they refuse an older runtime before requesting approval.

For this observation adapter only, a fast original command may have no retained membership sample.
The exact original native supervisor receipt must itself confirm cleanup with a resolved outcome;
unknown execution/cleanup or owner-loss inference cannot substitute. The release proof records
`membershipHistory: not-recorded` and the original native receipt as closure authority. It does not
invent historical descendant observations. Fresh owner/guardian/child/group absence remains required,
and a membership file appearing during collection refuses release. Existing producer-report and
local-host membership requirements remain unchanged.

### Original failed compiler-only simulator release

`workflow-release-resources --kind ios-simulator-build` composes the existing qualified simulator
observer with exactly one original local producer claim. Add `--local-resource`, the original
`--lock-directory` and `--simulator-lock-directory` mappings to the normal original run, revision,
authority, worker, registry, report/digest and receipt arguments. This explicit trusted-owner
selection declares a compiler-only failure; empty telemetry alone cannot grant that classification.
It accepts no physical device, app, network, emulator or additional claims, and no SDK rebuild.

The original unchanged closeout must record failed nonzero execution, `nativeSdkRebuilt: false`,
empty `appClosure`, confirmed conflict-free process closure with original observed identities,
released legacy locks and a `finished` time/file modification within the original native command
window. Original native outcomes/owner evidence, retained membership and process identity overlap
are required; all reported processes must now be absent. Nonempty app closure is outside this
compiler-only contract. Do not rewrite a report or treat an empty list as independent SDK proof.

The adapter only observes the exact simulator's current Shutdown state through the existing
qualified JSON device-list observer and current absence of both owner-mapped host lock directories.
It never shuts down or controls a simulator, launches/stops apps, or executes SDK work. Physical
device and SDK lifecycle remain explicitly unclaimed. Both original generations are released
together through the same journal/atomic registry path; original failed outcomes/clocks remain.
The same snapshot, freshness, mismatch and interrupted replay guards apply.

An already released historical run must not be reacquired or assigned a new cleanup receipt to
retroactively qualify an unsupported release. Preserve its actual release journal and failed
outcome; subsequent owners retain their own generations. This adapter qualifies the supported
public route for still-held matching compiler-only runs, not a retrospective acceptance claim.

### Explicit borrowed Android app session

`androidAppSession` is an opt-in recipe descriptor for a borrowed physical device or an
already-running emulator. It does not replace `androidEmulator` or own emulator shutdown.
The two descriptors are mutually exclusive. The original project policy still owns permission.

```json
{
  "androidAppSession": {
    "ownership": "borrowed",
    "serial": "emulator-5556",
    "adb": "/opt/android/platform-tools/adb",
    "userId": 0,
    "localLocks": [{"resource": "local-producer", "path": "/var/tmp/owned-producer.lock"}]
  }
}
```

The exact original resource set must consist of `android:<serial>`, one or more `app:<package>`
claims and every explicitly mapped local claim. Packages derive from those claims. Do not rename
resources or create aliases. ADB must be a canonical external executable outside the workspace;
local lock parents must exist at canonical paths. Unsupported/mixed identities, duplicate mappings,
missing descriptors and unmapped local claims refuse before new acquisition. Existing stored
workflows are not migrated or reinterpreted.

Normal finish and stopped-worker cleanup continuation read exact selected ADB inventory, explicit
foreground Android user, package/user UID mapping and complete wide numeric process-name output.
Parse the numeric PID and UID columns, then retain the entire final NAME column. Kernel and other
process names may contain spaces. Missing names, invalid numeric fields and duplicate PIDs still
refuse; a name containing spaces never exempts its UID or selected package/service match.
Successful remote completion is mandatory. Any selected UID process, same-user exact package
process or colon-suffixed service prevents release, including custom process names, shared UIDs
and SDK sandbox processes. Any same-user isolated UID whose package ownership is unavailable
retains custody, even when it may belong to another app. When such rows are present, the adapter
uses Android's read-only `cmd activity get-isolated-pids <full-package-uid>` for each distinct selected
package UID. Only an explicit successful `[]` proves absence for that UID; unsupported, malformed,
empty, nonempty or failed responses retain custody. Repeat this observation after the user/package
identity recheck. This establishes package ownership, not SDK lifecycle acknowledgement or the
absence of every indirect cross-package service dependency. The existing process-inventory digest
also binds those bounded ownership responses; no new receipt/store schema is introduced.
The adapter rechecks user/package identity after enumeration
and observes actual absence of every original local lock. Shared UIDs can conservatively retain
claims for another active app. Unsupported output, missing package identity, stderr, transport
failure, timeout or truncation is unknown. `device` connectivity alone does not prove boot readiness.
Raw full package/process inventories are not persisted in receipts.

For a resolved stopped original worker, `workflow-release-resources --kind android-app-session`
uses the ordinary base flags (database, run, current revision, worker-directory, registry, authority,
evidence, evidence-digest and receipt). Select one **original native command `result.json`** and its
actual digest as evidence; a project-authored closure report is insufficient. Device/user/lock
mappings come only from the original recipe, not new CLI declarations. Original native confirmed
cleanup, host/process absence, exact whole-set leases and generation readers remain mandatory.
The existing create-only journal, snapshot transaction, freshness, interruption re-observation and
historical replay machinery applies without a new store or schema. Normal reconciliation preserves
the original failed/cancelled/unknown semantics and never reruns completed work.

This adapter never force-stops an app, controls an emulator, installs software or calls an SDK.
It releases genuinely closed resource custody without inventing SDK close acknowledgement or
accepted test/API results. A borrowed device/emulator remains running. The owned-emulator adapter
still requires emulator absence, closed owned ports and absent original lock. Offline injected
fixture proof establishes the runtime contract; actual device qualification belongs to its owner.

### Preserve qualified native recovery in resource evidence

An original raw native receipt can remain `unknown`/cleanup `unknown` after qualified recovery.
Resource-owner evidence uses the same read-only recovered view as workflow settlement only when
the stage already records the exact raw `receiptDigest` and `recoveryDigest`. Original native request,
launch, machine, membership, process absence and expected-exit-code bindings still apply. Recovery
bytes join the immutable evidence snapshot and are checked again before release. A known native
exit remains failed or cancelled as originally derived; lost execution is never promoted. Raw
receipt bytes, native result clocks and failed results remain unchanged. This is cleanup custody,
not successful development, SDK/API acceptance or permission to replay completed commands.

### Explicit owned-emulator app sessions

A fresh app session may declare `ownership: owned-emulator` while retaining its original
`android:<serial>`, `app:<package>` and every mapped local claim. Add
`emulator: {bootStage: "device", lockPath: "/var/tmp/owned-vm.lock"}` to the existing descriptor.
The serial must be an exact supported even emulator console port. The boot stage must be an
ordinary declared stage. Do not combine this descriptor with `androidEmulator`, rename claims,
retrofit older bindings or relabel an existing borrowed VM. The project retains boot/shutdown
authority; Governance adds only observation and attribution.

The original project producer writes `android-emulator-owner.json`, create-only, in the boot
stage's existing `PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR`. The version1 record contains:

- `runId`, `stageId`, `ownership: owned-emulator`, exact `serial`, `userId` and `lockPath`.
- `initial: {targetAbsent: true, portsClosed: [consolePort, adbPort], lockAcquired: true, observedAt}`.
  These are facts observed by the original admitted producer before starting its own VM. Failed,
  ambiguous or borrowed-target observations cannot be recorded as confirmed absence/ownership.
- `emulator: {pid, fingerprint}` for the VM process, recorded among the original command's retained
  native descendants. A supervisor or wrapper PID, missing membership or mismatched fingerprint
  is insufficient.
- `bootedAt` (host VM launch time) and final `observedAt`, within that original native command.
  The report's actual mtime must also be within the original command window. No guest readiness,
  SDK-close acknowledgement or successful app outcome is inferred from those timestamps.

All original native commands must have qualified resolved outcomes and actual owner/group closure.
A normal worker can briefly observe a native supervisor after it wrote the terminal receipt. Only
that normal path waits up to the existing five-second settlement budget for the exact original
identities; PID reuse, missing/mutated evidence or unproved execution still refuses. Public late
owner release does not wait around a live original workflow worker.

Reuse the owned-target observer for successful ADB inventory with exact target absence, closed
console/ADB ports and absent original ownership lock. Compose every original local-lock and native
closure fact, then release the whole original lease set atomically. App absence follows the closed
owned VM, rather than querying an unavailable guest. Keep SDK lifecycle acknowledgement unclaimed.
The original failure/cancellation/unknown state, raw receipts, clocks, generation readers, create-only
journals, interruption re-observation and historical replay fences remain unchanged. The existing
`workflow-release-resources --kind android-app-session` selects only the bound original lifetime.

Offline fixtures prove normal finish, continuation, whole-set public release and harmless successor
reuse without executing an emulator/device. Actual Android qualification and normal deliberate
adoption belong to the existing project owner. This contract does not automatically upgrade pins.


## Explicit observed local-host recovery

A separately approved recovery may use `workflow-release-resources --kind local-host-observed
--request-file <path> --receipt <path>` for an original failed local-only operation whose closure
report lacks a historical native process overlap. The ordinary `local-host` rule still requires
that overlap. Never rewrite an original report or replace its missing history with invented data.

The bounded version1 request supplies `runId`, current `revision`, original `owner`, `authority`,
canonical `workspace`, `database`, `workerDirectory`, `registry`, exact `bindingDigest`, complete
original `leases`, and original `generation` reader (or null only when originally absent).
`report`, `approval` and `mappingEvidence` are canonical ordinary-file references `{path, digest}`.
The approval is an existing explicit authority decision, not an inferred human-confirmation event.
This remains the trusted local account boundary; file references do not authenticate a human.

The request declares `localOnly: true`, `historicalMutexMappingConfirmed: true`, and `guards` entries
`{directory, resources}` covering each original claim exactly once. Multiple logical reservations
may share one real mutex when the original owner's hash-bound mapping establishes that relationship.
Opaque names, absent imaginary locks, unknown mappings and unconfirmed declarations do not justify
recovery. Actual mutex roots must come from retained launch evidence or equivalent original facts.

The runtime validates original worker/native identity, same host, resolved failed effects, original
closure flags and report times, unchanged files, exact whole-set held leases and original runtime
reader. It observes full process/group absence, including all report identities and the original
worker PID; present or reused identities refuse. It observes canonical actual guard absence and
stable parent identity itself. A caller's JSON assertion of absence never substitutes for those
checks. Device, app-session, network or remote custody cannot use this route.

Retain a distinct create-only `workflow-local-host-observed-cleanup` receipt binding request,
approval and mapping digests, original report and native evidence, `historicalProcessJoin: missing`,
actual guard mappings and current absence. Recheck files, complete process inventory, guards,
original generation and the existing workflow/resource snapshots immediately before whole-set
release. The owner keeps that local lane idle through this short observe-to-commit seam. This
coordinates cooperating owners; it adds no sandbox against an unrelated process ignoring mutexes.

An interrupted journal is reused only with the same original scope and fresh observations. A
completed release replay never affects successor claims. Existing `workflow-reconcile-cleanup`
retains the original failed result and clocks and retires only its original reader. No workflow
dispatch, device action, successful test, acceptance, runtime adoption or automatic upgrade follows.
Qualification uses synthetic negative, interruption, public-route and successor fixtures; actual
recovery requires the original owner's admitted public invocation and readback.
