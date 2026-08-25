---
id: proposed.project-gateway.subscription-performance
title: Proposed Subscription Host, Performance, And Token-Efficiency Specification
type: spec
status: draft
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Work-in-progress contract for subscription-backed model access, host-session affinity, caching uncertainty, and gateway performance proof.
---

# Proposed Subscription Host, Performance, And Token-Efficiency Specification

> **Proposal status:** Proposed and work in progress. This specification does not authorize API-key
> use, provider account automation, credential export, or a replacement model client.

## Purpose

Preserve subscription-backed Codex and Claude Code operation while introducing the Project Gateway,
and prevent host decoupling from silently increasing latency, repeated context, model turns, or
subscription consumption.

The first gateway release must not require provider API keys. Subscription hosts retain their own
credentials, entitlements, model catalogs, quotas, sessions, caching, and provider communication.

## Access Modes

The gateway recognizes access modes independently of provider:

```text
subscription-host
local-runtime
enterprise-host
api-key
unavailable
```

`subscription-host` is required for the first Codex and Claude Code adapters. `local-runtime` may
be supported by a future runtime adapter. `api-key` remains outside the first-release implementation
and must never be selected as a silent fallback.

An adapter reports:

```yaml
access_mode: subscription-host
credential_owner: interaction-host
credential_visibility: opaque-to-gateway
model_catalog_source: host
session_persistence: supported
session_resume: supported
usage_reporting: optional
cache_reporting: unavailable
quota_reporting: unavailable
```

The gateway stores no provider subscription token, session credential, refresh token, or account
cookie. Authentication and reauthentication remain inside the installed host under the operator's
account.

OpenAI currently documents Codex as included with eligible ChatGPT plans and available through the
Codex app, CLI, and IDE extension. See [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan).
The adapter must use the installed Codex client's authenticated surface; plan inclusion does not
imply that every local control, session, cache, or usage detail is a stable public interface.

Claude Code officially supports Claude App Pro or Max subscription authentication and session
continuation through its CLI. See [Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/getting-started)
and the [CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage). Each host adapter
must nevertheless prove its current installed behavior rather than assuming another host exposes
the same automation, session, usage, or cache surface.

## Supported Topologies

### Native Host Session

The current Codex or Claude session remains the logical orchestrator. Gateway query, admission,
journaling, and evidence operations are deterministic and add no model call.

This should have the lowest token overhead and is the first performance baseline.

### Subscription Host As Worker Runtime

A gateway or external orchestrator submits one bounded assignment to a subscription-authenticated
host process or session. The adapter preserves the host's credentials and returns structured events
and results where supported.

The adapter should reuse a safe native session rather than start a new process and resend full
context for every control operation.

### Future External Orchestrator Plus Subscription Worker

An external orchestrator model plans while Codex or Claude Code performs worker execution. This may
consume two model contexts for one project outcome. It is not the default and requires measured
benefit over the native-host baseline.

### Future Owned Client

An owned client may supervise subscription-host processes locally. It does not convert a personal
subscription into a general remote API and must use provider-supported host interfaces. A hosted
central service must not assume it can export or reuse local subscription credentials.

## Expected Performance And Token Effects

### Gateway-Only Overhead

These operations require no model call:

- manager authentication and authorization;
- project snapshot query;
- intent validation and admission;
- revision, lease, and budget checks;
- journal append and read-model reduction;
- evidence hashing and lookup;
- event delivery; and
- telemetry projection.

Their cost is local CPU, storage, and transport latency. The first release must measure and bound
that overhead separately from provider latency.

### Potential Regressions

Decoupling can increase latency or subscription usage when it causes:

- loss of native session affinity;
- repeated host-process startup and authentication checks;
- full context rehydration for short tasks;
- volatile prefixes that prevent provider-managed cache reuse;
- duplicate context in both orchestrator and worker sessions;
- an extra model planning turn for deterministic control decisions;
- unnecessary manager polling or model-generated status summaries;
- repeated repository scans rather than incremental snapshots;
- redundant compaction or session rollover; or
- parallel work beyond subscription capacity.

### Potential Improvements

The gateway can reduce repeated input and latency through:

- content-addressed context items and manifests;
- incremental snapshot and context updates;
- bounded task-specific packets instead of full repository context;
- native session affinity and safe resume;
- stable instruction and authority prefixes;
- separation of volatile control metadata from model-visible context;
- deterministic queries and status summaries without model calls;
- idempotent manager intents that suppress duplicate work;
- shared local materialization across runtime adapters; and
- concurrency limits that avoid provider throttling and repeated retries.

## Session Affinity

The gateway records an opaque `HostSessionBinding`:

