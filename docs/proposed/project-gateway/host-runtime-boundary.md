---
id: proposed.project-gateway.host-runtime-boundary
title: Proposed Project Gateway Host And Runtime Boundary Specification
type: spec
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress adapter boundary that preserves current Codex and Claude workflows while enabling future host-neutral orchestration.
---

# Proposed Project Gateway Host And Runtime Boundary Specification

> **Proposal status:** Proposed and work in progress. This specification does not add a model
> client, external orchestrator, desktop application, provider bridge, or runtime adapter.

## Purpose

Ensure the Project Gateway functions in current Codex and Claude-hosted workflows without making
either host, its current primary model, or its native agent API a permanent gateway assumption.

The long-term goal is to permit any approved model to act as the logical orchestrator, including
while an operator uses an existing host as the conversation surface. Full enforcement of that goal
may eventually require an owned client and orchestrator runtime, but the gateway contract must not
require a rewrite at that point.

## Role Separation

```text
operator
  -> interaction host
       -> orchestrator runtime
            -> orchestrator model
                 -> Project Gateway
                      -> worker runtime
                           -> worker model and tools
```

One process may currently perform several roles. Identity and authority remain distinct even when
the deployment collapses them.

## Current Host-Integrated Contract

The first release supports a current host adapter that:

- reports explicit host and session identity;
- reports the actual current orchestrator model when the host exposes it;
- projects the existing bounded task and context contracts into gateway requests;
- uses gateway admission before launching governed delegated work;
- reports supported runtime controls and optional usage honestly;
- returns bounded results and evidence references; and
- leaves solo operation available when remote management or the gateway adapter is disabled.

The current host remains responsible for launching its native agents. The gateway neither embeds a
provider client nor pretends it can control host behavior that the adapter cannot enforce.

The first release uses subscription-host authentication. Provider credentials remain opaque to the
gateway, and unavailable subscription capacity must not trigger an API-key fallback.

## Future Host-Bridge Contract

A future bridge may treat the interaction host as a thin UI and capability provider:

1. the host receives an operator mission;
2. a bridge submits the mission to an external orchestrator runtime;
3. the external orchestrator uses a selected approved model;
4. it queries and submits intents through the same Project Gateway;
5. host-native capabilities remain separately advertised; and
6. results return to the interaction host for operator review.

This architecture can make the external model the logical orchestration owner. It cannot guarantee
that a third-party host stops applying its own session, tool, or security rules.

## Future Owned-Client Contract

An owned desktop, IDE, web, or CLI client may later supply:

- the interaction surface;
- orchestrator lifecycle;
- provider and model selection;
- credentials and egress policy;
- approvals and notifications; and
- runtime installation and updates.

It remains a gateway client. Project policy, state, leases, evidence, and effects stay behind the
same gateway boundary.

## Adapter Types

### Interaction Host Adapter

Declares:

- host and session identity;
- operator-authentication context available to the host;
- conversation and approval capabilities;
- native agent-launch capabilities;
- progress, cancellation, checkpoint, and steering support;
- usage reporting; and
- host-imposed restrictions.

It must not infer a different provider, model, or permission when the host does not report one.

### Orchestrator Runtime Adapter

The future contract accepts a bounded mission, gateway descriptor, project snapshot, context
references, model identity, budget, and authority scope. It emits proposed intents, progress,
requested approvals, decisions, and terminal results.

The gateway does not require this adapter for current host-integrated operation. Defining the
boundary prevents current host behavior from becoming the only possible orchestration path.

### Worker Runtime Adapter

Accepts one admitted worker assignment and returns runtime-neutral events and a terminal result. It
declares support for:

```text
progress-events
reported-usage
pause
resume
cancel
checkpoint
live-steering
tool-brokerage
effect-brokerage
isolation-profile
```

Capability absence is normal. The gateway adapts policy or returns `unsupported`; it does not
fabricate control.

Subscription-host adapters additionally declare authentication mode, model-catalog source,
session-persistence and resume capability, usage and cache reporting, quota reporting, and whether
the host can enforce requested turn, token, time, and concurrency limits.

## Runtime-Neutral Assignment

A worker assignment should include:

```text
run and task identity
objective and acceptance
governing references
immutable base snapshot
bounded context manifest
read and write scope
fixed decisions
tool and effect grants
budget grant
lease deadline
approval protocol
stop conditions
expected terminal result
```

Provider prompts, session handles, model-specific reasoning fields, and transport metadata remain
inside adapters.

## Model Selection And Egress

- The adapter reports orchestrator and worker model identities separately.
- The gateway validates them against local policy but does not select a global portfolio model.
- Host identity does not imply provider identity.
- Context egress rules are evaluated before material enters a model request.
- Routing receipts record included, withheld, and redacted context by reference and digest.
- Missing model identity or unenforceable egress restrictions fail closed for remote governed work.
- Subscription-host access is preserved through host-owned credentials; the gateway stores no
  provider token and does not silently replace subscription use with API billing.
- Session continuation and provider prompt caching remain separate capabilities. Cache reuse is an
  optimization and never a correctness assumption.

## Migration From Current Dispatch

The current route/start/finish lifecycle, compact worker briefs, immutable snapshots, writer lease,
token ceilings, replay protection, suspensions, and terminal receipts are useful seeds.

Migration must:

1. define one gateway-owned control journal and read model;
2. make current CLI commands thin callers of the same gateway domain operations;
3. preserve current solo behavior while the remote surface is disabled;
4. preserve exact current authorization and safety claims until the new contract proves replacements;
5. migrate active state only through an explicit, testable transition; and
6. remove the prior control-state authority after cutover rather than maintaining a permanent shim.

Current provider-aware orchestration remains authoritative until that migration is approved and
completed.

## Failure And Degradation

- Missing host adapter: local governance remains available; governed remote orchestration is
  unavailable.
- Missing runtime capability: return `unsupported` and preserve current state.
- Missing usage: report unavailable; never estimate a hard-limit measurement.
- Lost runtime connection: mark the run unknown or waiting for reconciliation; do not claim
  cancellation or failure without evidence.
- Lost manager connection: continue only work already admitted under valid policy, lease, and budget.
- Gateway unavailable: current local fallback follows approved migration policy; no remote client
  receives direct repository access.
- Host restriction conflict: the stricter host or gateway restriction wins.

## Boundary Acceptance

Conformance requires proof that:

- current Codex and Claude-hosted paths use the same gateway core without provider clients in the
  wheel;
- host, orchestrator, and worker identities remain distinct in records;
- a simulated external orchestrator can use the published gateway contract without host-native
  objects;
- runtime capability negotiation controls pause, resume, cancel, checkpoint, steering, and usage;
- disabling remote access preserves ordinary local and solo workflows;
- missing capabilities and disconnected runtimes remain honest and recoverable; and
- migration produces one control authority with no permanent compatibility state.
