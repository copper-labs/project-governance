---
id: plan.api-review-page
title: Readable local API review
type: exec-plan
summary: Replace oversized API dialogs with a complete local review page and exact decision binding.
status: active
owner: project-governance
created: 2026-11-09
updated: 2026-11-09
---

# Readable local API review

Goal: show the complete frozen API review in a readable local window and record only an explicit
human decision, without audit-text dialogs or fabricated chat provenance.

Scope: packaged approval adapter and page renderer, native macOS window, provenance compatibility,
focused regressions and exact archive release proof. Existing ledger lifecycle remains the owner.
No adopter candidate approval, unrelated policy changes or automatic approval clicks.

One coherent implementation batch covers safe complete rendering, native button transport,
post-confirmation identity checks and compatibility. Verify at its boundary with adapter/store tests,
renderer negative tests, Swift compilation and real window display/cancel. Synthetic confirmations
qualify mechanics only. Independent review and exact package proof precede release. A real human
approval/readback remains a separate adopter acceptance step.

- [x] Implementation: complete renderer, native window and truthful provenance.
- [x] Verification: focused tests, host display/cancel, independent review, archive proof.
- [x] Closeout: publish qualified patch and hand off adoption at an owner-confirmed safe seam.

Focused adapter/store/render tests and actual Swift typecheck pass. Real window display/cancel was observed without a ledger approval. Opus 5.5 high review and recheck found no remaining release blockers; small rendering/test findings were reconciled.

Exact final archive installation proof and normal commit/push hooks passed. Release 4.5.14 is published as latest stable. Downloaded archive, lock and update metadata match the qualified local bytes; the remote tag resolves to the declared source commit. Adoption instructions are handed off separately; consumer upgrades remain pending their safe transition. Human page approval remains an adopter acceptance step. Timeout descendant cleanup is not independently qualified; a terminated adapter cannot record a later decision.
