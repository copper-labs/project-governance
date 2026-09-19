# Night Progress

Working log for autonomous runs. Newest entry last. Each run appends; nothing is rewritten.

## State

- **Current step:** Step 1 - Find The Recurring Cost (not started)
- **Next batch:** Step 1 Batch 1 (representative sample and cost account)
- **Parallel track available:** Track R, read-only release preparation, depends on nothing
- **Language:** TypeScript on Node 22
- **Store:** files, JSON for records and Markdown for prose
- **Blocked on:** nothing for Phase 1

## Autonomous Schedule

An hourly scheduled task works one batch per run, commits, and appends here. Every run first checks
`docs/reviews/` for a review newer than the reconciliation; if one exists it reconciles instead of
implementing, and stops. It stops at the end of Phase 1 rather than starting Phase 2.

Runs need this computer awake with the desktop app running. If it sleeps, runs stop and resume when
it wakes; nothing is lost because state lives in this file and in git.

## Standing Constraints

- **The scheduled task's prompt is stale.** It targets the six-phase plan, which no longer exists.
  It must be rewritten for the five-step sequence before being enabled, and that rewrite needs the
  operator's approval because the task is bound to this computer.
- Step 1 builds nothing. It measures where time and tokens actually go and selects one intervention.
- No provider calls before Step 3, and Step 3 only starts if Step 2 showed the tool pays for itself
  without a model.
- Real KMP builds cannot run on this machine: Node 22 and JDK 11, no Gradle. Prove on the fixture
  adapter and the TypeScript adopter. Do not claim KMP coverage.
- Read the other repositories only. Never write outside `project-harness`.
- Every batch ends with a commit and an entry below.

## Log

- 2026-09-19: Repository created, contract family carried across, reconciled against the secondary
  review, committed. Phase 1 not yet started.

- 2026-09-19: Architecture review reconciled. Added a task brief and an action authority contract,
  made the tier rule a default rather than an admission test, separated verification from
  acceptance, added prepared and outcome-unknown states for side effects, split build hygiene into
  three separately adopted concerns, deferred the plugin engine. Replaced the six-phase plan with
  five steps plus an independent release-preparation track. Phase 1 as previously planned is
  withdrawn; its files are in git history.
