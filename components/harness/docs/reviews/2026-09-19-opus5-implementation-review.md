# Architecture reset review — project-harness, 19 September 2026

Reviewer: Claude Opus 5, extra-high, independent. Read-only; no edits, builds or installs were
performed, and nothing was written outside this plan file. `project-governance` was read only.

## Context

The architecture reset (`docs/exec-plans/active/2026-09-19-architecture-reset.md`) replaces the
prototype reviewed in `docs/reviews/2026-09-19-greenfield-assessment.md`. This review checks the
delivered `src/`, `test/` and `docs/specs` against that assessment's P1/P2 defects and against the
reset's own acceptance criteria, and independently re-derives the public governance batch protocol
from `project-governance/src/project_governance_runtime/provider_agents/{test_batches,jobs,cli}.py`.

## Recommendation

**Fix F1 and F2, then the design is sound enough for a provider-free pilot.** The boundaries hold,
the greenfield P1s are genuinely repaired, and the ownership table in `harness-core.md` matches the
code. Two defects would corrupt the pilot's own measurements, so they gate it. F3–F8 and F11–F12,
F15 are real but do not block a controlled pilot. Do not add scope before the pilot runs.

## Verified repairs (greenfield P1/P2 → current)

| Greenfield defect | Status | Evidence |
| --- | --- | --- |
| Retrieval bound to a mutable ref | Repaired | `retrieval.ts:30` resolves a tree object once; `readAtSubject:66` reads `git show <tree>:<path>` |
| Content never delivered | Repaired | `cli.ts:152` returns real bytes; `artifact read` (`cli.ts:154`) pages UTF-8 safely |
| Equal contents collapse to one locator | Repaired | `path` is in artifact identity, `store.ts:294` |
| Budget resettable per request | Repaired | `store.ts:566` `INSERT OR IGNORE`; expansion needs `setBudget` + authority ref |
| No recheck at dispatch | Repaired | `store.ts:262-266` rechecks task version/status on authorized/prepared/in-progress |
| Illegal transitions allowed | Repaired | `TRANSITIONS`, `store.ts:773` |
| Recovery mutates live work | Repaired | `execution.ts:232` only observes the owner; `finishExecution` is idempotent (`store.ts:700`) |
| File existence treated as completion | Repaired | replaced by owner job + receipt |
| `treeDigest` blind to dirty edits | Repaired | `concurrency.ts:24-37` hashes raw diff plus per-file content |
| `sessionId` falls back to PID | Repaired | `location.ts:22` returns `null` |
| `usageTotals` turns unknown into zero | Repaired | `store.ts:426` preserves null, reports coverage |

## Must-fix defects

### F1 — `--wait` does not wait. High. `src/ops/execution.ts:61`

`GovernanceExecutor.wait` calls `harness-agent wait <job> --seconds N`. Upstream that is the
*event-stream* wait: `cli.py` parses `--after` with default 0 and calls `jobs.wait(job_id, 0, N)`,
which returns as soon as `value["events"]` is non-empty (`jobs.py:283-288`). A just-started batch
has already emitted events, so the call returns immediately. `--until-terminal` (`cli.py:70` →
`jobs.wait_terminal`) is the primitive that actually blocks.

Failure scenario, already reproduced in this repository: `.harness/qualification/run.mjs:12` runs
`check run … --wait 5`; `.harness/qualification/results.json` records `"code": 3, "pending": true,
"passed": null` for **both** the exit-0 and exit-7 batches. The terminal receipts in
`pass-final.json` / `failure-final.json` were collected ~7 minutes later by a separate invocation
(`createdAt` 16:59:46 vs `updatedAt` 17:07:02). So every check costs a second CLI round trip and a
second model turn — the exact repeated work the product exists to remove.

Contradicted claims: `docs/specs/execution.md` "result can wait up to 30 seconds per call";
`HOW-TO-USE.md` "Wait is bounded to 30 seconds" and its `check result --action ID --wait 10` example.

Smallest remedy: call `wait <job> --until-terminal` (bounded by the existing spawn timeout), then
`result`. Map its `AgentError("cleanup needs project recovery…")` to pending + stage, not a throw.

### F2 — exit 1 is returned for results that established nothing. High. `src/cli.ts:217`, `src/cli.ts:228`

Both check paths emit `r.pending ? 3 : r.passed ? 0 : 1`. `collectResult` computes `established`
(`execution.ts:223`) and then discards it, returning only `passed`.

