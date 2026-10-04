---
id: guide.rc6-prompt-context
title: Configure and Observe Prompt Context
type: guide
status: current
owner: project-governance
created: 2026-09-25
updated: 2026-10-04
summary: Enable prompt delivery and optional metadata selection, then inspect actual usage without inferring savings.
---

# Configure and observe prompt context

## Implementation status

The runtime implements native prompt entry, a maintained per-worktree SQLite source index, basic
source-backed relationships and bounded metadata selection with two entry-linked expansions.
The [RC10 contract](../specs/engine-rc10-context-use.md) adds compact assessment, validated packet
reuse, optional project procedures and recent telemetry. This guide does not establish host trust,
first-read order, accepted work or measured savings. The
[RC10 plan](../exec-plans/active/2026-09-29-rc10-context-use.md) tracks candidate qualification and adoption.

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

For linked Git worktrees, Codex loads project hook definitions from the main checkout. Updating
only the linked hook file cannot repair an obsolete definition there. RC8's
[shared-source contract](../specs/engine-rc8-hook-sources.md) adds `promptHookSource` to context
doctor and a read-only source dependency to migration plans. A missing or conflicting main source
blocks a linked installation before mutation; repair the main checkout through its backed
installer at a coordinated seam, then finish each active worktree's own installation. The
definition is shared; runtime selection and startup receipts remain local to each tree.

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
packet. RC8 uses an explicitly declared route total for native delivery, including framing
and skills. Profiles without an explicit total retain the 24,000-byte native limit; RC6/RC7 imposed
that limit even when the profile declared more. Without that host setting, Codex can replace a large packet with a preview, hiding
required material. Doctor reports this configuration gap. Reconcile an exact older managed handler
through the backed installation and review its changed hash in the host; customized handlers still
need deliberate reconciliation. See [Codex's hook-output contract](https://learn.chatgpt.com/docs/hooks#large-hook-output).

RC8 context doctor checks required bytes for declared routes, pairs of owners and the combined
path owners. Its report names overflows and remaining bytes, missing guidance and any inspection
bound reached. Unchecked larger owner subsets produce a partial-readiness finding, even when sampled
combinations fit. Task-dependent skills and the actual route are still checked at use.
Review an overflowing route's requirements and budget; keep mandatory meaning intact. Move only
reviewed background references to expansion. Enlarging the envelope is an explicit profile choice,
not permission to claim smaller model inputs or savings.

## Inspect and refresh the source index

RC8 batches changed-file metadata capture and avoids whole-tree line-ending scans of unrelated
assets. Index freshness observation leaves time for extraction within the existing allowance.
Receipts show source capture plus index identity, freshness, cache, extraction and publication time.
Repeated bounded refreshes should extract or reuse facts while keeping every eligible path visible;
a partial index is not a claim that unexamined files are irrelevant.

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

The approved operational repair uses the same 45-second clock for preparation and selection;
extraction no longer receives a separate one-second allowance. Explicit index refresh also has
45 seconds. Unchanged facts are reused. Literal shell comments, configuration purpose fields and
key names, and Kotlin `expect`/`actual` declarations improve descriptors without generated prose.
The extractor version changes so an older empty descriptor is re-examined once.

Projection quality reports `pathOnlyReasons` with bounded examples. `no-supported-literal-clues`
means the file was read but this extractor found no supported labels. It is not automatically a
documentation defect. Binary content, oversized files, extraction failures and deadline deferrals
remain separate causes. A verified unchanged oversized blob is not repeatedly read; an edited or
smaller file is re-examined. Every eligible path remains available to selection.

Maintenance happens before a fresh context selection or through explicit `context-index refresh`;
there is no background watcher. An already-delivered packet remains a captured snapshot. Replay
and provider dispatch revalidate its selected sources and policy, and reject stale input. The local
catalog is cached, but a new prompt ordinarily asks JEV to assess relevance again. Each worktree
has its own disposable index, so another branch cannot replace its facts.

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
    evidence_bytes: 16384
    max_candidates: 64
    budget:
      max_calls: 512
      max_request_bytes: 10485760
    consumers:
      DL03:
        mode: auto
        questions: [context.metadata-relevance/1, context.passage-evidence/1, context.passage-role/1]
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

The example deliberately enables both metadata and passage selection. Metadata assesses files;
the two passage questions assess relevant sections inside the captured source window. Upgrading
preserves an existing project's explicit questions and allowances. Context doctor warns when source
sharing is approved but passage selection remains disabled; this warning does not grant consent.

The approved operational repair adds a neutral Codex `Stop` observer to collect supported native
response usage at each turn's end. `SessionEnd` remains a catch-up path. Exact session, turn and
response identities prevent cross-task attribution and duplicate counting. The observer never accepts
a task, continues the turn, discovers updates or changes startup ownership. Unsupported transcripts,
unobserved extra reads and task acceptance remain unknown. Review the changed managed hook hash in
Codex after adopting it. See [the host Stop contract](https://learn.chatgpt.com/docs/hooks#stop).

The catalog keeps the complete eligible inventory. Through RC8, JEV visits it in batches of up to
63 questions through the serialized provider-health owner. The accepted RC9 changes are described
in [the next-release section below](#rc9-planned-selection-changes); they are not active in RC8.
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

The source capacity amendment uses 512 calls and 10 MiB for isolated context metadata/passage scopes
when a budget is omitted. Ordinary task consumers retain 16 calls and 128 KiB. The settings owner supports
explicit allowances up to 1,024 calls and 16 MiB. This fragment targets that next source candidate;
older published runtimes retain their earlier ceilings. Existing explicit budgets are preserved
and need a deliberate profile edit if they remain too small. Use preflight and actual coverage to
check whether the complete permitted catalog and approved passage work fit.

The example budget is an experiment allowance, not a claim that every repository fits. A native
prompt entry and up to two requested expansions share one metadata allowance keyed to the entry ID.
Calls and bytes already spent remain spent when the purpose changes or a provisional entry gains a
task binding. An exact duplicate can replay a retained answer within the original lifetime.
A newer root turn, the completed second expansion, or 15 minutes closes the family to new calls.
Missing-token or off-mode entry uses local fallback without allocating paid-family accounting.
This allowance cannot spend review/CI capacity or the ordinary active-scope pool.
Both pools retain the shared 8 MiB budget-store file capacity; that is not a request-byte allowance.
Inspect actual coverage and budget receipts before changing these limits. Context preparation,
selection and delivery use one 45-second operation with a 55-second managed host envelope under
the capacity amendment. There is no per-request context
timeout. Overall cutoff does not trigger provider cooldown; a provider's own timeout still does.
The native prompt path runs the enabled metadata and passage questions. Workflow advice remains
on its deliberate command path. No provider is required for local routing.

The adapter adds bound intent to short follow-ups. It does not invent acceptance criteria, reopen a
closed task, or use the last task from another session. The operator/agent still deliberately creates
or resumes the continuity task when intent and scope are clear. Checks retain that same binding.

## RC9 planned selection changes

The accepted [RC9 specification](../specs/engine-rc9-parallel-context.md) and
[implementation plan](../exec-plans/active/2026-09-27-rc9-parallel-context.md) replace the separate
3.5-second selection cutoff with one 30-second total retrieval budget. Preparation and waiting
count toward it, with the last 500 ms reserved for delivery/cleanup. Managed prompt hooks allow
40 seconds so the host can start and return the bounded operation. Opt-in passage judgment shares
the single operation clock and the existing call/byte allowance.

JEV will receive fuller metadata batches where existing byte limits permit them, with at most
four requests in flight through one local pool shared across worktrees. Rate pacing and brief
admission transactions replace the network-long lock. Existing profile disclosure and task/family
spending limits remain; installing RC9 will not authorize more source sharing or model delegation.
RC9 also repairs multiline/lifecycle metadata, supported path coverage, complete current-prompt
handling, optional relevance ordering and useful section delivery. Frozen scenarios from three
different repository shapes will compare RC8, provider-free RC9 and live-JEV RC9. Sharing exclusions
remain visible, and expected answers stay outside the provider input. A smaller packet is useful
only when it still delivers the evidence needed for the task.
The implementation and live comparison are pending. Do not change an RC8 timeout alone and call
that the parallel selection repair. Coordinated adoption must include the effective shared hook
source, each selected worktree's launcher and ordinary prompt receipts.

To opt in to RC9 passage judgment, preserve existing DL03 questions and add
`context.passage-evidence/1` and `context.passage-role/1` beside
`context.metadata-relevance/1`. This sends bounded source passages from approved paths after
metadata selection. It does not send whole files. Known test, implementation and documentation
roles come from paths; JEV only classifies the role where that remains unknown. A positive answer
can change optional passage delivery. Missing credentials, uncertainty or an exhausted allowance
retains local excerpts and references to the originals. Existing profiles do not gain these questions
merely by upgrading.

## Continue a native prompt entry

The Codex prompt hook creates the initial entry automatically and gives its entry ID in the packet.
It also names the actual execution checkout and worktree locator. Shared hook definitions may come
from the main checkout; that does not make the main checkout the execution target. Align the chat
with the intended existing worktree before work. Missing local entries do not authorize a sibling lookup.

Read an unchanged packet under the same session with:

```sh
.governance/runtime/bin/project-governance context-route --entry <entry-id>
```

This revalidates the newest local entry, binding, configuration and captured sources without a new
selection or provider call. It returns the served turn and age. A bare `context-route` cannot know
which native turn you mean and returns `entry-turn-unobserved`; supply the hook's reference. An
explicit reference is declared reuse, not independent evidence of the current native turn. A stale
or superseded entry has a named reason and supported refresh action; no automatic paid retry occurs.
RC10.9 distinguishes an incorrectly supplied reference from a malformed stored identity and points
to a safe failure receipt. Copy the concrete entry ID from the packet; do not infer another turn.

RC10.2 returns selected evidence and compact status by default. Add `--json` to the same command
when full index and selection diagnostics are needed. The normal result includes the retained
receipt path, original source references and omissions; it does not repeat repository-wide facts.

For a fresh project, distinguish installation from live JEV readiness. `doctor --capability decisions`
reports eligibility separately from observed current-configuration provider health. An enabled token
with no recorded successful call remains unobserved. A billing failure names unavailable API credit;
restore the funded account rather than increasing a timeout. Doctor remains passive.

As project records, source or local skills are created, inspect `doctor --capability context` and its
`scopeCoverage` counts and missing-path previews. Explicitly review intended paths in both
`allowed_metadata_paths` and `allowed_source_paths`; the installer cannot approve future directories
automatically. Intentional restrictions remain valid, and generated `_local` evidence is excluded.

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

## Deliver project procedures

Opt in by listing existing project-owned Markdown guides in the router. Preserve all existing routes
and questions when editing the profile:

```yaml
context_router:
  # Same ordinary file slot as the manual command; total route limits still apply.
  optional_excerpt_bytes: 8192
  procedure_sources:
    - docs/guides/local-development.md
continuity:
  decisions:
    consumers:
      DL03:
        questions:
          - context.metadata-relevance/1
          - context.passage-evidence/1
          - context.passage-role/1
```

This fragment is an addition, not a complete profile or permission grant. Explicitly approve the
document through the existing `source` data class and `allowed_source_paths`; metadata selection
also needs its existing metadata class and paths. Source permission allows both extracted descriptions
and passage bodies for those paths. Passage questions must be enabled separately. Doctor shows
the effective settings and their limits without probing the provider.

The existing passage queue assesses complete parent sections independently of file relevance. Nested
steps stay with their parent, and shared introductory prerequisites accompany delivered sections.
Answered scores order bounded quotes and sections; they are uncalibrated advice. Required and
explicitly pinned material stays first. Source units retain original range order for tied scores.
Optional delivery gives each file its first useful unit before adding more from the same file.
Further evidence is added in rounds across files, before ordinary background. Confirmed source units
can use remaining space in the same declared packet; no extra budget is created. Previously delivered
ranges survive every extension, and incomplete added units remain visibly partial.
Omitted positive sections are named. An unconfirmed section too large for ordinary delivery keeps
its strongest section as an explicitly partial quote and retains its original reference; smaller,
weaker sections cannot substitute for it. Sections too large even for classification remain
reference-only. A quoted guide
does not authorize commands, waive checks or override instructions. Without JEV, declared originals
remain available as references and required rules remain intact.

File descriptions and passage bodies have different jobs. Description scores rank what to inspect
next. Positive ranks precede uncertain ranks; uncertain ranks precede local background. Those scores
do not establish body evidence. Receipts retain confidence counts and an uncertain preview. The
passage stage checks the actual source and uses its answered scores to choose quotes next, balancing
supported source/test roles. Uncertain quotes keep their ordinary limit and visible label. Shadow or
unavailable advice keeps the local order.

Metadata, passage assessment and delivery share one 45-second operation envelope, with a 55-second
managed host timeout to return fallback and settle ownership. There is no per-request timeout.
Provider admission still enforces the shared rate/concurrency limits. Verified measured input usage
settles a conservative rate estimate; unknown usage remains reserved. Paid family calls and bytes
are never refunded by this settlement.

RC10's compact metadata payload carries the full current request and all approved distinguishing
facts with less repeated framing. Coverage distinguishes cached, permitted, submitted and answered
descriptors from path-only answers. The index retains up to 32 MiB of facts in its existing 64 MiB
SQLite envelope; an extractor version change revisits earlier capacity omissions. Cold preparation
may still need bounded refreshes. A complete path count does not prove complete semantic coverage.
Classification can inspect more of a captured unit than the small excerpt sent to the coding
model, within existing disclosure and evidence limits. Preparation uses remaining family capacity,
with no separate 256-unit cutoff. Native delivery uses the declared route envelope, with no extra
8 KiB optional ceiling. Larger declared envelopes do not establish better outcomes or token savings.

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

For a deliberate read from another repository, keep the source path relative to that repository:

```sh
project-governance telemetry context expansion --entry <id> --source-workspace <absolute-Git-root> --path docs/example.md
```

The command verifies the source worktree and records its locator and current file digest, without
retaining the body or permitting JEV to inspect it. Local and external read counts remain separate.
Record only a read that actually happened; this observation is not inferred evidence of model use.

RC10 reads recent context/decision metrics through the existing bounded SQLite telemetry projection,
filtering workspace, runtime and time before limiting results. It retains at most 1,000 compact context
records and 1 MiB of payloads per worktree, separately from operational receipts. Status reports
eviction and unknown write coverage. If that projection is unavailable, a bounded receipt scan is
labelled partial when it cannot prove globally newest coverage. Missing evidence is unknown usage,
not zero usage. Doctor links the latest retained native entry and route rather than re-evaluating them.

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

For large repositories, review the existing `max_candidates` setting as well as the full-index
allowance. It controls captured file bodies after metadata assessment; its legacy default is 16.
A fully approved large-repository pilot can use 64. Doctor reports the effective window. Complete
metadata coverage does not mean every file body was captured or every section was delivered.
Answered uncertain section scores can improve ordering within a file, with explicit uncertainty,
source checks and the ordinary excerpt allowance. They do not authorize execution or acceptance.

`optional_excerpt_bytes` applies to normal native prompts as well as shell refreshes. It accepts
128–65,536 bytes; omitting it retains the existing 3,072-byte passage or 2,048-byte inactive default.
Larger slots trade breadth for fuller source. Review the route's expansion/total envelope alongside
the slot. The release's large-repository library regressions use 64 candidates, 8 KiB slots and
48,000 optional packet bytes; smaller profiles still have recorded misses. This is retrieval proof,
separate from installed synthetic-hook proof and accepted-task outcomes.

When a relevant test literally imports an already captured implementation, packet fitting can keep
the two beside each other. Both source hashes and non-negative advice must still match. This does
not capture new files, turn uncertainty into confirmation, enlarge slots or override required rules.
