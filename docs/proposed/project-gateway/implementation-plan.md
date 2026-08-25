---
id: proposed.exec-plan.project-gateway
title: Proposed Project Gateway Implementation Plan
type: exec-plan
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress staged implementation plan for the repository-local Project Gateway, subscription-host adapters, access control, and replayable evidence.
---

# Proposed Project Gateway Implementation Plan

> **Proposal status:** Proposed and work in progress. This plan is intentionally outside
> `docs/exec-plans/active/`. It does not authorize source changes, service activation, provider API
> use, publication, remote deployment, or adopter modification.

## Outcome

Deliver one repository-local Project Gateway that multiple authorized managers can query and, when
explicitly permitted, administer. The gateway will become the sole local control authority for
governed agent runs, preserve subscription-backed Codex and Claude Code operation, expose
provider-neutral contracts, and retain durable evidence sufficient for state recovery and forensic
playback.

Implementation stops at the gateway. Portfolio management, cross-project scheduling, global
budgets, business-knowledge machinery, a hosted control service, and an owned IDE or desktop client
remain separately planned consumers.

## Activation Gate

Implementation may begin only after the operator:

1. approves the proposed product boundary and authority order;
2. resolves the blocking decisions listed below;
3. selects a bounded first tranche and its success thresholds;
4. moves an approved copy of this plan to `docs/exec-plans/active/` with `status: active`;
5. records the exact source baseline and implementation branch; and
6. explicitly starts that lane.

Promotion must retain deferred stages as deferred. It must not turn the entire long-term packet into
one implementation authorization.

## Fixed Decisions

1. The Project Gateway is this repository's implementation ceiling.
2. Repository policy and approved Markdown remain above remote managers, orchestrators, and worker
   results.
3. The gateway domain is in-process and transport-neutral. A network service is an adapter, not the
   core.
4. Read-only and administrative are the simple public access profiles; granular capabilities are
   the enforcement mechanism.
5. Multiple managers may read concurrently. Accepted mutations are serialized against one local
   project revision.
6. Administrative clients submit typed intents, never arbitrary shell, filesystem, database, or
   provider-session operations.
7. The durable journal becomes the sole gateway control authority. Current ignored dispatch state
   is retired at an explicit cutover, not retained as a second authority.
8. First-release Codex and Claude Code execution remains subscription-host authenticated. The
   gateway stores no provider credential and never silently falls back to API-key billing.
9. Host sessions, models, usage, caching, quota, pause, resume, cancellation, checkpointing, and
   steering are capability-negotiated. Missing capability remains unavailable.
10. Gateway query, admission, journal, reduction, telemetry, and manager polling are deterministic
    operations and add no model call.
11. Provider prompt caching is an opaque optimization. Correctness and budget enforcement do not
    depend on cache hits or API-only cache controls.
12. State replay reconstructs authoritative gateway state. Model rerun reproduces recorded inputs
    where available but does not promise identical output.
13. External effects are separately requested, approved, receipted, and simulated by default in
    replay.
14. Ordinary local and solo governance remains usable when the remote gateway surface is disabled.

## Blocking Decisions Before Activation

| Decision | Why it blocks | Required evidence |
| --- | --- | --- |
| First tranche | Prevent an architecture packet becoming an unbounded build | Explicit included stages and deferred stages |
| Initial transport | Determines authentication, streaming, deployment, and attack surface | Comparison of CLI/stdio, local IPC, authenticated HTTP, and MCP against the protocol |
| Workload identity | Manager access cannot rest on a display name or bearer value in a request body | Credential binding, rotation, revocation, and local registry design |
| Journal storage | It becomes the sole control authority | Atomic append, locking, recovery, integrity, migration, backup, and retention proof |
| Evidence storage | Playback cannot retain unbounded content in events | Digest, classification, encryption, withdrawal, and garbage-collection rules |
| Administrative minimum | Remote write access should start narrower than the long-term capability list | Exact first-release allowed and protected operations |
| Codex host surface | Installed host surfaces may be experimental or change | Capability probe and subscription-authenticated conformance run |
| Claude Code host surface | Non-interactive and resumed execution need an explicit supported subset | Capability probe and subscription-authenticated conformance run |
| Session binding | Reuse can save context but can also preserve stale authority | Project/task/operator binding and invalidation rules |
| Performance thresholds | Numeric limits without a native baseline would be arbitrary | Direct-host measurements for selected representative workloads |
| Dispatch cutover | A partial migration would create two authorities | One-time migration, rollback boundary, and legacy-store retirement procedure |
| Retention defaults | Trajectories may contain sensitive model-visible material | Separate control, evidence, trajectory, telemetry, and security retention policy |

## Delivery Strategy

