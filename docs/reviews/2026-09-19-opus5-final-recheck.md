## Findings

**All four targeted findings are closed. No new consequential regression found in the fixes.**

**1 — closed.** `cancelCheck` calls `recoverJobLink(store, actionId)` (`src/ops/execution.ts:295`) after the terminal short-circuit and before reading the binding, so an acknowledged-but-unlinked job is repaired and cancelled through its owner instead of refused. The deliberate refusal at `:301` now fires only when no valid `submission-response` exists — the case worth refusing.

**2 — closed.** `test/execution.test.ts:50-72` stubs `linkJob` to fail, submits, then asserts `cancel` was invoked exactly once, action `cancelled`, evidence `unconfirmed` — exercising finding 1's path directly. The second half keeps a pending-cleanup owner and asserts `pending` with the action still `in-progress`. `:73-81` asserts an `authorized` action holding a binding appears in `listUnresolvedActions` (`store.ts:279`) and cancels. `test/cli-execution.test.ts:33-47` covers `check cancel` through a real subprocess with a receipt-preserving fixture owner (`established: false`, exit 0). The unused import is gone.

**3 — closed.** `observeCheck` (`src/cli.ts:119-134`) wraps `owner.wait` alone, records `waitError`, and proceeds into `collectResult`; both the success and failure emits carry `actionId`, `jobId` and `waitError`. Verified in a fresh process (`cli-execution.test.ts:20-28`): the `wait-error` fixture exits 1 with `{"error":…}`, and the CLI still exits 3 with job identity intact. Constructing the owner only when `!binding.result && binding.jobId` also makes cached terminal readback survive an owner whose digest has since changed — a genuine improvement, and it keeps `check run` on an uncertain submission at exit 3 rather than throwing.

**4 — closed.** The `status` failure branch (`execution.ts:250-252`) returns `pending: true` with `statusError` and no evidence; asserted at `execution.test.ts:82-92`.

**Non-blocking nit:** `recoverJobLink` now runs before the `proposed/authorized/prepared` local-cancel branch, so that branch could in principle cancel locally after linking a job. Unreachable today — `submitCheck` reaches `in-progress` before any `submission-response` is written, and no transition returns to `prepared`. Reordering the `binding?.jobId` check ahead of it would make that structural rather than incidental.

## Blocker status

No review blocker remains. Findings 5-7 stand as previously recorded (wording, and finding 7's cost/filter caveat), none gating. Prior boundaries — real-host and published-runtime qualification, unknown owner-state investigation, Node 22.18 minimum — remain open and unclaimed. I read only the named files; no builds, writes, or delegation.
