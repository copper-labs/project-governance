---
id: spec.engine-workflow-and-device-contract
title: Development Workflow and Device Round Trip
type: spec
status: draft
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
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


### Recovery through the managed launcher

The managed runtime admits `command-resume-cleanup`, `command-recover` and `command-reconcile`
as writes against an original command directory and request digest. Resume requires an authority
reference, proven command-worker absence and the original guardian/process identities. Recover
requires independently observed process absence. Reconcile binds existing evidence. None replays
ordinary work. A workflow failed-verification state may contain a stage with `commandOutcome: unknown`;
consumers must inspect stage evidence and must not infer that no external or local effect occurred.
