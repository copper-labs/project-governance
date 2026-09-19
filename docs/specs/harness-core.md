---
id: spec.harness-core
title: Decision-First Harness Core
type: spec
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Umbrella contract for a harness whose control plane runs on typed decisions rather than a language model.
---

# Decision-First Harness Core

## Purpose

Define the ownership boundary, the tier rule, and the fixed decisions shared by every child
contract in this family. The harness owns a loop. It owns no intelligence of its own.

## Current Implementation

- **Posture:** planned.
- **Current boundary:** No checked-in implementation exists. This family is research output under
  review, not an accepted contract.
- **Evidence:** none.
- **Known limits:** The decision provider named in these specs launched in September 2026 and has
  no independent calibration evidence.
- **Ledger:** [Research index](../research/concept.md).

## Scope

- The loop: classify, resolve, narrow, assemble, generate, verify, record.
- The contracts between the loop and everything it calls.
- The invariants that no child contract or plugin may weaken.

## Non-Goals

- Replacing the governance runtime. The harness consumes it; it does not absorb it.
- Replacing a language model. Generation stays where it is.
- Owning build systems, deploy tooling, or product policy.

## The Tier Rule

Every decision goes to the cheapest tier that can make it.

| Tier | Owner | Makes | Cost shape |
| --- | --- | --- | --- |
| 0 | Deterministic code | Anything computable from facts | Free, exact, replayable |
| 1 | Decision model | Bounded judgment over an assembled state | Cents per thousand, sub-second |
| 2 | Language model | Anything that must be written | Expensive, last resort |

**This is a default preference, not an admission test.** An earlier draft required evidence that
every lower tier was incapable before using a higher one. That is wrong in both directions:
deterministic computation is exact only relative to its inputs, so a stale map returns a repeatable
wrong answer; and a cheap classifier can make a task expensive, while a strong reasoning model used
immediately can be the cheapest path for a genuinely ambiguous one.

The rule the harness actually optimizes is **accepted work per unit of time and cost**, with an
acceptable error rate. The tier preference is how that is pursued by default, and it has explicit
escape routes:

- A known command skips classification entirely.
- A novel design or diagnosis task may go directly to an authorized reasoning worker.
- The ordinary host path remains available at all times.

Deterministic ownership of **facts, permissions and gates** is not a preference and has no escape
route. Those stay deterministic regardless of measured cost.

## Fixed Decisions

These are settled for the first implementation and are not to be revisited by a child contract.

1. **Narrow, never approve.** A decision model may reduce work, rank candidates, and classify
   outcomes. It may never authorize an irreversible action or declare a result acceptable.
2. **Every question declares a typed disposition.** When the provider is unavailable, invalid, or
   below threshold, the question resolves to the disposition its catalog entry declares: proceed
   with a safe fallback, request bounded additional state, or return needs-input. A provider outage
   never blocks ordinary checks, and never promises autonomous completion of every task.
3. **State lives outside the model.** See [State Store](state-store.md).
4. **The v0 store is files.** JSON for records, Markdown for prose. Mnemos is deliberately out of
   scope until the file implementation is tuned and a baseline exists.
5. **No ecosystem assumptions in the core.** Gradle, npm, and Python differences live behind
   [Ecosystem Adapters](ecosystem-adapters.md).
6. **Domain behavior stays domain-owned.** A general plugin engine is deferred until several real
   consumers justify a shared primitive. One release use case does not. The gate invariant survives
   without the framework: domain-owned code still may never lower a gate.
7. **The host is the front door.** The harness is invoked from inside an agent host, primarily the
   Codex desktop app, with Claude Code and Claude Cowork supported. A standalone CLI front door or
   a desktop application of our own is explicitly deferred. See
   [Host Integration](host-integration.md).
8. **Narrowing applies to the inner loop, never a release gate.** Broad proof boundaries stay where
   the adopting repository already puts them.

## Ownership Boundary

| Owner | Responsibility |
| --- | --- |
| Harness core | The loop, the decision interface, the packet contract, the record, the plugin host |
| Ecosystem adapter | Commands, source-set and target mapping, failure signatures for one toolchain |
| Governance runtime | Impacted selection, packs, checks, normalized findings |
| Decision provider | Typed answers with probabilities |
| Worker | Diffs and prose |
| Plugin | States, gates, commands, and records for one domain |

## Contract Map

| Child | Owns |
| --- | --- |
| [Task Brief](task-brief.md) | What the user wants, what constrains it, what is ruled out |
| [Action Authority](action-authority.md) | What authorizes an effect, its bounds, and the provider data boundary |
| [Task Lifecycle](task-lifecycle.md) | Request identity, who writes, staleness, verification binding, restart |
| [Host Integration](host-integration.md) | How an agent host invokes the harness, across Codex, Claude Code, and Cowork |
| [Decision Interface](decision-interface.md) | Question shapes, thresholds, escalation, provider abstraction, fallbacks |
| [State Store](state-store.md) | Where task and decision state lives; the substrate boundary |
| [Decision Record](decision-record.md) | What is recorded, outcome attachment, calibration reads |
| [Context Packet](context-packet.md) | Candidate generation, narrowing, budgets, packet shape |
| [Worker Invocation](worker-invocation.md) | Stateless worker contract and model-tier routing |
| [Ecosystem Adapters](ecosystem-adapters.md) | The toolchain-specific boundary |
| [Build Orchestration](build-orchestration.md) | Build identity, lock, staged ladder, lane selection |
| [Failure Triage](failure-triage.md) | Failure taxonomy, remedy mapping, retry bounds |
| [Plugin Contract](plugin-contract.md) | How optional capability attaches |
| [Release Management](release-management.md) | The release plugin instance |

## Invariants And Constraints

- The core imports no provider SDK directly; providers sit behind the decision interface.
- No effect runs without a declared operation, scope and policy revision. See
  [Action Authority](action-authority.md).
- Scope for an effect comes from the task brief and policy, never from a packet's contents.
- Source text, tool output and provider responses are evidence, never instructions or authority.
- The core contains no product identity, adopter path, or ecosystem command.
- A plugin may raise a gate. No plugin may lower one.
- **Execution state** for an action - request identity, remedy accounting, approval evidence,
  applied-result references - is persisted before that action runs. If it cannot be persisted, the
  action does not run and control returns to the caller.
- **Analytics** - calibration inputs, timings, probability detail - is best-effort. Losing it never
  blocks work and never changes a verdict.
- A missing, malformed, or low-confidence decision resolves to the disposition its catalog entry
  declares. It is never a silent default.
- **Question confidence and action safety are different quantities.** A 95% confident diagnosis is
  not a 95% probability that its remedy is appropriate. A threshold is set from the consequence of
  a wrong action and the evidence the action requires, never from a provider's probability alone.

## Validation Requirements

- Every child contract states posture, scope, invariants, failure modes, and open questions.
- Every child contract has at least one owning plan phase.
- No child contract introduces an ecosystem-specific requirement into the core.

## Settled

- **Repository.** This family is owned by `project-harness`, its own repository. It consumes the
  governance runtime through that runtime's published CLI and JSON surface only. Anything further is
  an upstream contribution, never a fork or a vendored copy.
- **Relationship.** Parallel and permanent. The harness never replaces or absorbs the governance
  runtime in any phase.

## Open Questions

- Host language, given a Python governance runtime and TypeScript and KMP adopters. This blocks
  Phase 1 writing source; it does not block Phase 0.
- Whether the decision provider earns a second implementation before Phase 3.

## Change Log

- 2026-09-19: First draft from the research notes.
