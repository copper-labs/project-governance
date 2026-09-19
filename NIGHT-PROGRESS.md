# Night Progress

Working log for autonomous runs. Newest entry last. Each run appends; nothing is rewritten.

## State

- **Current phase:** Phase 1 - Build Hygiene
- **Next batch:** Batch 1 (store and build record)
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

- No provider calls anywhere in Phase 1. It is deterministic by design.
- Batch order is Batch 1 store, Batch 2 fixture adapter, Batch 3 identity and request claim,
  Batch 4 ladder and the first real adapter. The fixture adapter comes before any real build.
- Real KMP builds cannot run on this machine: Node 22 and JDK 11, no Gradle. Prove on the fixture
  adapter and the TypeScript adopter. Do not claim KMP coverage.
- Read the other repositories only. Never write outside `project-harness`.
- Every batch ends with a commit and an entry below.

## Log

- 2026-09-19: Repository created, contract family carried across, reconciled against the secondary
  review, committed. Phase 1 not yet started.
