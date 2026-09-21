---
id: research.harness.host-integration
title: Host Integration
type: research
status: draft
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: How an agent host invokes the harness, and what stays host-owned across Codex, Claude Code, and Cowork.
---

> Child of [Decision-First Harness Core](harness-core.md).

# Host Integration

## Purpose

Define the seam between an agent host and the harness. The first delivered surface is not a
standalone tool: the operator keeps working inside the host they already use, and the harness is
what that host calls first.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** The governance runtime already writes a marked routing section into host
  entry files during `init`, and adopting repositories already keep thin per-host adapters. That
  pattern is the intended carrier; no harness routing exists yet.
- **Evidence:** none.
- **Known limits:** Host tool-invocation surfaces differ and are outside our control.
- **Ledger:** [Research index](../../README.md).

## Scope

- One invocation contract, expressed once and adapted per host.
- The marked section written into each host's entry file.
- What the host keeps owning.

## Non-Goals

- A standalone CLI front door. Deferred, not designed out.
- A desktop application. Deferred.
- Replacing host-native permissions, approvals, or session handling.

## Two Steps

**Step one, now.** The host remains the front door. Its adapter instructs it to call the harness
before exploring, and to work from the packet it receives. The host writes; the harness decides,
assembles, and records.

**Step two, later.** The same core is driven by a front door of our own. Nothing in the core may
assume which step is active. The invocation contract is identical; only the caller changes.

## Behavioral Requirements

- The harness exposes one invocation surface, callable as a subprocess with JSON on stdout, so any
  host capable of running a command can use it without a bespoke integration.
- Host adapters are thin. They contain routing instructions only, never policy, taxonomy, or
  thresholds.
- Each supported host receives the same marked section, generated from one source, so the three
  hosts cannot drift apart in substance.
- Supported hosts at v0: Codex desktop, Claude Code, Claude Cowork. An unsupported host must still
  be able to call the invocation surface directly.
- The harness never assumes it is being driven by a specific host, and never parses host transcripts.
- A worker that asks for something the packet lacks is recorded as a packet miss, whichever host
  it runs in.

## Invariants And Constraints

- Host adapters are generated and marked; authored content around them is never rewritten.
- The harness holds no host session state, credentials, or transcript.
- Approvals, permissions, and irreversible-action gating stay with the host and the adopting
  repository, never with the harness.
- Nothing in the core references a host by name outside its adapter.

## Failure Modes

| Condition | Behavior |
| --- | --- |
| Host cannot run subprocesses | Unsupported; report plainly rather than degrading silently |
| Adapter section missing or stale | Report drift; do not rewrite authored content |
| Harness unavailable | The host proceeds as it does today, with a recorded note |

## Validation Requirements

- The same task, run from each supported host, produces equivalent packets and records.
- Adapter generation is idempotent and touches only its marked section.

## Open Questions

- Whether Cowork and Claude Code should share one adapter or keep separate files.
- How much of the packet a host should be shown directly versus given as a path.

## Change Log

- 2026-09-19: First draft.