The lowest-risk useful sequence is:

```text
contracts and baselines
        -> durable local authority
        -> current local dispatch cutover
        -> subscription-host conformance
        -> read-only gateway
        -> administrative gateway
        -> remote hardening and release proof
```

Read-only access precedes administrative access because it proves identity, projection, freshness,
events, and multiple-manager behavior without granting new mutation authority. Current dispatch is
cut over before a remote mutation surface exists so there is only one local admission boundary.
Performance baselines precede host decoupling so regressions are visible rather than rationalized
afterward.

## Stage 0: Resolve Decisions And Freeze Baselines

**Purpose:** Turn the proposal into a bounded, measurable implementation tranche.

**Work**

- Resolve the blocking decisions required by the selected tranche.
- Define representative direct-host workloads: deterministic read-only query, bounded analysis,
  bounded implementation, resumed long-horizon work, and concurrent projects.
- Capture current route/start/finish, writer/readers, replay protection, suspension, budget, terminal
  receipt, telemetry, and failure behavior as versioned compatibility fixtures.
- Define a provider-neutral host capability probe that does not inspect or export credentials.
- Record direct native-host cold, warm, resumed, and concurrent baseline measurements.
- Classify every measurement as gateway-local, host-reported, derived, unavailable, or
  not-applicable.
- Set tranche-specific latency and context-overhead thresholds from the measurements. Do not invent
  provider cache-hit or subscription-quota targets when the host cannot report them.

**Proof**

- Baseline fixtures replay current behavior deterministically.
- No provider API key is required or read.
- Measurements separate local gateway work from host/model time.
- The activated plan names exact included and deferred stages.

**Pause if** either host cannot demonstrate a stable enough subscription-authenticated control
surface for the selected tranche. Narrow the tranche to the in-process gateway and simulator rather
than substituting API use.

## Stage 1: Define The In-Process Domain And Conformance Kit

**Purpose:** Make protocol semantics executable without activating a transport or changing current
runtime behavior.

**Candidate ownership**

- A new bounded gateway package owns identities, capabilities, project revisions, snapshots, run
  records, intents, decisions, budgets, events, and errors.
- JSON or YAML schemas own portable wire fixtures.
- Current orchestration modules remain authoritative during this stage.

**Work**

- Implement immutable domain records from the product and protocol specifications.
- Implement canonical encoding, digest rules, size limits, pagination, timestamps, and reason codes.
- Implement access-profile expansion and protected-capability rules as pure policy inputs.
- Implement an in-memory conformance gateway and non-production manager simulator.
- Define transport, journal, evidence, runtime, clock, identity, and telemetry adapter protocols.
- Add version-negotiation and honest `unsupported` outcomes.
- Keep provider SDKs, host objects, credentials, sockets, and model calls outside the core.

**Proof**

- Canonical fixtures round-trip across the public protocol.
- Unknown fields, versions, capabilities, and intent kinds follow the version contract.
- Bounded input rejects oversized, unpaginated, secret-bearing, or arbitrary-command payloads.
- The in-memory gateway proves two readers, revision conflicts, expiry, and idempotency.
- Importing and calling the core starts no host, network service, or model.

## Stage 2: Build The Durable Journal, Evidence Boundary, And Read Model

**Purpose:** Establish recoverable local state before it becomes runtime authority.

**Candidate ownership**

- A journal adapter owns atomic append, sequence, digest chain, and locking.
- A deterministic reducer owns project state.
- An evidence adapter owns content-addressed bytes, classification, integrity, and retention facts.
- Telemetry remains a derived observer.

**Work**

- Implement the versioned event envelope and bounded event-family schemas.
- Append events atomically with monotonic sequence and previous-event digest.
- Implement deterministic reduction, checkpoints, restart recovery, and corrupted-tail handling.
- Implement content-addressed evidence writes and digest verification.
- Implement state replay, bounded event reads, and export with integrity result.
- Add explicit unavailable and reconciliation states.
- Keep the new journal isolated from live dispatch until the cutover stage.

**Proof**

- Property and fixture tests prove deterministic reduction for the same supported bytes.
- Concurrent append cannot duplicate sequence or silently lose an accepted event.
- Truncation, reordering, mutation, checkpoint corruption, and evidence mismatch are detected.
- Telemetry failure cannot alter journal state.
- Journal or required-evidence failure prevents mutation success.

## Stage 3: Cut Current Local Dispatch Into One Gateway Authority

**Purpose:** Replace the short-lived dispatch control store without creating a permanent shim or a
second runtime authority.

**Candidate ownership**

- `agent_orchestration.py`, `agent_routing.py`, current CLI commands, and their tests become thin
  callers of gateway domain operations.
- The gateway journal and reducer become the only active control-state owner.

