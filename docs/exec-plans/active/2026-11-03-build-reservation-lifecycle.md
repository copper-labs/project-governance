---
id: plan.build-reservation-lifecycle
title: Complete local build reservation cleanup
type: exec-plan
status: active
owner: project-governance
created: 2026-11-03
updated: 2026-11-03
summary: Share native build cleanup across normal completion and recovery with explicit real-lock scope.
---

# Local build reservation lifecycle

A successful closed build can remain unknown because acquisition accepts its claim while automatic
cleanup has no matching observer. The previous local-only recovery alternative did not fix normal
completion or actual build mutexes. The operator authorized the full repair, expedited stable
publication with GitHub CI skipped, and deliberate adopter upgrade. Adopter evidence stays external.

Use the existing workflow/device contract and resource registry. Add an explicit local-build scope
with exact POSIX record-lock files, share the completion/recovery observer, hold real locks through
release, and refuse new named build dispatch when the handler is undeclared. Preserve older
bindings and manual-recovery contracts. Do not add a daemon, TTL eviction, duplicate project report,
new approval cycle or independent registry. Existing exact owners/generations remain authoritative.

- [x] Reproduce the successful-but-unknown failure against the prior installed stable artifact.
- [x] Implement the shared local-build lifecycle and original-run recovery path.
- [x] Finish focused interruption, lock, ownership and source regression checks.
- [ ] Reconcile independent Opus review and complete integrated/exact-archive release proof.
- [ ] Publish/read back the stable patch; retain adopter upgrade/recovery evidence externally.

Run one coherent affected source batch and typecheck, then independent review. Correct material
findings and recheck only affected proof. Full engine and installed/exact-archive proof are required
because this changes executor and recipe boundaries. Unchanged harness/script proof may be reused
only with matching source/environment inputs. No live build/device work is part of runtime proof.

