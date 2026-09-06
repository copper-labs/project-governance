---
id: exec-plan.provider-agent-skills
title: Release Optional Provider Agent Skills
type: exec-plan
status: active
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Build, independently review, test, and release optional Gemini, Claude, and Codex wrappers separately from implementation-plan improvements.
---

# Release Optional Provider Agent Skills

## Final State

Deliver the [provider-agent contract](../../specs/provider-agent-skills.md) through three optional
skills and one shared helper. Any shell-capable parent can start a provider with full native tools,
follow progress, collect honest results, and continue or cancel an exact job.

The supplied skills are named `harness-gemini-agent`, `harness-claude-agent`, and
`harness-codex-agent`, with the exact repository-local `harness-agent` executable. Adoption and
upgrades install this cross-model default automatically. Provider access remains optional, and
explicit operator route choices take precedence. Existing global wrappers remain untouched.

Implementation-plan template improvements and advance task-to-model assignments are explicitly
deferred. This release adds no role-to-model policy, price table, model ranking, or required provider.

## Delivery

- Delivery: implementation and local candidate proof complete; release authorized but held for
  the remaining live provider and cross-parent proofs.
- Candidate base: current `main` after the 2.3.0 release.
- Target: 2.4.0 under the existing semantic release contract for additive capabilities.
- Existing unrelated checkout work remains outside this candidate.

## Slice 1: Settle The Provider Boundary

- Depends on: none.
- Ownership: owning specification and its architecture integration.
- Execution: architecture review independent of execution-plan and fixture preparation.
- Semantic contract: settled by independent review and reconciliation.
- Fixed decisions: full native tools; no role restrictions; optional providers; one shared lifecycle;
  exact caller-selected model/effort; visible progress; no changes to implementation-plan templates.
- Acceptance: independent architectural findings reconciled before implementation.
- Focused proof: source/CLI protocol inspection and independent review of the proposal.
- Invalidates prior proof when: lifecycle, authority, packaging, or provider transport changes.
- Proof state: native interfaces inspected; independent architecture review reconciled nested
  ownership conflicts, bidirectional Codex requests, environment-use locks, and explicit authority
  amendments. Focused recheck accepted the changes; guardian lock retention and ancestry checks
  are included in implementation acceptance.
- Escalate or stop when: an unavailable provider is needed for a live compatibility claim.

## Slice 2: Shared Jobs And Native Adapters

- Depends on: Slice 1.
- Ownership: optional provider support package and focused fake-provider tests.
- Execution: sequential implementation with provider-specific test seams.
- Semantic contract: follows the reconciled specification.
- Fixed decisions: standard-library Python 3.9; local POSIX execution; no provider calls in core
  governance commands; preserve native authentication and configuration.
- Acceptance: start/status/events/wait/result/follow-up/cancel work across all three providers;
  malformed streams, identity drift, incomplete work, cancellation, and worker death fail honestly.
- Focused proof: deterministic protocol fixtures and detached-process lifecycle tests.
- Invalidates prior proof when: request, protocol, process ownership, or terminal-result behavior changes.
- Proof state: 23 focused provider tests pass on macOS with Python 3.9 and Linux with Python 3.10.
  Independent implementation
  review found two startup publication races, stale resolved-denial handling, and intermediate
  Gemini session drift. Repairs and regression tests are complete. The independent affected
  recheck closed all four findings and passed seven relevant regression tests. A subsequent
  maintainability refactor separated transport, native message dispatch, validation, and lifecycle
  responsibilities; focused tests and the independent regression review passed.
- Escalate or stop when: provider capability or cleanup guarantees cannot be demonstrated.

## Slice 3: Installable Skills And Operator Journey

- Depends on: Slice 2.
- Ownership: skill catalog, three skill bodies, public helper entry point, and operator guide.
- Execution: sequential.
- Semantic contract: source-neutral thin skills with a shared command contract.
- Fixed decisions: no relative helper dependency on relocated context packets; no automatic login,
  provider installation, global settings mutation, or external legacy-wrapper retirement.