**Work**

- Map current route requests, authorizations, leases, usage ceilings, suspensions, terminal reasons,
  and receipts to the new records.
- Define one activation transaction: inspect current control state, migrate any valid active state,
  verify the resulting projection, and switch command reads and writes to the gateway.
- Preserve current CLI behavior and compact worker-brief contracts unless an approved protocol
  change explicitly replaces them.
- Stop reading and writing the prior control path after successful cutover.
- Provide pre-cutover abort and recovery from journal backup; do not retain ongoing dual writes.
- Emit compatibility evidence for every frozen Stage 0 behavior.

**Proof**

- Current orchestration tests pass through the gateway core.
- Active writer and reader constraints remain repository-wide and race-safe.
- A consumed route remains single-use; expired, malformed, stale, and suspended work fails closed.
- Terminal events release leases and settle measurable budgets once.
- Repeated start, finish, recovery, and cancellation calls are idempotent.
- A repository scan and runtime assertion prove the old control path is no longer authoritative.

**Stop point A:** A durable local gateway authority with no remote access. This is the first safe
implementation milestone and a valid release boundary if host or remote decisions remain open.

## Stage 4: Prove Subscription-Host Runtime Boundaries

**Purpose:** Preserve current subscription use while introducing explicit runtime and session
capabilities.

**Work**

- Implement host capability descriptors and opaque session bindings.
- Select only host surfaces proven by Stage 0; keep experimental surfaces behind capability probes
  and disabled defaults until accepted.
- Normalize assignment, progress, result, cancellation request, usage observation, and host failure
  records without exporting provider-native sessions.
- Preserve requested and actual model identity separately.
- Implement safe session reuse and explicit invalidation for changed project, operator, authority,
  policy, snapshot, egress, and task continuity.
- Materialize content-addressed bounded context with stable instructions before volatile run data.
- Return unavailable for absent cache, quota, token, pause, resume, checkpoint, steering, or usage
  capabilities.
- Treat subscription capacity exhaustion as a typed availability or budget outcome; never launch an
  API-key fallback.

**Performance proof**

- Compare direct native host with gateway-mediated cold, warm, and resumed work.
- Record process starts, session resumes, context bytes, repeated-prefix bytes, turns, tool calls,
  compactions, throttling, total time, and host-reported tokens or cached tokens when available.
- Prove gateway-only controls make zero model calls.
- Prove manager polling and status projection do not create model-generated summaries by default.
- Reject an external-orchestrator-plus-worker default unless measured outcome value justifies its
  second model context.

**Pause if** a host adapter requires credential export, unsupported account automation, API billing,
or an unbounded context resend. Return unsupported and preserve native-host operation.

## Stage 5: Ship The Read-Only Gateway

**Purpose:** Deliver centralized visibility before introducing remote mutation authority.

**Work**

- Implement project descriptor, snapshot compiler, event resume, telemetry projection, evidence
  metadata, and structured introspection.
- Implement the manager registry with the `read-only` profile, granular capabilities, project
  scope, expiry, revocation, and opaque credential binding.
- Select and implement one transport adapter over the in-process domain.
- Enforce authentication, confidentiality, integrity, request bounds, rate limits, replay
  protection, and audit events appropriate to that transport.
- Support concurrent readers and bounded subscriptions from a known sequence.
- Preserve explicit freshness and reconciliation behavior through disconnect and restart.

**Proof**

- Two independently authenticated readers receive the same revision and digest.
- A revoked, expired, wrong-project, replayed, oversized, and rate-limited request is denied.
- Event resume is at least once and consumer deduplication is deterministic.
- Queries reveal no plaintext credentials, private reasoning, arbitrary filesystem bytes, or
  unrestricted transcript content.
- Read traffic adds no model call and remains within approved local latency thresholds.

**Stop point B:** A read-only Project Gateway usable by external project managers. This is the
recommended first externally useful release.

## Stage 6: Add Narrow Administrative Control

**Purpose:** Permit selected remote changes only after identity, state, journal, and read-only
operation are proven.

**Work**

- Activate an explicitly approved subset of administrative capabilities.
- Implement intent admission, expected revisions, expiry, idempotency, preconditions, and typed
  decisions.
- Implement project-local budget grant, reservation, measurable consumption, settlement, and
  release.
- Enforce operator precedence, protected effects, independent approvals, and no self-grant.
- Normalize pause, resume, cancel, reprioritize, checkpoint, and steering through runtime
  capabilities; omit operations no first-release runtime can enforce.
- Serialize accepted mutations while retaining concurrent reads.
- Add offline queue reconciliation without treating the queue as project authority.

**Proof**

