---
id: proposed.project-gateway.product-requirements
title: Proposed Project Gateway Product Requirements
type: prd
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress product requirements for a repository-local, subscription-preserving, remotely governable Project Gateway.
---

# Proposed Project Gateway Product Requirements

> **Proposal status:** Proposed and work in progress. These requirements define a candidate first
> release and do not authorize source implementation, remote deployment, publication, or adopter
> changes.

## Problem

An operator can govern work inside a single Codex or Claude-hosted session today, but an authorized
project manager outside that session cannot reliably discover project state, observe running
agents, change admitted work, allocate a project-local budget, or reconstruct what happened through
one durable, provider-neutral contract.

Directly exposing a host session, filesystem, shell, or model transcript would couple governance to
one tool and create a second authority. Moving execution behind provider APIs would also break the
requirement to retain subscription-backed Codex and Claude Code use.

The product needed in this repository is therefore a Project Gateway: a local control surface that
normalizes state and admissible actions while the repository keeps authority and installed hosts
retain subscription credentials, sessions, model catalogs, and provider communication.

## Users And Jobs

### Operator

- See an attributable summary of goals, work, agents, budgets, evidence, and blockers.
- Grant or revoke simple read-only or administrative manager access.
- Approve protected effects and resolve decisions without delegating ultimate authority.
- Diagnose and reconstruct failures from durable evidence.

### Read-Only Manager

- Discover gateway and runtime capabilities.
- Query current, stale, partial, or unavailable project state without invoking a model.
- Follow bounded events and telemetry from a known sequence.
- Explain admitted objectives, decisions, evidence, usage, and blockers without private reasoning.

### Administrative Manager

- Submit typed, expiring, revision-bound, idempotent intents.
- Request, reprioritize, pause, resume, or cancel work only where runtime capability and policy
  permit.
- Grant or reduce project-local work budgets without controlling a global portfolio budget.
- Receive typed acceptance, denial, conflict, deferral, approval, unsupported, and availability
  outcomes.

### Runtime Adapter Author

- Integrate a host or worker without leaking its session objects into the public protocol.
- Advertise only controls, usage, cache, and quota signals the runtime actually supports.
- Preserve host-owned subscription authentication without API keys or silent fallback.
- Prove performance against a direct native-host baseline.

## First-Release Outcome

One adopting repository can run its ordinary local workflow while optionally exposing one
provider-neutral Project Gateway to multiple authorized managers. The gateway supports bounded
read-only state, serialized administrative intents, runtime-neutral run supervision, project-local
budgets, a durable journal, evidence references, telemetry, and reconstruction. Codex and Claude
Code remain subscription-authenticated execution hosts.

The first release ends at the gateway. A centralized portfolio manager, cross-project scheduler,
global budget allocator, hosted service, owned IDE, and business-knowledge plane are future
consumers.

## Functional Requirements

### Discovery And State

1. The gateway exposes project identity, revision, repository snapshot, policy digest, freshness,
   availability, and negotiated capabilities.
2. Snapshots include bounded goals, artifacts, work, runs, leases, budgets, validations, blockers,
   suspensions, and requested decisions with pagination or omitted counts.
3. Queries and deterministic introspection add no model calls.
4. Offline, stale, partial, unknown, and reconciliation-required states are explicit.

### Identity And Access

5. Operator, manager, interaction host, orchestrator runtime, orchestrator model, worker runtime,
   worker model, project, and run identities remain distinct.
6. The public access profiles are `read-only` and `administrative`; both expand into granular local
   capabilities.
7. Multiple managers may read concurrently. Accepted mutations are serialized against one project
   revision.
8. Administrative access cannot grant itself access, change policy, approve its own protected
   operation, or bypass repository admission.

### Control

9. Every mutation is a typed intent with actor, target, expected revision, scope, expiry,
   preconditions, reason, and idempotency key.
10. The gateway returns typed outcomes and never simulates pause, resume, cancel, checkpoint,
    steering, usage, or budget enforcement a runtime cannot provide.
