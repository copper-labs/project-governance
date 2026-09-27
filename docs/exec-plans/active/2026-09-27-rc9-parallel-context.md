---
id: plan.rc9-parallel-context
title: RC9 Context Quality and Parallel Selection Delivery
type: exec-plan
status: active
owner: project-governance
created: 2026-09-27
updated: 2026-09-27
summary: Repair context fidelity, qualify realistic repository scenarios, and deliver bounded parallel JEV selection within a 15-second retrieval envelope before RC9 publication.
---

# RC9 implementation plan

Owner: [RC9 context quality and parallel selection specification](../../specs/engine-rc9-parallel-context.md).
The operator has authorized implementation. RC9 source implementation and the first comparison
are complete. Independent review corrections are reconciled. Release qualification remains open
on a measured ranking regression; publication is pending. Package metadata names RC9 for local
qualification only. Active adopter checkouts remain unchanged.

One writer owns the timing, admission and selection batch. Work solo during preparation: the
relevant source seams and official API contract are already identified. Use one independent review
on the completed candidate, with affected rechecks after reconciliation rather than repeated broad
review cycles. Runtime evidence, adopter identities and review artifacts remain outside this checkout.

## Accepted scope and defaults

- A 15-second total retrieval operation, including local preparation and admission wait; reserve
  its last 500 ms for return/cleanup and allow 20 seconds in the managed host hook.
- Remove the separate 3.5-second selection cutoff. Preserve the one-second individual metadata
  request cap or stricter profile setting, measured from actual dispatch.
- Metadata-only batching up to 256 questions when existing evidence, wire and provider token bounds
  permit it. No automatic increase to an adopter's disclosure or cumulative spending limits.
- At most four concurrent requests through one local JEV pool, with shared token/request pacing.
  Keep the existing SQLite task/family budget and add only transport admission state.
- Retain full eligible inventory, deterministic required guidance, stable result order, exact replay,
  provider-free fallback, fixed coding-model defaults and per-worktree task/receipt identity.
- Repair multiline/lifecycle metadata, source-type/path coverage, current-prompt completeness,
  optional relevance ordering and bounded passage delivery. Use existing index/documentation owners.
- Evaluate three different real repository shapes using frozen, external case artifacts. Keep
  installed-policy limitations, synthetic overlays and actual development outcomes distinct.

## P0 — Freeze the contract and comparison

- [x] Verify official API semantics: questions within a call and independent concurrent calls;
  published token/rate limits; no vendor basis for the local 63-question cap.
- [x] Identify both local serialization points and define the 15-second envelope and shared-pool scope.
- [x] Update owning specifications, navigation and version-qualified operator guidance.
- [x] Before code changes, retain a hash-identified RC8 comparison artifact and synthetic fixture
  outside the checkout. Capture effective profile/model, required context, known relevant sources,
  inventory size, byte limits and expected coverage. Never copy credentials or customer records.
- [x] Freeze three source-grounded requests each for mobile/native tooling, a multilingual library,
  and a web/release repository. Record registered worktree identity, commit and full tree inventory;
  read selected committed blobs for the external answer key without touching active edits.
- [x] Separate answer evidence from inputs and label case status accurately: authored, source-checked,
  replay-ready, executed, or accepted-development proof. An authored case is not a passing benchmark.
- [x] Assign development/held-out cases, expected source groups and passage anchors before tuning.
  Record current metadata/source permissions and policy-blocked expected evidence. A wider live
  evaluation needs a separately authorized policy; local snapshot preparation does not authorize it.

Use a small repository, a representative repository with at least 1,200 permitted entries, and a
larger stress inventory. Include misleading filenames, meaningful source descriptions, required
guidance and unshared paths. Keep cold index/preparation and warm selection results separate.
The baseline stays an evaluation artifact; do not ship a second runtime implementation.
The first external pack has nine source-checked requests and 28 passage anchors. Full frozen inventories have now been compared in RC8, local RC9 and live RC9 arms. The initial
source-preparation stage made no provider calls or adopter mutations; later qualification made
bounded live calls under the recorded existing disclosure policies.

## P1 — Repair information quality before tuning throughput

Owners: `context-source-index.ts`, `context-source-facts.ts`, `context-path-policy.ts`,
`context-projection.ts`, `prompt-context.ts`, `context-metadata.ts`, `context-excerpts.ts`,
`context-documentation.ts`, and existing doctor/receipt surfaces.

