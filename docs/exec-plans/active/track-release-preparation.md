---
id: plan.harness.track-release
title: Track R - Release Preparation
type: exec-plan
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: A read-only release evidence packet built from existing checkers and live sources, measurable on its own and independent of every step.
---

> Child of [the master plan](../README.md). Independent of the numbered sequence.

# Track R - Release Preparation

## Final State

One complete read-only release evidence packet, assembled from existing checkers and live fact
sources, rendered from a deterministic template, and compared against the current process for
accuracy and operator time.

**Non-goals:** deployment, any gated transition, a plugin loader, a checker rewrite, a classifier,
worker dispatch.

This track needs nothing from Steps 1 to 5 and blocks none of them. It exists separately because it
is the clearest measurable saving available and the baseline is already in the adopter's history.

## Delivery

- Delivery: local-only. This track performs no release execution of any kind.

## Batch 1: Collect the live facts

- Depends on: none
- Ownership: the adopter's release preparation; one writer
- Execution: sequential
- Parallel support: one bounded read-only assignment enumerating the facts currently left for an
  operator and where each is obtainable, needed at batch start
- Semantic contract: settled by [Release Management](../../specs/release-management.md)
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: read-only throughout; existing checkers are called and their receipts preserved,
  never reimplemented; an unavailable fact is reported unavailable and never inferred; every
  external read declares its destination and satisfies the project's export rules
- Acceptance: the fields previously filled by hand are populated from their sources; the packet is
  current rather than a template; unavailable facts are explicit
- Development checkpoints: focused tests per source, with recorded fixtures for external systems
- Build and integration point: one real assembly against the adopter
- Review boundary: a generated packet compared field by field against a recent hand-filled one
- Proof budget: one real assembly plus fixtures; record the operator time it replaces, since that is
  the measurable claim
- Invalidates prior proof when: an external interface or credential scope changes
- Proof state: not-run
- Split early or stop when: a required fact has no programmatic source
- Documentation: consolidate at batch closeout
- Acceptance milestone: operator confirms the generated packet is trustworthy

## Batch 2: Render it, deterministically first

- Depends on: Batch 1
- Ownership: rendering; one writer
- Execution: sequential
- Parallel support: solo
- Semantic contract: settled
- Model class: routine (gpt-5.6-luna, high; source: default table)
- Fixed decisions: a deterministic template renders the packet first; a language model is used only
  where narrative synthesis demonstrably beats that template, measured rather than assumed; no fact
  originates in a model
- Acceptance: a rendered packet reviewed against a prior hand-written one covers the same ground,
  with any omission named; if a model is used at all, its contribution is shown to beat the template
- Development checkpoints: rendering against two historical assemblies
- Build and integration point: none
- Review boundary: the side-by-side comparison and the operator-time measurement
- Proof budget: two comparisons
- Invalidates prior proof when: the packet shape changes
- Proof state: not-run
- Split early or stop when: the deterministic template is already sufficient, which is a good
  result and ends the track's model question
- Documentation: consolidate at track closeout
- Acceptance milestone: operator accepts a rendered packet for a real preparation

## Stable-Candidate Proof

Focused source and rendering tests plus the adopter's existing checks. No broad release proof is
needed, because nothing here executes a release.

## Rollback

Stop calling it. The existing checkers, receipts and hand-written practice are untouched, because
this track reuses them rather than replacing them.
