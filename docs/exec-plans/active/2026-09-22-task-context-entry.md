---
id: plan.task-context-entry
title: Ordinary Task Context and Selection Adoption
type: exec-plan
status: active
owner: project-governance
created: 2026-09-22
updated: 2026-09-22
summary: Implements and qualifies the post-RC4 task binding and context selection integration repair.
---

# Ordinary task context and selection adoption

Owner: corrective batch of the [major adoption programme](2026-09-21-major-adoption-and-measurement.md).
Contract: [task context entry](../../specs/engine-task-context-entry.md).
Status: implementation and local qualification complete; Opus 5 extra-high architectural review
reconciled with no remaining release blocker. Release and installed adoption remain separate gates.
This plan does not authorize a new remote release.

## Scope and acceptance

Repair normal task binding and context delivery so enabled optional decisions are actually reachable
before reading source. Keep deterministic enforcement, fast provider-free fallback, fixed models and
existing task/receipt owners. Adopter identities, snapshots and review evidence stay outside this repo.
Do not claim deployment or token savings from source tests. Preserve concurrent adopter edits.

## Priority and implementation slices

### C1 — Reuse continuity identity

- [x] Add read-only workspace lookup to the existing SQLite store; no schema or database migration.
- [x] Project an open, same-version, same-worktree task into the existing decision-context type.
- [x] Resolve explicit input before inherited session binding, with bounded fields and named fallback.
- [x] Connect ordinary plan/check preparation and provider submission. Freeze detached identities.
- [x] Keep explicit workflow authorization and approval IDs unchanged. Document native session
  inheritance and a portable `HARNESS_SESSION` host launch; no generic ungoverned child launcher.
- [x] Qualify session/worktree isolation, stale/closed tasks, explicit conflicts and read-only behavior.

### C2 — Deliver useful context automatically

- [x] Use resolved task intent and scope when ordinary context-route flags are omitted.
- [x] Preserve all path-matched mandatory route owners for mixed work; retain prompt ambiguity handling.
- [x] Reuse captured-path inventory and discovery; bound, filter and record automatic candidates before
  selection. Include appropriate new drafts without reading unrelated dirty work.
- [x] Reuse packet excerpts, model interface, no-token fallback and source revalidation.
- [x] Link route entry exposure and binding/candidate readiness to existing telemetry.
- [x] Qualify automatic delivery, privacy bounds, required-context preservation and fallback.

### C3 — Repair the adopter configuration

- [x] Recheck active worktree identity, dirty files and ownership before narrow edits.
- [x] Add missing design/reference/spec/plan routes and concise owner guidance; repair reviewed sharing
  patterns. Keep model routing off and existing required gates intact.
- [x] Replay the observed routing misses and a mixed source/docs case without provider calls or builds.
- [x] Document exact current-RC usage and the future task-once path. Do not patch installed RC4 or
  bind/alter another agent's active task. Preserve an external configuration handoff and receipts.

### C4 — Integrated proof and review

- [x] Run affected focused suites through development; run engine/continuity/typechecks once at this
  batch boundary. Run the existing installed-package decision pilot because selection/hooks changed.
- [x] Freeze the review diff and evidence. Ask Claude Opus 5 at extra-high effort for architectural
  review of identity, boundaries, capture, fallback, telemetry, rollout and unnecessary complexity.
- [x] Reconcile substantive findings and recheck affected proof/review. Record remaining limitations.
- [x] Finish the source/configuration handoff with release/adoption prerequisites. Live ordinary-task
  acceptance belongs to the subsequent immutable-release adoption; do not manufacture a task or
  count an installation probe as accepted-work benefit.

## Deferred work

No new retrieval service, global task registry, automated model cascade, task guessing, forced JEV
availability, full mobile build, device disruption test or new evaluation platform. CI request-size
optimization can follow measured evidence; do not bundle it into this binding/selection repair unless
it prevents basic qualification. Public release and real development acceptance are distinct gates.

## Qualification checkpoint

Engine tests: 513 passed with four concurrent test-file workers. Continuity: 73 passed. Packaging
helpers: 4 passed. Both TypeScript
checks passed. Reconciled offline installed-package proof passed, including task creation, automatic source
selection with fixture inference, no-token fallback, native checks and task identity retained after
host rebinding. The source pre-push gate has no blocking findings; comment advice remains advisory.

The installed-package fixture initially exposed its own unowned configuration changes in the
validation plan. Capture the fixture configuration before testing a source-only task; do not weaken
the planner. The corrected probe passed. New documentation metadata/index findings were repaired.
Runtime, configuration and ordinary-task acceptance are separate: current-RC route corrections are
qualified; new automatic behavior remains source/package-qualified until immutable adoption.
Mixed source/document requests remain blocked by ambiguity in installed RC4 until that adoption.

Opus 5 at extra-high effort identified root-scope regression, ambient-task replay conflicts,
route-name-dependent mixed budgets and vague binding failures. Reconciliation preserves required
routing for empty scopes, freezes replayed intent before ambient lookup, combines budget envelopes,
and emits distinct projection diagnostics. It also retains provider-free explicit source delivery,
queries scoped captured metadata, preserves every required skill path, makes revision/rebind atomic,
and separates classifier excerpts from delivery excerpts. Focused regressions cover these cases.
The reviewer rechecks closed the original blockers and the ordinary-entry fallback/inventory follow-ups.
Task-derived non-text files now produce recorded exclusions while manually flagged invalid inputs
retain their strict errors. The legacy selector's whole-request sharing fallback is documented; the
current DL03 relevance consumer assesses permitted candidates individually.

Two broad-run fixture deletions raced detached final bookkeeping. The affected recovery/timeout
fixtures now wait for their own recorded processes to exit before deleting evidence. Runtime assertions
remain intact; the final integrated run and installed package proof pass. No application build or device
session was needed for this context/identity batch.
