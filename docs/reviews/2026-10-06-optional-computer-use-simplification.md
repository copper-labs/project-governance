---
id: review.optional-computer-use-simplification
title: Optional Computer Use Simplification Pass
type: review
status: current
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Records a separate Opus 5.5 medium pass reducing repeated ownership, proof and image-comparison prose.
---

# Optional computer use simplification pass

Owners: [specification](../specs/engine-optional-computer-use-testing.md) and
[implementation plan](../exec-plans/active/2026-10-06-optional-computer-use-testing.md).
This pass followed the [design reconciliation](2026-10-06-optional-computer-use-design-reconciliation.md).

Claude Opus 5.5 (`claude-opus-5-5`) completed a separate read-only simplification pass at medium
effort with fallback disabled. Its wrapper audit reports exit 0, no timeout and no workspace changes.
It confirmed the residual R5 correction and optional-exit/missing-envelope clarifications, found
no new architectural defects and recommended reductions without a new framework. Raw assignment,
response and audit remain outside this reusable checkout. No implementation or live proof was run.

## Accepted reductions

| Reviewer recommendations | Applied choice and retained function |
| --- | --- |
| Evaluator-plan duplication | Replace the long Holo workstream with links to its spec/plan. Preserve the evaluator's live-qualification heading, standalone image protocol, JEV comparison and authorization boundary. Correct the stale below reference. |
| S1–S2: image protocol | Keep one protocol owner. The new spec adds only Holo geometry/crop limits; the new plan invokes the protocol rather than recopy variants. Retain development/held-out separation, quality requirement, actual total cost and honest failure. |
| S3–S4: availability and setup | Merge identical absence rows; action uncertainty stays with the action lifecycle. Define passive/readiness/smoke once in local setup. Preserve warning plus advisory/exit-0 versus failed plus blocking/nonzero. |
| S6–S7: future control and historical seam | Keep bounded recovery qualification in one paragraph. Shorten the historical descriptor caveat and remove its repeated plan version. No autonomous agent or registry is introduced. |
| S8–S10: ownership and cadence | Remove the repeated owner table, shared-writer staffing and duplicate test/commit prose. The spec owns responsibilities, plan authorization owns permission and validation cadence owns focused batch checks. Caller installed proof and any separately accepted shared gap retain their own gates. |
| S11–S12: reports and races | Link report measures to R5 instead of three lists. Keep native/visual results separate and retain unresolved outcomes, sample uncertainty and the wrong-target scoring rule. Correct the ambiguous sentence about the deterministic baseline. |

S5 proposed deleting future-use examples. The author retained one short sentence because the
operator explicitly asked about other opportunities. It gives no new driver authority or proof;
the repeated required-proof rollback statement now has one owner in the availability section.

Keep all three realistic tasks, independently hidden state/labels, the required-absence fixture,
driver credential canary, flushed intent, lost-acknowledgment readback and separate local/combined
proof. Removing these loses required behavior. Model-free correctness, installed execution,
Holo setup, visual accuracy and cost qualification remain distinct future claims.

## Final document identity

The final candidate hashes below identify the simplified documents, not executed implementation.
The retained source documentation hook requires `draft` rather than the compiled contract's
`proposal` metadata; the final spec uses `draft` without changing its reviewed behavior.

- Spec: `3146e46d28d26ba2746933f7703770b42db38eee2b79c623f5def2d8f02aa22d`.
- Plan: `bf416b2cb73cdfd11657d39440d4c29e46e9a5e5d7db77ebd9a32dda726f1e46`.
