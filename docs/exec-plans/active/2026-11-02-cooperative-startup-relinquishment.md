---
id: plan.cooperative-startup-relinquishment
title: Upgrade a project without ending unrelated native chats
type: exec-plan
status: active
owner: project-governance
created: 2026-11-02
updated: 2026-11-02
summary: Add operator-approved per-owner relinquishment using existing runtime and startup ledgers.
---

# Cooperative startup relinquishment

The operator approved this lifecycle change after reviewing its scope: each native owner may
release only its own project runtime reservation at a safe seam, leaving the chat and shared
host open. Existing one-parent update handoff still refuses another reader; absent-host recovery
correctly refuses a shared live host. Neither old route expresses this cooperation.

Use the existing runtime generations, native identity, startup owner history and explicit updater.
No new schema, copied runtime authority, process termination, fabricated event or inferred acceptance.
Do not remove active command, workflow or provider readers. Normal maintenance still requires drain.
The owning [startup specification](../../specs/startup-runtime-updates.md) defines the new command,
bootstrap route, exact-binding replay, concurrent prompt behavior and context refresh on resume.

Primary research reviewed 2026-11-02: [Linux RCU overview](https://docs.kernel.org/RCU/whatisRCU.html)
distinguishes active-reader completion from a surrounding host's lifetime. The existing runtime
already has immutable generations and separate activation; this change supplies explicit task
cooperation, not RCU hot swapping. [SQLite's transaction contract](https://www.sqlite.org/lang_transaction.html)
supports preserving the existing serialized writer seam. Neither inspected page exposes a dependable
publication/update date; a linked 2024 API reference is not the page's update date. These are primary
conceptual/transaction references, not proof of application correctness or time/token savings.

- [x] Reproduce unsupported cooperative release against the existing public command.
- [x] Implement exact native-owner release and owning contract/guidance.
- [x] Pass focused identity, concurrent-reader, interruption, replay and resume regressions/typecheck.
- [x] Obtain Opus 5.5 high independent QA and reconcile material findings.
- [ ] Complete affected shared-boundary and exact installed-archive proof.
- [ ] Publish the approved next stable patch through normal narrative/hooks; verify tag/assets/latest.

The coherent batch includes its source, tests, specification, guide and release metadata. Validate
locally; do not enable GitHub CI. Adopter identities, runtime/process observations and coordination
receipts stay outside this checkout. Existing adopter changes and held resources remain owned by
those projects. Published dependency correction qualification is historical; no new adoption or
accepted development is inferred until the actual installed check has completed.

The reviewed affected checkpoint passes46/46. The broader engine checkpoint reports1517 passes and
25 installed-only skips; it spanned the review correction, so the affected reviewed checkpoint is
retained separately rather than synthesizing a new full-run total. Harness82/82 and scripts142
passes with5 explicit skips retain their distinct dimensions. Typecheck and build pass. The final
clean archive's focused installed checkpoint passes36/36, including the actual compiled owner.

Opus5.5 high reviewed and rechecked without fallback. Both material findings are closed: slow
native/payload verification moved outside the receipt-store writer lock, and resume guidance now
accurately requires explicit current-guide/context refresh instead of claiming an automatic native
notice. A regression fails against the original candidate with SQLite busy and passes after repair.
Deterministic history replay, successor refusal and short writer-lock proof are included. Finish
pending update completion/cancellation recovery before cooperation; optional deeper recovery and
future refresh-notice changes remain separate proposals. No accepted development or savings claim
comes from these synthetic release checks.
