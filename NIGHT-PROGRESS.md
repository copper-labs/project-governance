# Night Progress

Working log. Newest entry last. Nothing here is rewritten.

## State

- **Pass A:** complete. Baseline measured, Track R surveyed.
- **Pass B:** the runtime is built and tested. Batch 4, the comparison against the baseline,
  needs real use over days and has not started.
- **Pass C:** not started. It needs Pass B's comparison first.
- **Language:** TypeScript on Node 22. Zero runtime dependencies.
- **Store:** SQLite via `node:sqlite`, Markdown for briefs, files for large artifacts.
- **The host holds the pen.** The harness reads, runs declared checks, and records. It does not
  write to a working tree.

## Standing Constraints

- No provider call is required by any core path. The `JEV_TOKEN` in `.env.local` is unused so far.
- Prove on the TypeScript adopter. This machine cannot build the movement SDK's Kotlin targets
  (JDK 11, no Gradle) and cannot reach the parent repository of its worktree.
- Read other repositories only. Never write outside `project-harness`.

## Try It

```sh
npm test                 # 38 tests
npm run typecheck
node --experimental-strip-types src/cli.ts help
```

## Log

- 2026-09-19: Repository created, contract family carried across, reconciled against the secondary
  review, committed.
- 2026-09-19: Architecture review reconciled. Task brief and action authority contracts added, tier
  rule made a default rather than an admission test, verification separated from acceptance,
  prepared and outcome-unknown states added, build hygiene split into three concerns, plugin engine
  deferred. Six-phase plan replaced by five steps plus a release track.
- 2026-09-19: Contracts consolidated around four objects - Task, Action, Artifact, Evidence - with
  decisions as annotations. Thesis changed to reliable continuity: the runtime is useful with zero
  model calls. SQLite adopted for operational state. Context ranking pipeline cut down to
  subject-bound retrieval within a task budget.
- 2026-09-19: Writing staged. The host performs every edit in the first implementation; the
  harness's own contracts for writing exist but stay unused.

### Pass A - complete

- **Baseline measured** from telemetry already present in two repositories: 495 governance runs over
  36 days, 83 test batches over 34 hours. Written up in `docs/research/pass-a-baseline.md`.
  - 71% and 54% of non-commit-msg check runs re-execute an identical subject. Worst case: one
    subject re-checked 34 times at `pre-push`.
  - Test execution consumed 4h27m in 34 hours, median batch 41s, p90 10m54s, failure rate 41%.
    83 of 87 batches were dispatched externally as `long-batch`.
  - The movement SDK fails at 31% against the governance repository's 9%.
  - Planning costs under a second. There is nothing to win in selection.
  - **Token consumption is recorded nowhere.** It cannot be recovered from history and had to be
    instrumented going forward. That became a Pass B requirement.
- **Track R surveyed** in `docs/research/track-r-fact-sources.md`: 25 fields left pending for an
  operator every release; 11 have a client already in the repository, 7 need a definition rather
  than code, 7 are narrative and should stay human. Realistic claim is 18 of 25.

### Pass B - runtime built, comparison outstanding

Stack: Node 22 native TypeScript type stripping, `node:sqlite`, `node:test`. No runtime
dependencies, no build step, no framework.

Delivered:

- The four objects, in `src/model/types.ts`.
- The SQLite store with compare-and-set on an expected revision, the execution/analytics
  criticality split, bounded retention fields and a first-class JSON export.
- The authority boundary: scope resolved before checking so `..` and symlink escapes are refused,
  task-declared scope bounding action scope, stale policy revisions refused, destinations never
  inferred, export rules blocking a transmission before it leaves.
- The action lifecycle through `prepared` and `in-progress`, with recovery by inspecting real
  effects and `outcome-unknown` when the outcome cannot be established.
- The execution seam: runs a declared check, keeps a content-addressed receipt, and records what it
  establishes - a passing check states plainly that it is *not* acceptance of the task.
- Subject-bound retrieval through git, closing the gap both reviews flagged.
- Usage instrumentation emitted from the first run.
- A JSON command surface: `task create|show|list|revise`, `context get`, `check run`, `recover`,
  `usage`, `export`.

Proven, not asserted:

- 38 tests pass; typecheck clean.
- Fault injection: a crash between two writes, an effect whose receipt was lost, two resumers
  racing, and survival across a process restart with the reconciliation method intact.
- On real repositories: a 42KB file retrieved within budget, a second request inheriting the
  first's spend, a mandatory item returning a blocker rather than being dropped, and a staged
  subject yielding 780 bytes while the dirty worktree held 791.

Two things the first real runs caught, both fixed:

- A read-only constraint was refusing to run the test suite. Running a command the operator
  declared is not a code change; the prohibition now applies to mutating operations only.
- The blocker message reported negative remaining budget.

## What Is Next

1. **Pass B Batch 4.** Use the harness on real tasks for a while, then compare against the Pass A
   baseline on its four measures. This needs days of real use, not another build session.
2. **Decide the seven Track R definitions** - what counts as healthy, what counts as passing. That
   is a conversation, and it unblocks 7 more fields.
3. **Pass C** only after Batch 4 says the tool pays for itself without a model.

## Open Questions For The Operator

- The `recover` command's inspector treats an action with no declared outputs as unestablishable,
  which is correct but conservative. Whether check-only actions should declare their receipt as an
  inspectable output is a design call I did not want to make unilaterally.
- Track R's seven definitions above.
