---
id: review.decision-first-reconciliation
title: Decision-First Review Reconciliation
type: review
status: current
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Local disposition of Opus 5 findings and focused review closure.
---

# Review reconciliation

The [initial review](2026-09-19-decision-first-opus5-review.md) used Claude Opus 5 at high effort,
with fallback disabled, read-only permission mode and no runtime execution. Wrapper audit confirms
successful artifact creation. This is design/specification evidence, not implementation qualification.

| Finding | Disposition and repair |
| --- | --- |
| 1: research authority/IDs | Accepted ambiguity; research was already labeled non-authoritative, so critical severity is overstated. Namespaced draft spec/plan IDs and added explicit supersession links. Preserved unique content and divergent historical copies. |
| 2: overlapping sequences | Accepted navigation risk. Added explicit historical/S-slice banners to supporting plans and progress snapshot. No move or deletion; those simplifications remain for operator review. |
| 3: batch mapping | Added A→S3, B→S7, C→S4–S6 table with prerequisites. S1–S9 remains the sole order. |
| 4: device resource owner | Added explicit named-project acquisition/release qualification prerequisite to S5/S6. Root overlap is not device locking; absent ownership blocks the lane pending an authorized owner decision. No new manager assumed. |
| 5: protocol fields | S4 now assesses public target/stage bindings and owns any needed Python/TypeScript protocol change with compatibility proof. Existing runner artifacts are preferred where sufficient; automatically inventing v3 is not justified by missing top-level fields alone. |
| 6: analytics durability/cardinality | Measurement spec owns a bounded frozen evaluation manifest for comparisons, separate from rolling telemetry. Numeric measures are not dimensions; fixed bounded projections replace a cross-product. |
| 7: small sample claims | Initial 10–20 tasks are explicitly directional, with inconclusive allowed. Percentage claims need declared uncertainty/sample assumptions; correctness and proof remain hard gates. |
| 8: packet surface | Defined prepare as the host-facing composition; resume remains an inexpensive existing operation. Next-proof is one prepare section, not a second command. |
| 9: discovery mechanism | Distinguished existing alphabetical prefix from new S3 retrieval. Bounded Git inventory/in-process lexical search is baseline; optional ripgrep availability is reported with fallback. |
| 10: excerpt completeness | Defined candidate cap, measured headers, per-candidate allowance, lexical-window selection and omission accounting. Removed the unprovable guarantee that unseen decisive facts cannot be omitted. |
| 11: deadlines | Separated offline/shadow and interactive deadlines with all-request timeout/fallback denominators. Reviewer prediction that one second will often fail is unmeasured, not adopted as fact. |
| 12: policy/cooldown ownership | Named future profile keys and S7 schema/migration validation. Operational-store spec owns bounded nonsecret advisory health state; no secrets in identity or logs. |
| 13: handoff authorization | Separated durable sequence from the current documentation/review-only assignment. |
| 14: env example | Preserved it and labeled it optional/future, with no automatic loading. Removal deferred to simplification review. |

Additional deterministic repairs: root active plans use valid exec-plan/active metadata; handoff is
indexed. Focused documentation validation uses pre-push changed-path selection against HEAD, because
manual has no documentation pack and the pre-commit command expects staged selection. No files staged.

## Closure

The [focused Opus 5 high-effort recheck](2026-09-19-decision-first-opus5-recheck.md) reports no blocker.
It verified all 49 candidate hashes. Twelve findings were closed; the remaining research-navigation
repairs were mechanical: banners at both family entry points, research types and the last research ID.
Those are now fixed locally, together with R3–R5 links/wording and an explicitly inconclusive S7 exit.
No further broad review was repeated for these mechanical repairs.

Subsequent operator clarification adds a runner-reliability checkpoint before S4 integration and an
explicit framework/OS/target/transport qualification matrix. Existing runners may be repaired or
replaced; single ownership does not mean their implementation is ideal. This clarification follows
the recheck and is not claimed as independently reviewed by that earlier receipt.

The operator subsequently accepted the [balanced cleanup dispositions](2026-09-19-decision-first-simplification-candidates.md).
Specifications and S1–S9 now preserve useful flexibility while consolidating duplicate guidance and
replacing speculative benefit forecasts. These later changes received focused documentation checks;
the earlier Opus receipts certify only their recorded snapshots. No runtime capability or historical
review artifact was removed.
