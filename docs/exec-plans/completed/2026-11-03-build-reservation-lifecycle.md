---
id: plan.build-reservation-lifecycle
title: Complete local build reservation cleanup
type: exec-plan
status: completed
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
- [x] Reconcile independent Opus review and complete integrated/exact-archive release proof.
- [x] Publish/read back the stable patch; retain adopter upgrade/recovery evidence externally.

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
28 skips. Final integrated and exact-archive qualification passed before publication.

A nonblocking telemetry limitation remains: immutable observation attempts and the stable release
intent do not record which attempt was held at the transaction. Fresh checks still run synchronously
before every release; historical observations are never release authority. Consider a small event
join separately if diagnosis requires it. Do not add another approval or cleanup protocol for it.

## Release closeout

Stable 4.5.7 was published from `684f29a823b534a55d8632108e0ab33b77383e75` after
1,594 engine tests passed (28 documented skips), 116 installed cleanup/recovery tests passed,
focused admission/link tests, typecheck/build and exact-archive qualification. Unchanged harness
and script proof retained its source/environment bindings. Normal commit/push hooks ran with only
existing TypeScript comment-coverage advisories. Independent review was reconciled before commit.
The release tag, immutable assets, downloaded digests, source binding, update metadata and latest
stable channel were verified. GitHub CI did not run, as explicitly requested. Adopter recovery,
installation and original evidence remain outside this source checkout.
