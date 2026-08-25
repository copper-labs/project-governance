---
id: proposed.project-gateway.control-protocol
title: Proposed Project Gateway Control Protocol Specification
type: spec
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress provider-neutral protocol for multi-manager discovery, query, administration, budgets, events, and reconciliation.
---

# Proposed Project Gateway Control Protocol Specification

> **Proposal status:** Proposed and work in progress. The operations and envelopes below are target
> contracts, not active CLI, network, authentication, or runtime behavior.

## Purpose

Define the provider-neutral Project Control Protocol used by authorized manager clients to discover,
query, introspect, and govern one repository through its Project Gateway.

The protocol is product-shaped. It does not expose arbitrary filesystem reads, shell execution,
database queries, provider-native session objects, or internal Python objects.

## Scope

The protocol covers:

- project and gateway discovery;
- manager identity and access profiles;
- capability negotiation;
- bounded project snapshots and run records;
- read-only queries and event subscriptions;
- administrative intents and typed decisions;
- project-local budgets, concurrency, and leases;
- optimistic concurrency, idempotency, and replay protection;
- offline queuing and reconciliation; and
- transport-independent errors and versioning.

Cross-project portfolio state, global scheduling, and global budget allocation are consumer concerns
outside the gateway.

## Protocol Principles

1. One semantic contract supports CLI, stdio, local IPC, HTTP, MCP, or later transports.
2. Read operations are bounded and carry revision, provenance, and freshness.
3. Mutations are typed intents evaluated against current local state.
4. Local admission is authoritative; remote administrative access is not a bypass.
5. Multiple clients may read concurrently; accepted mutations are serialized.
6. Every mutation is attributable, expiring, idempotent, and revision-bound.
7. Capabilities are advertised explicitly and may differ by host, runtime, and run.
8. Unsupported control returns a typed outcome rather than simulated success.
9. Content bodies use bounded inline fields or content-addressed references.
10. Every accepted decision produces a durable control event.

## Common Envelope

Every request and response uses a versioned envelope:

```yaml
protocol_version: project-control.v1
message_id: msg-...
correlation_id: corr-...
causation_id: msg-...
sent_at: 2026-08-24T00:00:00Z
sender:
  actor_kind: manager
  actor_id: manager.delivery
project_id: project.example
expected_project_revision: 42
payload_kind: project.snapshot.request
payload: {}
```

Administrative requests also contain:

```yaml
expires_at: 2026-08-24T00:05:00Z
idempotency_key: intent-...
authority_scope: [runs.request]
approval_context: null
```

Transport authentication proves a credential binding. It does not replace actor identity, access
profile, project scope, or intent admission in the envelope.

## Discovery And Capability Negotiation

An authenticated client begins with `gateway.describe`. The response contains a
`ProjectGatewayDescriptor`:

```yaml
project_id: project.example
gateway_instance_id: gateway-...
gateway_version: 0.0.0-proposed
supported_protocol_versions: [project-control.v1]
project_revision: 42
repository_snapshot: git:...
policy_digest: sha256:...
capability_digest: sha256:...
availability: current
capabilities:
  query: [project.snapshot, runs.list, runs.get, events.read]
  administration: [runs.request, runs.cancel, validation.request]
  runtime:
    access_modes: [subscription-host]
    progress_events: true
    pause: false
    resume: false
    cancel: true
    checkpoint: false
    live_steering: false
    session_persistence: true
    session_resume: true
    reported_usage: optional
    reported_cache: unavailable
    reported_quota: unavailable
```

Capabilities may be conditional by runtime or active run. A gateway-level capability does not imply
that every connected runtime supports it.

## Manager Access

### Access Profiles

The first release exposes two simple profiles:

| Profile | Default behavior |
| --- | --- |
| `read-only` | Query state, evidence, events, telemetry, and structured explanations |
| `administrative` | Read plus submit the configured project-control intents |

Profiles expand to granular capabilities so policy can add or remove individual operations without
introducing a new public profile.

Default read-only capabilities:

```text
project.read
runs.read
artifacts.read
evidence.read
events.read
events.subscribe
telemetry.read
introspection.read
```

Candidate administrative capabilities:

```text
runs.request
runs.pause
runs.resume
runs.cancel
runs.reprioritize
checkpoint.request
validation.request
budget.allocate
artifacts.propose
project.refresh
```

Protected capabilities are not part of default administrative access:

```text
policy.change
manager.grant-administrator
artifact.approve
effect.merge
effect.deploy
effect.publish
effect.message
learning.activate
```

