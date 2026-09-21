---
id: review.decision-first-opus5-recheck
title: Opus 5 Decision-First Focused Recheck
type: review
status: current
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Focused independent closure review of the repaired documentation candidate.
---

# Focused recheck — decision-first documentation candidate

**Scope:** re-verification of the 14 findings in `docs/reviews/2026-09-19-decision-first-opus5-review.md` against the repairs recorded in `docs/reviews/2026-09-19-decision-first-reconciliation.md`. Read-only; no tests, no runtime execution, no writes. Model: Opus 5, high effort, no fallback.

**Candidate integrity:** all 49 paths in `/tmp/governance-decision-recheck-files.json` hashed — 0 mismatches, 0 missing. Inspection was scoped to the sections each finding named, plus the research ID namespace and the exec-plan banner set.

---

## Recommendation

**Close 12 of 14 findings; clear the candidate for the simplification proposal pass and for a future implementation authorization.** No blocker remains. Two findings are partially closed, and both residuals are navigation-surface defects in `docs/research/decision-first-harness/`, not contract defects. The load-bearing repairs — the hidden device-owner dependency (4), the hidden cross-language protocol change (5), and the evaluation data that expired before the decision (6) — are all substantively fixed, and fixed in a way that converts each hidden assumption into a declared, owned prerequisite. That was the right shape of repair.

The one disposition I want to record as a *changed decision* rather than a *resolved finding*: finding 5's repair declines to mandate a protocol v3, instead requiring S4 to assess the gap and prefer existing runner artifacts. That is a defensible narrowing of my original recommendation — my finding rested on absent top-level request fields, which does not by itself prove the facts are unexpressible through receipt artifacts. The repair correctly refuses to buy a cross-language protocol change before establishing the gap.

---

## Closure table

