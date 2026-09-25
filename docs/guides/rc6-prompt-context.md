---
id: guide.rc6-prompt-context
title: Configure and Observe RC6 Prompt Context
type: guide
status: current
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Enable prompt delivery and optional metadata selection, then inspect actual usage without inferring savings.
---

# Configure and observe RC6 prompt context

## Implementation status

The current RC6 candidate implements native prompt entry, a maintained per-worktree SQLite source
index, basic source-backed relationships, and bounded metadata selection with two entry-linked
expansions. This guide gives the implemented commands. It does not claim publication, host trust,
first-read order, accepted work, or measured savings. The
[implementation plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md) tracks qualification.

The [RC6 contract](../specs/engine-rc6-linked-retrieval.md) keeps the coding model fixed. Code chooses
required guidance and captures current source. Optional JEV advice orders eligible paths before
selected excerpts reach the coding model; it does not choose a model, grant permission, or accept work.
Continuity history supplies local references and source hints, never hosted history prose.

## Install and check the entry path

Use the normal exact-archive installation. Initial `init` now includes the Codex prompt observer in
the backed host transition. Its startup receipt database is `startup.sqlite` next to that
worktree's installation registry. The tracked Codex hook resolves the current worktree at invocation;
its ignored launcher supplies the worktree-specific registry. An explicit `startupReceipts` in an
installation request is accepted only when it equals this default. Authored hook settings are
preserved or require deliberate reconciliation. Updates keep existing handlers; if an update must
install or reconcile hooks, supply the default `startupReceipts` in its backed installation request.

The host must trust the project and the exact hooks. Installation cannot grant that trust or enable
a host feature prohibited by managed policy. `doctor --capability context` reports configuration and
receipt coverage; it does not claim host trust or proof of first-read order. For an existing
installation, `startup hooks --receipts <registry-directory>/startup.sqlite` proposes configuration and
`startup install-hooks --receipts <registry-directory>/startup.sqlite` applies it through the managed launcher.
An older absolute-path managed hook requires a deliberate clean cutover before installing RC6 in a
linked worktree; do not leave a handler pointing at another checkout. For an RC5 update, finish the
active sessions, review `.codex/hooks.json`, remove only its four old managed `startup observe`
handlers while preserving authored handlers, then run the backed RC6 update with the default
`startupReceipts` **explicitly set to `<registry-directory>/startup.sqlite` in the update request**.
Review and commit the newly generated tracked hook with the pin. A linked tree
receives that tracked change through Git and installs its own ignored runtime at a safe seam.
Until that local install completes, its prompt hook may fail against the older launcher; do not
resume governed work in the mixed state. An update with an old managed observer and no hook
transition is rejected rather than silently retaining a second receipt authority.

New profiles include a small default route. Existing profiles need an explicit `context_router.default_route`
naming a declared route for requests that match no path or term. Add the project's actual shared
required guidance to that route; the engine cannot guess it. Keep background indexes and large
reference collections out of mandatory guidance unless every task truly needs their complete text.
The prompt adapter refuses to label an oversized required packet complete.

Run the repository-local command:

```sh
.governance/runtime/bin/project-governance doctor --capability context
.governance/runtime/bin/project-governance doctor --capability decisions
.governance/runtime/bin/project-governance context-route --help
```

The first automatic adapter is Codex `UserPromptSubmit`. It requires the host's session, turn, cwd
and submitted prompt. It rejects delegated workers and mismatched workspaces. Other hosts keep the
explicit governed command path until their native adapter is independently qualified.

If Codex resumes the same session under a new process, a prior startup reader can still be held.
When the prior process is proved absent and the pinned runtime is unchanged, prompt context can
continue without transferring that reader. The old startup owner still needs SessionEnd or explicit
owner recovery to retire its reader; startup updates stay blocked until then. The resumed
SessionStart can return without update advice;
the submitted-prompt hook still supplies the packet. If a prompt hook exits abruptly, its
separate reader is recoverable through the existing observation recovery command after process
absence is proved. An unproved process or runtime identity leaves the prompt lifecycle unavailable
and requires inspection; it never silently grants update authority.

