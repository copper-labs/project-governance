---
id: spec.engine-rc8-hook-sources
title: RC8 Hook and Context Reliability
type: spec
status: current
owner: project-governance
created: 2026-09-25
updated: 2026-09-26
summary: Repair shared hook ownership, bounded repository preparation and required-context readiness before coordinated adoption.
---

# RC8 hook and context reliability

This amendment also corrects preparation and delivery gaps in the
[maintained retrieval contract](engine-rc6-linked-retrieval.md). Keep the
[RC7 operation and selection clocks](engine-rc7-prompt-reliability.md), complete eligible inventory,
fixed coding model, explicit disclosure and provider-free fallback. Computer use remains deferred.

## Observed failure and owner

Codex can load project hook definitions from the main Git checkout while executing them in a
linked worktree. A correct linked `.codex/hooks.json` therefore does not prove that Codex uses it.
A retained legacy Python command can block a prompt before the installed native runtime starts.
Restarting a conversation does not repair the on-disk source mismatch.

This behavior is explicit in OpenAI's
[linked-worktree config tests](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/config_loader_tests.rs).
The [hook guide](https://learn.chatgpt.com/docs/hooks) owns host discovery and trust. A local
readiness report remains separate from host discovery and successful native prompt delivery.

## One definition source, separate execution owners

Resolve the main checkout through Git's registered worktree inventory, not directory naming or
the current branch. Report the workspace, definition source, whether it is shared, and its content
digest. Bound the Git command and file reads; unreadable, bare or ambiguous source identity is
unavailable, never silently treated as local. Non-Git proposal fixtures retain local behavior.

The managed command continues resolving the current worktree's launcher at invocation. Each
worktree keeps its own runtime pin, installation registry and startup receipts. No primary-tree
registry is copied into a sibling. Do not add a Python compatibility adapter or another dispatcher.

`doctor --capability context` inspects the shared definition and the current worktree's launcher.
It names a missing or conflicting shared source even when the linked copy looks current. Ordinary
installation doctor also surfaces this shared-source failure. Neither command grants hook trust,
executes a hook, nor claims that other host/user/plugin sources were fully discovered.

## Deliberate repair and adoption

The migration plan records the shared source as a read-only dependency, outside the current
worktree's backup/write scope. Changes to that dependency invalidate a saved plan. Before creating
an installation operation or changing its runtime, a linked cutover requires the shared managed
hook set to be current. Recheck before backed hook changes and final admission. A mismatch names
the source to repair. `startup install-hooks` applies the same precondition before local writes.

Use the existing backed installer in the main checkout to reconcile its legacy hooks and runtime
at a coordinated seam. Pause affected active worktrees first, preserve staged/unrelated edits and
finish their individual installations before resuming them. Main-first refers to hook definition
ownership; it does not require another branch, shared runtime selection or automatic sibling edits.
An archived or unused older tree must be reconciled before its next governed session.

Review changed definitions through normal host trust. Confirm the source and command with native
hook discovery, then confirm one normal prompt receipt in each resumed worktree. Keep the previous
receipts and spending history. A restart may refresh a loaded session, but cannot substitute for
source repair, trust review or observed prompt delivery.

## Proof and scope

Use real temporary Git worktrees: old main/current sibling must fail readiness and preflight;
current main/old sibling must identify the main as the executable source; a corrected main must
execute the portable command against the sibling launcher and preserve stdin. Cover absent and
malformed sources, changed source digests, read-only discovery and preservation of authored hooks.
Run focused regressions and typecheck, then the declared hook-boundary suite and installed-package
proof at the RC8 release checkpoint. Native host discovery/trust and ordinary task delivery remain
explicit adoption evidence. The separate computer-use research does not authorize shipping an
unqualified browser or desktop executor in RC8.

## Preparation must leave time for selection

Capture changed-file identities from bounded bulk Git metadata instead of launching a process per
file. Preserve the two observations that reject concurrent changes, the exact immutable base,
staged/worktree isolation, symlink handling and captured-byte revalidation. An unavailable bulk
observation must not silently produce an empty change set.

Line-ending verification must not scan unrelated binary assets across the entire tracked tree.
Only eligible files that can undergo normalization need that observation. Custom filters, encoding,
untrusted Git flags and incomplete observations remain unverified and require literal byte capture.
Bound freshness preparation within the index allowance, leaving room for incremental extraction;
an expired operation never gains another allowance. Keep every eligible path, including pending
metadata. Preserve verified unchanged facts and rotate pending work across bounded refreshes.

Record source capture time and index identity, freshness, cache, extraction and publication time.
Show extracted, reused and still-pending counts so repeated zero-progress refreshes are visible.
Qualify a repository with thousands of eligible files, many changed files, unrelated large assets,
normalized text and uncertain sources. Prove durable cold progress, warm reuse and invalidation;
do not use a larger timeout or a narrower candidate inventory as the repair.

## Required context has one reviewed delivery envelope

Continue using the largest declared owner envelope for mixed work. Mandatory files and skills
remain intact; JEV cannot remove them or override the limit. Native prompt delivery must use that
same explicitly declared total envelope instead of a separate smaller hard-coded packet cap.
Without an explicit owner total, retain the existing 24,000-byte native limit. Compute each
owner's native limit before taking the largest; an implicit owner cannot borrow
another owner's explicit opt-in to enlarge the packet. The recorded native limit is also bounded
by the validated combined total. Count framing and retained skills as well as source text within
that envelope. Optional evidence stays bounded, and final output still
has the existing runtime ceiling. Replay validates the recorded envelope against current captured
configuration, never a caller-provided larger value.

Context doctor reports actual required bytes against primary, active-plan and native delivery
limits. Inspect declared routes and bounded mixed-owner combinations, with deduplicated reads and
explicit coverage when the declaration is too large for complete inspection. Mark unexamined larger
owner subsets as a readiness finding even when no scenario-count bound was reached. Return owner IDs,
limits, overrun and missing files. This is passive readiness, not provider execution or proof of
successful host delivery. No automatic profile-budget increases or deletion of required guidance.

At adoption, reconcile an overflowing profile with its owner, preserve required meaning and leave
reviewed room for expected growth. Verify the failing mixed route as well as the default route.
Use ordinary native prompt receipts to link provider calls, additional reads and available model
usage. Acceptance and savings remain unknown until actual task outcomes supply comparable evidence.
