---
id: proposed.project-gateway.journal-telemetry-replay
title: Proposed Project Gateway Journal, Telemetry, And Replay Specification
type: spec
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress control journal, evidence, telemetry, privacy, and replay contract for the Project Gateway.
---

# Proposed Project Gateway Journal, Telemetry, And Replay Specification

> **Proposal status:** Proposed and work in progress. This specification does not activate durable
> journaling, trajectory capture, remote telemetry, or replay in the current runtime.

## Purpose

Define the records required to reconstruct gateway state, diagnose failures, inspect manager and
agent activity, and compare repeated executions without treating advisory telemetry or a
model-specific transcript as project authority.

## Record Separation

The gateway maintains four logically separate records:

| Record | Authority | Purpose |
| --- | --- | --- |
| Control journal | Authoritative for gateway transitions | State reconstruction, audit, causality, recovery |
| Evidence and artifact store | Authoritative for referenced bytes and receipts | Exact content, manifests, validation, effects |
| Runtime trajectory | Runtime evidence with restricted authority | Model-visible inputs, tool lifecycle, compaction, diagnostics |
| Operational telemetry | Derived and advisory | Metrics, health, capacity, latency, trends, alerts |

No record silently substitutes for another. A missing trajectory does not erase a control event;
telemetry loss does not reopen an admitted action; a runtime transcript cannot approve project
state.

## Authoritative Control Journal

The journal is append-only and ordered per project. Every accepted mutation and material control
decision emits one event before the gateway reports success.

### Event Envelope

```yaml
journal_version: project-control-journal.v1
event_id: event-...
project_id: project.example
sequence: 129
project_revision: 43
occurred_at: 2026-08-24T00:00:00Z
recorded_at: 2026-08-24T00:00:00Z
actor:
  actor_kind: manager
  actor_id: manager.delivery
correlation_id: corr-...
causation_id: intent-...
event_type: intent.admitted
policy_digest: sha256:...
repository_snapshot: git:...
payload_ref: artifact:sha256:...
previous_event_digest: sha256:...
event_digest: sha256:...
```

The event digest binds the canonical envelope and payload digest. The previous-event digest makes
truncation, reordering, and mutation detectable. A project export includes the chain head and
integrity result.

### Event Families

Access and identity:

```text
manager.registered
manager.updated
manager.revoked
manager.connected
manager.authenticated
manager.access-denied
```

Project and reconciliation:

```text
project.snapshot-produced
project.revision-advanced
project.became-stale
project.reconciliation-started
project.reconciled
project.reconciliation-failed
```

Intents and approvals:

```text
intent.received
intent.admitted
intent.rejected
intent.deferred
intent.conflicted
approval.requested
approval.resolved
```

Runs and leases:

```text
run.requested
run.admitted
run.queued
run.started
run.progressed
run.waiting
run.paused
run.resumed
run.cancel-requested
run.cancelled
run.completed
run.failed
run.timed-out
lease.acquired
lease.released
lease.expired
```

Budgets, validation, artifacts, and effects:

```text
budget.granted
budget.reserved
budget.consumed
budget.released
budget.exhausted
validation.requested
validation.completed
artifact.proposed
artifact.proposal-resolved
effect.requested
effect.approval-resolved
effect.executed
effect.failed
```

Event payloads are bounded schemas. Arbitrary prompts, command output, source content, credentials,
and exceptions do not enter the control envelope.

## Deterministic Read Model

The Project Gateway derives current control state by reducing journal events in sequence. The
reducer is deterministic for the same supported journal version and event bytes.

```text
empty project state + events 1..N = project state at sequence N
```

Read-model checkpoints may accelerate startup but remain derived. Every checkpoint contains the
last included sequence, chain digest, reducer version, and state digest. Recovery verifies the
checkpoint and replays later events. An invalid checkpoint is discarded rather than repaired into
authority.

## Evidence And Artifact Store

Large or sensitive content is content-addressed and referenced from journal events:

- context manifests and selected material;
- worker briefs and result envelopes;
- generated documents and patches;
- validation manifests and findings;
- tool-result summaries and bounded raw outputs;
- approval packets;
- effect requests and receipts;
- runtime error reports;
- checkpoints and reconciliation reports; and
- comparative replay results.

Every stored object includes content digest, media type, byte length, classification, originating
event, retention class, and encryption state. A digest mismatch makes the object unavailable and
emits an integrity finding; the gateway never returns corrupted bytes as evidence.

## Runtime Trajectory

Where a host or runtime supports it, a restricted trajectory may retain:

- exact model-visible input or a content-addressed manifest;
- orchestrator and worker model identity;
- runtime and adapter versions;
- tool requests and bounded results;
- approval and effect request references;
- compaction and session-continuation events;
- provider-reported usage and cache fields; and
- terminal runtime status.

