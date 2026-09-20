---
id: spec.harness.measurement-and-qualification
title: Bounded Telemetry and Qualification
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Bounded telemetry and qualification

## Ownership and implementation status

Use governance's public telemetry for check selection, equivalent-scope repeats and check durations.
Harness observes continuity, context volume and its own overhead. Codex supplies native usage only
where qualified. Join by existing task/attempt/job/measurement IDs; do not duplicate facts or scrape
private transcripts. Existing native usage accounting is implemented. Retention, aggregate reports
and the benchmark runner below are not yet implemented.

## Collection and bounds

Emit allowlisted numeric/categorical observations at resume, retrieval completion, checkpoint,
reconciliation, execution transition and task outcome. No prompts, code, arbitrary error text,
command bodies, full tool arguments or absolute paths. IDs are pseudonymous, not anonymous. Export
is explicit. A report is on demand; no chat notifications, daemon or model analysis on each event.

Use a separate local analytics database. Retain newest raw records within all three limits: 7 days,
1,000 records and 1 MiB payload. Retain daily aggregates for 90 days within 1 MiB, with at most 64
combinations of dimensions per day and an `other` bucket. Target total physical storage, including
journals, below 8 MiB; bound SQLite pages/journals and suspend recording on storage exhaustion.
Logical payload limits alone do not establish the disk bound.

Use zero analytics lock wait and bounded retention work. Deduplicate observation and aggregate
update transactionally. Drop analytics on contention/failure; never compromise the critical ledger.
Track known drops and coverage, without claiming best-effort counters survive every crash. Expensive
compaction is explicit maintenance, not session startup. Operational history has separate explicit
archive rules; never delete live tasks, unresolved jobs or referenced proof to meet analytics limits.

## Report

Return a bounded report of accepted/reopened tasks, native usage and missing coverage, context bytes,
repeat checks by cause, resume/failure/recovery outcomes, harness latency and disk growth. Break device
work into queue/build/install/scenario/cleanup where the existing runner supplies those measurements.
Use exact content/subject identities to distinguish changed inputs from potential redundant work.
Uninstrumented native reads and host coordination time remain unknown. Bytes are not token counts.
Unknown costs are not zero, and subscription cost is not automatically API list price.

## Lightweight test laboratory

Extend `node:test` and public CLI fixtures, with no model/network requirement in core tests. Cover:
install/idempotence/interrupted activation; fresh/aged bounded resume; immutable/live retrieval;
linked worktrees; shared-workspace overlap; pass/fail/pending/crash/cancel; incompatible migration;
analytics off/full/locked; and Codex adapter identity/root/output validation.

Use small and larger inventories (initially 100/5,000 paths), plus an efficiently seeded store of
200 tasks and 10,000 historical records. Fixture sizes are tunable inputs, not production limits.

- Per change: relevant correctness regressions and a smoke layer targeting under 30 seconds.
- Release/performance changes: selected benchmarks targeting under 90 seconds, five warmups and 20
  samples, median and approximate p95. Separate cold startup from warm operations.
- Adapter/installer changes and adoption: one actual Codex app lifecycle recipe against published,
  pinned governance artifacts. Test reopen, interruption, worktrees and same-workspace sessions.

Qualify macOS and the minimum supported Node release plus the current qualified Node release first.
Baseline records name OS/architecture, Node, fixture and component versions. Keep ten local benchmark
reports and compact release summaries. Twenty samples do not estimate production tails precisely.

Provisional goals: small-fixture resume p95 below 250 ms including startup; incremental analytics p95
below 5 ms. Flag median regression exceeding both 25% and 25 ms and reproduce once on comparable load.
Calibrate before making timing goals hard gates. Correct identity, mandatory constraints, bounded
output, durable pre-action state and no duplicate dispatch are hard gates immediately.

## First-release benefits: planning assumptions, not measurements

The first supported release includes Codex qualification, bundled install, bounded continuity and
reporting, plus one real check workflow. It does not include a new build cache, universal verdict
reuse, JEV routing, a device scheduler or an owned agent loop.

For budgeting, use **0–15% net total-token reduction** and **0–10% elapsed-time reduction** across a
mixed task sample as a low-confidence planning envelope. These are scenario assumptions, not empirical
estimates or a promised nonnegative outcome: setup costs or poor adoption can cause a regression.
Resumed tasks with substantial repeated context may show larger local gains; fresh tasks can show none.

Derive expectations separately for tokens and time:

`net fraction saved = addressable overhead share × fraction removed − added overhead share`

Illustration only: tokens with 40% addressable overhead, 30% removed and 2% added yield 10% net savings.
For elapsed time, 20% addressable overhead, 30% removed and 1% added yield 5%. These examples do not
estimate the actual repositories. A 15-minute required build remains a 15-minute build. Avoiding one
unnecessary such run saves 15 minutes only when that duplicate actually existed and was safely avoided.

Pilot targets, separate from the forecast: eliminate observed manual-then-hook duplicates in the
qualified flow; eliminate duplicate submission when an existing job is known; aim for 25% less
repeated context on resumed tasks and at least 10% lower median coordination cost on matched tasks.
Report native-token coverage before interpreting a token result. Do not add overlapping category
savings or assume proxy improvements equal total-token savings.

Use an initial 10–20 accepted tasks per condition, with and without the continuity module under the
same governance policy and comparable Codex/model settings, task mix, cache state and proof requirements.
Avoid replaying identical tasks as if familiarity had no effect. Include retries, reopened work,
operator time and all child/model usage; report spread and limitations. Repair the historical 495/624
denominator before quoting historical comparisons. No defect/required-proof regression is acceptable.
If benefit is unclear, improve or remove the intervention before widening scope.
