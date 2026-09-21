---
id: spec.harness.decision-interface
title: Optional Decision Interface
type: spec
status: accepted-design
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Internal semantic decisions with immediate provider-free fallback and measured adoption.
---

# Optional decision interface

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C17](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
early optional JEV with deterministic fallback. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

## Status and ownership

Accepted design; the interface and JEV adapter are not implemented. They belong inside the single
governance product: the current wheel until the deliberate compiled-Node cutover, never a separate
product or independently editable lock. Core operation requires no provider or account.
Code owns facts, arithmetic, identity, permissions, required proof, execution and cleanup. The host
owns reasoning, source edits and acceptance. Model output is a bounded suggestion, never authority.

## Placement in the development flow

`current facts → deterministic result → optional semantic suggestion → validation → working packet`

Start with `rank_optional_context`: ordered IDs from a supplied candidate set for implementation,
investigation, review or resume. Required instructions and mandatory evidence bypass ranking.
JEV is the first adapter to compare against deterministic retrieval and current host discovery.
Failure interpretation, ambiguous intent/skill advice and worker advice are later consumers selected
by measured cost. No live parent switching, permission decisions or automatic tool calls.

Candidate generation and ranking are separate: a model cannot recover a file absent from its inputs.
Preserve source digests, quoted-data boundaries, coverage limits, conflicting evidence and explicit
unknown/abstention. Re-read or refuse changed source before delivering a packet. The host retains
bounded expansion and native discovery. No generated prose summary is required for ranking.

## Request and response

A versioned request contains question/purpose, task revision, bounded candidates/evidence references,
answer schema, evidence digest, permitted data scope, deadline and total cost budget. A response
contains answer or abstention, candidate/evidence IDs, input digest, provider/model/question version,
latency, native usage when available and native uncertainty fields. Missing usage remains unknown.
E3 implementation follows E1a evidence identities; comparisons require a frozen retrieval baseline,
independent of RN E1b/device completion.

Reject malformed answers, invented IDs, stale input bindings and expired responses. Confidence from
one provider/question is not a calibrated probability of correctness and cannot inherit another
question's threshold. No generated executable commands. Add question types only with real consumers.

## Modes and fallback

- `off` (default): ordinary retrieval and host reasoning; zero provider calls.
- `auto`: explicitly enabled eligible questions use the configured adapter; all others use the baseline.
- `shadow`: explicitly enabled comparison records advice but delivers the deterministic result.

Prepare the deterministic result first. Missing `JEV_TOKEN`, disabled data sharing, unsupported input
or disabled mode bypasses the provider immediately, without a network probe or account prompt. Token
presence is not authorization to export project data. One configuration switch disables all optional
calls without reinstalling or changing task state. Never log token contents or credential digests.

Use a configurable one-second interactive request deadline initially; this is a tuning setting, not
a performance guarantee. Bound the complete request and abort transport on expiry. Do not retry on
the critical path. Timeout, invalid response or provider error returns the prepared baseline.
Late responses cannot replace a delivered packet. Accounting must still avoid losing or double-counting
known billable usage; unobservable usage is unknown.

Authentication rejection disables attempts until explicit reset or a nonsecret configuration revision
changes. Transient transport/rate-limit failures use a bounded cooldown (initially 60 seconds), shared
across CLI invocations by repository/provider configuration identity. Do not put secrets in that key.
Cooldown state is advisory: unreadable state returns the baseline, not a provider retry storm.
Normal fallbacks appear in health/telemetry, not repetitive chat warnings.

Bound candidate/evidence bytes and native request size before dispatch. Initial evidence cap is 8 KiB
per question, at most 16 candidates and one call per packet request for the initial ranker. These
are initial question-specific settings, not a universal one-question product ceiling. Later approved
questions may compare bounded shared-snapshot batching with explicit quality, latency and cost proof.
A candidate header includes ID,
source digest and selection reason. After measuring headers, split remaining bytes equally between
candidates and select whole UTF-8 lines around deterministic lexical matches, with ties by source
position. Record excerpt ranges, source sizes, omitted-byte counts and excluded candidates. If headers
alone exceed the cap, or no useful excerpt fits, return the baseline. Candidate caps, excerpt omission
and misleading match position are evaluation strata, not guarantees that decisive evidence survived.
Full selected artifacts use their separate delivery budget. Pin request/model versions.
Provider-native formatting and limits must be verified when implementing the adapter.

## Evaluation and promotion

Compare current host discovery, deterministic packets and JEV ranking on fresh matched tasks.
Keep related retries/variants together, tune on development cases and evaluate fresh families.
Score decisive-evidence retention and final accepted outcomes as well as packet size, expansions,
latency and all-agent/provider tokens. Measure candidate omissions separately from ranking mistakes.
Include ambiguity, late decisive facts, misleading/quoted instructions, outage and stale-source cases.

Shadow scores do not establish saved calls. Enable a question only when it replaces reading/reasoning
at acceptable quality after fallback and rework. Never infer authority, a passed test, cache validity
or acceptance from a semantic classification. Disabling the adapter leaves every core path complete.

## Configuration and state ownership

This specification owns a planned `continuity.decisions` section in the tracked governance profile:
`mode` defaults to off, `provider` selects jev initially, `allowed_questions` enumerates enabled types,
`allowed_data_classes` defaults to empty and currently permits only explicitly approved source or
diagnostic excerpts. A caller label cannot expand allowed classes or source scope. `config_revision`
is nonsecret and explicit. Timing/cap overrides are validated here. E3 adds schema/doctor validation
and configuration-migration proof; these keys do not work in the current runtime. Environment supplies
`JEV_TOKEN` only; no credential is copied into the profile or logs. The adapter maps its own variable.

Provider access requires both an enabled question/mode and permitted data class/scope. This is the
concrete data-sharing gate, not inferred consent from a token. A single mode=off disables everything.
[Operational storage](operational-store.md#optional-provider-health--accepted-design) owns the bounded
advisory cooldown state. E3 selects its storage mechanism outside critical ledger transactions while preserving failure isolation.

Keep shadow capability for comparisons on real workloads. E3 chooses evaluator-owned execution,
runtime integration, or both from coverage and coordination cost; offline replay is not presumed
equivalent to observing live inputs and conditions. Runtime shadow requires a named lifecycle owner,
bounded calls/concurrency, cancellation and durable outcome/usage accounting. No unowned detached
calls or late mutation of delivered packets. If asynchronous ownership cannot be established, use an
explicit evaluator run; if shadow delays delivery, measure that overhead rather than claim it is free.

Evaluations declare their deadline (initially five seconds); auto retains the one-second interactive
default. Report fallback/timeout rates over all requests alongside completed-request quality. Record
both deadlines and execution placement. Shadow measures agreement, quality and added cost, not avoided
host work. An enabled comparison must establish actual workflow benefit before promotion.