11. Existing local scopes, writer limits, leases, approvals, validations, and effect boundaries
    remain enforceable.
12. Current route, start, finish, suspension, and terminal-result behavior migrates into one gateway
    authority; no permanent second control store or compatibility shim remains.

### Subscription Hosts And Models

13. First-release Codex and Claude Code adapters use host-owned subscription authentication and
    require no provider API key.
14. Credentials and provider session secrets remain opaque to the gateway.
15. No adapter silently falls back to API billing when subscription capacity or a host capability
    is unavailable.
16. Requested and actual model identities are recorded separately. A host adapter may use only
    models available through its installed, approved surface.
17. Native session continuation is capability-negotiated, explicitly invalidated, and separate
    from assumptions about provider prompt caching.

### Budgets, Journal, And Playback

18. Project-local budgets distinguish enforceable limits from reported observations. Subscription
    runs are not assigned API-dollar estimates.
19. Every accepted mutation and material control decision is durably journaled before success.
20. Large or sensitive bytes are content-addressed evidence, not unbounded journal payloads.
21. State replay is deterministic; forensic playback and execution reconstruction expose structured
    facts without requiring private model reasoning.
22. Replay simulates external effects unless a new request receives current authorization.

## Quality Requirements

- **Authority:** Repository Markdown and approved artifacts remain authoritative above manager and
  model proposals.
- **Performance:** Gateway control operations make zero model calls. Native-host versus gateway-host
  latency and context overhead are measured before numeric service objectives are approved.
- **Efficiency:** Context is bounded, content-addressed, incrementally materialized, and arranged to
  preserve stable host-visible prefixes where possible.
- **Reliability:** Journal append, revision conflicts, replay protection, leases, and reconciliation
  fail closed without inventing runtime state.
- **Security:** Non-local access is authenticated, scoped, rate-limited, revocable, encrypted, and
  free of committed plaintext credentials.
- **Privacy:** Telemetry is content-free by default; runtime trajectory is separately classified and
  retained only by explicit policy.
- **Portability:** Core domain operations do not depend on a provider SDK, network service, host
  object, transport, or UI.
- **Degradation:** Disabling remote access preserves ordinary local governance and solo work.

## Success Evidence

The first release is successful only when evidence proves:

- two independent read-only managers observe the same bounded project revision;
- conflicting administrative intents resolve deterministically without a silent rebase;
- unauthorized and protected operations are denied with attributable reason codes;
- a current host-native task and its gateway-mediated equivalent receive the same governed objective
  and acceptance criteria;
- Codex and Claude Code adapter proofs retain subscription authentication without an API key;
- gateway query, admission, journaling, telemetry, and polling add zero model calls;
- direct, cold, warm, resumed, and concurrent performance trials report local overhead separately
  from host/model time;
- unavailable cache, quota, token, or session fields remain explicitly unavailable;
- journal recovery rebuilds the same project state and detects reordered or modified events;
- effect replay cannot repeat an external action without fresh authorization; and
- turning off the remote surface leaves the local workflow operational.

## Not In The First Release

- Portfolio-wide objectives, dependencies, scheduling, or budget allocation.
- A centralized AI project-manager implementation.
- Business-specific knowledge ingestion, a knowledge graph, or activated learning.
- A hosted gateway fleet, multi-tenant control service, product UI, IDE, or desktop application.
- Provider API-key execution, API cost accounting, or a universal provider client.
- Unbounded prompt, transcript, reasoning, filesystem, shell, or secret access.
- Guaranteed bit-identical model reruns.

## Product Decisions Required Before Activation

- The narrow administrative capability set shipped initially.
- The first transport and workload-identity binding.
- Journal and evidence storage formats, encryption boundary, retention, and recovery objectives.
- The first stable Codex and Claude Code host surfaces and minimum capabilities.
- Session binding granularity and rollover rules.
- Baseline workloads and acceptable measured gateway overhead.
- The exact cutover from current dispatch control state to the durable journal.
