---
id: review.next-rc-experiments-simplification
title: Next RC Experiments Simplification Pass
type: review
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Applied simplifications, retained safeguards and optional later reductions after the independent design review.
---

# Next RC experiments simplification pass

## Decision basis

This pass follows the [Opus review reconciliation](2026-09-21-next-rc-experiments-reconciliation.md).
Prefer a simpler design when it preserves the intended outcome. Preserve flexibility when the
upside is concrete and the carrying cost is small. API price alone does not justify new machinery.
This is a design change, not removal of implemented functionality. The three experiments remain in
the [specification](../specs/engine-decision-experiments.md), with a narrower initial attention effect.

## Applied to the specification and plan

| Choice | Why it is smaller | What we give up or defer |
| --- | --- | --- |
| Attention is shadow/advice only in this RC | Existing stage events are handled by code; no new pre-wake push boundary is demonstrated. Avoid a new delivery queue, cursor owner and effect vocabulary. | Live suppression of ambiguous updates waits for observed traffic and a separately qualified boundary. The research opportunity remains. |
| Execute up to three read-only child recipes | Reuse the existing executor, action bindings, resource leases and native results. No model-directed graph or generic branching language. | Repairs, app relaunch and longer adaptive investigations remain later capabilities. |
| Reuse DL05/DL06/DL12 and the existing provider interface | No parallel decision subsystem, vendor-specific API or new plugin framework. | No capability loss in this batch; future consumers still need explicit registrations. |
| One outcomes manifest with an optional analysis block | Reuse the bounded reader and report entry point. Avoid another manifest type and a family of task/revision CLI flags. | One-shot classification without an input manifest is not supported initially. |
| DL12 uses the common advice effect | One report-only behavior matches the existing omitted effect default. No observe/advice aliases with identical semantics. | No useful report behavior is lost; no runtime action was intended. |
| Reuse existing pilot receipt aggregates | Source already reads version-2 decision receipts. Add episode joins, not another collector. | No loss; directory summaries retain their existing incomplete-coverage limits. |
| Freeze existing spending limits and use small sub-bounds | No quota allocator or adaptive budgeting service. Existing SQLite owns spending; one fixed attention event ID handles sampling. | Attention assesses only the first eligible update per run. Historical reports can be partial; new budgets need a declared later experiment. |
| One active plan and proportionate proof | N0–N6 sits inside the current delivery plan. Focus tests on changed contracts, one simulator lane and one release package boundary. | No universal device/platform qualification or physical disconnect matrix in this RC. |

## Keep despite the extra work

| Item | Why it earns its cost |
| --- | --- |
| Small SQLite diagnostic reservation record | Unique child IDs prevent duplicate children but cannot alone enforce a total three-probe limit across racing coordinators. The shared cap, owner and deadline need an atomic owner. |
| Explicit child action bindings and native target identity | A read label does not authorize a command or prove the correct simulator. The parent action cannot be rebound to another recipe. |
| Off-arm episode capture and assigned-versus-actual exposure | Without them, fallback and failed episodes vanish from the comparison. A cheap classifier can look beneficial simply because difficult cases were excluded. |
| Entry/question/effect enforcement | DL05 serves both advisory observation and executable diagnosis. Distinguish them in admission and evidence; one consumer-wide label is insufficient. |
| Exact RC, ledger/profile migration and forward-repair rules | Installation, disabling an experiment and downgrading a written ledger are different operations. Avoid losing newly created task history. |
| Optional reviewed-procedure matching | It is one bounded question using supplied candidates and costs nothing when no catalog exists. Retain this small extension point; do not build a retrieval system for it now. |
| Unknown usage and future attention-delay measures | Missing data should limit our claim rather than be replaced with convenient estimates. A later live routing effect still needs delay measurements. |

The review suggestion to replace reservation state with only deterministic child IDs was not
adopted. That removes the place to enforce the aggregate cap and owner fence. The suggestion to
remove procedure matching entirely was also not adopted: its conditional path preserves useful
flexibility without making a procedure library a prerequisite.

## Further candidates, not removed

These are optional reductions for the implementation or pilot decision, not new work requirements.

| Candidate | When it would make sense | What we would lose |
| --- | --- | --- |
| Stop at native attention counts and omit a live DL06 caller integration | N0 finds no ambiguous events after code filtering. Keep the question contract and offline research record. | No in-session attention-classification samples on that host; there would be no demonstrated events to classify. |
| Start with one or two diagnostic recipes | Available traces show that one useful observation resolves most relevant cases. The manifest still permits up to eight. | Less initial diagnostic coverage; unfamiliar cases reach the LLM earlier. |
| Skip procedure matching for the first history report | No reviewed procedure catalog exists in the adopter. Classify work and show representative episodes instead. | No automated link from episodes to known procedures until candidates are supplied. |
| Keep the first pilot report manually invoked | Developer volume does not justify recurring analysis. The same report remains reproducible from its manifest. | Less frequent discovery of improvement candidates, with no impact on development execution. |

None of these candidates removes telemetry needed to judge the experiment, the provider-free path,
required tests or authority/cleanup protections. Do not implement speculative infrastructure just
to make an experiment appear more complete. Do not discard a low-cost extension point merely to
reduce the feature count.

## Result

The next delivery is baseline recording, an on-demand history report, bounded probe execution,
then attention observation. Release the supported experiments disabled, adopt the exact RC,
collect shadow evidence, and activate only qualified probe execution in the first controlled lane.
Use the observations to decide what to keep, improve or stop; broader local-CI selection and later
attention/recovery effects remain in the existing programme.
