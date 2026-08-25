---
id: proposed.project-gateway.architecture
title: Proposed Project Gateway Architecture Specification
type: spec
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress boundaries and invariants for a host-neutral, repository-authoritative Project Gateway.
---

# Proposed Project Gateway Architecture Specification

> **Proposal status:** Proposed and work in progress. This specification defines a target
> architecture only. It does not authorize implementation or change current runtime behavior.

## Purpose

Define the long-term architecture required for a repository-local Project Gateway that multiple
remote project managers can query and govern without making the remote manager, interaction host,
model provider, or agent harness a second repository authority.

The gateway is the highest component this repository intends to implement. Portfolio and product
components above it remain planned consumers.

## Desired Outcome

An adopting repository can expose a bounded, truthful, replayable control surface that:

1. describes project state and freshness;
2. reports running and queued agents through runtime-neutral records;
3. permits concurrent authorized readers;
4. admits serialized administrative intents through local policy;
5. enforces project-local scopes, leases, approvals, and budgets;
6. retains an attributable control journal and bounded evidence;
7. works from current Codex and Claude-hosted environments; and
8. remains usable when orchestration later moves into an owned runtime or client.

## Implementation Ceiling

```text
                       Future consumers — planned only

 Operator -> interaction client -> orchestrator runtime -> selected model
                                      |
                               remote managers
                                      |
                           Project Control Protocol
======================================|===================================
                                      |
                              PROJECT GATEWAY
                        implementation ceiling here
                                      |
                  project state, policy, journal, adapters
                                      |
                         repository, tools, and agents
```

The line is an ownership boundary, not merely a deployment boundary. A future centralized manager
may consume gateway contracts, but its portfolio database, cross-project reasoning, scheduling,
user interface, and global budgets do not belong in this wheel.

## Actors And Identities

The architecture separates identities that current hosts often collapse:

| Identity | Responsibility | Must not imply |
| --- | --- | --- |
| Operator | Human authority, goals, approvals, and access grants | A particular host or model |
| Interaction host | Conversation, UI, session, and host-native capabilities | Orchestration authority or provider identity |
| Manager client | Remote project query and control client | Permission beyond its local grant |
| Orchestrator runtime | Planning and coordination process | Repository write authority |
| Orchestrator model | Model performing orchestration reasoning | The interaction host or worker model |
| Worker runtime | Executes one bounded assignment | Project planning or policy authority |
| Worker model | Performs one task under a runtime | Authority beyond the admitted task |
| Project Gateway | Local admission, control state, evidence, and protocol boundary | Business prioritization across projects |

Every run and manager interaction uses explicit identifiers rather than deriving provider or
authority from the current host:

```text
operator_id
manager_id
host_id
host_session_id
orchestrator_runtime_id
orchestrator_model_id
orchestrator_provider_id
worker_runtime_id
worker_model_id
project_id
run_id
```

## Authority Order

When inputs conflict, the gateway applies this order:

1. explicit operator decisions and revocations;
2. current repository policy and approved artifacts;
3. gateway admission rules and current project state;
4. admitted remote-manager intents;
5. orchestrator proposals;
6. worker results and runtime observations; and
7. derived telemetry, indexes, and semantic projections.

A remote administrator cannot weaken a higher authority. Models may propose changes but cannot
change policy, grant access, approve their own protected effects, or activate learning.

## Architecture Components

### Project Gateway Core

The core owns provider-neutral domain behavior:

- project identity and capability discovery;
- manager authentication results and authorization decisions;
- project revisions and state transitions;
- query and intent validation;
- run and lease state;
- project-local budget grants and settlement;
- effect-request admission;
- durable control events and deterministic read models;
- evidence references and replay metadata; and
- adapter contracts.

The core must be callable without starting a network service. CLI, stdio, local IPC, HTTP, MCP, or
other transports are adapters over the same domain operations.

### Project Snapshot Compiler

The compiler produces one bounded point-in-time projection containing:

- project and repository snapshot identity;
- approved goal, artifact, plan, and work references available locally;
- active, queued, waiting, and recently terminal runs;
- current manager and writer leases;
- project-local budget state;
- validation and evidence summaries;
- blockers, requested decisions, and suspensions;
- supported control capabilities; and
- observation time, freshness, availability, and reconciliation state.

Snapshot compilation must not scan arbitrary external systems or infer missing project truth. An
adapter may contribute explicit observations with provenance and freshness.

### Manager Access Boundary

The gateway supports multiple authenticated managers with simple `read-only` and `administrative`
profiles backed by granular capabilities. Concurrent reads are permitted. Mutations are serialized
through project revision checks, idempotency, and local admission.

### Agent Supervisor

The supervisor presents runtime-neutral run records. Runtime adapters declare whether they can:

- report progress and usage;
- stream events;
- accept a checkpoint;
- pause or resume;
- cancel;
- accept live steering;
- enforce token or cost limits; and
- bind tool and effect requests to the gateway.

Unsupported capabilities return a typed outcome. The gateway must not claim control a host cannot
enforce.

### Policy And Effect Boundary

Administrative clients submit typed intents rather than filesystem or shell instructions. Local
policy resolves each intent into accepted, rejected, deferred, approval-required, stale-conflict,
or unsupported.

Consequential external actions remain effect requests with exact targets, authority, preconditions,
idempotency, and result receipts. Replay never repeats effects automatically.

