---
id: plan.rc9-1-context-deadlines
title: Context Deadline Correction Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-09-28
updated: 2026-09-28
summary: Remove the redundant context provider timeout, prove bounded fallback, and publish the corrected prerelease.
---

# Context deadline correction delivery

Owner: [context decision deadline correction](../../specs/engine-rc9-1-context-deadlines.md).

1. Replace the context-only one-second cap with the existing 30-second operation cutoff. Keep
   profile deadlines for every other decision.
2. Build and package the runtime; bind the archive to the exact source commit. Publish RC9.1
   immediately without CI or test-suite qualification, as directed by the operator.
3. Update the paused Coaching Intelligence worktree and the active Portal worktree from that
   immutable archive. Preserve existing work and record installed identity in each checkout.
4. Later qualification should cover delayed valid responses, caller cutoff, cancellation, budget
   ownership, installed-package behavior and ordinary-task telemetry.

The first live adopter probes that exposed this issue are external installation evidence, not
ordinary-task acceptance. Preserve their receipts and do not repeat them as a substitute for the
corrected release check.
