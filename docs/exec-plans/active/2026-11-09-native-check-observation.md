---
id: plan.native-check-observation
title: Preserve native check observation across publication races
type: exec-plan
status: active
owner: project-governance
created: 2026-11-09
updated: 2026-11-09
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

## Current-line source checkpoint

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

## Minimal maintenance backport

Backport the same repair to the published 4.2.2 source as stable 4.2.3. Preserve all dependency,
configuration-schema, runtime-store and host integration identities; only package versions and
release notes accompany the reviewed changes. Resolve documentation context against this line,
without importing later feature or cleanup changes. Reuse identical source/test review claims and
run the backport's affected checks and installed package journey. Publication and affected idle-owner
adoption require their existing authorization and exact versioned installation controls.

- [x] Preserve the committed current-line repair and apply only its changes to the maintenance line.
- [x] Pass the maintenance source/typecheck and archive/installed delta qualification.
- [x] Verify independent review applicability and freeze the maintenance candidate for normal hooks.
- [ ] Generate exact source-bound release metadata and retain the concrete deliberate adoption request.
- [ ] Publish and read back the exact approved release; no adopter is upgraded by publication.

Maintenance typecheck and 26 affected checks passed. The exact 4.2.3 archive built with unchanged
dependency identities, passed the installed greenfield journey and upgraded a disposable installation
from the integrity-verified published 4.2.1 archive through its original launcher. Task, attempt,
session and workspace rows, staged content and unstaged content were preserved; no reader or
maintenance obligation remained. The fixture's candidate source locator was explicitly synthetic;
final publication provenance is established separately by source-bound release metadata. Independent
review confirmed applicability of the byte-identical repair and inspected maintenance delta.

Current: qualified maintenance source and archive, ready for the normal local commit. Next: bind the
frozen archive to that commit, complete authorized publication/readback and coordinate deliberate
adoption only at affected idle owner seams. The installed greenfield journey uses synthetic host
input and inference; it does not prove live desktop delivery or current product acceptance.