An administrative manager may propose a protected operation but cannot approve it unless an
independent operator grant explicitly permits that exact capability and policy allows it. A manager
cannot grant itself access or approve its own protected request.

### Manager Registry

An adopting repository or host owns a manager registry equivalent to:

```yaml
managers:
  - manager_id: manager.delivery
    display_name: Delivery manager
    access_profile: read-only
    project_scope: [project.example]
    capability_overrides: []
    credential_binding: identity:fingerprint:...
    issued_at: 2026-08-24T00:00:00Z
    expires_at: null
    revoked_at: null
```

The registry stores identity bindings, not plaintext credentials. Credential issuance, secret
storage, and network identity remain host responsibilities. Registry changes are journaled.

## Project Snapshot

`project.snapshot.get` returns a bounded `ProjectSnapshot`:

```yaml
project_id: project.example
project_revision: 42
control_sequence: 128
repository_snapshot: git:...
observed_at: 2026-08-24T00:00:00Z
freshness: current
availability: available
reconciliation_state: reconciled
policy_digest: sha256:...
capability_digest: sha256:...
goals: []
artifacts: []
work: []
runs: []
leases: []
budgets: []
validations: []
blockers: []
suspensions: []
requested_decisions: []
```

Collections are paginated or explicitly capped. The response states omitted counts and continuation
tokens. It never silently truncates a collection.

Freshness values are:

```text
current
stale
partial
offline
unknown
reconciliation-required
```

## Runtime-Neutral Run Record

Every observed or governed run projects to:

```yaml
run_id: run-...
task_id: task-...
state: running
role: implementation-worker
objective_ref: artifact:...
manager_id: manager.delivery
host_id: codex-host
host_session_id: session-...
orchestrator_runtime_id: orchestrator-...
orchestrator_model_id: model-...
worker_runtime_id: runtime-...
worker_model_id: model-...
base_snapshot: git:...
context_digest: sha256:...
policy_digest: sha256:...
read_scope: []
write_scope: []
lease_deadline: 2026-08-24T02:00:00Z
budget_grant_id: budget-...
usage_state: reported
last_event_sequence: 128
last_progress_at: 2026-08-24T00:00:00Z
pending_approval: null
capabilities:
  pause: false
  cancel: true
```

Run states are proposed as:

```text
requested
admitted
queued
running
waiting
paused
terminal
```

Terminal reasons remain bounded and may include completed, failed, cancelled, timed-out,
budget-exhausted, needs-operator-decision, rejected-result, and runtime-unavailable.

## Read-Only Operations

The protocol should support bounded equivalents of:

- `gateway.describe`;
- `project.snapshot.get`;
- `project.changes.get` after a known revision;
- `runs.list` and `runs.get`;
- `artifacts.list` and `artifacts.get-metadata`;
- `budgets.get`;
- `leases.get`;
- `validations.get`;
- `evidence.get-metadata`;
- `events.read` after a sequence;
- `events.subscribe` where the transport permits streaming;
- `telemetry.get`; and
- `introspection.explain`.

`introspection.explain` returns structured evidence:

- admitted objective and plan revision;
- routing and policy decisions;
- context and tool-catalog digests;
- allowed tools and effects;
- current run state and remaining budget;
- produced artifacts and validation state;
- blockers and requested decisions; and
- source event and evidence references.

It does not require private model reasoning.

## Administrative Intents

Administrative changes use `ManagerIntent`:

```yaml
intent_id: intent-...
intent_kind: run.request
manager_id: manager.delivery
target:
  project_id: project.example
  run_id: null
expected_project_revision: 42
objective_ref: artifact:...
reason: Advance the highest-priority ready work.
priority: 50
preconditions: []
authority_scope: [runs.request]
budget_grant: null
allowed_effects: []
expires_at: 2026-08-24T00:05:00Z
idempotency_key: intent-...
approval_context: null
```

Candidate intent kinds:

```text
run.request
run.queue
run.pause
run.resume
run.cancel
run.reprioritize
checkpoint.request
validation.request
budget.grant
budget.reduce
artifact.propose
project.refresh
blocker.propose
dependency.propose
```

Artifacts, blockers, and dependencies remain proposals until their owning repository workflow
accepts them.

## Gateway Decisions

Every intent returns one typed decision:

| Outcome | Meaning |
| --- | --- |
| `accepted` | State changed or exact work was durably admitted |
| `rejected` | Policy or contract prohibits the request |
| `deferred` | Valid request cannot proceed until a named condition changes |
| `approval-required` | An operator or independent authority must decide |
| `stale-conflict` | Expected revision no longer matches current project state |
| `unsupported` | Gateway, host, or runtime cannot perform the requested control |
| `unavailable` | Required local state or dependency is unavailable |
| `already-applied` | Idempotency record proves the same intent already completed |