```yaml
binding_id: binding-...
host_id: codex-host
host_session_id: opaque-session-id
project_id: project.example
orchestrator_runtime_id: orchestrator-...
access_mode: subscription-host
base_snapshot: git:...
context_digest: sha256:...
policy_digest: sha256:...
created_at: 2026-08-24T00:00:00Z
last_used_at: 2026-08-24T00:10:00Z
resume_capability: supported
state: warm
```

Reuse is allowed only when project, operator, authority, egress policy, and task continuity remain
compatible. A changed policy, revoked manager, incompatible snapshot, cross-project switch, or
sensitive-scope change can require a fresh session.

Session continuation is not the same as prompt-cache reuse. It can also retain stale or excessive
context, so the adapter must support explicit rollover and invalidate bindings deliberately.

## Prompt And Context Caching

Provider-managed prompt caching is an optimization, not a gateway correctness dependency.
Subscription hosts may apply caching without exposing controls or usage details. API-specific cache
keys, breakpoints, pricing, or retention fields must not be assumed to exist in subscription-host
mode.

The gateway controls only its own deterministic context reuse:

1. canonicalize stable instructions and governing references;
2. keep stable prefixes byte-identical where host behavior permits;
3. place volatile status, timestamps, and one-run metadata after stable material;
4. send changed context items by digest rather than rebuilding an unbounded prompt;
5. reuse native sessions only through advertised host capability;
6. record host-reported cached tokens only when explicitly supplied; and
7. label cache state `reported`, `unavailable`, or `not-applicable`.

The gateway never estimates cache savings and presents them as provider fact.

## Subscription Capacity And Budgets

Subscription plans expose usage windows, throttling, and model availability differently from API
billing. A project-local budget must therefore distinguish enforceable limits from observations:

```yaml
access_mode: subscription-host
hard_limits:
  output_tokens: optional
  turns: 8
  wall_clock_ms: 7200000
  concurrent_workers: 1
observations:
  input_tokens: host-reported-or-unavailable
  output_tokens: host-reported-or-unavailable
  cached_tokens: host-reported-or-unavailable
  subscription_quota: host-reported-or-unavailable
  financial_cost: not-applicable
```

- Do not convert subscription use into API dollar estimates.
- Do not claim a hard input-token or quota limit if the host cannot enforce or report it.
- Prefer enforceable turn, time, output, concurrency, and work-count limits.
- Treat provider throttling or quota exhaustion as capacity-unavailable or budget-exhausted according
  to the host's typed evidence.
- Never fall back to API-key billing without a separate operator decision and future specification.

## Model Selection

Long-term "any model" support means any model reachable through an approved runtime adapter and
allowed by policy. A subscription-host adapter can select only models the host exposes to the
operator's subscription and supported automation surface.

The gateway records requested and actual model identity separately. Silent substitution is
prohibited unless the intent explicitly permits a bounded fallback set and the adapter reports the
selection event.

## Performance Measurements

The gateway must compare representative work in these modes:

```text
direct native host
native host through gateway
cold subscription-host process
warm or resumed subscription-host session
future external orchestrator plus subscription worker
```

Measure when available:

- task success and evidence completeness;
- end-to-first-progress latency;
- total wall-clock duration;
- gateway-local processing time;
- host process startup count and duration;
- session resume and rollover count;
- context items and exact bytes materialized;
- repeated-prefix bytes;
- provider-reported input and output tokens;
- provider-reported cached tokens;
- compaction events;
- turns and tool calls;
- quota or throttling outcomes; and
- duplicate or abandoned work.

Test small read-only analysis, bounded implementation, long-horizon implementation, resumed work,
and two or more concurrent projects. Separate cold and warm measurements.

## Performance Acceptance

The proposal does not set numeric latency targets before a direct-host baseline exists. An active
plan must establish thresholds from representative measurements.

At minimum, the first release must prove:

- gateway query, admission, journaling, and telemetry add zero model calls;
- direct-host and gateway-host tasks receive equivalent governed objectives and acceptance criteria;
- bounded context does not become a full-repository prompt;
- current host adapters retain subscription authentication without API keys;
- no API fallback occurs when subscription capacity is unavailable;
- session reuse and rollover are explicit and testable;
- cache and quota fields remain unavailable unless reported by the host;
- administrative polling does not invoke a model by default;
- parallelism respects project and host capacity; and
- any external-orchestrator mode demonstrates measured outcome benefit sufficient to justify its
  additional tokens and latency.

## Open Decisions

- Which installed host interface is stable enough for the first Codex adapter.
- Which Claude Code non-interactive and resume surfaces form the first adapter baseline.
- Whether first-release adapters keep one warm session per project, task, or orchestrator.
- Which deterministic tokenizer or byte proxy is used for local context budgets.
- What threshold forces session rollover.
- Whether restricted runtime trajectory capture is opt-in or enabled with bounded retention.
- How provider throttling is normalized when a host emits only human-readable errors.
