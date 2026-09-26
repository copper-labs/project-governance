---
id: plan.rc8-hook-sources
title: RC8 Hook and Context Reliability
type: exec-plan
status: active
owner: project-governance
created: 2026-09-25
updated: 2026-09-26
summary: Repair shared hooks, large-repository preparation and context-budget readiness, then qualify RC8 and coordinate adoption.
---

# RC8 delivery slice

Owner: [shared hook source contract](../../specs/engine-rc8-hook-sources.md).
One writer handles the related preparation and entry repairs; no additional reader is needed before
the frozen review. Computer-use work is deferred. Inspect adopter sources read-only, retain timing
artifacts outside this checkout, and keep test/index state in separate fixtures. Authorized adopter
configuration and runtime changes happen only at a coordinated seam, preserving concurrent work.

1. [x] Confirm native discovery and the upstream host contract. Separate shared hook definitions
   from per-worktree runtime selection and receipts.
2. [x] Resolve and report the actual project hook source in context and installation readiness.
3. [x] Bind the shared definition as a read-only migration dependency and reject incomplete linked
   cutovers before mutations. Preserve existing backed repair and normal host trust.
4. [x] Prove the reproduced failure and repair using temporary linked worktrees. Run focused
   regression tests and typecheck; update adoption guidance.
5. [x] Reproduce large-repository preparation, batch changed-file source lookup, scope and bound
   freshness observation, and prove cold index progress plus warm reuse without hiding candidates.
6. [x] Unify native delivery with the declared route budget; expose standalone and mixed-owner
   required-context overflow in passive readiness. Prove missing/oversized guidance and replay.
7. [x] Freeze the complete RC8 candidate, perform the hook/selection-boundary test suite and installed-package
   proof, then the existing independent release review and affected reconciliation.
8. [ ] Publish only the qualified candidate through the established release process. Coordinate
   main-checkout and active-worktree adoption, verify native hook sources/trust and normal prompt
   receipts, and preserve unrelated work. Publication and adopter repair are distinct outcomes.

Focused checkpoints cover changed-subject capture, incremental indexing, routed/prompt budgets and
shared-hook installation. The integrated release checkpoint includes engine and continuity tests,
typecheck, package proof, a bounded synthetic live-JEV call and independent Claude review. Compare
preparation on the same local source where possible; active edits invalidate a matched speed claim.
The adoption checkpoint reconciles shared main-checkout hooks, each active tree's runtime, profile
budget readiness, trust and ordinary prompt evidence. Installation probes are labeled separately.

## Review reconciliation

Claude Opus 5.5 at medium effort reviewed the implementation and rechecked the affected corrections.
No high or medium finding remains. Bulk metadata is restricted to changed paths rather than the
whole tree; unusual unrelated names cannot break narrow capture. Readiness includes selected
intent owners with path owners and reports incomplete larger combinations. Native budgets keep
the old implicit limit and combine each owner's actual limit without borrowing another owner's
opt-in. Replay retains that digest-bound limit. The review accepted the two lifecycle coordinator
cohesion dispositions. Runtime evidence and review artifacts remain outside this repository.

Focused regressions cover those corrections, Git normalization and mandatory guidance. The full
engine suite passed 632 tests before the final budget correction; its 27 affected tests and
typecheck then passed. Continuity passed 73 tests and the existing Python owner passed 470 tests.
The exact publication archive passed clean installed-package proof and two bounded live JEV calls,
including task refresh, index reuse, zero-call replay, exhausted-budget fallback and missing-token
fallback. The legacy wheel also passed clean installed proof. Native host trust and ordinary
adopter outcomes remain part of the coordinated installation checkpoint.

## Computer-use research boundary

The operator deferred computer-use work to a later release on September 25, 2026. Preserve the
research; do not install or implement the proposed pilot during this release. The current
follow-up review exposed the preparation and budget defects now included in this release.

Investigate primary implementations of JEV action selection over browser controls and desktop
accessibility. Compare a continuous executor loop with per-click LLM mediation. Separate author
benchmarks from reproduced evidence, and identify a small opt-in pilot with independent success
checks, no-token fallback and total-cost measurement before proposing another release feature.

The [research report](../../research/2026-09-25-jev-computer-use.md) records browser and native
desktop examples, measurement limits and a targeted automated-browser-test pilot. Evaluate the
existing Jev Desktop for Codex loop first, then add only the required test definitions, assertions
and harness receipt integration. Credential setup stays outside the JEV loop; broad desktop
automation is deferred. No new executor or community plugin was installed. The confirmed
shared-hook repair is implemented in source;
publication and coordinated adopter repair remain separate release work.
