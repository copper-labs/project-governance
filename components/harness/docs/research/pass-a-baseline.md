> Historical research note, reviewed 2026-09-19. The 495-run sample and 624-operation denominator have not been reconciled. Percentages are provisional and do not establish harness savings. Current implementation contracts live under docs/specs.

---
id: research.pass-a-baseline
title: Pass A - Baseline Findings
type: research
status: draft
owner: project-harness
created: 2026-09-19
updated: 2026-09-19
summary: What the existing governance telemetry establishes about repeated execution, failure rates and test cost, and what it cannot establish.
---

# Pass A - Baseline Findings

Measured from governance telemetry already present in two adopting repositories. No instrumentation
was added and no provider was called.

## Sources

| Repository | Records | Window |
| --- | --- | --- |
| `project-governance` | 991 events, 495 runs | 12 Aug - 17 Sep 2026 (36 days) |
| movement SDK | 272 events, 51 runs, 83 test batches | 17 - 18 Sep 2026 (~34 hours) |

## Finding 1 - Most check runs re-execute an identical subject

Counting runs that share an identical scope fingerprint, subject digest, stage and mode:

| Repository | Non-commit-msg runs | Identical re-executions | Share |
| --- | --- | --- | --- |
| `project-governance` | 624 | 442 | **71%** |
| movement SDK | 54 | 29 | **54%** |

Commit-message runs are excluded deliberately: editing a message does not change the subject digest,
so their repeats are legitimate rather than duplicated work. Including them the figures are 77% and
66%.

The worst single case is one subject re-checked **34 times at `pre-push`** in the same mode.

**What this does and does not establish.** It establishes that the same declared selection ran
against the same bytes repeatedly. It does **not** by itself establish that the work was redundant:
the governance runtime's own contract is explicit that repeat observations do not prove unchanged
inputs or authorize reuse. External state, toolchain and environment can differ between two runs
over identical source. Treat it as the strongest available signal for where duplicate execution
lives, not as a measured waste figure.

## Finding 2 - Test execution is the expensive path, and it mostly leaves the session

From the movement SDK's 83 recorded test batches in roughly 34 hours:

| Measure | Value |
| --- | --- |
| Total test execution | **4 hours 27 minutes** |
| Median batch | 41 seconds |
| 90th percentile batch | **10 minutes 54 seconds** |
| Outcomes | 47 succeeded, 34 failed, 2 cancelled |
| Failure rate | **41%** |

Routing decisions recorded alongside them: **83 of 87** test batches were dispatched externally with
the reason `long-batch`; only 4 ran directly as a `quick-check`. Every one was hosted by Codex.

Two things follow. The long tail is where the wall clock goes: a 41-second median with an 11-minute
p90 means the average experience is dominated by the slow minority. And a 41% failure rate against
that distribution is the round-trip cost the proposal set out to attack, now with a number on it.

## Finding 3 - Check failure rates differ sharply by repository

| Repository | Passed | Failed | Blocked/warning | Failure rate |
| --- | --- | --- | --- | --- |
| `project-governance` | 444 | 43 | 8 | 9% |
| movement SDK | 34 | 16 | 1 | **31%** |

The movement SDK fails roughly three times as often. Any baseline drawn only from the governance
repository would have understated the problem badly, which is the argument for sampling it despite
its scale.

## Finding 4 - Planning is not the cost

Planning duration: median 0.0s and p90 0.4s in `project-governance`; median 0.2s and p90 2.5s in the
movement SDK, worst case 5.4s. Selection is already cheap. Nothing here supports spending effort on
making check selection faster.

## What Could Not Be Measured

Stated plainly, because a baseline that hides its gaps is worse than no baseline.

- **Token consumption is not recorded anywhere.** The telemetry contract anticipates aggregate token
  counts on test-batch events, but the records carry only duration, outcome and cleanup state. The
  token measure therefore cannot be recovered from history and must be instrumented going forward.
- **Wall-clock per run is absent.** Only planning duration is populated, so "time to an accepted
  result" is not directly available for check runs. Test-batch durations are the exception and are
  the only real timing evidence here.
- **Rework is not directly observable.** Repeated identical subjects are a proxy. Attributing a run
  to a prior failure would need the linkage the harness itself proposes to record.
- **Continuity after interruption is unmeasured.** Nothing in the current tooling records whether a
  fresh session resumed correctly, which is precisely the gap the continuity thesis addresses.

## What This Implies For The Slice

1. **Duplicate execution is the largest visible cost**, and it is concentrated in check runs over
   identical subjects. Recording what ran against which subject is the prerequisite to doing anything
   about it, and that is Task and Evidence rather than a classifier.
2. **The expensive minority is test execution**, not selection. Any intervention aimed at planning
   would be aimed at 0.2 seconds.
3. **Instrument tokens now.** The measure the proposal most wants to move is the one nobody is
   recording. Pass B should emit it from the first run rather than reconstructing it later.
4. **Nothing here yet argues for a classifier.** The visible costs are duplication, long test batches
   and a high failure rate. A decision model may help triage those failures, but this baseline does
   not establish it, and Pass C is where that gets tested rather than assumed.

## Change Log

- 2026-09-19: First measurement pass. Track R fact enumeration is still outstanding.