The managed prompt handler sets `additionalContextLimit: 0` because governance already limits its
packet to 24,000 bytes. Without that setting, Codex can replace a large packet with a preview, hiding
required material. Doctor reports this configuration gap. Reconcile an exact older managed handler
through the backed installation and review its changed hash in the host; customized handlers still
need deliberate reconciliation. See [Codex's hook-output contract](https://learn.chatgpt.com/docs/hooks#large-hook-output).

## Inspect and refresh the source index

The index is a disposable SQLite projection under the external context state root for this
worktree. It stores bounded literal source facts, ranges and links with their resolution status,
not full source bodies. It is separate from the shared continuity task and history database.
`status` only reads existing cache metadata: `absent` stays absent, and `present` does not prove
that source is still current.

```sh
.governance/runtime/bin/project-governance context-index status
.governance/runtime/bin/project-governance context-index status --cache-root <absolute-context-state-root>
.governance/runtime/bin/project-governance context-index refresh
.governance/runtime/bin/project-governance context-index refresh --staged
.governance/runtime/bin/project-governance context-index refresh --rebuild
```

`refresh` reconciles the current worktree view, including eligible dirty and untracked files.
`--staged` selects the index view. `--rebuild` replaces only this disposable cache; status may
inspect another cache root, but refresh and rebuild cannot target one. Index maintenance makes
no JEV call and does not change tasks, checks or evidence.

The index reuses facts only when Git or captured bytes support their identity. Changed files are
re-extracted, and selected source is captured and checked again before delivery. Uncertain identity,
missing bytes or bounded extraction leaves an explicit partial or unavailable result; it never makes
an old cached body current. Each file is limited to 256 KiB, each read window to 4 MiB, and each
invocation to 32 MiB. TS/JS syntax facts and Markdown clues are bounded; other languages may have
only literal or heuristic clues. A missing link in a partial index is not proof that no dependency exists.

## Opt in to bounded metadata selection

Merge this fragment into the existing `continuity.decisions` declaration, choosing stable project
roots rather than the paths from one pilot task. This is an example, not an automatic disclosure grant:

```yaml
continuity:
  decisions:
    mode: auto
    allowed_data_classes: [metadata, source]
    allowed_metadata_paths: [src/**, docs/**, tests/**]
    allowed_source_paths: [src/**, docs/**, tests/**]
    deadline_ms: 1000
    evidence_bytes: 16384
    max_candidates: 16
    budget:
      max_calls: 256
      max_request_bytes: 4194304
    consumers:
      DL03:
        mode: auto
        questions: [context.metadata-relevance/1]
```

Set `JEV_TOKEN` in the host's inherited environment. Never place its value in agent instructions or
the profile. Metadata permission includes the raw submitted prompt plus bound task intent and eligible
file paths, only when their complete bounded purpose fits `evidence_bytes`. Pasted prose in the prompt
is part of this provider input; filenames-only consent is not sufficient. It does not
permit source-derived descriptions or history prose. Adding `allowed_source_paths` plus the `source`
data class permits literal titles, symbols and short documentation extracted from those files.
The example opts into both. Omit source approval for paths-only mode; it is weaker for misleading
filenames. Full raw files and historical prose are not sent by this index consumer. Existing DL03 profiles do not acquire the new question
or metadata permission merely by upgrading. Keep unrelated enabled consumer settings when merging.

The catalog keeps the complete eligible inventory. JEV visits it in batches of up to 63
questions through the existing serialized provider-health owner.
Request bytes can reduce a batch size, never the inventory. No keyword or task-scope shortlist decides
which files exist for JEV. Current required guidance stays code-owned. The maintained SQLite index
reuses unchanged source facts and searches literal descriptions, symbols and source-backed links.
Pending, unsupported or oversized extraction still leaves the path eligible, with a recorded
limitation. Local indexing never widens hosted path or source-description permission.
The start offset changes with the observation identity, so a short deadline does not repeatedly
confine new turns to the same alphabetical prefix. This does not guarantee eventual full coverage.

Shared state carries the purpose once per batch. `max_candidates` bounds later source delivery,
not JEV's inventory. Exact and changed sources retain priority. Missing credentials, uncertainty or a
spent budget preserves the local fallback. Partial coverage remains useful but is labelled in the
packet: answered, unanswered, outside-sharing-scope and unavailable counts are distinct. It must not
be described as a complete search or no-match proof. Descriptions are clues, not full summaries.

The example budget is an experiment allowance, not a claim that every repository fits. A native
prompt entry and up to two requested expansions share one metadata allowance keyed to the entry ID.
Calls and bytes already spent remain spent when the purpose changes or a provisional entry gains a
task binding. An exact duplicate can replay a retained answer within the original lifetime.
A newer root turn, the completed second expansion, or 15 minutes closes the family to new calls.
Missing-token or off-mode entry uses local fallback without allocating paid-family accounting.
This allowance cannot spend review/CI capacity or the ordinary active-scope pool.
Both pools retain the shared 8 MiB budget-store safety limit. Inspect actual coverage and budget
receipts before changing these limits. The 3.5-second overall provider deadline applies to prompt,
CLI and provider-context selection and may leave large
inventories partly assessed; synchronous source work is size-bounded, not a hard timing guarantee.
Each metadata call has at most one second or the stricter profile timeout. Reaching the overall
retrieval cutoff does not trigger provider cooldown; a provider's own timeout still does.
The native prompt entry runs only the enabled index question. Legacy body-ranking and workflow
advice remain on their existing deliberate command paths. No provider is required for local routing.

The adapter adds bound intent to short follow-ups. It does not invent acceptance criteria, reopen a
closed task, or use the last task from another session. The operator/agent still deliberately creates
or resumes the continuity task when intent and scope are clear. Checks retain that same binding.

## Continue a native prompt entry

The Codex prompt hook creates the initial entry automatically and gives its entry ID in the packet.
If that packet is unavailable, an explicit route supplies local context for the current purpose:

```sh
.governance/runtime/bin/project-governance context-route --task "<current purpose>" --revision 1 --changed-path src/example.ts
```

That standalone route returns a route receipt, not a native entry ID. Only the current native entry
can use the two continuation commands below. Use its entry ID and the current or clarified purpose:

```sh
.governance/runtime/bin/project-governance context-route --entry <entry-id> --expansion 1 --task "<current purpose>" --revision 1 --optional-path src/example.ts
.governance/runtime/bin/project-governance context-route --entry <entry-id> --expansion 2 --task "<current purpose>" --revision 1 --links docs/example.md
```

An optional path fetches an original; `--links` asks for one hop of declared links. Expansion requires
the same observed host session and worktree, and step 2 follows a completed step 1. It shares the
initial entry's allowance. Missing credentials or an exhausted family still permits local routing
and deliberate original reads; neither condition widens hosted disclosure.

## Keep continuity history separate

The source index belongs to one worktree. The existing continuity database in the Git common
directory may be shared by linked worktrees and remains the owner of task history and bindings.
The prompt path reads at most 32 recent task references and includes at most three local summaries
within 2 KiB. These are historical background and source hints, not current source or policy.
History prose stays local and is not copied into the source index or sent to JEV. Rebuilding the
source index does not reset or migrate continuity history.

## Inspect actual use

```sh
.governance/runtime/bin/project-governance telemetry context status
.governance/runtime/bin/project-governance telemetry decisions
```

In the context status JSON, `counts["context-observations:startup-owner-rollover"]` is the bounded
count of resumed prompt context attempts. An absent key means no rollover receipts were counted;
the count does not prove model use.

Prompt receipts live outside the checkout under the existing context state root. They record prompt
digest/length, binding, catalog coverage, decision links, actual packet bytes and source references.
They do not retain raw prompts or source bodies. Early parsing/configuration failures have receipts,
even when no JEV request could be made. A prepared hook packet remains unconfirmed model use.

When the host supplies a transcript path at `SessionEnd`, the adapter can import matching usage from
a bounded tail and a per-session entry index. This work stays off the prompt's critical path.
The versioned Codex adapter matches thread/root-turn/response identities and reads
incremental `usage`, never cumulative turn/thread totals. Raw transcript text is discarded. Missing
native records or an unsupported format stays unknown. An explicit import is also available:

```sh
.governance/runtime/bin/project-governance telemetry context import --entry <id> --transcript <absolute native transcript>
.governance/runtime/bin/project-governance telemetry context expansion --entry <id> --path src/example.ts
.governance/runtime/bin/project-governance telemetry context outcome --entry <id> --disposition accepted --evidence <receipt-reference>
```

Use `reopened` when an accepted result needs more work. Expansion/outcome observations are labelled
host-reported. They are not inferred from a check or classifier. Imports deduplicate response IDs;
cached input and reasoning remain subsets of their respective totals. Counts over a bounded window
are known subtotals, not a claim of complete usage or savings. Compare similar accepted work,
additional reads and rework before promoting optional selection.

## Improve documentation without a repository-wide rewrite

For behavior being changed, document its purpose, public contract and important constraints at the
owning source or reference. Prefer one useful module overview with links to code, tests and guides.
The existing `docs init --dry-run` / `docs init` workflow creates a neutral entry and capability
catalog when requested; it preserves existing authored files. The runtime index is a disposable view
of current sources, not a second prose knowledge base or an authority for project standards.

Run existing comment and documentation checks for the changed work. Selected Markdown needs a
non-empty title and summary when selected through a compared or explicit path scope. All-files
inventories retain existing checks but do not apply that new description rule without change provenance.
New/touched declarations are enforced where the configured analyzer
supports them; older debt remains advisory under the default `report-existing-enforce-touched` mode.
Doctor reports configured mode and adapter coverage, not successful pack execution. Confirm actual
stage selection with `plan`. Python and Kotlin currently have active analyzers; the other declared
languages, including TypeScript, are advisory. RC6 does not invent a parser to claim equal enforcement.

The source index records literal overview clues separately from symbols/headings. Context telemetry
and doctor show repeated `overview-not-observed` candidates with source digests, observation counts
and entry references. No source prose is copied into this report. These are historical partial
observations: unread or unapproved files remain unknown, and a module guide may already explain a
flagged file. Revalidate current source and inspect the module guide before adding a description.
Prioritize touched areas and repeated packet expansions; leave unrelated legacy debt for later.
No extra provider call, background rewrite, new debt database or new approval gate is introduced.