- [x] Parse multiline summaries and retain declared lifecycle/replacement clues without inventing
  prose, treating proposals as implemented, or removing historical sources from historical queries.
- [x] Reconcile supported source extensions and bounded path validation. Retain unknown-syntax files
  with honest text-only metadata; preserve all existing sensitive/generated/binary exclusions.
- [x] Expose missing, pending, truncated and low-information descriptors distinctly. Reuse unchanged
  facts. Give empty projects actionable readiness without creating a mandatory prose-writing gate.
- [x] Preserve the full accepted current prompt before optional task background. Replace silent
  truncation with explicit capacity/fallback evidence and test important intent at the end.
- [x] Keep required/pinned material first, then order optional positive answers by score with stable
  ties. Improve bounded passage selection through existing section/symbol spans, retaining exact
  original references. Measure any extra passage work against the same 15-second operation.
- [x] Compare per-question file metadata against the current shared layout using the same facts.
  Adopt a layout only from quality evidence; keep the current uncertainty threshold initially.

Focused checkpoint: extraction/eligibility, prompt fidelity, score ordering, passage delivery and
readiness regressions. Small deterministic fixtures cover each confirmed defect; no broad suite yet.
Track documentation backfill through existing gap recommendations when touched or repeatedly missed.

## P2 — Implement the timing and batch contract

Owners: `context-timing.ts`, `context-metadata.ts`, `decision-request-preparation.ts`,
`decision-schema.ts`, `context-route-command.ts`, `startup-hooks.ts`, and affected prompt/host adapters.

- [x] Implement the single 15-second operation deadline and delivery reserve. Inventory every
  prompt, CLI, provider-context and expansion caller; remove obsolete selection defaults without
  changing unrelated index-maintenance limits that happen to use the same number.
- [x] Separate queue/preparation time from the per-request dispatch clock. Record cutoff ownership
  so local deadlines cannot create provider cooldown.
- [x] Define metadata-group count/evidence limits once. Pack using the real payload, profile limits
  and both token constraints, preserving source descriptions and complete inventory eligibility.
- [x] Reconcile managed 15-second and other exact supported hook definitions to 20 seconds through
  the existing backed/shared-source installer. Update readiness and portable host adapters together.

Focused checkpoint: timing, request preparation/schema, metadata packing and shared-hook tests.
Use fake clocks and representative payloads; no repeated 15-second sleeps. Prove the first call
gets its actual per-call allowance after a wait, old managed hooks are recognized, and authored
definitions are preserved. Passing this slice alone does not qualify RC9 parallel behavior.

## P3 — Replace the network-long lock with bounded admission

Owners: `decision-transport.ts`, `decision-runtime.ts`, `decision-budget.ts`, existing state-location
helpers, and a small transport-owned coordination module if separation makes the code clearer.

- [x] Implement the user-local SQLite provider pool: four live leases, 200,000 estimated input
  tokens/second and 960 requests/minute. Use bounded rolling accounting and no persistent job queue.
  All cooperating decision clients share it across worktrees, models and configuration revisions.
- [x] Keep shared rate/concurrency state separate from per-workspace paid allowances. Prepare first,
  claim admission, reserve paid budget once, recheck eligibility, then dispatch. Release only unused
  admission on rejection; never refund possibly dispatched work or reopen a spent family.
- [x] Keep transactions short. Wait asynchronously within the caller deadline. Expire only owned
  admission leases after enforced request/cleanup bounds, with fencing against late releases.
- [x] Preserve credential-scoped authentication suppression, pool-wide rate cooldown, cancellation
  and exact duplicate handling. An older success must not overwrite a newer failure or cooldown.
- [x] Define a clean RC8-to-RC9 transport cutover. Keep old receipts/budgets intact; no copied legacy
  transport, compatibility daemon or silent reset. Tests use an injected temporary coordination root.

Focused checkpoint: fake transport/clock tests plus one multiprocess test with independent workspace
budgets and one shared provider pool. Prove actual overlap, pool maximum, rate pacing, denied budget,
same-event dispatch once, clock/lease recovery and storage-unavailable fallback. Assert no transaction
spans HTTP I/O and no cross-worktree task/cursor data enters the pool.

## P4 — Connect parallel selection and truthful telemetry

Owners: `context-metadata.ts`, context cursors/family replay, route/prompt receipts,
`decision-telemetry.ts`, `context-observations.ts`, and existing passive status output.

