---
id: plan.api-signoff-restoration
title: Restore the native API decision capability
type: exec-plan
status: active
owner: project-governance
created: 2026-11-08
updated: 2026-11-08
summary: Restores the existing exact API decision ledger and public adapter in the stable package.
---

# Native API decision restoration

Stable installations lack the previously implemented public API decision adapter and its ledger
exports. Restore the isolated capability from reviewed source90cf3494, including its rejection of
injected confirmation callbacks. Preserve the existing version1 subject, locator, tables, current
head, revocation and supersession rules. Verification stays read-only and never requests approval.
Existing genuine decisions do not need another confirmation just because the runtime changed.

This batch excludes unrelated recovery code, workflow permission changes, new approval policy and
adopter data. Keep new consent distinct from read-only verification of existing records.

## Coherent batch and proof

Restore store, identity validation, native adapter, host exports and packaging together. Retain
original store/adapter regression cases and add public packaged verification of prior synthetic
records with changed, missing and revoked negative cases. Verify unchanged database bytes for
verification. Include these cases in installed archive qualification to prevent recurrence.

At the batch checkpoint run focused store/adapter tests, typecheck, host integration tests and the
engine/continuity/script suites for the restored authority boundary. Build one candidate archive,
clean-install it and run the normal package verifier including the restored public adapter tests.
Obtain the required independent review and reconcile meaningful findings. Preserve source identity,
archive digests and published readback. Adoption at an owning safe seam remains separate; real
approval records are never edited or fabricated for qualification.

## Qualification limits

The existing contract still requires genuine native confirmation before activating a new production
baseline. Synthetic transport tests cannot satisfy that requirement. Restoring verification of
existing genuine records does not create a new baseline and does not require repeating their consent.
Frozen old-source rows now test compatibility independently of the current writer. Managed-generation
archive proof uses the actual launcher and full installation lock. Non-macOS qualification reports
native confirmation transport as unqualified; real confirmation is not exercised by this release proof.

Qualification deliberately records native transport separately from package installation and verification.
An overall package pass on another platform is not native-confirmation qualification; consumers must
read the explicit transport field. This release is qualified on macOS. CLI bypass refusal runs on every
platform. This preserves the existing cross-platform verifier exit contract.

## Completed source qualification

Focused store tests passed 7/7; final source and exact managed-archive adapter tests passed 10/10.
Typecheck passed. Full engine, continuity and script suites passed 1878 tests with 33 declared skips
and no failures before the platform-independent refusal test split; the final adapter rerun passed.
The clean full archive verifier passed on macOS. Its first attempt observed an incomplete foreground
check just before the native result completed; that failed proof is retained separately. No production
code or timeout was changed for the successful rerun without concurrent suite load.

Independent Opus 5.5 high review and recheck found no remaining blocking issues after frozen old-record
compatibility proof and real launcher/lock fixture coverage. Native transport remains synthetic proof,
not a human decision. Published artifact identity and adopting checks are subsequent release steps.
