---
id: review.rc6-index-design-reconciliation
title: RC6 Maintained Context Design Review Reconciliation
type: review
status: completed
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Closes the RC6 design review corrections while keeping expanded implementation and optional simplifications at the operator review seam.
---

# RC6 maintained context design review reconciliation

## Scope and result

This review covers the [RC6 specification](../specs/engine-rc6-linked-retrieval.md), its
[ordered implementation plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md), and the
[ordinary-task context contract](../specs/engine-task-context-entry.md). The accepted scope is
automatic prompt entry, a maintained repository index, basic relationships, bounded JEV selection
with expansion, and evidence from real development tasks.

Claude Opus 5.5 at medium effort completed an initial architecture review and two focused correction
rechecks, with fallback disabled. Each wrapper audit records successful completion, read-only plan
mode and no repository changes by the reviewer. The last recheck closed the remaining worktree
findings and shared-store clarification with no medium/high design correction left in that scope.
The raw prompts, responses, input hashes and audits remain in the external review packet.

This closes the design review, not implementation or release qualification. The earlier transient
index is an implementation baseline; the expanded maintained-index behavior is not claimed to exist.
The [simplification recommendations](2026-09-25-rc6-index-simplification.md) were subsequently accepted
by the operator and incorporated into the spec/plan. They are implementation choices, not evidence
that the expanded runtime has been built or qualified.

## Initial findings and reconciliation

| Finding | Disposition |
| --- | --- |
| F1: first task association could restart selection or reuse answers for changed intent | Preserve the provisional entry family, original purpose, traversal, receipts and spend. First binding is an append-only association. Clarification is explicit; semantic reuse requires identical complete inputs |
| F2: existing per-invocation budget closure does not support continuation | Extend the existing owner with a stable family key, durable reservations, explicit closure/expiry and capacity fallback. Qualify any budget-schema change; no task-schema migration |
| F3: partial traversal may repeatedly miss useful candidates | Interleave exact/text/link priorities with the independently eligible general inventory. While a remainder exists, reserve at least half the batch for it. Track separate coverage and never turn priority into exclusion |
| F4: full-tree hashing can erase warm-index savings | Use Git-observed clean identity for reuse and captured bytes for dirty/untracked files. Treat exceptional flags conservatively and revalidate selected source. Measure the complete cold/warm path |
| F5: sibling contract still stated the obsolete 126-path limit | Correct the ordinary-task contract to distinguish legacy body-selector bounds from RC6 full-inventory traversal and continuation |
| F6: edits could discard all progress or incorrectly replay shared-batch answers | Reconcile changed/deleted paths incrementally; preserve compatible traversal, but replay semantic answers only when all supplied batch evidence and question identity match |
| F7: reverse links could imply complete coverage | Report extraction coverage and partial reverse relationships; unresolved sources remain visible |
| F8: relationship metadata could disclose an unapproved endpoint | Keep edges, reasons and other endpoint paths local. Independently authorize every hosted candidate |
| F9: repeated root turns have no aggregate monetary ceiling | Explicit first-iteration choice: bounded families, cumulative reporting, off switch and follow-up cost measurement; no hidden session ceiling or extra classifier |
| F10: concurrent refresh and orphan handling lacked detail | Use SQLite snapshots and generation-checked publication; tolerate bounded duplicate extraction. Verify cache ownership before removal; never remove task history |
| F11: history links could duplicate operational state | Query existing task/evidence links live; do not persist another history copy in the source index |
| F12: default source view was unclear | Prompt entry uses current working-tree bytes and eligible untracked files; explicit staged checks use staged bytes |

The first focused recheck closed F1-F12. Two worktree issues arose from the operator's subsequent
concurrency question and were addressed in the final focused recheck.

## Worktree and database findings

| Finding | Disposition |
| --- | --- |
| W1: a directory path cannot distinguish a recreated worktree | Name the existing continuity filesystem locator from the individual Git administrative directory, distinct from a directory-path hash. Validate it before cache reuse; qualify recreation and move cases |
| W2: a new pin arriving by merge can block the merge commit hook | Resolve the installation footprint, manually reconcile the destination with readers drained while the merge is open, read back and run that merge's hook. Automatic startup adoption remains blocked during the merge. I6 must prove the sequence without a bypass or extra commit |
| Shared history versus separate source index | Linked worktrees share the default continuity database under the Git common directory. The source index remains per-worktree. RC6 retains schema 6; qualify RC5/RC6 writes and cross-version reads with distinct bindings. An incompatible future migration needs every shared-store user paused, backup and explicit migration; the current per-tree guard does not enforce that future process |

The coordinator then incorporated the reviewer's low-priority clarifications: failed Git lookup or
missing birth time cannot establish verified cache identity; Git blob IDs and extracted-byte digests
can differ under EOL/filter handling; expired families cannot permanently consume open capacity;
installer changes to the managed footprint must match the resolved merge index before its hook; and
the existing store's schema-4/5 upgrade-on-open does not qualify pre-v6 sibling runtimes. These are
recorded proof obligations and wording corrections, not newly implemented mechanisms. They did not
receive another independent review round.

The coordinated-upgrade convention is deliberately small: one project-designated integration tree
approves the pin/configuration, other trees adopt that pin at a safe seam, and each owns its runtime
and source context. No main-path discovery, upgrade leader, shared source cache or new branch is added.

## Evidence limits and next seam

The source schema matches RC5's version and structure; the reviewed changes do not establish runtime
compatibility by themselves. Packaged FTS5 support, two-runtime shared-store behavior, actual merge
installation, worktree recreation, native-host pre-read delivery and ordinary accepted-task outcomes
remain explicit implementation/release gates in I1-I6. No tests, provider experiments, adopter
upgrades or runtime implementation were performed for this documentation review.

The operator resolved the simplification seam and authorized implementation on September 25.
Follow the single implementation plan and obtain the separate implementation review
before exact-package qualification and publication. Do not use this design closure as release proof.
