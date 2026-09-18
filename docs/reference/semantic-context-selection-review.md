---
id: reference.semantic-context-selection-review
title: Semantic Context Selection Architectural Review
type: reference
status: draft
owner: project-governance
created: 2026-09-17
updated: 2026-09-17
summary: Opus 5 architectural findings and evidence-based reconciliation of the context-selection proposal.
---

# Semantic Context Selection Architectural Review

Scope: [specification](../specs/semantic-context-selection.md) and
[implementation plan](../exec-plans/active/2026-09-17-semantic-context-selection.md).
This is a design review, not proof of host delivery, model quality, savings, or implementation.

## Review Identity And Initial Verdict

Claude consultation wrapper requested `claude-opus-5`, `xhigh`, read-only plan permissions,
with fallback disabled. The initial wrapper audit reports exit 0, no timeout, an artifact written,
and no repository edits by the reviewer. The request ran 2026-09-18 01:13:57–01:20:21 UTC
(2026-09-17 in the working timezone). These are invocation settings, not an independent attestation
of the provider's internal serving implementation.

Initial verdict: proceed only to a delivery-feasibility spike; revise the dependent plan before
implementation. The reviewer supported the selection/assembly separation and deterministic fallback.

## Reconciliation

| Finding | Disposition and rationale |
| --- | --- |
| D1: full-content delivery evidence unavailable in current hooks | Accepted feasibility gap. Name Codex additionalContext as a candidate, not qualified. Make Batch 0 a stop/go spike. Reject marker echo as sufficient full-payload evidence; no silent fallback to subagent-only scope. |
| D2: repeated injection can overwhelm savings | Accepted. Task entry and explicit scope revisions only; cap requests across the task. Compaction recovery requires a qualified signal; unsupported retention stays unknown. |
| A1: existing boundary contracts need reconciliation | Accepted need for exact amendment inventory, with scope correction. Current bans on native-agent helper calls and model-based validation can remain; JEV does not require violating them. The spec enumerates files and proposed amendments. No separate active authority is introduced by this draft. |
| A2: compaction conflicts with startup | Partly accepted. Release-update restrictions do not forbid a separate context operation. Preserve all release restrictions and make refresh capability-dependent; no invented compaction hook. |
| A3: host support narrower than assumed | Accepted. Codex alone is the initial startup-channel candidate. Other host qualification is later work. |
| S1: candidate pool near budget is inert | Rejected as stated: threshold filtering can remove irrelevant candidates even if all fit. Accept measuring oversubscription, irrelevant-byte share, and actual optional-reading cost before hosted work. |
| S2: fallback and evaluation baseline ambiguous | Accepted. Separate current-invocation fallback, deterministic expanded comparator, and local selection comparator. Report product impact and incremental JEV benefit separately. |
| S3: changed paths absent from scorer | Accepted explicit decision. Local comparison uses paths; v1 remote scorer deliberately excludes them from egress. Evaluate the information disadvantage instead of pretending equal inputs. |
| S4: local comparator unspecified | Accepted a concrete term-overlap comparator before hosted work. Reject copying route weights blindly: authored route aliases/globs are not candidate-document relevance. |
| S5: context events evict validation telemetry | Accepted. Separate bounded stream using existing storage primitives, independently sanitized/versioned; validation retention remains unchanged. |
| S6: secret detection before egress | Accepted narrow reuse of detector definitions over exact outbound bytes. The current pack scans repository selections, so do not invoke the whole pack. Detection/scanner error falls back; repository waivers do not authorize egress. |
| S7: injected source instructions | Accepted host qualification coverage for quoted-material framing and imperative candidate text. A model relevance score is never the security boundary. |
| S8: legacy external-provider marker | Preserve compatibility rather than remove incidentally. Explicitly exclude this marker from JEV configuration/authorization; retirement requires separate evidence. |
| E1: small sample cannot establish strong acceptance | Accepted uncertainty bounds and variance-informed held-out size. The 60-case count is illustrative only; zero observed misses is a pilot criterion, not a zero-error guarantee. |
| E2: cache savings speculative | Accepted. Assume no cache benefit until real hit rates support it. |
| E3: private evidence cannot support governed promotion | Accepted need for an auditable disposition. Record generic methodology/decision in docs and authorized evidence custody privately. Do not publish numerical benchmarks unless terms permit; inaccessible evidence prevents promotion. |

Verification used current `startup.py`, startup/provider/runtime contracts, `context.py`, telemetry
implementation, and `check-security-policy.py` scanner behavior. No hosted JEV experiment or host
injection probe was run for this review. Those remain implementation-plan work, not missing design edits.

## Follow-Up Review

The first focused recheck ran with the same model/effort/fallback settings, exited 0 without
timeout or reviewer edits, and accepted the major reconciliations. It withdrew S1's inertness
claim and agreed that release-update restrictions had initially been read too broadly. It found
four residual contract details, addressed as follows:

- R1: delivered now requires both mechanism qualification and per-invocation exact-payload
  acceptance without truncation. Without a signal, the result remains unverified.
- R2: the caller declares scope; refresh is deterministic, never model-driven. Separate task caps
  bound JEV requests, delivery events and delivered bytes. Exhausted delivery capacity reports
  incomplete context rather than silently injecting or reusing stale content.
- R3: the host-entry adapter owns one composer for independent updater/context results. Empty
  updater output cannot suppress context. The spike covers authored-handler merge/order/limits.
- R4: one importable secret-detector helper owns shared patterns/constants. Batch 2 explicitly
  schedules extraction and unchanged blocking-checker proof, including chunk boundaries/waivers.

Minor fixes name each plan comparator and test that changed paths never enter JEV requests.
The final focused Opus 5 extra-high closure check completed 2026-09-18 01:29:38 UTC, with
fallback disabled, exit 0, no timeout, and no reviewer repository edits. Its verdict: all four
residual findings are resolved at design level; no material design defect remains. Architectural
review is closed. This does not close the delivery-feasibility or quality/economics checkpoints.

Documentation metadata, local links, documentation-system consistency, and whitespace checks
passed after reconciliation. Runtime tests and live host/JEV experiments were not run because
this delivery changes documentation only.

## Subsequent Operator Amendment

After the live hook spike, the operator explicitly accepted mechanism qualification plus `submitted`
status instead of mandatory per-invocation full-payload receipts. That decision supersedes D1's stop
gate. The above Opus review assessed the earlier design; it is not an implementation review or an
endorsement of this later amendment. Exact-text, size, refresh and compaction regression proof remain
required; no result claims the model followed the supplied material.

## Implementation Review And Reconciliation

One independent read-only implementation review found three defects: closed sessions retained
receipts, interrupted provider work escaped request accounting, and delivery limits omitted outer
JSON escaping. Repairs retire SessionEnd receipts, reserve requests before egress, and charge the
complete serialized output. The bounded recheck accepted all three repairs; deterministic regression
tests cover each case. Later source/fact identity checks reject retained packets after policy changes.

The implementation was simplified after the staged maintainability checks identified oversized
control flow. Provider preflight, candidate loading, assembly, host submission and command dispatch
now have separate responsibilities. Shared secret detector behavior remains covered by the existing
scanner suite. These results establish implementation behavior, not relevance quality or cost savings.
