---
id: plan.harness.phase-3
title: Phase 3 - Harness As A Tool
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: The harness invoked from inside Codex, Claude Code and Cowork, assembling packets and dispatching bounded work.
---

> Child of [the master plan](../README.md).

# Phase 3 - Harness As A Tool

## Final State

The operator keeps working inside the host they already use. That host calls the harness first,
receives a bounded packet, and writes from it.

**Success is measured by accepted task results, later-detected defects, rework, and total time and
cost against the existing workflow.** Packet miss rate is a diagnostic split by cause, not the
measure: a worker can miss an essential constraint without ever asking for it, so a falling request
rate proves nothing on its own.

**Non-goals:** a front door of our own, a desktop application, any release capability, semantic
search infrastructure.

## Delivery

- Delivery: local-only

## Batch 1: One invocation surface and three host adapters

- Depends on: Phase 2 complete
- Ownership: invocation surface and generated host adapters; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to inventory how each host expects to be
  instructed, needed before the marked section is generated
- Semantic contract: settled by [Host Integration](../../specs/host-integration.md)
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: one subprocess surface with JSON on stdout; adapters are thin and generated from
  one source; approvals and permissions stay host-owned; the harness parses no transcripts
- Acceptance: transport proven with a **fixed fixture packet** - each host invokes, receives and
  acts on it identically; adapter generation is idempotent and touches only its marked section. Real
  packet equivalence across hosts moves to phase closeout, after Batch 3 exists. Support for each
  host is a demonstrated capability, not a consequence of sharing instruction text
- Development checkpoints: focused tests for the invocation surface; one manual run per host
- Build and integration point: real use in one repository from each host
- Review boundary: the three hosts compared on one identical task
- Proof budget: three manual runs and their records; no separate benchmark
- Invalidates prior proof when: a host changes how it invokes tools
- Proof state: not-run
- Split early or stop when: the three hosts cannot share one substantive instruction
- Documentation: consolidate at batch closeout
- Acceptance milestone: operator runs one real task from their usual host

## Batch 2: Intent classification and deterministic resolution

- Depends on: Batch 1
- Ownership: the loop's classify and resolve steps; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: the work taxonomy is derived from recorded history, not invented; an unclear
  option always exists; resolution uses the governance runtime's existing impacted selection rather
  than a new implementation
- Acceptance: a plain-English intent produces a work class, a surface, and a resolved change scope
  in one provider call plus deterministic work; an unclear intent escalates rather than guessing
- Development checkpoints: the Phase 0 intent fixtures rerun against the real implementation
- Build and integration point: none beyond the harness
- Review boundary: the taxonomy against real intents from the record
- Proof budget: the existing fixture set
- Invalidates prior proof when: the taxonomy or its thresholds change
- Proof state: not-run
- Split early or stop when: real intents do not fit a closed set, which would change the design
- Documentation: the taxonomy is durable
- Acceptance milestone: none

## Batch 3: Packet assembly, budgets and the escape hatch

- Depends on: Batch 2
- Ownership: packet assembly; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to establish what a good packet contains for a
  sample of past tasks, needed as the comparison baseline
- Semantic contract: settled by [Context Packet](../../specs/context-packet.md)
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: no language model builds a packet; candidates are generated deterministically
  before anything is narrowed; packets are immutable and content-addressed; the escape hatch is
  served deterministically and recorded as a miss split by cause; **the subject-to-materialization
  bridge is built in this batch and its absence is a blocker, not an assumption**; mandatory items
  cannot be dropped by narrowing or budget
- Acceptance: determinism holds over a frozen subject, catalog, history snapshot, budget and
  recorded selection; staged and worktree bytes made to differ prove which the packet carried;
  mandatory context overflow returns a blocker rather than a silent drop; a clean checkout with no
  diff routes by declared target; misses are split by generation, ranking and budget cause
- Development checkpoints: determinism and budget tests on change
- Build and integration point: real tasks in both repositories
- Review boundary: packets compared against the hand-built baseline
- Proof budget: the baseline sample; packet miss rate from real use
- Invalidates prior proof when: candidate generation, budgets, or the narrowing question change
- Proof state: not-run
- Split early or stop when: misses trace to missing candidates rather than bad narrowing, which
  means effort belongs in generation instead
- Documentation: consolidate at batch closeout
- Acceptance milestone: none

## Batch 4: Worker invocation and recorded selection

- Depends on: Batch 3
- Ownership: worker invocation; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Worker Invocation](../../specs/worker-invocation.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: input is a packet identity plus a bounded instruction, never a transcript; the
  operator's explicit choice wins over any recommendation; unavailable models are reported, never
  substituted; output is untrusted until verification
- Acceptance: the same packet dispatched to two providers produces results that both pass
  verification for a fixture task; selection and its source appear in every record
- Development checkpoints: focused tests for selection precedence and unavailability
- Build and integration point: real dispatched work with verification following
- Review boundary: the two-provider comparison, which is the evidence for the portability claim
- Proof budget: one fixture task per provider; not a quality benchmark
- Invalidates prior proof when: the packet contract or the selection policy changes
- Proof state: not-run
- Split early or stop when: portability fails, which would mean statelessness is not real
- Documentation: consolidate at phase closeout
- Acceptance milestone: operator review of accepted-result and rework measures, with miss causes as
  supporting diagnostics, before Phase 4

## Stable-Candidate Proof

Retain the focused host, packet and invocation tests, close the declared host integration gaps, and
run one branch-aware impacted sign-off on the frozen candidate.

## Rollback

Remove the marked adapter sections. Each host returns to working exactly as it does today, and the
recorded packets remain inert.
