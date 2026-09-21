---
id: spec.harness.measurement-and-qualification
title: Bounded Telemetry and Qualification
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Bounded telemetry and qualification

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C13](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
shared events, bounded analytics and controlled evaluation. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

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

E1a compares extending governance telemetry with a separate local analytics store before choosing
storage. Evaluate observation/join coverage, retention, frozen comparisons, failure isolation, write
cost and migration/maintenance effort. Reuse earns preference only when it satisfies these needs;
a separate store is justified when it materially improves them. Record the choice and rejected
alternative in the E1a receipt; E1b measures actual adopter overhead. Either option must satisfy the following bounds and must not couple
analytics failures or retention to the critical ledger.

Retain newest raw records within all three limits: 7 days,
1,000 records and 1 MiB payload. Retain daily aggregates for 90 days within 1 MiB, with at most 64
combinations of dimensions per day and an `other` bucket. Target total physical storage, including
journals, below 8 MiB for the analytics allocation; bound pages/journals where SQLite is used and
suspend recording on storage exhaustion. Account for shared-store overhead explicitly.
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

## Benefit targets from measured baselines

Before each intervention, measure the current workflow's accepted-work cost, usage coverage and
variability. Declare the targeted outcome, minimum useful improvement and uncertainty/sample-size
assumptions before candidate evaluation. Do not set a forecast from unmeasured percentage envelopes.

Target elimination of observed manual-then-hook duplicates and duplicate submission of known jobs.
For context and coordination, derive explicit experiment thresholds from the measured baseline and
the intervention's total overhead. Include retries, operator time and rework. A required build still
costs its measured duration; savings require an unnecessary run to be safely avoided. Do not add
overlapping savings categories or equate context bytes with total-token savings.

Use an initial 10–20 accepted tasks per condition as a directional feasibility screen, not proof of
a percentage improvement. An underpowered result is inconclusive, not qualified.
Correctness, mandatory-context retention and proof coverage remain hard gates. Run the comparison with and without the continuity module under the
same governance policy and comparable Codex/model settings, task mix, cache state and proof requirements.
Avoid replaying identical tasks as if familiarity had no effect. Include retries, reopened work,
operator time and all child/model usage; report spread and limitations. Repair the historical 495/624
denominator before quoting historical comparisons. No defect/required-proof regression is acceptable.
If benefit is unclear, improve or remove the intervention before widening scope.

## Decision and workflow tuning — accepted design

Join task/attempt/packet/decision/job observations through existing IDs. Record question/configuration/
model versions, mode, fallback reason, opaque input identity, candidate/selected counts, preparation
and provider latency, delivered bytes, expansions and attributed corrections. Record target kind and
transport separately from queue/build/install/launch/scenario/cleanup timing where owners supply it.
Track retry/reuse reasons, operator intervention, accepted/reopened outcomes and usage coverage.

Deduplicate terminal and native-usage observations. Starts and terminals are two events for one run.
Missing usage is unknown. Summed concurrent job time is not wall time; same-source repetition is not
proof of waste. Distinguish observed facts from host/reviewer labels and record their provenance.
Report by task type, decision method and configuration with the existing bounded dimensions/storage.
Compare current host handling, deterministic packets and JEV-ranked packets, counting all attempts,
model calls, fallbacks, expansions and rework. Shadow mode establishes no avoided host work.

Routine analytics retain no source/prompts/log bodies. An explicitly enabled evaluation capture can
keep sanitized packets, predictions, corrections and outcomes in the adopter's private evaluation
area, with declared retention/data scope and no automatic export. Freeze useful cases separately
from rolling analytics. Aggregate telemetry alone cannot replay or train semantic decisions. Tune
retrieval/rules/questions first; model-weight training needs its own evidence and capability decision.

Add focused fixtures for no-token/off operation with zero network calls, deadline/cooldown fallback,
stale candidates, required-context retention and telemetry failure. Workflow fixtures cover target
ambiguity, simulator readiness, device disconnect, contention, same-job resume and cleanup. Actual
simulator and physical-device qualification remains separate from these fixtures.

## Durable evaluation manifest and bounded dimensions

This specification owns the E1a evaluation-manifest schema. Arm comparisons must use a frozen,
explicitly enabled evaluation record set, not rolling analytics. Its manifest declares version,
question/config/source identities, arms, task-family IDs, capture scope, author/reviewer labels,
metric definitions, missing-usage policy, deadlines, thresholds and retention/budget. Keep inputs,
observations and adjudication separate. E1a adds schema validation before the first comparison.
E1b records RN baseline coverage and freezes thresholds afterward, before evaluating the candidate;
E3 and the CI pilot may establish their own independent baselines. D10 applies this ordering to the
engine migration itself as well as optional interventions. Missing instrumentation stays explicit.

Default evaluation bounds: 500 task episodes or 100 MiB, whichever is reached first; 90-day retention
from capture unless the operator sets another explicit expiry before the run. Stop capture at its
cap, record incompleteness and do not silently evict a comparison. Export/extend retention explicitly
before expiry if needed; deletion requires the declared retention policy and preserves operational
proof. The owning adopter's private evaluation area holds this capture. No automatic cloud export.

Numeric observations (bytes, counts, durations) are measures, not aggregation dimensions. Use fixed
report projections rather than a cross-product: method/mode/task class; question/model/config revision;
or stage/target kind/transport. Each projection obeys the existing cardinality bound and reports other
and dropped coverage. The frozen evaluation retains the joins needed for paired analyses independently
of the seven-day raw window and routine aggregate buckets. Do not widen routine telemetry by default.

Record runner coordination burden separately: host status reads/turns where observable, unchanged
progress reads, operator interventions, recovery attempts and time to actionable failure. Do not
label fewer chat messages as token savings without native usage. Attribute cold/warm/stale-state
conditions to the evaluation capture; avoid unbounded routine telemetry dimensions.