- Acceptance: clean-wheel invocation works; missing providers leave ordinary governance usable;
  host configuration can select different model IDs and efforts without package edits. Adoption
  and existing bootstrap launchers install marked pointers in each native host entry file;
  authored text, permissions, and safe symlinks remain intact. Core doctor reports incomplete
  routing resources without invoking providers or claiming universal host precedence.
- Focused proof: skill payload, context selection/materialization, and installed-wheel seam.
- Invalidates prior proof when: packaging, discovery, entry point, or configuration precedence changes.
- Proof state: skill validation and 16 catalog, selection, and payload tests pass. Installation
  tests pass. Clean installed-wheel proof passes, including optional-provider absence, three
  native protocol fixtures, overlapping-job queueing, cancellation, and bootstrap exclusion.
  Eleven additional host-integration tests pass. Independent review closed unsafe runtime-target
  symlinks, incomplete route-readiness checks, and permission preservation; a case-insensitive
  macOS alias regression also passes. The installed-wheel journey now checks the harness default
  with a competing command on PATH.
  Empty Codex overrides remain inactive, preserving the repository's authored AGENTS.md guidance;
  aliases that would activate them indirectly are rejected before any instruction write.
  A live Codex parent selected the exact repository-local harness command while the existing
  global Gemini plugin and competing commands were present. It used the host binding, received
  streamed fixture events, and reported the terminal missing-read-evidence blocker honestly.
  No competing command ran; cleanup was confirmed and authored startup text remained intact.
  The child was synthetic: this proves route selection and evidence reporting, not live Gemini
  capability. Native Claude and Gemini parent routing still need their live acceptance checks.
- Escalate or stop when: installation requires a provider account or changes core configuration validity.

## Slice 4: Live Proof And Independent QA

- Depends on: Slices 2 and 3.
- Ownership: isolated temporary test workspaces and candidate review.
- Execution: separate provider runs; no overlapping writers.
- Semantic contract: live evidence complements deterministic fault fixtures.
- Fixed decisions: use operator-selected available models; no silent substitution; no personal
  account information, source paths, or provider transcripts in tracked release documentation.
- Acceptance: each provider reads, writes, executes/tests, and accesses the network; events arrive
  before completion; follow-up keeps exact context; a Claude parent starts and collects Codex.
- Focused proof: one representative live tool task per provider plus the cross-parent seam;
  additional calls only for a named failed or uncovered claim.
- Invalidates prior proof when: provider command, protocol translation, or permission mode changes.
- Proof state: Codex exercised reads, edits, commands/tests, web access, public progress, exact
  continuation, and confirmed cleanup in a temporary fixture. Antigravity login is restored, but
  quota exhaustion blocks live execution. Claude Code still requires login. The live Claude,
  Gemini, and Claude-parent-to-Codex proofs remain release blockers.
- Escalate or stop when: required provider authentication or model access is unavailable. Do not
  release a provider wrapper based solely on fake-provider evidence.

## Stable-Candidate Proof And Release

Freeze one candidate after independent QA reconciliation. Run one branch-aware local sign-off.
Prepare the change narrative, open the PR, and run source readiness on the proposed merge result.
The release boundary includes the complete runtime suite, reproducible wheel boundary, clean
installed-wheel proof, and Linux/macOS process evidence. Follow the
[release process](../../governance/release-process.md) for merge, immutable tag publication, and
wheel/lock/hash readback. A changed integration base forms a new candidate.

The local candidate passes all selected repository checks, the reproducible wheel boundary, and
the complete runtime suite: 351 tests with one existing optional TypeScript-compiler test skipped
because that dependency is unavailable. The Linux provider suite and clean installed-wheel journey
also pass. These proofs do not replace the outstanding live provider acceptance or certify a
published release. The plan remains active until those checks and release readback are complete.

## Proof Budget

Use focused protocol and lifecycle tests during implementation. Do not run the complete suite for
each adapter. Independent QA consumes the frozen candidate and existing evidence; a repair gets
one affected recheck. Broad tests run at the prescribed candidate and publication trust boundaries.

## Rollback

An adopter retains its previous pinned wheel until it deliberately upgrades. Before publication,
repair the candidate branch. After publication, retain immutable artifacts and use a new corrective
release if needed. Do not rewrite a released tag or create old-command compatibility shims.
