---
id: plan.workflow-approval-repair
title: Reusable workflow approval and execution diagnostics
type: exec-plan
status: active
owner: project-governance
created: 2026-10-26
updated: 2026-10-26
summary: Qualifies bounded approval across task revisions without disrupting older sibling runtimes.
---

# Reusable workflow approval and execution diagnostics

The operator approved repair and stable publication. Release 4.3.0 builds on stable
4.2.2 and the existing host adapters. It excludes the separate work-batch admission
candidate and does not enroll or upgrade any adopter.

## Contract and design

The [workflow contract](../../specs/engine-workflow-and-device-contract.md) owns the
approval bounds, exact per-task actions, compatibility and revocation rules. Keep
one canonical ledger and one executor. Additive grant storage plus a domain-separated
binding digest lets older engines reject only new actions, rather than migrate the
whole shared ledger. Do not weaken current task, policy, resource or cleanup checks.
The unshipped schema-4 draft remains refused; no downgrade is implemented.

The two accompanying corrections reuse existing owners: native checks observe bound
late cleanup proof and packet replay errors carry hashed diagnostic joins. Their
contracts are in the [engine specification](../../specs/unified-development-engine.md)
and [context quality specification](../../specs/engine-4-1-context-quality.md).
They add evidence, never infer a lost command outcome or replay stale context.

The design matches per-request authorization against reusable policy, as described
by [Cedar](https://docs.cedarpolicy.com/auth/authorization.html), without adding Cedar
or another policy service. [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
allow one writer: expensive filesystem checks precede the short authority transaction.
Both primary references were read on 2026-10-26; publication/update dates were not stated.
These sources support design reasoning, not proof of local correctness or savings.

## Batch and proof

- [x] Reproduce schema-wide refusal, receipt-route collision and fragile revocation
  against the preserved draft using synthetic repositories and the real old runtime.
- [x] Implement additive compatibility, authority-bound receipts, independent revocation,
  short write transactions and known interpreter-form refusal.
- [x] Integrate the two existing narrow evidence corrections and their original regressions.
- [x] Verify typecheck, host/cycle adapters, workflow/diagnostic owners, cleanup and replay
  regressions together at the completed-source checkpoint.
- [x] Freeze the final source; build its 4.3.0 archive; run installed host/cycle cases against that
  archive and legacy runtime; run the existing complete installed-package verifier.
- [x] Complete independent read-only review of the frozen change and reconcile findings.
- [ ] Complete ordinary narrative/commit/push hooks and exact-archive metadata generation.
- [ ] Publish stable/latest and verify tag, commit and all three asset digests by readback.

Focused commands: `npm run build`, `npm run typecheck`; Node test runner over
`workflow-cycle-authorization.test.mjs`, `workflow-host-binding.test.mjs`,
`workflow-store.test.ts`, `workflow-executor.test.ts`, `workflow-command.test.ts`,
`decision-diagnose.test.ts`, `native-check*.test.ts`, `context-replay-diagnostics.test.ts`
and `context-route-command.test.ts`. Use the declared Node24 and actual Git toolchain.
The legacy-package environment selects an existing immutable package read-only and
all mutable fixtures live in temporary roots. A missing legacy package is explicitly
unqualified; release proof must supply it. Build/pack only after the source checkpoint.

The shared execution boundary warrants integrated source tests and the normal
`verify-package.mjs ARCHIVE LINT_TOOL_ROOT` proof, including greenfield journeys.
No provider probe, device run, real approval dialog or adopter mutation is needed.
Independent review uses the already selected Opus 5.5 medium route with source and
synthetic proof only. Recheck affected findings; preserve unchanged proof. External
release evidence records command results, exact inputs and archive identity.

## Current seam

The final source is isolated from concurrent work. The integrated source run passed
1,369 tests with no failures; 19 environment-dependent cases were explicitly skipped.
The affected post-review owners then passed 35 focused cases. The final installed
archive passed all 28 host/cycle cases with the real older stable package supplied,
and the separate older release-candidate compatibility cases passed. The installed
public CLI exercised two task revisions with one synthetic approval, exact replay
and refusal after revocation. These are controlled tests, not real operator acceptance.

Build and typecheck passed. The complete installed-package verifier passed, including
greenfield journeys and real lint backends. Archive correspondence checks the compiled
files, shipped host adapters and generated dependency lock against their owning inputs.
The first archive remains superseded evidence; only the final corrected archive may ship.

Independent read-only review and the focused recheck found no release blockers. Retained
limitations are explicit: the interpreter filter is supplementary, not a sandbox; indirect
interpreter/environment forms need separate hardening; interrupted receipt locks need
operator journal recovery and are never automatically stolen. Legacy task-cycle expiry
keeps its existing bind-time contract. New workspace grants recheck before execution.

Normal commit/push gates and publication readback are the remaining release steps.
Their terminal results belong in the external release record. No adopter enrollment,
runtime upgrade, live provider or physical-device claim follows from publication.
