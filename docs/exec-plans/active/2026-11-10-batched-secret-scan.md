---
id: plan.batched-secret-scan
title: Batch immutable secret scan reads
type: exec-plan
status: active
owner: project-governance
created: 2026-11-10
updated: 2026-11-10
summary: Remove per-blob Git process overhead without weakening exhaustive secret scanning or hook proof.
---

# Batch immutable secret scan reads

A live exhaustive secret scan launches a Git process for each unique staged or committed blob.
A generic thousand-file fixture reproduces the process count and overhead. Required later packs
can consequently remain unexecuted when the enclosing check reaches its unchanged deadline.
The kernel contract retains exhaustive worktree, index and committed-candidate coverage.

## One implementation batch

- [x] Verify the original failure boundary and reproduce per-blob process overhead with a generic fixture.
- [x] Stream bounded groups of pinned blobs with strict identity/type/length/delimiter validation.
- [x] Retain large binary streaming, detector hashes, replacement-ref isolation and in-run deduplication.
- [x] Verify focused parser, process-failure, timeout, full-scan and committed-push regressions.
- [x] Complete typecheck, build, security-boundary broad proof and a matched generic benchmark.
- [x] Freeze the batch for a dedicated primary QA pass and readiness for normal-hook local commit.

Work solo for the bounded implementation: the existing scanner and its owning tests provide the
required context, and a second investigation would duplicate it. Review consumes the completed
batch and proof once.

The first checkpoint runs the new batch/parser tests with existing secret, built-in, committed-push
and check-execution tests. The batch boundary runs root typecheck/build and complete engine and
continuity proof because stream framing and owned-process cleanup form a security boundary.
Build the normal package and verify its installed secret-scan boundary. Compare the same generic
fixture before/after, retaining private timing evidence outside this checkout.

No adopter files, installed runtime payloads or pins change. No resumed partial check, retained
receipt acceptance, pack selection, new timeout, or broader release authorization is introduced.
Actual publication still requires a complete normal hook on its exact candidate after separately
authorized adoption. Any failed or unrun proof remains explicit.

## Current seam

The compatible maintenance candidate is identified locally as 4.2.4. Focused regressions,
typecheck, build, complete engine/continuity/package tests, clean installed package proof and the
matched generic benchmark are complete. The dedicated primary QA pass found no material defect;
the scanner and regression bytes match the current-line correction. The batch is ready for a local
commit through the tracked source hooks; Git records that outcome. Publication and adopter
acceptance remain separate and unclaimed.