| # | Original severity | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Critical — research authority / colliding IDs | **Partially resolved** (now Medium) | 26 of 27 research IDs namespaced `research.*`; set-intersection against live `spec.harness.*` returns zero collisions. Residuals below. |
| 2 | High — four sequences, six stale `active/` docs | **Resolved (navigation)** | Supersession banners verified on all seven documents plus `components/harness/NIGHT-PROGRESS.md:2`; `step-3-one-decision.md:3-4` already deferred to S7. `exec-plans/README.md:26` ("not a second sequence") now survives reading the files. |
| 3 | High — Batch A/B/C unmapped | **Resolved** | `2026-09-19-decision-first-development-loop.md:242-246` maps A→S3 (prereq S1 install + S2 measurement), B→S7, C→S4–S6; `:248` cedes scheduling to S1–S9 acceptance criteria. Batch A's implicit S1/S2 dependency is now explicit. |
| 4 | Critical — nonexistent device resource owner | **Resolved as a declared blocker** | Adoption plan `S5:92-95` and `S6:108-109` require naming the authorized project and verifying its runner owns acquisition/release, state that governance root-overlap claims do not establish it, block the lane if absent, and forbid silently adding a manager. `development-loop.md:168-170` mirrors it. Consistent with `execution.md:61`. |
| 5 | High — S5/S6 need protocol fields no slice adds | **Resolved, narrower disposition** | Adoption `S4:75-79` owns assessment, public Python/TypeScript contract extension where artifacts cannot express the binding, version negotiation, old-protocol behavior, rejection of missing target facts, and installed cross-language seam tests. One cross-reference gap below. |
| 6 | High — telemetry bounds cannot carry the evaluation | **Resolved** | `measurement-and-qualification.md:135-153` owns the S2 evaluation-manifest schema, mandates frozen capture (not rolling analytics) for arm comparison, bounds it at 500 episodes / 100 MiB / 90 days, separates numeric measures from dimensions with fixed projections, and `:152-153` states the capture is independent of the seven-day raw window and routine aggregate buckets. |
| 7 | Medium — sample size vs. benefit threshold | **Resolved** | `measurement:99-102`: 10–20 tasks is a directional screen, percentage targets are hypotheses, effect size and uncertainty must be declared before evaluation, "an underpowered result is inconclusive, not qualified," and correctness / mandatory-context retention / proof coverage remain hard gates. |
| 8 | Medium — five things called a "packet" | **Resolved** | `development-loop.md:158-165` names `harness prepare --task --purpose`, states `resume` remains the inexpensive compatibility/diagnostic operation that does not implicitly call a provider, makes next-proof a *section* of prepare output, and separates governance change packets as internal validation subjects. The former "Next-proof packet" section is now "Proof section of the working packet" (`:90`). |
| 9 | Medium — `rg` named but neither used nor probed | **Resolved** | `repository-discovery.md:12` now reads "Git/lexical"; `:46-54` states `discoverPaths` is an alphabetical, scope-filtered 40-cap inventory and "not relevance retrieval," makes ripgrep an optional accelerator reported by doctor with in-process fallback and no installation failure, and requires tests beyond the first 40 alphabetic entries and with dirty/untracked changes. |
| 10 | Medium — 8 KiB cap vs. unsatisfiable guarantee | **Resolved** | `decision-interface.md:70-77`: ≤16 candidates (down from 40), one call per packet, defined header contents, headers measured first then remaining bytes split equally, whole-UTF-8-line selection around deterministic lexical matches with source-position tiebreak, recorded excerpt ranges / source sizes / omitted bytes / excluded candidates, baseline return when headers exceed the cap. The unprovable guarantee is replaced by "evaluation strata, not guarantees that decisive evidence survived." |
| 11 | Medium — 1s deadline makes S7 vacuous | **Resolved** | `decision-interface.md:107-111`: separate offline/shadow deadline (initially five seconds), auto retains one second, fallback/timeout rates reported **on all requests** as the denominator alongside completed-request quality, no detached background shadow call, both deadlines recorded. My unmeasured latency prediction is correctly not adopted as fact. |
| 12 | Medium — undefined gates, unowned cooldown store | **Resolved** | `decision-interface.md:92-105` defines the planned `continuity.decisions` profile keys and states the concrete gate: "Provider access requires both an enabled question/mode and permitted data class/scope… not inferred consent from a token," with S7 owning schema/doctor validation and migration proof. Cooldown assigned to `operational-store.md:73-81` — a bounded 16 KiB advisory `provider-health.json`, atomically replaced, deliberately outside both the ledger and analytics. |
| 13 | Medium — self-contradictory authorization line | **Resolved** | `2026-09-19-continuity-agent-handoff.md:79-81` separates the durable S1→S2→S3 sequence from "Authorization for this task is specifications, planning and secondary review only. A future implementation assignment must authorize runtime work; the sequence alone does not." |
| 14 | Low — tracked `JEV_TOKEN=` | **Accepted with rationale; removal deferred** | The file now carries "Optional future JEV adapter only. Core operation needs no account or token." and "The current runtime does not load this file automatically." The contradiction with `installation.md:85` is gone. Removal is correctly reserved as a proposal under your no-removal constraint. |

---

## Remaining material items

No blocker. Two residuals and three cosmetic gaps.

**R1 — the research family's own entry points contradict a settled decision (Medium; residual of finding 1).**
The supersession banner exists only at `docs/research/README.md:11` and `handoff:111-112`. The two documents a reader actually lands on when navigating or grepping into the family carry none:

- `docs/research/decision-first-harness/specs/README.md:14-17` still asserts *"this repository's charter keeps it project-neutral with no model invocation path, and the harness is a different product. When its owning repository is settled, the family moves intact."* That directly contradicts `handoff:47` ("One governance product and wheel. Harness is an internal module; standalone adoption is unsupported") and the completed migration receipt.
- `docs/research/decision-first-harness/plans/README.md` likewise carries no banner and reads as a live phased plan ("Child plans… become `active` one at a time").

Both also retain `type: spec` / `type: exec-plan` rather than `type: research`, so a type-based sweep still surfaces them as contracts. One banner line on each, matching the one at `docs/research/README.md:11`, closes this without removing anything.

