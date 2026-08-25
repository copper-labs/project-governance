---
id: proposed.project-gateway
title: Proposed Project Gateway
type: plan
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress architecture, protocol, evidence, and implementation planning for a host-neutral repository Project Gateway.
---

# Proposed Project Gateway

> **Proposal status:** Proposed and work in progress. This packet defines a candidate architecture
> and implementation sequence. It does not authorize runtime implementation, publication, remote
> deployment, adopter changes, or activation of a network service.

## Desired Outcome

Allow multiple authorized remote project managers to inspect and govern one repository with
running agents while:

- preserving repository-local authority;
- continuing to work inside Codex and Claude-hosted environments;
- remaining compatible with a future host-neutral orchestrator using any permitted model;
- separating read-only and administrative access;
- recording durable, replayable control evidence; and
- stopping this repository's implementation scope at the Project Gateway.

The centralized portfolio manager, cross-project scheduler, global budget allocator, hosted
coordination product, and owned desktop or IDE experience are future consumers. They may be
architected against the gateway contract, but this proposal does not implement them.

## Proposal Packet

- [Product requirements](product-requirements.md) defines the first-release users, jobs, outcomes,
  functional requirements, quality requirements, and success evidence.
- [Architecture specification](architecture.md) defines the implementation ceiling, authority
  model, system components, data boundaries, and current-to-future deployment shapes.
- [Control protocol specification](control-protocol.md) defines manager identity, access profiles,
  discovery, queries, intents, events, budgets, concurrency, and reconciliation.
- [Host and runtime boundary specification](host-runtime-boundary.md) separates interaction hosts,
  orchestrators, models, gateways, and workers so current and future execution paths share one
  contract.
- [Subscription host, performance, and token-efficiency specification](subscription-performance.md)
  preserves subscription-backed Codex and Claude Code operation, treats provider caching and quota
  as capability-reported, and defines direct-versus-gateway benchmarks.
- [Journal, telemetry, and replay specification](journal-telemetry-replay.md) defines the durable
  control record, evidence references, runtime trajectories, operational projections, and safe
  playback.
- [Proposed implementation plan](implementation-plan.md) orders the gateway-only delivery slices,
  proof obligations, pause conditions, and future deferrals.

## Authority And Lifecycle

Markdown in this repository remains the active governance authority. Existing runtime behavior is
defined by the current specifications and source. This draft packet does not alter the current
provider-aware orchestration contract, CLI, ignored control state, telemetry, or wheel boundary.

The packet becomes implementation-authorizing only after the operator:

1. approves the architecture and resolves its blocking open decisions;
2. approves a bounded first-release product outcome;
3. promotes the implementation plan into `docs/exec-plans/active/` with `status: active`;
4. links the active plan from the execution-plan index; and
5. explicitly starts implementation.

Until then, contradictions with current specifications resolve in favor of the current
specifications.

## Fixed Proposal Boundary

This repository may eventually implement:

- the Project Gateway domain and provider-neutral contracts;
- project descriptors, snapshots, run records, events, and read models;
- read-only and administrative manager access;
- local policy and command admission;
- project-local budgets, leases, and effect requests;
- durable control journaling, evidence references, telemetry, and playback;
- adapters for current Codex and Claude-hosted operation;
- host-neutral runtime adapter contracts;
- transport-neutral gateway APIs and one deliberately selected transport adapter; and
- conformance fixtures and a non-production manager simulator.

This repository will not implement:

- a centralized AI portfolio manager;
- cross-project durable portfolio state;
- a global budget allocator or cross-project scheduler;
- a hosted coordination service or product UI;
- an owned desktop application or IDE;
- business-specific prioritization or organization knowledge;
- provider credentials or model implementations; or
- automatic policy, approval, or learning activation.

## Review Questions

The proposal is not ready for activation until review settles:

- the first supported transport and credential-binding shape;
- the durable journal storage and recovery contract;
- which administrative capabilities ship in the first release;
- the first-release runtime capability floor for Codex and Claude-hosted adapters;
- default trajectory capture and retention policy;
- exact project-local budget units; and
- the migration boundary from the current local dispatch state into one gateway authority.