Failure scenario: a worker crash makes upstream return `input_validity: "invalid-or-unverified"`,
`assessment_allowed: False` (`test_batches.py:363-365` `recover_result`). The harness correctly
records evidence `unconfirmed` — and the shell sees exit **1**, indistinguishable from "your
assertions failed". Any hook or pipeline reports an infrastructure failure as a product-assertion
failure. Same for `state: "interrupted"` and for a case carrying `reason`.

This contradicts `src/cli.ts:43`'s own HELP ("2 blocked/refused/invalid") and
`docs/specs/execution.md` ("1 established unsuccessful result … JSON and shell exit status must
agree"). `HOW-TO-USE.md` states a third, different meaning for exit 1. `test/execution.test.ts:14`
asserts the evidence is `unconfirmed` but never the exit code, so the suite cannot catch this.

Smallest remedy: return `established` from `collectResult`; emit 2 when `!pending && !established`.
Then reconcile the three exit-code descriptions to one.

## Significant defects

### F3 — a job identity can be lost after a successful submission. `src/ops/execution.ts:169-177`

If `submit` succeeds but `linkJob` throws, or the returned `job_id` fails the regex at line 170,
the response is discarded and the action becomes `outcome-unknown` with no pointer to the owner.
`collectResult` then returns `pending: true` forever (`execution.ts:203`), `recoverExecutions` can
never resolve it, and the recorded reason correctly says "do not submit again" — so a real running
job is stranded with nothing to inspect. Remedy: persist the raw response (ledger event or
`saveResult`) before transitioning. Two lines.

### F4 — unknown drift is reported as "unchanged". `src/ops/concurrency.ts:73`

`treeChanged` is `false` both when nothing changed and when `treeDigest` returned `null` — which it
does for >2000 modified/untracked files or any unreadable file (`concurrency.ts:28-34`). `status`
then asserts `treeChangedSinceYouLastActed: false` with no warning, precisely when coverage is
worst. `docs/specs/concurrency.md` says "unavailable or oversized inspection is unknown."
Remedy: make the field `boolean | "unknown"` and add the branch to the warning ladder at line 74.

### F5 — the concurrency test file covers a dead code path that contradicts the spec. `src/store/store.ts:484-516`, `src/store/schema.ts:121-129`

`recordTaskPath` and `overlappingPaths` (and the `task_path` table) have no production caller; the
live mechanism is `path_intent` + `report()`. Yet `test/concurrency.test.ts:32-83` exercises only
the dead API — including line 74, which asserts an `explore`-mode task cannot collide, via
`store.ts:509` `COALESCE(t.mode,'implement') != 'explore'`. `docs/specs/concurrency.md` states the
opposite ("Task mode describes intent but never suppresses reader/writer risk. Writing a spec is
still a write"), and the shipped `report()` (`concurrency.ts:71`) correctly does not filter explore.
The suite's main concurrency evidence therefore pins behavior the product does not have.
Remedy: delete the dead trio and rewrite `test/concurrency.test.ts` against `report()`.

### F6 — no CLI path resolves a stuck action. `src/ops/actions.ts:24-29`

`completeAction` and `cancelAction` have no callers; there is no `cancel` verb in `cli.ts`.
`docs/specs/action.md` promises "Prepared records without a job remain pending until explicitly
cancelled". A `prepared`/`outcome-unknown` action whose owner is gone (state root deleted, or the
executable upgraded so `executorFor` throws at `execution.ts:182`) can never leave the unresolved
set: it reappears in every `resume` packet (`continuity.ts:24`) and every `recover`, for every
worktree sharing the store, forever.

Related orphan: if `mkdirSync`/`writeFileSync` fails at `execution.ts:163-164` *after*
`saveExecution` at line 161, the action stays `authorized` with an `execution` row; the PRIMARY KEY
makes retry impossible, and `authorized` appears in neither `listUnresolvedActions` (`store.ts:282`)
nor `resume`'s pending filter — an invisible orphan.

Remedy: add `check cancel --action ID --authority-ref REF` wired to `cancelAction`; include
`authorized` actions that already hold an execution binding in `listUnresolvedActions`.

### F7 — resume never says you are in the wrong workspace. `src/cli.ts:127-133`, `src/ops/continuity.ts:5`

Neither `bind()` (`store.ts:596`) nor `resume()` compares the current worktree against the task's
scope items. `docs/specs/task.md` requires the operator to revise scope before working in another
worktree — the documented linked-worktree flow. Failure scenario: an agent resumes task T (scoped
to worktree A) inside linked worktree B, gets a clean, confident packet, plans, and only then finds
every path returned as `unavailable: "outside task scope"` (`retrieval.ts:106`) and `check run`
refused (`governance.ts:11`). That discovery costs a full turn. Remedy: `withinScope` already
exists — add `workspace: { worktree, withinTaskScope }` plus a next-step hint to the resume payload.

### F8 — the upstream `protocol_version` is never pinned. `src/ops/execution.ts:213-221`

`collectResult` validates `kind`, `workspace`, `cleanup_confirmed`, `cases`, `input_binding`,
`input_fingerprint` and `state`, but not `protocol_version` — which upstream carries on every result
(`test_batches.py:322`) and deliberately flips as its recovery-compatibility guard
(`test_batches.py:325-331` `terminal_protocol`). The harness pins *request* version 1
(`execution.ts:84`) and leaves the result protocol open. `executorDigest` is not a substitute: it
fails closed on any binary change, so it forces a hard stop on upgrade rather than a version check.
Remedy: record `protocol_version` on the binding at submit; refuse terminal results outside a
declared supported set.

### F15 — stuck cleanup is invisible. `src/ops/execution.ts:211`

Upstream distinguishes "running" from "Awaiting confirmed process/project cleanup" via `status`'s
`stage` (`jobs.py:110-119`, `jobs.py:155`); `wait --until-terminal` even raises for it. The harness
never calls `status` and returns a flat `pending: true`. A batch whose project cleanup never
acknowledges stays pending forever, `recover` says nothing actionable, and (with F6) the action
cannot be cancelled. Remedy: call `status` when not ready; surface `state`, `stage`,
`elapsed_seconds` in the pending payload.

## Design gaps that under-deliver their own spec

### F11 — fork copies findings with no per-item origin. `src/store/store.ts:102-123`

`forkTask` copies unrevoked items verbatim; `TaskItem` (`model/types.ts:6`) and `task_item`
(`schema.ts:31`) have no origin field. `resume` labels the *task* as inherited (`continuity.ts:22`)
but cannot label individual items. So a child's inherited `ruled-out` — true of the *parent's*
inputs — is indistinguishable from one observed on this task's inputs, and the next session skips a
re-check the fork invalidated. `docs/specs/task.md` claims "Findings keep their original
applicability limits." Remedy: an `origin` column (`<parentTaskId>@<version>`, NULL for native),
written by `forkTask` and surfaced in `resume`'s `findings`.

### F12 — reconcile cannot classify the evidence that matters. `src/ops/continuity.ts:66-69`

Applicability is `source-match`/`stale` only when the artifact subject starts with `tree:`.
Execution receipts get `manifest:<hash>` or `null` (`execution.ts:227`) and worktree snapshots get
`worktree:<hash>` (`retrieval.ts:132`). So **every check receipt** — the only evidence a merge
actually needs classified — resolves to `unknown`, and only committed/staged retrieval snapshots
ever match. `HOW-TO-USE.md` says reconciliation "records whether old evidence still matches the
merged tree." Remedy: either record a comparable resolved input identity on the receipt subject
(the manifest already carries per-file sha256), or state plainly in `task.md` that receipts are
always `unknown` and reconciliation is a bookkeeping record.

## Lower-severity, small remedies

- **F9** `src/ops/retrieval.ts:127-137` — `reserveBytes` returns the authoritative `{ceiling, used}`
  and it is discarded; line 137 reports `prior + bytes` from the pre-transaction read at line 97.
  With two sessions on the shared store, `context get` under-reports spend and the next read is
  refused unexpectedly. One-line fix: report the returned value.
- **F10** `src/cli.ts:274-278` — `touch` runs in `finally` for every command and calls `treeDigest`
  (three `git` subprocesses plus a SHA-256 of every dirty/untracked file). `status` and `paths`
  already computed it in `report()` (`concurrency.ts:67`), so they hash the tree **twice** per
  invocation, and `usage`/`events`/`task list`/`doctor` pay it for nothing. On a tool measured by
  cost per accepted task, this is self-inflicted overhead in the pilot that judges it.
- **F13** `src/ops/continuity.ts:83` vs `:93` — the bundle digest relies on `JSON.stringify` key
  order surviving a parse round trip. Any integer-like key reaching a ledger `detail` reorders and
  makes a valid bundle permanently unimportable. `execution.ts:187` already has a canonical
  serializer; reuse it on both sides.
- **F14** `src/store/store.ts:172-191` — `#writeTaskVersion` issues raw `BEGIN IMMEDIATE` without
  touching `#depth`. Latent today; the first caller that creates or revises a task inside the public
  `atomic()` gets a nested-transaction error, and the bare `ROLLBACK` at line 185 then aborts the
  *enclosing* transaction. Route it through `this.atomic()`.
- **F16** `src/ops/continuity.ts:72` — a reconciliation event embeds every source observation in one
  ledger `detail`, which `events` (`cli.ts:251`) returns unbounded. Resume is safe (summaries only);
  `events` is not.

## Unnecessary complexity to remove

Charter: "remove what no longer helps." In 3.1k lines, these have no production caller:
`Store.exportJson` (`store.ts:744`, test-only), `routeByDeclaredTarget` (`retrieval.ts:140`),
`changedPaths` (`retrieval.ts:141`, test-only), `completeAction`/`cancelAction`,
`recordTaskPath`/`overlappingPaths`/`task_path` (F5). Also currently unreachable: `Action.destination`
is always null and `authorize` refuses any non-null value (`authority.ts:44`); operations `read` and
`record` are never proposed (the only `proposeAction` is `cli.ts:207`, always `check`); artifact
kinds `patch`/`document` are never produced; the `session` columns on `action` and `evidence`
(`schema.ts:59`, `schema.ts:87`) are never written. The Action object's generality currently serves
exactly one case. Either delete the unused surface or note in `action.md` that it is reserved.

## Coherence for a provider-free pilot

Coherent, with F1/F2 fixed. Concretely:

- **Boundaries hold.** No fallback runner exists; `GovernanceExecutor` touches only
  `batch`/`result`/`wait` and `governancePlan` only `plan --json`. Nothing imports governance
  internals. No model call is on any core path. `init --apply` is the only writer, limited to
  marked blocks in two files, refusing symlinks and malformed markers (`adapter.ts:38-55`).
- **Claims are calibrated.** `authorize()` (`authority.ts:37`) enforces only structured
  `deny:<operation>` and scope, and `action.md` says so. `authorityRef` is labelled an attribution
  claim. Unknown usage stays null. These are the right small claims.
- **Durable-before-dispatch is real.** `saveExecution` requires `authorized` (`store.ts:676`), the
  request is persisted before `submit`, and `beginAction` rechecks task revision and open status
  transactionally at the dispatch boundary (`store.ts:262`).
- **Conservative recovery is real.** Crash recovery was re-derived end to end: upstream's
  `recover_result` yields `assessment_allowed: False`, the harness computes `established === false`,
  and evidence lands `unconfirmed` — no fabricated pass. Late results after task cancellation stay
  historical (`test/recovery.test.ts`).
- **The fingerprint contract actually matches.** `inputFingerprint` (`execution.ts:186`) reproduces
  upstream's `json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=True)` over normalized
  inputs, including the `files: []` default that upstream always emits (`test_batches.py:99`). The
  only divergence is sort order for astral-plane characters (JS UTF-16 units vs Python code points)
  — not worth fixing.

What tests do **not** establish: the suite's executor is a fake that reuses `inputFingerprint`
itself (`test/helpers.ts:40`), so it cannot detect protocol drift; there is no test of `check run`
exit codes at all; concurrency coverage sits on a dead path (F5); and the "budget binds to the task"
test (`test/retrieval.test.ts:78`) calls `retrieve` **without** `taskId`, so it exercises caller-
threaded arithmetic, not the store-backed ceiling. The live qualification in `.harness/qualification`
is the stronger evidence, and it is what surfaced F1.

Deferred JEV/Mnemos/pilot work is correctly deferred: no adapter, dependency or shaping toward
either appears in the source. That is intentional absence, not unbuilt savings, and the specs say so.

## Next checks (in order)

1. Fix F1, then re-run `.harness/qualification/run.mjs` and confirm `check run --wait` returns
   `code 0` and `code 1` directly — currently both return 3.
2. Fix F2; add a CLI test asserting 0 / 1 / 2 / 3 against a fake executor for passed, refuted,
   `invalid-or-unverified`, and pending.
3. Reconcile the three exit-code descriptions (`cli.ts:43`, `execution.md`, `HOW-TO-USE.md`).
4. Decide F5: delete the dead concurrency trio and rewrite its tests against `report()`.
5. Add F6's `check cancel` and F7's workspace/scope field — both are small and both remove a full
   wasted turn from the documented flows.
6. Qualify the crash and stuck-cleanup paths against the **real** executor (kill a worker mid-batch;
   withhold cleanup acknowledgment) — the fake cannot reach `recover_result` or `stage`.
7. Publish the compact implementation-status table with proof limits that the greenfield assessment
   asked for; `NIGHT-PROGRESS.md` is prose and currently states that this review "is recorded under
   docs/reviews" before it was.
8. Only then run the matched pilot. F10's overhead should be removed first, since the pilot measures
   exactly that.
