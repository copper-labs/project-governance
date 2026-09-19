---
id: plan.harness.phase-1
title: Phase 1 - Build Hygiene
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: Build identity, a workspace lock, and a staged ladder, with no decision model involved.
---

> Child of [the master plan](../README.md).

# Phase 1 - Build Hygiene

## Final State

Builds in one workspace stop colliding and stop repeating, failures surface earlier than the
slowest lane, and every build is recorded. No decision model participates. The recorded history
this produces is what Phases 2 and 4 learn from.

**Non-goals:** duplicating a build tool's cache, changing CI lane selection, any provider call.

**Environment limit, stated up front.** The working machine has Node 22 and a JDK 11 with no Gradle.
Real KMP builds are therefore out of reach here. Phase 1 proves on the fixture adapter and the
TypeScript adopter; the KMP adapter's real-build proof is deferred to an environment that can run it
and is not claimed until then.

## Delivery

- Delivery: local-only

## Batch 1: A store and a build record exist

- Depends on: none
- Ownership: harness store and record modules; one writer
- Execution: sequential
- Parallel support: solo; the contract is small and splitting it would duplicate its setup
- Semantic contract: settled by [State Store](../../specs/state-store.md) and [Decision Record](../../specs/decision-record.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: files only, JSON for records and Markdown for prose; append-only; no substrate;
  bounded retention enforced by the store
- Acceptance: append, read-by-task, read-by-question and outcome attachment work; concurrent
  writers in one workspace are safe; a corrupted record is quarantined and the event recorded
- Development checkpoints: focused tests per store operation, run on change
- Build and integration point: none yet; the store has no consumers in this batch
- Review boundary: the store interface, because every later phase is shaped by it
- Proof budget: focused unit tests only
- Invalidates prior proof when: the record shape or retention policy changes
- Proof state: not-run
- Split early or stop when: the interface needs more than the four declared operations, which would
  mean the record shape is wrong
- Documentation: update [State Store](../../specs/state-store.md) if the interface moves
- Acceptance milestone: none

## Batch 2: A minimal fixture adapter

- Depends on: Batch 1
- Ownership: the fixture adapter; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled by [Ecosystem Adapters](../../specs/ecosystem-adapters.md)
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: a fixture adapter with deterministic fake commands, declared inputs and seeded
  failure signatures; it exists so identity and claim behavior can be tested without a real toolchain
- Acceptance: the core's tests run end to end against the fixture adapter with no real build tool
  installed; the fixture declares all six adapter capabilities
- Development checkpoints: focused tests per capability
- Build and integration point: none; the fixture is the substitute for one
- Review boundary: the fixture's fidelity to the adapter contract
- Proof budget: focused tests only
- Invalidates prior proof when: the adapter contract changes
- Proof state: not-run
- Split early or stop when: the fixture cannot express a capability, which means the contract is wrong
- Documentation: none beyond the adapter contract
- Acceptance milestone: none

## Batch 3: Build identity and the request claim

- Depends on: Batch 2
- Ownership: build orchestration module; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to inventory what actually contributes to a
  build's inputs in the KMP repository, needed before identity is declared complete
- Semantic contract: settled by [Build Orchestration](../../specs/build-orchestration.md)
- Model class: difficult-implementation (gpt-5.6-luna, xhigh; source: default table)
- Fixed decisions: reuse defaults off per adapter until its inputs are proven; an identity that
  cannot be computed completely is not an identity; the harness owns no build cache
- Acceptance: two concurrent identical requests produce one build; a claim is reclaimed only after
  process identity and cleanup are checked; overlapping lanes, a holder dying with a live child,
  cancellation by one of two waiters, input drift and deleted outputs are each exercised; composition
  with the existing test-execution claims is tested before any collision-prevention claim
- Development checkpoints: focused tests for claim contention, reclamation and identity stability,
  all against the fixture adapter
- Build and integration point: the fixture adapter only. Real builds arrive in Batch 4
- Review boundary: identity completeness, since false reuse is worse than no reuse
- Proof budget: focused tests plus a small number of real builds; reuse stays disabled so a wrong
  identity cannot produce a wrong verdict
- Invalidates prior proof when: adapter-declared inputs, toolchain, or lock file change
- Proof state: not-run
- Split early or stop when: input completeness cannot be established for the first adapter
- Documentation: record the adapter's declared inputs alongside the adapter
- Acceptance milestone: none

## Batch 4: The staged ladder and the first real adapter

- Depends on: Batch 3
- Ownership: build orchestration and the first real adapter; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment to derive the unit and lane maps from the
  existing change selector and module graph, needed at batch start
- Semantic contract: settled by [Ecosystem Adapters](../../specs/ecosystem-adapters.md)
- Model class: ambiguous-integration (gpt-5.6-terra, high; source: default table)
- Fixed decisions: stage B is a static rule in this phase, never a provider call; selection widens
  on uncertainty; release and broad-proof boundaries ignore the ladder
- Acceptance: a change known to break one lane surfaces in stage A or B; disabling the ladder
  yields the same final verdict; the adapter contains no decision logic
- Development checkpoints: fixture changes with expected lanes, run on adapter change
- Build and integration point: real multi-lane builds on the **TypeScript** adopter, which the
  available environment can actually run. The KMP adapter is declared but its real builds are proven
  separately, in an environment with a current JDK and Gradle; claiming KMP coverage from a machine
  that cannot build KMP would be a false claim
- Review boundary: the completed ladder against a set of historical changes with known outcomes
- Proof budget: replay a handful of historical failures; compare where the failure surfaced against
  where it surfaced originally, using existing logs for the baseline
- Invalidates prior proof when: the lane map, module graph, or toolchain changes
- Proof state: not-run
- Split early or stop when: the lane map cannot be derived and would have to be hand-maintained
  from the start, which changes the cost case
- Documentation: consolidate the adapter contract and the ladder at batch closeout
- Acceptance milestone: operator confirmation that failures arrive materially earlier before
  Phase 2 begins

## Stable-Candidate Proof

On the completed ladder, retain the focused store, identity and adapter tests, then run one
branch-aware impacted sign-off on the frozen candidate in whichever repository hosts the harness.
QA consumes that evidence rather than replaying it.

## Rollback

Remove the harness invocation. The build tooling is untouched: every command it wraps still runs
exactly as before, and the recorded history is inert data.