### Journal And Evidence Boundary

The durable control journal is the source of gateway state transitions. Large or sensitive content
is retained separately in content-addressed evidence storage. Runtime trajectories and operational
telemetry are distinct records with separate authority, privacy, and retention.

## Data Ownership

| Data | Authority | Gateway responsibility |
| --- | --- | --- |
| Governance policy | Repository Markdown and configuration | Read, validate, digest, and enforce |
| Approved artifacts and code | Repository or named source | Reference exact revisions; never silently replace |
| Project control state | Gateway journal and reducer | Own locally and expose bounded projections |
| Agent runtime state | Runtime adapter observation | Normalize with capability and freshness labels |
| Remote portfolio state | Future external consumer | Do not store as gateway authority |
| Evidence and effect receipts | Gateway evidence boundary | Bind to event, run, snapshot, and digest |
| Runtime trajectory | Runtime or restricted trajectory store | Reference and govern retention; do not treat as project truth |
| Telemetry | Derived projection | Monitor and diagnose; never authorize work |
| Semantic graph or search index | Rebuildable projection | Support bounded retrieval; never replace the journal or repository |

## Supported Deployment Shapes

### Current Host-Integrated Mode

```text
operator -> Codex or Claude-hosted environment
         -> current host model as logical orchestrator
         -> host adapter -> gateway -> workers and tools
```

This is the required first-release mode. Existing solo and native-host workflows must continue when
remote management is disabled.

### Future Host-Bridge Mode

```text
operator -> Codex or Claude-hosted environment
         -> thin bridge -> external orchestrator runtime and selected model
         -> same gateway -> workers and tools
```

This shape is planned but not an implementation requirement for the first gateway release. A
third-party host may still impose its own session and tool policy; the gateway must not claim to
override it.

### Future Owned-Client Mode

```text
operator -> owned desktop, IDE, web, or CLI client
         -> owned orchestrator runtime and selected model
         -> same gateway -> workers and tools
```

The client may change without changing project authority or gateway semantics.

## Architectural Invariants

1. Centralized visibility may be built above the gateway; repository authority remains local.
2. The gateway is this repository's implementation ceiling.
3. Interaction host, orchestrator runtime, model provider, gateway, and worker are separate roles.
4. Host identity never implies orchestrator or provider identity.
5. AI proposes; deterministic gateway code admits and records.
6. Remote clients use typed, versioned operations rather than arbitrary commands.
7. Every mutation includes actor, target, expected revision, expiry, scope, and idempotency.
8. Current repository policy may reject any remote action.
9. Multiple managers may read; accepted mutations are serialized locally.
10. One durable gateway authority replaces rather than duplicates current dispatch control state.
11. Execution runtimes advertise capabilities and remain replaceable.
12. Operational state, evidence, runtime trajectories, telemetry, and semantic projections remain
    separate.
13. Replay reconstructs state and inputs; it does not promise identical model output.
14. External effects are simulated by default during replay and require fresh authorization.
15. Offline or partial observations remain explicitly stale, partial, unavailable, or pending
    reconciliation.
16. Private model reasoning and plaintext secrets are not gateway observability requirements.
17. Disabling the gateway's remote surface leaves ordinary local governance and solo work usable.
18. First-release Codex and Claude adapters preserve subscription-host access and require no
    provider API key.
19. Provider cache, quota, and token details remain unavailable unless the host reports them.
20. Gateway query, admission, journaling, and telemetry add no model call.

## Future Consumer Contracts

The architecture reserves, but does not implement, consumers that may:

- maintain cross-project goals, dependencies, and portfolio projections;
- allocate global token, cost, concurrency, and time budgets;
- coordinate several project gateways;
- provide a centralized AI project-manager experience;
- host an owned orchestrator runtime with arbitrary approved models; and
- provide a desktop, IDE, web, or mobile interface.

Those consumers must use the same query, event, intent, and receipt contracts as any other manager.
They receive no privileged filesystem or policy bypass.

## Non-Goals

- Building the centralized manager or scheduler in this repository.
- Replacing current Markdown authority.
- Implementing a universal task tracker or business-knowledge store.
- Starting a required hosted service for ordinary repository development.
- Selecting a graph database, agent harness, model provider, or UI framework.
- Exposing hidden model reasoning.
- Persisting secrets or indiscriminate raw context for playback.
- Guaranteeing that every host supports pause, resume, steering, or exact usage reporting.
- Maintaining permanent parallel control-state authorities.

## Blocking Open Decisions

- First-release transport and credential-binding mechanism.
- Durable journal storage and recovery format.
- Exact transition from current ignored dispatch state to the gateway journal.
- Default trajectory capture and retention.
- Minimum supported capabilities for current host adapters.
- First-release administrative capability set.
- Project-local budget units and behavior when usage is unavailable.
- First-release subscription-host session affinity, rollover, and performance thresholds.

## Architecture Acceptance

This architecture is ready to govern an active implementation plan only when:

- every blocking open decision has an accepted resolution or an explicit bounded deferral;
- the protocol and journal specifications agree on identity, revisions, events, and replay;
- current host-integrated operation has an explicit compatibility and migration path without a
  second runtime authority;
- future consumers can be implemented without adding a privileged bypass to the gateway; and
- the operator explicitly promotes the proposal lifecycle.