Primary research reviewed November 3: [Gradle daemon documentation](https://docs.gradle.org/current/userguide/gradle_daemon.html)
(version 9.8.2 observed; publication/update date not exposed) distinguishes long-lived daemons from
single-use clients. Therefore process-client exit alone is insufficient. [Kubernetes finalizers](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/)
(updated April 27, 2025) tie completion to an owning cleanup controller and warn against stripping
stuck ownership markers. We reuse this ownership principle within the existing executor, not a
Kubernetes dependency or service. The smaller difference is one native observation owner shared by
finish/recovery plus an actual lock check, replacing duplicated device-only dispatch for local builds.

Independent Opus 5.5 high review and two focused rechecks resolved all material findings: admission
now precedes submission; missing parents remain valid while aliases are rejected; stable release
intent survives changes in fresh lock observations. Focused source checks passed, including normal
completion, failed builds, interruption on both sides of registry release, legacy recovery, real
POSIX contention, and declaration integrity. The initial full engine batch passed 1,584 tests with
28 skips. Final integrated and exact-archive qualification remain release gates.

A nonblocking telemetry limitation remains: immutable observation attempts and the stable release
intent do not record which attempt was held at the transaction. Fresh checks still run synchronously
before every release; historical observations are never release authority. Consider a small event
join separately if diagnosis requires it. Do not add another approval or cleanup protocol for it.

## Historical coordination names

The explicit original-build recovery route rejected older bare coordination names before
checking native closure. Accept these names only on that historical owner route. Keep normal
admission and reserved namespaces strict. Regression proof covers the original release, replay
after successor acquisition, missing project metadata and rejection outside recovery.

## Apple checkpoint reader repair

Apple policy discovery reads configured command-bearing surfaces, including large API metadata.
The previous whole-file read limit aborted required checks without identifying the failing input.
For captured immutable Git blobs, scan literal policy tokens in bounded stream chunks, retaining
an overlap for split tokens and requiring successful Git process completion. Keep exact captured
identities, case rules, deleted input handling and work-bound exceptions. A failed input produces
a path-specific blocking finding. Live working-tree reads keep their existing identity checks.
Validate large staged inputs after live-file changes, chunk boundaries, normal policy exceptions,
and the full required hook against the adopter's preserved candidate. Keep adopter evidence external.


## Explicit later resource recovery

Approved scope: failed owned-emulator boot with missing original ownership record, and failed local
cleanup report after native command cleanup was separately recovered. Preserve failure history;
use the existing explicit release/reconciliation route with fresh exact target/process/lock/mount
observations. Normal worker cleanup, old request formats and live owners remain unchanged.

The focused batch reproduces both failures, tests original-evidence preservation and refusal of
live/ambiguous/changed identities, and checks interruption/successor replay. Complete typecheck,
independent Opus review, affected workflow recovery tests and integrated/exact-archive proof before
stable publication. Installation and exact recovery receipts remain outside source. No device run or
SDK supervisor change is part of this runtime batch.

The later-recovery batch passed independent Opus review after process-snapshot, mount-alias and
portable-test corrections. Both affected compiled recovery suites pass, including targeted rerun
of a timed-out fixture. Integrated engine failures pass their focused reruns; continuity and
script batches also pass. Exact archive installation proof remains incomplete: repeated attempts
time out at different unchanged proof steps. Retain this batch unpublished until that required
proof completes; do not infer package qualification from the focused recovery results.

The installation-proof interruption was traced to host system sleep, not a runtime policy failure.
A process-scoped system-sleep assertion on AC allowed the unchanged proof to finish. The rebuilt
4.5.9 archive is byte-identical to the affected regression-tested archive; installed host binding,
check recovery, decision pilots, fresh startup, delivery and real lint backend proof all pass.
The later-recovery batch is qualified for the approved stable patch and deliberate adoption.

## Deadline recovery projection

The qualified cleanup projection omitted deadline failure although ordinary native execution
already classifies a cleaned-up deadline as failed. Add that narrow mapping only with retained
exit/signal and independent cleanup evidence. Test failed/zero exit, missing outcome, immutable
originals and public release/reconciliation. Reuse unchanged qualification inputs; run affected
executor/recovery checks, typecheck, Opus review and rebuilt installed archive proof.

Opus confirmed the deadline change is a narrow parity correction with no material source defect.
Reconciliation adds signal-only, null/malformed outcome and exact exit/provenance assertions.
The shared executor observation is in scope; its existing recovery/cleanup tests run alongside
worker/resource tests. Unchanged engine/harness/script proof from 4.5.9 remains separately retained.

## Fast failed preflight recovery

Approved focused follow-up: allow original supervisor-confirmed closure when a failed owned
emulator command finishes before its first membership sample. Retain original failure, explicit
historical recovery, all identity and fresh resource checks. Do not extend successful missing-boot
recovery. Reproducer fails against the prior source. One coherent batch covers public release and
reconciliation, missing-history attribution, live/wrong-owner/ambiguous evidence rejection, then
Opus 5.5 high review and installed exact-archive proof. Adopter identities stay outside source.

Research: Node's [child-process contract](https://nodejs.org/api/child_process.html) separates
process exit from stream closure and permits detached children. Neither exit status nor elapsed
time proves resource closure. Reuse the existing supervisor proof and fresh identity/target checks,
rather than treating a fast duration as authority. Reviewed 2026-11-10; update date not established.

The source regression reproduced the prior refusal. Final focused cases passed (10/10),
related recovery checks passed (73, with six skips), and all 48 owned-emulator cases passed
against the final compiled archive. Typecheck passed. Opus 5.5 high recheck found no blockers
after preserving the sampled recovery route and correcting refusal assertions. Generic recovered
cleanup tests cover the shared evidence guard; a dedicated unsampled recovered-file fixture remains
optional coverage. Full installed archive proof is the remaining publication gate at this seam.

### Cancelled removed-app recovery batch

Operator-approved scope: reuse the existing removed-app physical observer for a cancelled local
workflow with modern device/app claims. Original device records and fresh absence establish only
reservation closure, never successful application cleanup. Keep historical XCTest and no-launch
observation contracts unchanged.

- [x] Implement the explicit evidence join and focused positive/negative regression batch.
- [x] Verify source/compiled regressions, independent Opus review and exact archive installation.
- [x] Publish the qualified patch with hosted CI skipped. Adoption evidence remains outside source.

Validate the original cancellation and negative cleanup report remain unchanged. Reject live or
ambiguous device processes, reinstallation, wrong device/owner/revision/container, stale or modified
originals, retained locks and conflicting owners. Reuse existing lease and runtime-reader fences.

Release closeout: stable 4.5.17 published from `447dcc10a5b9d0fa63f1f789cd6d4c2774ece2a4`.
The installed shared regression batch passed 119/119; the strengthened final focused batch passed
28/28, including installed generation loss. Opus 5.5 high review and rechecks have no remaining
blockers. Exact archive clean-install proof, tag/source identity and downloaded asset readback
passed. Hosted CI was skipped. Recovery preserves cancelled outcomes; adopter activation remains
a separate owned operation and is not implied by publication.

### Successful legacy Android recovery batch

Operator-approved follow-up: one successful native command, retained membership, original
supervisor cleanup and exactly two emulator/app claims may use fresh closure to recover missing
historical boot evidence. Preserve the successful result and mark history unavailable. No ordinary
worker relaxation or device control. The previous source reproducer failed as expected.

- [x] Implement the narrow route and source regression cases.
- [x] Verify focused/shared checks, Opus 5.5 high review and exact installed archive.
- [ ] Publish qualified stable patch with hosted CI skipped; adoption remains separate.

Checkpoint: source and installed positive release/reconcile, unavailable-history attribution,
missing membership, wrong/live ownership, revision, changed originals and target/port/lock refusal.
Reuse the Node child-process research above: exit alone cannot establish absence of descendants.

Qualification: 63 source cases and 172 installed shared cases passed. The additional genuine
inferred-cleanup refusal regression passed against the same archive, preserving original bytes.
Typecheck and exact clean-install archive proof passed. Opus 5.5 high review/recheck approved;
its medium coverage finding is addressed. Low redundant-guard/test-strength suggestions remain
nonblocking. The test-only Apple assertion correction restores strict indexed-access typing.
Ready for the authorized patch publication; no hosted CI or automatic adopter selection.
