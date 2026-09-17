---
id: exec-plan.selective-readers
title: Selective Read-Only Support During Implementation
type: exec-plan
status: completed
owner: project-governance
created: 2026-09-06
updated: 2026-09-06
summary: Make useful reader delegation explicit in planning and allow one cooperating writer without weakening exclusive jobs.
---

# Selective Read-Only Support During Implementation

## Final State

An orchestrator considers useful independent investigation at batch planning and meaningful work
transitions. It keeps one writer and uses zero to two readers only when their assignments replace
necessary work or avoid material rework. Existing native controls and the optional provider helper
remain the execution routes. No scheduler, model ranking, collector, mandatory agent count, or
per-step reporting is added.

The provider helper gains an explicit writer mode compatible with shared readers. Default
exclusive jobs retain isolation. Readers remain an assignment restriction, not a filesystem sandbox.
Source publication is authorized; adopter repositories remain outside this change.

## Delivery

- Delivery: source implementation and local proof complete; publication remains gated by
  reconciled independent review, candidate CI, and the immutable release workflow.
- Target release: 2.6.0, a compatible capability within the existing 2.5.0 startup integration.

## Batch 1: Useful Parallel Investigation With One Writer

- Depends on: none
- Ownership: primary is the sole source writer; provider coordination and installed workflow guidance.
- Execution: sequential implementation with bounded independent read-only design analysis.
- Parallel support: one existing reviewer checks coordination and mixed-version hazards while the
  primary updates guidance; it later reviews the frozen candidate. No second reader is needed.
- Semantic contract: settled; reconcile the access-mode safety details before editing the runner.
- Fixed decisions: one writer, at most two readers, existing exclusive default, no model defaults,
  no nested fan-out, no weakening of runtime pinning or session ownership.
- Acceptance: planning and work route to the shared delegation rule; writer/shared jobs can overlap;
  a second writer or exclusive job cannot; read-only guidance covers Git and shared build state;
  old jobs, follow-ups, cancellation, and cleanup retain their guarantees.
- Development checkpoints: focused provider fixtures for the access matrix, queue ordering,
  continuation, ancestry, and cleanup; existing skill payload tests for installed guidance.
- Build and integration point: after the coherent patch, one disposable installed-wheel live
  writer/reader probe; release source readiness performs the full suite and clean wheel proof.
- Review boundary: one independent approval review of the frozen diff and existing proof, followed
  only by focused reconciliation checks for findings.
- Proof budget: reuse unchanged adapter proofs; do not repeat all live provider capabilities for a
  common scheduler change. Prove the changed scheduling seam with a supported native provider.
- Invalidates prior proof when: access semantics, queue handling, installed guidance, or candidate
  content changes; focused rechecks cover the affected claims.
- Proof state: 34 provider tests and seven skill-payload tests passed; installed native
  writer/reader overlap passed. Candidate CI supplies final full-suite and clean-wheel proof.
- Split early or stop when: compatibility requires state migration or a wider coordination layer.
- Documentation: consolidate shared contract, workflow instructions, operator guide, research
  limits, and release notes in this batch.
- Acceptance milestone: verified immutable 2.6.0 release assets and fresh published-wheel install.

## Cost Calibration

The initial goal of less than 25% median token premium is an evaluation target, not a runtime
deadline, a research optimum, or a claimed result. Compare the same representative tasks and
accepted outcomes with zero, one, and two readers using existing host records when available.
Keep input, cached input, output, reasoning, monetary cost, and elapsed time distinct. Unknown
usage stays unknown. Shipping this policy does not claim a measured speed or token improvement.

## Stable-Candidate Proof

Freeze the completed batch, reconcile independent review, and use the ordinary commit and push
hooks. Bind source readiness to the proposed merge tree and base before merge and tag. The tag
workflow repeats broad proof at the independent publication boundary. Read back exact source,
wheel, lock, compatibility metadata, digests, and immutable release state.

## Implementation Closeout

Planning and work now read the shared delegation contract. The implementation-plan template asks
for bounded parallel support or a brief solo rationale. The optional helper supports an explicit
cooperating writer while retaining exclusive ownership for older runners and default jobs.

One independent reader analyzed coordination risks and later reviewed the frozen candidate
`3263cf94e075f8d8461c100c4d400836db9d845a`. The review found one malformed-record validation gap:
the reader-overlap flag could appear without an access mode. The correction rejects that shape,
and its focused regression check passed. Reconciliation reviews that correction rather than
repeating the unaffected batch review.

An installed-wheel probe from that candidate completed concurrent native writer and reader jobs.
The writer changed only its assigned fixture source and passed the fixed acceptance check. The
reader supplied snapshot-bound provisional findings and selected zero, one, and two readers for
three bounded planning scenarios. Protected fixture files and Git identity remained unchanged,
and both jobs confirmed cleanup. This valid-record proof remains applicable after the focused
malformed-record correction; final candidate CI also exercises the corrected validation.

The probe establishes working coordination and delivered guidance. It is not a comparative
efficiency experiment. No token or elapsed-time improvement is claimed. No scheduler, collector,
adopter change, or additional worktree was introduced. Existing evidence remains outside the
source checkout; published assets and completed release checks establish delivery readback.

## Rollback

Retain explicit exclusive mode for assignments that cannot tolerate concurrent readers. Revert the
source change through the normal reviewed release process; never rewrite published assets or
silently replace an active adopter runtime.
