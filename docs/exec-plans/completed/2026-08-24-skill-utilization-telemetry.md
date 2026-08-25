---
id: exec-plan.skill-utilization-telemetry
title: Skill Utilization Telemetry Implementation Plan
type: exec-plan
status: completed
owner: project-governance
created: 2026-08-24
updated: 2026-08-24
summary: Add bounded provider-neutral selection and closeout receipts so adopters can inspect whether governed skills were selected and reported as used.
---

# Skill Utilization Telemetry Implementation Plan

## Final State

The existing `project-governance context` command records one local content-free selection event
when it materializes skills and returns a random utilization ID in its result. After work, a
provider-neutral `project-governance skills closeout` command consumes that exact context result
plus an explicit outcome document and appends one bounded terminal receipt.

`project-governance telemetry status` reports retained selections, closeouts, unclosed selections,
per-skill outcome counts, and influence categories. The result is useful for post-use review but
remains advisory and cannot prove instruction compliance or work quality.

## Non-Goals

- Remote export, scheduled collection, a database, dashboards, tracing, or Gateway integration.
- Prompts, task text, paths, source content, skill bodies, free-form reasons, or private reasoning.
- Inferring that a model read a skill from token usage or that a changed file proves utilization.
- Blocking governed work when advisory telemetry cannot be written.
- KMP-specific receipt code, provider-specific adapters, or adopter-owned workflow changes.
- Publishing a wheel, updating an adopter, or starting the KMP pilot in this slice.

## Fixed Decisions

1. Reuse `.governance/telemetry/runs.jsonl` and its existing 1,000-record bound, writer lock,
   fail-open behavior, and status command.
2. Record one `skill-selection` event only from the public context CLI. Direct library calls and
   provider-native skill discovery remain outside observable coverage.
3. Return a random utilization ID and the content-addressed context packet ID. Neither identifier
   contains task, repository, provider, or source information.
4. Store only safe skill IDs, exact content digests, bounded selection classes, fixed utilization
   statuses, fixed influence categories, and a fixed task-outcome enum.
5. Closeout must cover every materialized skill exactly once and cannot name a skill absent from the
   supplied context result. An `applied` entry names at least one influence category; non-applied
   entries name none.
6. The utilization statuses are `applied`, `consulted-no-change`, `declined`, `unavailable`, and
   `not-read`. Influence categories are `decision`, `edit`, `validation`, and `restraint`.
7. Status pairs retained selection and terminal events by utilization ID. Because either side may
   be evicted and callers may bypass closeout, coverage is explicitly best-effort.
8. The live generic runtime owns this contract. The proposed Project Gateway remains untouched and
   gains no authority from this work.

## Implementation Ownership

- `skill_utilization.py` validates context-bound selection and closeout data and owns its narrow
  sanitization and status projection.
- `telemetry.py` owns the shared bounded ledger, idempotent receipt persistence, and event-family
  dispatch.
- `cli.py` owns the public `skills closeout` command and context-selection hook.
- The shared context-router and Work skills carry the selection identity and bounded closeout
  obligation without teaching every stack leaf about telemetry.
- The governance-kernel specification owns the live contract. KMP proposal material records the
  transition from deferred to implemented generic telemetry.
- Focused tests prove command behavior, exact coverage, redaction, retention-safe aggregation, and
  the context-to-closeout seam.

## Validation

1. Run the context, utilization, and telemetry unit suites.
2. Exercise the public CLI from a temporary repository with one materialized skill.
3. Confirm forbidden prompt, path, source, and free-text values never enter the JSONL ledger.
4. Run the directly affected runtime integration tests and skill validation.
5. Run one branch-aware impacted pre-push sign-off on the committed candidate.

## Closeout

- The public context and closeout CLI seam is implemented without a database, remote service,
  provider adapter, KMP-specific command, or Gateway dependency.
- Exact KMP selection plus closeout, packet tampering, missing coverage, privacy rejection,
  idempotency, context output, telemetry aggregation, and public command behavior have focused
  tests.
- Forty-two directly affected tests passed, followed by the complete 279-test runtime suite with
  one existing skip.
- Documentation, maintainability, context-router, format, naming, prose, and test-quality packs
  passed with zero findings.
- A clean temporary wheel installed into an isolated environment, selected the KMP router and build
  leaf, recorded both as applied, and reported one closed selection through installed-package code.
- The generic skill validator does not accept the runtime's existing `id`, `title`, `stage`, and
  `provenance` frontmatter convention. The repository-owned skill payload and materialization tests
  remain the authority for those unchanged legacy metadata fields; portable KMP frontmatter is
  unaffected.
- No wheel was published, no adopter was changed, and no Project Gateway file or runtime behavior
  was promoted.