- [x] Dispatch disjoint prepared batches with bounded concurrency and refill available slots.
  Join by batch identity; stabilize result ordering independent of completion order.
- [x] Keep completed valid results if one sibling fails. Stop new dispatch on cancellation,
  shared cooldown or exhausted budget; abort/settle owned calls before packet publication.
- [x] Preserve immutable task/prompt associations and cumulative family spend across task changes,
  exact repeats and expansions. Do not close/finalize a scope while its batches remain active.
- [x] Add admission wait, batch/HTTP timings, peak concurrency, request sizes and token estimates
  beside reported usage. Keep sum-of-call durations distinct from wall time and preserve old receipts.
- [x] Separate complete permitted coverage from sharing exclusions; report unassessed paths and
  exact limiting reason. Keep fallback and required evidence accessible in the normal returned packet.

Focused checkpoint: metadata selection and route/prompt integration tests, task switching and
expansion regressions. Complete the whole related batch before consolidated QA or documentation closeout.

## P5 — Qualify one frozen candidate and review it

- [x] Run the focused matrix below and typecheck, then the engine/continuity and script suites
  at the hook/selection release boundary. Consolidate again only after actual corrections.
  Use existing source governance checks.
- [x] Build/package once stable and use that exact archive for clean installed proof through the
  real launcher. Historical proof assertions must match the approved operation/hook contract.
- [x] Run the bounded synthetic live-JEV comparison with a pinned model and explicit attempt/input
  budget. Compare sequential/concurrent modes on identical prepared batches, then compare feasible
  batch sizes up to the proposed ceiling. Retain failures; no unlimited retry-until-green loop.
- [x] Execute the external repository cases through the normal extraction/selection path on frozen
  snapshots, with the entire eligible inventory and answer labels withheld. Run RC8, provider-free
  RC9 and live-JEV RC9 under matched disclosure/packet limits. Keep cold/warm trials separate.
- [x] For each missing expected group, attribute the loss to source availability, extraction,
  disclosure, ranking, passage budget, dispatch or delivery. Record file recall and passage delivery
  separately; preserve unknown downstream token use, extra reads and task outcomes.
- [ ] Use held-out cases once after tuning. Require no unexplained loss of required evidence or
  matched-baseline regression. Disclose policy-blocked cases and missing live coverage by repository
  shape; do not inflate success by excluding hard or unshared cases from reporting.
- [x] Require full permitted coverage on the healthy representative fixture, expected relevant-source
  retention, correct usage accounting and clean ownership. Measure total and selection wall time;
  separate noisy service timing from deterministic correctness. Revise batch size/concurrency if
  quality or rate behavior regresses. Report partial coverage honestly on the stress fixture.
- [x] Obtain one Claude architecture/code review on the frozen diff and existing evidence through
  the governed review route. Record the actual available model and effort; no silent substitution.
  Reconcile findings and recheck affected seams. Another broad cycle needs a new concrete risk.
- [ ] Finish the release notes, operator guidance and implementation closeout. Do not claim ordinary
  accepted-task savings from this synthetic proof.

### Required focused matrix

| Case | Required evidence |
| --- | --- |
| Metadata / eligibility | Multiline summaries, lifecycle clues, source variants, long paths, sparse and partially indexed files retain correct limitations |
| Prompt / ranking / passages | Intent at the end survives; scores affect optional order; needed sections and mandatory guidance reach the packet |
| Frozen repository scenarios | Three distinct repository shapes, full eligible inventory, source-checked evidence groups, labels withheld, misses attributed |
| New / changed / unavailable evidence | Empty project, changed same-path file in two worktrees, stale document and no-answer overlays do not invent or reuse wrong context |
| Healthy multi-batch input | Calls overlap, no more than four; every permitted candidate receives one valid answer; stable output order |
| Payload boundaries | Exact count/byte/state-plus-longest/all-input bounds; no lost candidates or silently removed descriptions |
| Missing token / off / uncertainty | Immediate ordinary fallback; no unwanted call, wait, leaked lease or lost required guidance |
| Two processes / worktrees | Shared pacing, separate paid budgets and task identities; no duplicate event dispatch or overspend |
| Mixed failures | Valid sibling answers survive; malformed response/429/529/auth cases preserve named failure and correct suppression |
| Deadline / steering cancellation | Stop admission and abort owned calls; no late packet mutation; correct spent/unknown usage and ownership release |
| Crash / unavailable storage | Bounded lease recovery, no destructive reset, no ungoverned call and no refund of uncertain work |
| Replay / task switch / expansion | Reuse only matching batches; original history, family allowance and lifetime survive |
| Managed hook in linked worktree | Main definition source and sibling launcher agree; 20-second host envelope; authored hooks/trust preserved |
| Installed synthetic live comparison | Same model/input, coverage and relevance evidence, actual concurrency/timing/usage; all owned leases/readers settled |

