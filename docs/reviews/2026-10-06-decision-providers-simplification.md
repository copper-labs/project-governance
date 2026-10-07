---
id: review.decision-providers-simplification
title: Decision Providers Simplification Pass
type: review
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Records the separate Opus 5.5 medium simplification pass and accepted reductions in settings, public fields and repeated proof.
---

# Decision providers simplification pass

Owners: [specification](../specs/engine-decision-providers-and-image-evaluation.md) and
[implementation plan](../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md).
This pass followed the [design reconciliation](2026-10-06-decision-providers-design-reconciliation.md),
including closure of the midnight replay correction.

Claude Opus 5.5 (`claude-opus-5-5`) completed this separate read-only pass at medium effort with
fallback disabled. Its audit reports exit 0, no timeout and no workspace changes. It found no
material blockers introduced by its recommendations. Raw assignment, response and audit remain
outside this reusable checkout. No source, installed or live-provider proof was performed.

## Accepted changes

| ID | Simpler choice | Function preserved and tradeoff |
| --- | --- | --- |
| S1 | One configured provider/model for generic evaluation, separate from registered decisions; remove text/image routing. | OpenAI supports both inputs; JEV supports text and rejects images before dispatch. Cannot simultaneously price-route generic text to JEV and images to OpenAI. Add that only if measured cost earns the extra setting. |
| S2 | Fixed adapter request bounds; configure enablement, provider/model, disclosure, roots and daily allowance. Reuse the operation deadline and existing pool's provider policy. | Retain finite image/count/question/encoded-byte bounds and one dispatch. No required per-request call setting or duplicate duration/byte knobs. Lower request overrides can follow a real need. |
| S3 | One envelope and one exit rule: exit 0 only for answered/unknown/refused outcomes; otherwise exit 1. | Independent answers survive errors. The author tightened the recommendation further: unreadable/unparseable requests also produce the structured envelope with unresolved identities null, rather than introduce a bare-error shape. Exit 0 never means assertion success. |
| S4 | Source suites own semantic/disclosure/default cases; installed proof checks actual exports/assets/skill, taskless CLI/library execution, existing pilot and real credential boundaries. | Keeps package/process evidence while avoiding a second matrix. Default profile text is compiled by `runtime-project-defaults.ts`; `package-assets.mjs` separately copies policies/packs/skills. No new decision-profile asset requires duplicate installed default proof. Reassess if packaging ownership changes. |
| S5 | One shared v3 `score`, computed from the full validated distribution; keep the provider score only in native fields. | Retain confidence, legend, distribution and native/computed agreement check. Old v2 receipts remain unchanged. No duplicate public expectation field. |

An independent read-only source-fit pass agreed with S1 and added two clarifications, now applied:
a deliberate new paid attempt uses a new evaluation ID and consumes the daily allowance, while a
reserved ID never dispatches again; generic admission validates the complete request and supplied
questions before reservation. The plan's cadence prose is shortened and links its existing owner.

## Boundaries retained

Keep the narrow library export, supplied-evidence grant, per-question answer preservation,
provider-neutral version-3 identity, durable cross-window dispatch guard and three coherent batches.
Removing these would lose function or revive corrected defects. Shared runtime, native check/result
authority, explicit credentials and separately qualified required visual assertions remain unchanged.

The documents incorporate this pass. Implementation, installed execution, live compatibility,
visual accuracy and accepted-task benefit remain separate future work.
