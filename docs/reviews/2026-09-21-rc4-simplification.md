---
id: review.rc4-simplification
title: RC4 Simplification and Scope Review
type: review
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-22
summary: Keeps fixed models as the default and a simple optional category mapping while reducing duplicate infrastructure and identifying conditional scope cuts.
---

# RC4 simplification and scope review

## Recommendation

Keep the useful feature set. Simplify the implementation by connecting existing owners and limiting
the first qualified path. Do not introduce general infrastructure to support hypothetical future
consumers. The [research pass](../research/2026-09-21-jev-agentic-development.md) and
[architecture reconciliation](2026-09-21-rc4-design-reconciliation.md) informed this review.

The operator explicitly confirmed fixed-model defaults and simple opt-in category routing. The
[specification](../specs/engine-decision-rc4.md) and
[implementation plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#rc4-quality-routing-and-ci-batch)
incorporate the smaller designs below. These are planning changes; no runtime feature was removed.

## Incorporated simplifications

| Choice | Why it earns its cost | What we give up or defer |
| --- | --- | --- |
| Fixed model by default; optional category-to-model mapping | The operator supplies categories, a short description and one model/effort pair each. JEV classifies; code looks up the pair. Unknown falls back to the fixed binding. | No automatic model discovery, rankings, pools within categories, mid-task switches or retry ladders. Explicit operator choices still win. |
| One flat category map | Avoid separate named model registries, category aliases and a routing rule language. Existing provider binding owns the baseline and compatibility checks. | Reusable model aliases can wait until repeated configuration creates a real problem. Future categories remain possible. |
| One provider, one guarded class, baseline plus one alternative for first proof | A small real path can establish actual model dispatch and denials. The same class must be both guarded and routable. | Broader providers/classes require later qualification. An unrestricted coordinator remains outside the child enforcement claim. |
| Connect DL03/DL13 before adding another retrieval system | Existing capture, selection, protected output and retrieval references already serve the task. The missing proof is ordinary caller delivery before reading. | No new source index, MCP server or conversation compactor. Retrieval breadth remains bounded and visible. |
| Shared quality capture and existing projections | Requirement-linked questions and claim advice reuse one evidence snapshot where compatible. Repeated observations reuse receipts. | No overall quality grade, background evaluator or second completion gate. Independent questions still retain useful distinctions. |
| Existing CI pack descriptions, optional extra context only where needed | Avoid a second scenario catalog and mandatory metadata rewrite. Reuse already-required results for comparisons. | No predictive omission, placement scheduler, per-test history warehouse or extra full-suite evaluation runs in RC4. |
| Existing receipts/outcomes and SQLite | Add needed fields and joins to current owners. No global usage monitor or separate feature-coverage service. | Unobserved direct host activity stays unknown. We do not manufacture whole-session coverage. |
| Deterministic guarded-host hook | Native tool permissions and a small adapter qualify a bounded path without calling JEV for every action. | No universal agent sandbox or semantic permission system. Additional supported host boundaries remain later work. |
| Existing replay owner, with an explicit interrupted-write result | Persisted requests reuse decisions. An empty job directory stays a visible unresolved submission until ownership is reconciled. | No new crash-recovery transaction or automatic replacement worker; deliberate retries retain their cost. |

## Keep despite the extra detail

- **Separate configuration and binding identities.** Parsed category policy and the resolved
  executable/host environment have different owners. Two hashes preserve that separation; one
  catch-all parser would mix filesystem discovery with policy parsing.
- **Exact question opt-in and frozen RC3 defaults.** These prevent an update from silently adding
  calls or changing behavior. Version selection does not replace effect/entry admission.
- **Explicit source scope, fallback and actual delivery evidence.** A cheap classifier still
  receives data and can be bypassed. Without these facts, telemetry cannot tell whether it helped.
- **Independent outcomes and total token/cost accounting.** Correct categorization can route to an
  inefficient model. Classifier cost, coding tokens, retries, review and repairs all matter.
- **A no-match/unknown route.** Forcing every task into a category makes a small mapping brittle.
  The fixed-model fallback is useful behavior, not a failed experiment to hide.

Do not reduce authority checks, native result preservation or cleanup merely to shorten this plan.
Do not replace SQLite, remove the provider-neutral interface, or narrow future platform support
solely to reduce the number of components. Their existing ownership earns its cost.

## Conditional candidates, not removed

These are options for the operator if observations justify them. They do not silently change the
RC4 release floor or remove planned features.

| Candidate | Reason to consider it | What we would lose | Recommendation |
| --- | --- | --- | --- |
| Enable one new requirement-quality question at a time in the first pilot | Cleaner attribution with less evaluation traffic while retaining both implementations | Slower evidence collection for the second question | Reasonable pilot configuration; not a code deletion or requirement to stay shadow-only |
| Start CI v2 with a small catalog of the expensive optional scenarios | Good descriptions and matching results matter more than catalog size | Advice cannot identify gaps outside the supplied catalog | Prefer this when metadata is sparse; preserve later expansion and label coverage |
| Defer live category dispatch if R0a finds almost no eligible jobs or the host boundary cannot be qualified | Avoid spending the RC on a low-volume or unenforceable path | RC4 would provide fixed/shadow category behavior without the planned live routing experiment | Only an explicit scope decision after discovery; do not make this cut now merely for simplicity |
| Remove a quality question later if independent labels show it adds no useful information | Fewer repeated judgments and less review noise | Possibly distinct defect coverage that a small sample missed | Wait for real evidence, including apparently successful cases; no removal now |

The intended progression stays: establish actual exposure, connect existing evidence selection,
add focused quality advice, support simple optional category routing, improve CI advice, then
qualify and release. Active JEV features do not require changing the developer's fixed coding model.

## Implementation simplification disposition

The final pass retains the agreed feature set. Native host permissions replace a new per-tool
classifier; admission and continuation reuse existing task actions and lifecycle owners. One compact
message helper covers failures and blockers. Existing receipts support off-mode exposure and
newest-first bounded reports; operator archiving avoids an additional retention service. SQLite
remains the operational authority. No model gateway, index, scheduler or automatic retry ladder
was added. Source freshness, explicit workspace identity and cleanup evidence remain necessary
boundaries. Future removals still depend on measured accepted-work outcomes.
