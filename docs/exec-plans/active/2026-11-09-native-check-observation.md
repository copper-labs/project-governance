---
id: plan.native-check-observation
title: Preserve native check observation across publication races
type: exec-plan
status: active
owner: project-governance
created: 2026-11-09
updated: 2026-11-11
summary: Repairs transient check observation gaps and exposes the existing bounded deadline to native pre-push.
---

# Native check observation and push budget

A queued intent can become claimed after it is read, or a worker can publish a terminal result and
exit after the observer checked for that result. Neither interleaving proves an unfinished run.
The foreground caller currently exits early on that snapshot, aborting its hook while the original
check continues. A separate execution-budget gap prevents native pre-push from selecting the existing
explicit deadline supported by a manual check.

## Coherent batch

Refresh incomplete snapshots once and keep foreground observation on the original run within the
existing deadline and observation allowance. Preserve genuine unknown outcomes, recorded worker
failures, terminal failures and native cleanup requirements. Forward one pre-push-specific environment
setting to the existing deadline parser; retain its bounds and the absent-setting default. Keep
adopter configuration, runtime bytes, task bindings, readers and publication outside this batch.

Work solo through implementation because the failing seams are localized. Request one independent
review of the frozen batch and existing proof; no duplicate product gate is needed for reproduction.

## Checkpoints

- [x] Diagnose both races with deterministic publication interleavings in disposable fixtures.
- [x] Add regressions that fail against the prior source, including unknown-owner and timeout cases.
- [x] Complete the source repair, public contract and portable command guidance together.
- [x] Pass focused observer, CLI, hook, detached-worker and recovery tests; typecheck and build once.
- [x] Review the frozen batch independently and reconcile findings using the existing proof.
- [x] Freeze reviewed source and owned staging, ready for normal retained source hooks.

This is a local source repair for a subsequent release, not a release certification or adopter
upgrade. Publication requires the normal package qualification and operator authority. Adoption
must use the versioned installation contract at an owning safe seam, preserving worktree bindings
and active original readers. A configured longer budget is an operator choice based on measured
required work, not a diagnosis that timing alone explains a failure.

## Source checkpoint

The focused observer, hook, CLI, detached-worker, recovery, cancellation and cleanup checkpoint
passed 30 tests; the foreground wrapper also exercises five isolated deterministic cases. Both race
fixtures and missing timeout forwarding failed against the previous source. Typecheck passed after
a test-only assertion overload correction. One compiled archive build passed, its canonical dependency
boundary was inspected by the packager, and it installed offline into a clean disposable directory.
The installed entry and both deterministic publication interleavings passed. One independent review
of this frozen batch found no blocking issues and consumed the existing proof without replaying it.

Normal shipped source hooks will be selected only for the commit invocation because the shared Git
configuration has no installed source hooks. This does not change shared configuration or adopter
hooks. The exact commit and retained native hook results remain external evidence; no second status
commit is required. Full release/greenfield qualification and adopter migration remain unclaimed.

The first normal source hook required its declared Python development dependencies in the isolated
environment. Its next run detected the new plan's missing execution-plan index link; that link is
now present. These prerequisite/documentation corrections do not invalidate the compiled proof.


## Stable 4.6.2 carry-forward

The current compiled release line needs the maintained observer and native-budget protection plus
the companion [bounded secret scanner](2026-11-10-batched-secret-scan.md). Carry only those accepted
repairs while preserving the existing first-push diagnostic, feature destination and Cowork owner.
No default deadline policy, runtime installation or adopter authority changes.

- [x] Carry the existing observer, budget and scanner source/regression owners onto the current base.
- [x] Prepare matching stable package versions and authored release notes.
- [x] Pass affected observer/status/recovery/worker, hook/ref-input, secret/built-in and committed
      subject tests, then typecheck and build the frozen archive once.
- [x] Pass actual installed archive observer/scanner owners and normal first-push budget/cleanup,
      complete the existing package checkpoint and matching Cowork package proof.
- [x] Complete one independent QA review of exact source/archive identities and retained proof.
- [ ] Prepare normal source commit/PR controls, integrate the exact qualified tree, and publish
      the stable tag and complete immutable assets with byte-for-byte readback.

Work solo through this localized carry-forward; another initial investigation would duplicate the
retained negative controls. One independent reviewer consumes the frozen batch and final package
proof. Reuse the current release's unchanged source, continuity, provider/device and Cowork evidence
after source/archive comparison. Do not replay unrelated full suites or any live application gate.
The source checkpoint names the affected tests above. Package qualification runs the same original
foreground and batch/union regressions against installed compiled modules and packaged schemas;
normal managed first-push proof asserts the operator deadline in the original dispatch. Preserve
failed originals and recheck only invalidated owners. The existing release process owns source
integration, final-HEAD metadata, stable publication and readback. Keep operational identities and
adopter evidence outside this checkout. An actual rollout still requires a fresh backed plan and
explicit authority for each original installation at an idle seam.


The current affected source checkpoint passes forty-nine top-level cases plus the foreground child
cases; typecheck and the frozen archive build pass. Complete installed package proof passes its
original boundaries and eleven added installed-owner cases plus foreground child cases. The managed
Git first push records the selected native deadline and reaches terminal success with confirmed
native and owned fixture cleanup and no remaining readers. The corresponding original feature
archive fails each targeted negative control for its intended budget, observation and process-count
assertion. Current Cowork package smoke and its affected installed journey pass. Independent QA
finds no material issue and verifies exact source/archive correspondence and valid unchanged-proof
reuse. Normal authored narrative preflights pass. The next action is ordinary source commit and
publication controls; actual integration, tag and immutable readback outcomes remain in Git and the
external release record. Live installation acceptance and fresh idle-seam backup plans remain separate.
