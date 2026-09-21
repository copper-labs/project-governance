---
id: review.decision-layer-reconciliation
title: Decision Layer Research and Review Reconciliation
type: review
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Reconciles Fable 5.1 extra-high independent research with the proposed decision layer, early local CI work, and new output-selection experiments.
---

# Decision layer review reconciliation

## Scope and evidence

The operator requested **Claude Fable 5.1 at xhigh effort** to review the four proposal documents,
conduct independent research and look for ambitious opportunities as well as defects. The consult
used `claude-fable-5-1`, fallback disabled and read-only permission mode. The wrapper completed
successfully and retained the full review and audit externally. All four frozen proposal inputs
remained unchanged during review. Other core implementation changed concurrently; the wrapper's
repository-delta flag is not evidence that this reviewer authored those changes.

The reviewer reported thirteen contract findings (C1–C13) and twelve innovation opportunities
(I1–I12). They are recommendations, not verified runtime failures or product qualification. This
reconciliation checks the important claims against source and primary references, retains the
original opportunities, and adds DL13 output selection. The
[specification](../specs/engine-decision-layer.md), [consumer catalog](../specs/engine-decision-use-cases.md),
[local-CI detail](../specs/engine-decision-local-ci.md) and
[technical work packages](../reference/2026-09-20-decision-layer-work-packages.md) describe the design.
This review preserves its original recommendations and evidence. Its earlier delivery-order advice
is superseded by the [finalized S0–S10 plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md),
which owns the eight-consumer RC1 scope and accepted simplifications; implementation remains unstarted.

## Resulting direction

Start local-CI history, input declarations and conservative planning without waiting for JEV.
The first semantic experiments now emphasize tool-output selection and completion-claim advice,
alongside focused CI selection and workflow matching. Test quality, semantic code review, context,
device diagnosis, model routing, release and process learning remain in the plan.

Additional experiments cover evidence localization in logs, symptom grouping, verifying a cheaper
model's output before escalation, and speculative work within spare-capacity budgets. Predictive
omission remains a later explicit experiment. Nothing here claims measured savings on our workloads.

## Contract findings

| Finding | Disposition and correction |
| --- | --- |
| C1: batch layouts | Accepted. Distinguish several questions about one object from candidate-isolated requests. Compare layout quality and actual total cost; isolated requests repeat common context and are not assumed token-equivalent. Each group has total call/token/concurrency/deadline bounds. |
| C2: check history | Accepted with a source correction. `RunMetric` is run-level, but native command receipts already retain duration. Project that evidence into stable per-check history and add missing timing only. The planner still needs history input. Vendor selection flags are candidate features, not universal rules. |
| C3: reuse closure | Accepted. `path_globs` select packs but do not declare all check inputs. Add one owning input contract/resolver and explicit unknown-closure behavior. Hashes alone do not satisfy trust, expiry, external-state or claim requirements. |
| C4: confidence and margin | Modified. Preserve the full Choice distribution and compare top probability, margin and derived confidence per question. There is no evidence for universally banning confidence or mandating a margin cutoff. None is an independent probability of workflow correctness. |
| C5: calibration ownership | Accepted with scope flexibility. Regions are versioned workload data with optional repository-specific specialization, counts, provenance and separate calibration/evaluation data. Shared qualified scopes remain possible; every repository need not fit a new statistical model. |
| C6: provider budgets | Accepted. State both token constraints, question/option bounds and conservative estimation. Larger line-ID definitions get their own budget/quality proof; do not globally raise interactive limits. |
| C7: injection protection | Accepted the weakness, rejected a mandatory model-based defense. Quoting does not neutralize hostile text, and the same model cannot certify its own input. Optional suspicious-content signals may cause abstention; native authority, redaction and adversarial qualification remain independent. |
| C8: abstention | Accepted. Noul and Score have no native abstention field. Their unknown outcome comes from evidence requirements and interpretation; Choice may include an explicit unknown option. |
| C9: overload handling | Accepted. Distinguish 429/529 from authentication and invalid responses; bound suppression and `Retry-After` by the caller contract. No hidden interactive retry loop. |
| C10: reach | Accepted. Report total/eligible/called/usable/delivered events and reasons. Live comparisons predeclare task assignment and account for contamination, rather than comparing selected successes with the full baseline. |
| C11: flakiness | Accepted narrowly. Normalize failure-level symptoms and use JEV only for unresolved pair matching. Keep every failure; a historically flaky test may expose a new regression. Grouping is not a common-cause proof or permission to quarantine. |
| C12: capacity | Accepted with a platform correction. Exclusivity leases are not capacity admission. Add actual host workload classes and configured limits through current owners; do not hard-code a two-VM rule from an unverified secondary source. |
| C13: primitive names | Accepted. Name Noul with a possible internal Boolean alias; distinguish Score's weighted value from an interpreted category and retain native provider caps. |

## Innovation opportunities