The decision contains current revision, policy reason code, related event IDs, and bounded recovery
guidance. It does not expose arbitrary exceptions or secrets.

## Concurrency And Multiple Managers

- Authorized reads do not require a coordination lease.
- Every administrative intent includes `expected_project_revision`.
- The gateway serializes accepted mutations and increments one canonical project revision.
- An idempotency key is unique within the manager, project, intent kind, and validity window.
- A stale revision produces `stale-conflict`; the gateway never rebases an intent silently.
- Operator instructions outrank automated-manager intents.
- A future continuous scheduler may request a short-lived coordinator lease. The lease grants no
  additional capabilities and cannot block emergency operator cancellation.
- Existing repository writer and reader limits remain independently enforced.

## Project-Local Budgets

The gateway accepts only project-local `BudgetGrant` records:

```yaml
budget_grant_id: budget-...
issued_by: manager.delivery
project_id: project.example
scope: run-...
access_mode: subscription-host
hard_limits:
  input_tokens: null
  output_tokens: 20000
  turns: 8
  wall_clock_ms: 7200000
  concurrent_workers: 1
observations:
  input_tokens: unavailable
  output_tokens: unavailable
  cached_tokens: unavailable
  subscription_quota: unavailable
  financial_cost: not-applicable
soft_targets: {}
valid_from: 2026-08-24T00:00:00Z
expires_at: 2026-08-24T02:00:00Z
```

The gateway reserves before launch, records reported consumption, settles terminal usage, and
releases unused reservation. It never invents unavailable token, cache, quota, or cost usage.
Subscription-host runs do not receive an API-dollar estimate, and an unavailable subscription must
not trigger an API-key fallback. Policy decides whether missing hard-limit measurements reject the
runtime, restrict it to measurable limits, or permit a clearly labelled unmetered run.

Global portfolio budget allocation is outside this repository.

## Offline And Reconciliation Behavior

A remote client may prepare or queue an intent while the project is unreachable, but an offline
cache is not project authority. Queued intents retain expected revision, expiry, capabilities, and
preconditions.

On reconnection:

1. the gateway reports current project revision and control sequence;
2. missing events are synchronized;
3. the consumer reconciles its projection;
4. queued intents are re-submitted through normal admission; and
5. stale or invalid intents return typed outcomes.

The gateway does not execute an expired or stale queued intent merely because it was valid when
created.

## Event Delivery

Events use the envelope defined by the journal specification. Consumers may read after a monotonic
sequence number and may subscribe where supported. Delivery is at least once; consumers deduplicate
by event ID and sequence. An event acknowledged by a consumer remains authoritative even if the
consumer later loses its local projection.

## Transport And Authentication Boundary

The first transport is unresolved. Candidate adapters include CLI/stdio, local IPC, authenticated
HTTP, and MCP. The core protocol must not encode transport sessions, HTTP status codes, provider
objects, or MCP-specific payloads.

Every non-local transport requires:

- authenticated workload identity;
- authorization bound to the local manager registry;
- confidentiality and integrity protection;
- request size and rate limits;
- expiry and replay protection;
- revocation behavior;
- audit events for access decisions; and
- no committed plaintext credentials.

## Versioning

- Protocol versions are explicit and negotiated before project operations.
- Clients declare supported versions and required capabilities.
- A major version changes semantics or removes a field.
- Additive optional fields require capability negotiation when their absence changes behavior.
- Unknown intent kinds and capabilities return `unsupported`.
- Provider-native identifiers may appear as opaque metadata but never define protocol semantics.
- There is one active gateway state authority; version changes use explicit migration rather than a
  permanent compatibility store.

## Protocol Acceptance

An implementation may claim conformance only when tests prove:

- distinct operator, manager, host, orchestrator, runtime, model, project, and run identities;
- concurrent read-only clients and serialized administrative mutations;
- profile-to-capability authorization and protected-capability denial;
- expected-revision conflict, expiry, idempotency, and replay behavior;
- capability negotiation and honest unsupported outcomes;
- bounded snapshots, pagination, freshness, and offline reconciliation;
- project-local budget reservation, settlement, and missing-usage behavior;
- event resumption after a known sequence;
- no arbitrary command, filesystem, secret, or provider object in protocol envelopes; and
- no remote manager bypass of repository policy or effect approval.
