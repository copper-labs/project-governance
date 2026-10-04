---
id: plan.rc10-9-prompt-entry
title: RC10.9 Prompt Entry and Context Reference Repair
type: exec-plan
status: active
owner: project-governance
created: 2026-10-04
updated: 2026-10-04
summary: Separates advisory prompt preparation from retained startup ownership and makes context reference failures diagnosable.
---

# RC10.9 prompt entry and context reference repair

Native prompt preparation currently requires the previous startup process to disappear even when
the new native parent is verified and the existing reservation would remain untouched. Its catch
also hides the failing stage. Explicit commands can inherit a valid session without recording that
identity, and malformed references do not distinguish caller formatting from stored corruption.

The [prompt contract](../../specs/engine-rc6-linked-retrieval.md) owns native entry. The
[task context contract](../../specs/engine-task-context-entry.md) owns command identity and replay.
Private field evidence, project checker changes and installed qualification stay outside source.

## Delivery and proof

- [x] Reproduce a resumed native prompt with a still-live prior process, malformed caller/stored
  references, and an inherited-session route missing its recorded session identity.
- [x] Permit only advisory submitted-prompt preparation under its own exact current-generation
  reader. Preserve startup/update ownership, SessionStart absence proof and maintenance refusal.
- [x] Persist safe cause/stage and reference-format diagnostics without raw prompts, references,
  exception text or credentials. Make the refusal point to its receipt.
- [x] Verify exact packet-reference replay within the inherited session and worktree;
  retain latest-turn, task, source and runtime validation and perform no new paid selection.
- [x] Correct the affected project-owned documentation checker at its evidence/live-document
  boundary. Prove saved exports do not become live policy and live-document failures still block.
- [x] Run focused regressions, type checking, release suites and a clean installed-package proof.
  The installed proof must exercise the real native-ancestor and managed launcher paths.
- [ ] Freeze the candidate, publish an immutable dot release without hosted CI, and verify tag,
  archive, checksum and update metadata. Publication does not upgrade an active adopter.

## Review and reconciliation

Opus 5.5 at medium effort reviewed the bounded repair and rechecked its substantive corrections.
The installed test now verifies the complete original owner before comparing it after continuation.
Exact packet references remain the only replay interface; the proposed inferred-current shortcut
was removed before release. Linkage diagnostics cannot interrupt selection, distinguish explicit
context from native delivery and preserve unknown identity. Shared refusal messages prevent throw
sites and safe cause mapping from drifting apart.

The local source suite passed 862 tests before these review corrections. The affected recheck passes
40 cases, including malformed entries, explicit context and retained ownership. Release-command
tests and type checking also pass. The final compiled archive passed clean installation, managed
launcher/native-parent continuation, greenfield first-task, provider fixture and recovery proof.
The archive is ready; publication and exact source/asset readback follow the candidate commit.

## Limits

Keep the fixed coding model, existing context store, disclosure rules and 45-second umbrella.
Do not reattach another chat, follow a sibling task automatically, release a live owner, waive a
project gate or claim accepted-task savings from fixture proof. Selector calibration and wider
output-selection pilots remain separate experiments, not hotfix prerequisites.
