---
id: plan.rc7-prompt-reliability
title: RC7 Prompt Reliability Release
type: exec-plan
status: active
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Implement and locally qualify timing and task-switch repairs, then publish an immutable RC7 archive.
---

# RC7 delivery

Owner: [prompt reliability contract](../../specs/engine-rc7-prompt-reliability.md).
One writer owns this small shared batch; a single independent review follows implementation.
Adopter files and live sessions are not implementation fixtures.

1. [x] Separate selection and operation deadlines; expose phase timing; reconcile managed hooks.
2. [x] Record explicit task transitions and refresh through existing context routing. Preserve
   history, usage provenance, disclosure boundaries and the original entry allowance.
3. [x] Repair the demonstrated managed-launcher omissions for context-index and CLI help.
4. [x] Run focused regressions, then one local release checkpoint: engine/continuity tests,
   typecheck, script tests, build, installed archive proof and synthetic live JEV qualification.
5. [x] Complete one independent review; reconcile findings with affected rechecks only.
6. [ ] Freeze the candidate, run source governance hooks, publish RC7 and read back tag, assets,
   source identity, checksums and immutable release status.

The operator authorizes local release verification in place of GitHub Actions for this RC.
Keep repository CI enabled. Use a CI-skipping commit for this exact publication, and create/upload
the locally verified archive and metadata through the existing draft-to-published release path.
If a hosted run nevertheless starts for this exact tag, cancel only that redundant run. Record
the local-only qualification and its platform limits in release notes. No adopter upgrade is
implied by publishing RC7.

Implementation and local proof are complete. The [review reconciliation](../../reviews/2026-09-25-rc7-prompt-reliability.md)
records the accepted dispositions. Publication and readback execute after this candidate is
committed; their exact source/hash evidence belongs to the external release record.
