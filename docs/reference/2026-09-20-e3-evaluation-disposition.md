---
id: reference.e3-evaluation-disposition
title: E3 Evaluation Disposition
type: reference
status: current
owner: project-governance
created: 2026-09-20
updated: 2026-09-20
summary: Optional ranking evaluation outcomes and remaining integration evidence.
---

# E3 evaluation disposition

E3 permits qualified benefit, no-benefit, or inconclusive results per question. The optional
context-ranking question has an **inconclusive development-benefit outcome**. No further paid
trial is required merely to obtain a positive outcome. This does not close unverified integration
clauses or E5 workflow-benefit acceptance.

## Retained observations

| Evaluation | Observation | Disposition |
| --- | --- | --- |
| Initial governance-context screen | Eight useful selections versus six lexical; no observed losses | Promising curated screen, not qualified benefit |
| Four task-derived cases | Two useful selections in each mode; missing provider usage and fallback limit inference | Inconclusive |
| Four source-bound decisive-span cases, live advice | Both advice and lexical excerpts delivered evidence in three cases; zero incremental hits or losses; 186–512 ms advice latency | No incremental benefit observed in this screen; development benefit inconclusive |

The last screen reported 27,880 provider input tokens and 966 output tokens. These are provider
cost observations, not avoided host tokens. Labels and candidate universes were author-selected;
none of these results establishes independent held-out quality or whole-workflow savings.
Runtime datasets, manifests and source-specific receipts remain external to this checkout.

## Integration evidence

Canonical owners are `components/engine/src/decisions.ts`, `decision-configuration.ts`,
`decision-doctor.ts`, `decision-telemetry.ts`, `decision-cancellation.ts`, and
`context-route-command.ts`. Their focused tests cover no-call fallback, source sharing restrictions,
invalid suggestions, usage retention, outage suppression, bounded concurrency, cancellation,
configuration refusal and routed mandatory context. The historical
[package checkpoint](../exec-plans/records/2026-09-20-unified-engine-checkpoints.md#managed-cancellation-and-e3-package-checkpoint)
records compiled decision/context and managed-signal qualification.

The source integration audit covers cross-process suppression, selected shadow ownership,
configuration migration, cancellation, stale-source rejection and usage accounting. A focused
37-test run passed with no failures or skips. This includes new coverage for explicit abstention
and low-confidence advice: both preserve the baseline and usage without suppressing the next call.
The installed preview now also has an explicitly enabled context-assembly comparison through
the public `context-packet` command, described below. Final release-candidate qualification remains
an E5 obligation. The evaluation outcome needs no forced rerun.

Later experiments require a new concrete recurring decision or improved retrieval hypothesis,
a consumer, frozen comparison and accepted-work measurement. JEV remains optional behind the
interface; missing credentials must preserve deterministic operation.

## Current clause readback

- **Shadow ownership:** the caller awaits one bounded adapter request; shadow returns baseline
  delivery and retains a separate suggestion. Evaluation owns replay/scoring of that suggestion.
  There is no detached scheduler. The strengthened test deliberately makes advice disagree with
  the baseline and proves shadow cannot change delivered order.
- **Cross-process outage suppression:** two actual Node processes share one health path. A 429
  response in the first causes zero transport calls in the second. The health record does not
  contain the test credential. This adds process-boundary proof to the existing concurrency test.
- **Configuration migration and doctor:** old profiles resolve to off; valid tracked settings map
  to the adapter; unknown fields/providers and invalid revisions fail closed. Doctor reports
  eligibility and fallback without calling the provider. Fifteen focused tests pass for these clauses.
- **Question batching:** the current consumer asks one optional-context ranking question per packet.
  Candidate choices already share that request. Cross-task evaluation cases carry different evidence
  identities and are evaluated serially. No multi-question batching comparison has been performed. It is not applicable to this first
  consumer, which has only one question per evidence identity; combining unrelated evaluation cases
  would change the comparison rather than optimize its request. Reopen the conditional batching
  clause when a concrete consumer has multiple questions sharing one bounded evidence packet.
  This disposition makes no claim about provider batching capability or batching benefit.

The implemented shadow path includes the bounded advice latency even though it preserves baseline
content. It is an explicitly selected measurement mode, not a zero-latency background promise.

## Installed context-assembly comparison

The same four frozen cases were materialized as files and run through a clean offline installation
of the preview archive. Each case used the public `context-packet` command once with advice off
and once with advice auto, with identical source text, purpose and byte budget. Mandatory content
was retained in all eight packets. Both modes delivered the decisive evidence in three of four
cases; there were zero additional hits and zero losses. Three live requests returned suggestions
and one abstained. Provider usage was 27,792 input tokens and 966 output tokens.

The original evaluator hashes canonical JSON strings for source identity; the public command hashes
raw file bytes. All original hashes were verified before the comparison, and this representation
difference is recorded in its manifest. Text and labels were not changed to improve the outcome.
Temporary installation and source workspaces were removed; command outputs and durable receipts
remain in external evidence.

This qualifies the enabled context-assembly consumer on the tested preview, including actual CLI
configuration, file capture, provider dispatch, mandatory delivery, abstention and receipt writing.
It does not demonstrate host task completion, avoided host tokens, independent held-out quality,
or the E5 whole-workflow benefit. The E3 per-question result remains **inconclusive development
benefit**, with no observed incremental retrieval benefit in this comparison.