| Finding | Disposition and delivery |
| --- | --- |
| I1: output reduction | Added DL13 and early P2d. Preserve originals, protected native facts, complete blocks, unknown content and exact retrieval references. A supported host interface and downstream outcome comparison are required. |
| I2: completion gate | Promote DL09/P2c, but use evidence-grounded advice and one caller correction first. Do not copy a semantic stop blocker, a broad rerun instruction or a new default human approval step. Scope-valid receipts matter more than any passing check after an edit. |
| I3: plan effects | Added explicit `shape-plan` and opt-in `request-input`. Effects are independent allowed capabilities, not an ordered permission ladder. A shaped plan still needs existing execution authority; deferral retains proof obligations. |
| I4: observed coverage | Add a narrow adapter and positive observed edges. Runtime coverage cannot prove unexecuted paths irrelevant or complete dependency closure. Unknown coverage remains conservative; independent read-only consumers do not wait for a full map. |
| I5: context fusion | Add a lexical-plus-JEV comparison and independent labels. Keep lexical as the baseline; pooled versus isolated preparation and fusion are experiments, not assumed improvements. |
| I6: model cascade | Add produce/verify/escalate alongside pre-routing in DL08. Retain operator model choice, native acceptance and all-model/rework accounting; an extraction demo does not establish coding quality. |
| I7: root-line selection | Add useful-line/block localization under DL05. Rename the claim: the selected line is evidence to inspect, not a proven root cause. Preserve stack/continuation context and unknown handling. |
| I8: speculation | Add optional P5e after capacity qualification. Use known input changes and code scheduling first; add JEV only where it helps. Measure wasted work and contention as well as latency. Spare capacity is not an action grant. |
| I9: failure clustering | Bring a narrow failure-grouping comparison into P5c. Share symptom preparation with DL11 where useful, while leaving post-release observation optional. Do not apply broad clustering claims to every host. |
| I10: semantic features | Add a history-only versus history-plus-JEV predictor experiment in P8/P5. Keep it optional; it is not the only permissible way to use a semantic signal. No self-installed model/policy updates. |
| I11: domain regions | Covered by C5. Version preparation, interpretation and workload together, without requiring duplicate per-repository machinery where a shared scope is qualified. |
| I12: alternate transport | Deferred implementation. Retain the replaceable interface and require explicit model/data/limit qualification for another transport. A matching alias alone is not proof of identical behavior. |

The review suggested deferring policy identity for advisory consumers. That was not adopted: source
sharing, preparation and interpretation policy still affect an advisory answer. Operational action
binding is deferred until needed, so early advice does not require a new execution subsystem.

The review also placed test integrity after the full coverage map. That dependency was removed:
supplied test/implementation evidence can support a useful bounded consumer independently. P5a's
code improvements ship incrementally, rather than becoming a large prerequisite for all experiments.

## Research readback and limits

Primary sources checked during reconciliation:

| Source | What supports the revision | Limit |
| --- | --- | --- |
| [TypeSafe API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [confidence](https://docs.typesafe.ai/confidence) | Primitive semantics, native limits, derived confidence and pinned identity | Vendor contract, not our quality measurement; limits can change |
| [TypeSafe jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | Distractor, numeric and hostile-input weaknesses | Typed output does not remove semantic error |
| [Re-ranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) and [fan-out](https://docs.typesafe.ai/patterns/fan-out) | Separate input-layout patterns | No universal layout winner for our corpus |
| [jev-belay](https://github.com/valentynkit/jev-belay), September 19–20, 2026 experiments | Native facts can improve a semantic completion judgment | Quality was measured on a 100-stop proxy-labeled subset, not all 2,694 source stops; tuning and scoring share that subset |
| [jev-pruner](https://github.com/tamaratran/jev-pruner), accessed September 20, 2026 | Concrete pre-delivery output-selection implementation | No systematic downstream accuracy result establishes readiness |
| [Rerank comparison](https://github.com/zhuyansen/jev-search-rerank-eval), September 2026 | Fusion comparison and evaluator-bias concern | Author experiment with model labels and corpus-specific effects |
| [TypeSafe extraction cascade](https://docs.typesafe.ai/cookbooks/sde_cascade) and [feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) | Verification and semantic-feature patterns | Different tasks; hypothetical transfer to CI/coding |
| [Meta selection](https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/), November 2018 | Deployed history-based selective testing | Different scale and policy; not evidence for JEV thresholds |
| [Google selection comparison](https://research.google/pubs/assessing-transition-based-test-selection-algorithms-at-google/), 2019 | Strong simple baselines and workload-sensitive results | Simulation/industrial context differs from developer laptops |
| [Nx cache inputs](https://nx.dev/docs/concepts/how-caching-works) | Explicit source/config/dependency/runtime input hashing | Caching does not alone establish this engine's proof applicability |

The broad reviewer ledger contains additional leads. Its labels such as “peer-reviewed” were not
accepted merely because a paper has an arXiv URL. We do not carry unverified benchmark numbers or
hardware limits into requirements. New JEV community projects supply promising patterns, not mature
production evidence. The independent check of the completion example corrects the review's headline
sample-size claim and its suggestion that the project itself only asks for confirmation: the public
implementation can block stopping; our proposal deliberately chooses advice first.

## Remaining choices and review closure

The plan retains recommendations for the first host interface, input-schema adoption, optional operator
prompts, speculative compute budget and eventual predictive omission. Authoring and reconciliation do
not require a new permission round. Actual activation follows each accepted consumer contract and the
existing execution owner; no model experiments, host changes or release actions occurred in this work.

A focused Fable recheck at the same model and effort closed all 25 original findings, including
the accepted modifications and source corrections. It found no high-severity issues and judged
the proposal coherent for operator review. Its remaining nonblocking medium item was an explicit
hostile-log case in DL05 acceptance; that case is now included. Wording fixes name DL13's advice
capability, remove residual permission-ladder language and clarify Choice's unknown option.
The suggested primitive shapes for four auxiliary questions remain registration-time decisions;
their registered definitions must satisfy the shared typed contract before activation.

These final drafting corrections follow the focused recheck's recommendations. The recheck did not
review their later application. Documentation validation covers the final reconciled files;
neither review establishes runtime behavior or measured savings.