Trajectory capture is capability-negotiated and may be disabled by policy. It is not required to
expose private reasoning. Reasoning fields supplied for provider continuation remain restricted
runtime material and are never exposed as manager introspection.

## Operational Telemetry

Telemetry is derived from accepted journal and runtime events. Candidate measures include:

- gateway request count, latency, errors, and denial reasons;
- snapshot compilation duration and changed-item counts;
- active, queued, waiting, paused, and terminal runs;
- runtime capability and availability;
- manager connection and intent outcomes;
- writer and coordinator lease contention;
- budget grants, reservations, reported usage, and exhaustion;
- validation outcomes and approval latency;
- journal append, reducer, checkpoint, and recovery health;
- evidence-store integrity and retention results;
- transport availability and reconciliation lag;
- host process starts and native session resumes;
- model time-to-first-event and total duration;
- context bytes, selected-item counts, and repeated-prefix ratio;
- provider-reported input, output, reasoning, and cached tokens when available; and
- host-reported compaction or quota state when available.

Unavailable measurements remain unavailable. The gateway does not estimate provider cost,
subscription quota, token savings, or cache hits and present them as reported fact.

Telemetry export must be content-free by default. Sensitive identifiers use bounded pseudonymous
or hashed representations when operationally sufficient.

## Playback Modes

### State Replay

Rebuild the read model from the journal and verify its final state digest. State replay is mandatory
for a durable gateway implementation.

### Forensic Playback

Present an ordered timeline of:

- manager identity and access decisions;
- observed project revision and freshness;
- submitted intent and admission decision;
- policy, context, model, runtime, and tool-catalog digests;
- run, lease, budget, approval, validation, and effect transitions;
- evidence references; and
- failure, cancellation, timeout, or reconciliation behavior.

Forensic playback explains system decisions through structured records, not private model
reasoning.

### Execution Reconstruction

Reconstruct exact available inputs:

```text
repository snapshot
approved artifact revisions
context manifest
policy digest
runtime and adapter versions
orchestrator and worker model identities
tool catalog digest
budget and lease
scope and effect grants
worker assignment
```

Missing bytes or unsupported runtime data remain explicit gaps.

### Comparative Rerun

Run a reconstructed assignment with a deliberately changed model, runtime, context compiler,
prompt, tool implementation, or budget. Bind the new run to the original and report differences in
outcome, evidence, tokens when reported, latency, and effects requested.

The contract promises reproducible inputs and attributable comparison. It does not promise
identical model output.

### Effect Replay

Effects default to simulation during every replay or comparative rerun. A real effect requires:

- a new request and idempotency key;
- current target-state inspection;
- current policy evaluation;
- fresh authorization; and
- a new receipt.

An old effect receipt proves what happened; it never authorizes repetition.

## Data Classification

Every stored object receives one classification:

```text
operational
project-confidential
model-visible
operator-private
credential-sensitive
restricted-trajectory
```

Credential-sensitive bytes should normally be omitted rather than retained. Logs record secret
references or redaction facts, never plaintext credentials.

## Retention, Redaction, And Deletion

The proposal must resolve separate target-owned policies for:

- control journal retention and export;
- evidence and artifact retention;
- runtime trajectory default and maximum retention;
- telemetry aggregation and raw-record retention;
- provider usage and subscription-capacity observations;
- security audit retention;
- operator-requested deletion; and
- legal or project holds.

Redaction produces a new governed projection and redaction receipt. It does not silently rewrite
the journal chain. Where removal is required, the journal retains a content-withdrawal fact while
the restricted object becomes unavailable according to policy.

## Availability And Failure

- Journal append failure rejects the associated mutation before success is returned.
- Telemetry export failure does not reopen an accepted journal transition.
- Evidence-write failure rejects an event that requires that evidence reference.
- Missing optional trajectory data does not fail an otherwise valid terminal result.
- A sequence gap blocks state advancement until reconciliation.
- A digest-chain failure blocks authoritative replay and produces an integrity finding.
- Consumers resume after a known sequence and deduplicate by event ID.
- Storage backpressure may reject new administrative work; it must not discard authoritative events
  silently.

## Acceptance

Implementation conformance requires proof of:

- atomic append and monotonic per-project sequence;
- event and previous-event digest verification;
- deterministic reduction and checkpoint recovery;
- bounded event schemas and content-addressed evidence integrity;
- distinct control, evidence, trajectory, and telemetry authority;
- manager, run, budget, approval, validation, and effect timelines;
- state, forensic, and execution-reconstruction playback;
- simulated effects and fresh authorization for real reruns;
- explicit missing usage, cache, trajectory, and evidence states;
- retention, redaction, withdrawal, and deletion-policy behavior; and
- no plaintext credentials, private-reasoning requirement, or unbounded raw context in control
  events.