## P6 — Publish and adopt deliberately

- [ ] Freeze exact source, satisfy change-narrative and release checks, publish immutable
  `3.0.0-rc.9`, and read back tag, archive, runtime lock and checksums using the existing release process.
  Respect the operator's standing publication authorization; do not disable repository CI as a side effect.
- [ ] At an authorized adoption seam, inspect registered active worktrees and shared hook ownership.
  Reconcile the definition source, install each requested checkout, and preserve unrelated work.
  Older active processes cannot be assumed to participate in RC9's shared limiter.
- [ ] Verify native hook approval/discovery, one normal prompt per resumed worktree, profile
  disclosure/readiness, fixed coding model and JEV receipts. Label installation probes separately.
- [ ] Observe ordinary accepted tasks for coverage, additional reads, total usage, elapsed time
  and rework. A timeout increase or more provider traffic is not itself proof of benefit.

## Simplifications retained

No provider SDK migration, account-discovery call, cross-machine coordinator, adaptive model,
background indexer, general scheduler, new retry policy or second task-budget backend. Use the
existing decision/runtime entry points, SQLite technology, receipt surfaces and live proof runner.
The local pool intentionally shares a conservative allowance across keys until measured contention
justifies something more elaborate. Repair the existing extraction and packet path; do not add bulk
generated summaries, a full semantic graph, an embedding service or a second retrieval framework.
Keep the first external evaluation to nine real-source cases plus small controlled overlays. Expand
only when a concrete miss needs a new case, rather than constructing a large benchmark platform.

## Qualification findings and remaining seam

The corrected source passed 661 engine, 73 continuity and four release-metadata tests, plus
typecheck. Focused checks cover actual cross-process SQLite contention after dispatch, paid-budget
exhaustion with concurrent siblings, deadline ownership, cleanup timing and multi-range delivery.
The source governance check reported no blockers and 75 advisory comment findings.

One Claude Opus 5.5 medium review and an affected recheck resolved the original ten findings.
Small follow-up corrections remove duplicate literal test labels, preserve the original total
deadline of other consumers, and finalize telemetry after cleanup. The extractor now has separate
script, Markdown and native-format helpers. The reviewed transport and selection functions keep
their shared operation lifetime; accepted cohesion is recorded in the existing policy registry.
The governed review route could not start because this source checkout lacks the compiled profile
facts. The explicit read-only Claude wrapper supplied the same review inputs; no silent model
substitution or paid retry through the failed route occurred.

The exact archive passed clean offline installation and the installed prompt, linked-worktree,
public API, decision-consumer and experiment fixtures. It also received complete live answers
for 24 and 1,200 synthetic entries;
the representative case took about 6.3 seconds with four concurrent calls. This is synthetic
retrieval proof, not accepted-development or token-saving evidence.

All nine frozen source cases were rerun after the corrections without changing permissions,
packet limits or answer labels. The two development cases improved, but the held-out case retains
two of three required passage anchors versus three under the RC8 comparison. Its remaining test
reference is recognized as relevant and loses initial packet capacity to higher-scored related
implementation references. Narrow disclosure and cumulative budgets explain other cases' misses.

The release gate remains open. Old positive-reference ordering, an offline application of the
existing rank-fusion formula to descriptors, and the alternate question-local layout did not remove
the regression. A separate provider-free diagnostic fused the existing index order with confidence
order. It restored the missing passage but lost a passage in another development case; no net
quality improvement justified adopting it. Confidence that a source is useful does not establish
which sources jointly cover the request within a compact packet.
Do not promote these diagnostics into defaults or repeat provider calls until one happens to pass.
The next correction must preserve distinct requested evidence needs when the compact packet fills,
within the existing authority and byte limits. Keep the failed held-out result and label later
attempts as regression rechecks. All identities, source copies, review audits and results remain
outside this checkout. No adopter upgrade or remote publication has occurred.