- Concurrent conflicting managers produce one accepted transition and one stale conflict.
- Duplicate and expired intents cannot repeat work.
- A manager cannot grant itself access, change policy, approve its protected effect, or bypass a
  local suspension, writer lease, validation, or effect gate.
- Budgets never claim enforcement for unavailable measurements and never convert subscription use
  into API dollars.
- Disconnect, restart, unknown runtime state, and late terminal results reconcile without invented
  success.

**Stop point C:** A narrow administrative Project Gateway. Add capabilities only through a later
policy and conformance change.

## Stage 7: Complete Playback, Operations, And Release Hardening

**Purpose:** Make the gateway supportable, auditable, recoverable, and safe to operate beyond one
development workstation.

**Work**

- Complete forensic playback and execution reconstruction with explicit evidence gaps.
- Add comparative rerun records while defaulting every external effect to simulation.
- Implement bounded retention, encryption, redaction projections, content withdrawal, deletion
  receipts, and legal/project holds according to approved policy.
- Add health, capacity, reconciliation, integrity, authorization, session, context, token, cache,
  and quota telemetry with explicit provenance.
- Add storage backpressure, backup, restore, key rotation, credential rotation, and incident
  runbooks.
- Run transport threat review, dependency review, clean-wheel inspection, and temporary-environment
  install proof.
- Publish operator, manager-client, runtime-adapter, migration, rollback, and playback guides.

**Proof**

- A clean environment can install the wheel, initialize a project, recover the journal, and run the
  conformance suite without provider credentials in the package.
- State replay reproduces the final digest; forensic playback explains actor, cause, policy,
  evidence, budget, and outcome.
- A comparative rerun is attributable and cannot repeat an old effect authorization.
- Retention and withdrawal preserve integrity facts without leaking withdrawn bytes.
- Backup and restore retain sequence, digest chain, manager revocation, and idempotency behavior.
- Direct-host performance comparisons remain within the approved thresholds.

## Cross-Cutting Test Matrix

Every activated stage owns focused tests plus one directly affected integration seam. The stable
release candidate additionally covers:

| Dimension | Cases |
| --- | --- |
| Authority | operator override, policy denial, manager proposal, worker result |
| Access | read-only, administrative, protected, expired, revoked, wrong project |
| Concurrency | two readers, conflicting writers, writer lease, late result |
| State | clean start, restart, stale snapshot, partial runtime, reconciliation |
| Journal | append failure, corruption, truncation, checkpoint recovery, export |
| Runtime | supported, unsupported, disconnected, throttled, budget exhausted |
| Subscription | authenticated host, no API key, no fallback, model unavailable |
| Session | cold, warm, resumed, invalidated, rolled over, cross-project denial |
| Context | bounded packet, digest reuse, changed item, stable prefix, redaction |
| Usage | reported tokens, unavailable tokens, reported cache, unavailable quota |
| Playback | state, forensic, reconstruction, comparative, simulated effect |
| Transport | authentication, replay, rate, size, stream resume, revocation |
| Degradation | remote disabled, telemetry down, evidence down, gateway unavailable |

## Performance And Token Guardrails

- The gateway does not call a model to authenticate, authorize, query, reduce state, append events,
  project telemetry, poll progress, or render deterministic status.
- One operator goal should not create both an orchestrator model turn and a worker model turn unless
  the selected topology requires it and measured value justifies it.
- A host process is not restarted merely to answer a control query.
- A full repository is not resent when a bounded content-addressed context packet suffices.
- Session resume is preferred only when its authority and context remain valid; warm is not assumed
  to mean safe.
- Provider-reported usage is retained as an observation. Unreported tokens, cache hits, quota, and
  subscription cost remain unavailable or not-applicable.
- Concurrency is constrained by project writer/readers, host capability, and subscription capacity.
- Performance regressions are diagnosed against direct-host, cold, warm, and resumed baselines
  before increasing a budget or parallelism.

## Deferred Architecture Artifacts

The proposal packet may later add non-implementing specifications for these consumers after the
gateway protocol stabilizes:

- portfolio manager and cross-project project-management machinery;
- global goal, dependency, schedule, and budget projections;
- business and implementation knowledge retrieval contracts;
- hosted gateway discovery and fleet identity;
- an owned interaction client and model-neutral orchestrator runtime; and
- governed learning proposals and activation.

These artifacts must depend on the Project Control Protocol. They must not add privileged gateway
operations, move repository authority upward, or enter this implementation plan without a separate
operator decision.

## Completion Criteria

An activated implementation plan may close only when its selected stop point is fully proven, all
claimed behavior is documented as current, deferred stages remain clearly deferred, the source
tree has one control authority, and remaining risks are explicit. Completion does not authorize a
remote push, release, publication, hosted deployment, or adopter change.
