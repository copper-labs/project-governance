---
id: review.rc7-prompt-reliability
title: RC7 Prompt Reliability Review
type: review
status: completed
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Reconciles the independent timing, task transition and release-boundary review.
---

# Review disposition

Claude Opus 5.5 at medium effort reviewed the completed RC7 batch read-only. One scoped recheck
closed all four findings. The review found no remaining material publication blocker.

| Finding | Disposition |
| --- | --- |
| A retained 10-second hook could terminate fallback. | Require reconciliation and host approval of the exact 15-second handler. Doctor already detects configuration drift. The release does not support a partial hook upgrade. |
| Timeout telemetry could miss a terminal deadline or relabel successful selection after slow delivery. | Record the cause when selection ends. Separate provider, selection, operation and caller limits; report delivery overrun independently. Focused tests cover each case. |
| An expired old turn can keep automatic refresh local-only if the host skips a new prompt. | Preserve this conservative boundary. An unobserved turn cannot justify fresh paid accounting. Tests cover expiry, exhausted expansions and return to the original task without resetting spending. |
| Duplicate prompt guidance asked for a new operator turn after a task switch. | Return the ordinary context-route refresh instruction for a changed binding. |

The recheck's suggested one-batch 3.5-second provider test exceeds the existing one-second
per-call metadata ceiling. The focused timing test checks terminal caller-deadline mapping and
millisecond rounding; transport ownership remains covered by its existing tests. A sub-millisecond
deadline classification and closed-task wording remain nonblocking telemetry/presentation limits.
No additional provider authority, schema migration or automatic budget renewal was introduced.

## Qualification

- The full checkpoint passed 614 engine tests, 73 continuity tests and four release-script tests.
- Both module typechecks and 470 legacy runtime tests passed; the legacy wheel installed cleanly.
- After review corrections, 24 focused timing, transition and attribution tests passed.
- Installed archive proof checks the real launcher, managed hook, active fixture selection,
  task-switch refresh, fallback, linked worktrees and reader cleanup.
- Bounded live JEV qualification uses only synthetic source. It verifies active selection,
  retained allowance, index reuse and fallback. It does not establish development savings.

Publication is a separately authorized operation after the candidate commit. Exact archive hashes,
provider receipts, local proof logs and published tag/asset readback remain outside this reusable
source repository. GitHub Actions is skipped only for this operator-authorized publication.