**R2 — one research ID was missed by the namespacing pass (Low; residual of finding 1).**
`docs/research/decision-first-harness/specs/harness-core.md:2` retains `id: spec.harness-core` with `type: spec`. It does **not** collide with the live `spec.harness.harness-core`, and I confirmed no validator in `src/project_governance_runtime` enforces documentation ID uniqueness or prefixes — so this is a human-navigation risk, not a gate failure. It matters only because this is the file the research specs README tells readers to "start with" as the family umbrella, and it is now the single remaining `spec.*` ID under `docs/research/**`.

**R3 — finding 5's cross-reference did not land in `execution.md` (cosmetic).**
`execution.md:90-98` still says only "expose missing facts through the owner public contract," with no pointer to S4 ownership. `development-loop.md:170` and adoption `S4:75-79` both carry it, so the ownership is assigned — but a reader of `execution.md` alone still cannot see who owns the protocol change. One clause at `:95`.

**R4 — doctor's ripgrep reporting is declared in the wrong spec (cosmetic).**
`repository-discovery.md:51` requires "Doctor reports availability," but `installation.md`, which owns doctor (`:89`), does not mention it. Same pattern as R3: correct requirement, stated only by the consumer.

**R5 — two sentences the repairs left verbatim (cosmetic, non-contradictory).**
`decision-first-development-loop.md:105` still reads "Its exact command name is an implementation choice" after `development-loop.md:160` named `harness prepare`; and `exec-plans/README.md:6-7` still says the architecture reset "replaces the old decision-first sequence" while that document is now banner-marked completed historical evidence. Neither is live guidance — the plan subordinates itself to the specs at `:20-22`, and the README names the adoption plan as the active sequence in its opening line — but both are the exact sentences the findings quoted.

**One wording gap worth noting against finding 7's repair:** adoption `S7:127` phrases the exit as "either qualify this bounded question or retain the deterministic path with an **explicit no-benefit finding**." Under `measurement:101`, an underpowered run is *inconclusive*, which is not the same claim as no benefit. The exit's second branch should admit "no-benefit **or inconclusive**" so an underpowered pilot cannot be written up as a negative result.

---

## Missing evidence (unchanged from the original review, restated for closure)

- **Documentation and planning qualification only.** No runtime behavior executed, no tests run, no build performed. The documentation gate on 49 paths (run `58c6e1dc-65a7-4224-ae37-303ae887f1f5`) is metadata and link validation; it does not evaluate whether a contract is implementable.
- **Findings 4, 5 and 9 were originally grounded in targeted greps that returned no matches.** The repairs convert all three into declared prerequisites rather than asserted capabilities, which is the correct response to that evidence class — but it means none of the three is *disproved*, only correctly scoped. S4's protocol-gap assessment and S5's runner-ownership verification are the checks that will actually settle them.
- **Still not assessed:** whether Codex's actual host surface supports the lifecycle S1/S4 assume; whether any named adopter runner exposes the device ownership S5/S6 now require; whether the 0–15%/0–10% envelope is plausible for these repositories. All three are correctly deferred to slices that name them.
- **Unverified by construction:** the evaluation-manifest bounds (500 episodes / 100 MiB) have no baseline behind them — reasonable defaults, not calibrated ones. `measurement:141` correctly assigns schema validation to S2 before the first comparison.

---

## Next checks

1. Add supersession banners to `docs/research/decision-first-harness/specs/README.md` and `plans/README.md`, and reconcile or banner the "different product / moves intact" sentence at `specs/README.md:14-17`. This is the only residual with a live contradiction in it.
2. Namespace `spec.harness-core` → `research.harness.core` and set `type: research` across the research family, closing finding 1 completely.
3. Fold R3/R4 into whichever edit touches those specs next — neither justifies its own change.
4. Widen `S7:127`'s second exit branch to admit an inconclusive result.
5. At the S4 boundary, record the protocol-gap assessment as an artifact. That assessment is now the single point where finding 5 either closes or reopens as a real cross-language work item, and it is the one place where the narrowed disposition could turn out to be wrong.
6. Keep the simplification proposals (the duplicated-rule collapse, `auto`→`enabled`, the handoff reading budget, `.env.example` removal) as a separate list, as the reconciliation intends. None of them are prerequisites for implementation authorization.
