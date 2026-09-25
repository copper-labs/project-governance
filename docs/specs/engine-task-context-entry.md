---
id: spec.engine-task-context-entry
title: Task Context Through Ordinary Entry Points
type: spec
status: current
owner: project-governance
created: 2026-09-22
updated: 2026-09-25
summary: Reuses session-bound continuity intent and bounded discovery for ordinary context and check delivery.
---

# Task context through ordinary entry points

Status: accepted corrective design; implementation and qualification tracked in the
[delivery plan](../exec-plans/active/2026-09-22-task-context-entry.md).
This extends [RC4 decision delivery](engine-decision-rc4.md), not its authority or model policy.
The [RC6 extension](engine-rc6-linked-retrieval.md) adds prompt-time provisional entry and metadata
selection through these same owners, with a maintained current-source projection and bounded expansion.
The [guide](../guides/rc6-prompt-context.md) defines opt-in and
qualification. A qualified prompt packet precedes deliberate task creation; it is not an accepted task.

## Problem and intended behavior

A working provider and enabled flags do not establish useful adoption. Ordinary commands currently
lose task intent unless a caller repeatedly supplies a context file. Context selection requires
extra candidate flags. Missing document routes and narrow installation-only sharing declarations
then prevent delivery before the main model reads. These are integration defects, not evidence that
semantic selection lacks value.

At task entry the host records the goal, acceptance criteria and relevant source scope once through
`harness task create`. A known host session is bound to that task in the existing SQLite continuity
store. `context-route` then returns required guidance and a bounded optional source packet without
requiring repeated task, revision or candidate flags. Normal checks and Git hooks resolve the same
binding. Detached checks capture it at dispatch. Supported provider submissions use the same packet.

The main model still diagnoses and edits. Code owns identity, source capture, permissions, required
context, check selection, execution and cleanup. JEV only ranks approved optional evidence. The
coding model remains fixed by default. No new scheduler, task database, vector index or executor is
introduced.

## One task owner and resolution protocol

The existing continuity `Task`, `Attempt`, workspace locator and `(session, workspace)` binding are
the owners. Read resolution must not create a database, migrate it, register a workspace, change a
binding, or choose the most recent task. The filesystem workspace locator and canonical worktree
must agree with the recorded attempt. Only an open task at the attempt's recorded version qualifies.
A changed task needs an explicit resume, or a revision performed by that same bound session.

Resolution order is explicit validated context (argument/request), explicit context file or inherited
`GOVERNANCE_DECISION_CONTEXT`, then the current continuity binding. Existing `HARNESS_SESSION` and
`CODEX_THREAD_ID` identity are supported by the continuity owner. A host without inherited identity
must launch with `HARNESS_SESSION` set and create/resume the task under that identity. A startup child
cannot set its parent's environment; installing a startup hook alone does not qualify this path.
Do not guess a session from process IDs, directories, last activity, or another agent's task.

Projection uses task ID, task version as decision revision, outcome as requirement, live acceptance
items, and project-relative scope paths. Root-wide or empty scope preserves required routing from
captured changed paths; RC6 can select safe local optional metadata from the workspace without
granting hosted disclosure. Revoked paths do not remain explicit priorities. Paths outside the worktree, excessive context, unavailable store,
closed task, stale attempt or missing identity produce a named unavailable result. Inferred context
failure does not block native checks. Explicit malformed context or conflicting explicit identity is
an input error. A decision binding does not confer action authority or replace an Apple approval ID.

Normal check preparation freezes the projection into the existing dispatch record; completion and
output selection never rediscover whichever task is current later. Provider submission identity covers
the caller's original request. New jobs then capture resolved intent. Replays first validate that request
and policy identity and retain their original captured task, including an absent task; a later ambient
binding or context-file change cannot retarget or relaunch them. A new assignment uses a new job ID.
Workflow execution retains its existing explicit authorized
task/action binding; observation reads that binding, not an ambient session override.

## Context before reading

The normal `context-route` entry accepts omitted task/revision when resolution succeeds. Explicit
values remain supported and must agree with a bound decision identity. An explicit task description
can narrow the retrieval query without changing the stored requirement used by task advice. A check's
`--decision-purpose` adds focus to the bound requirement; it never replaces it or invalidates the check.

The compiled runtime owns one short managed block in each supported host instruction file. It tells
the top-level development agent to bind once and route before task-specific source or documentation
reads, then expand from original references when the packet is incomplete. Host files retain their
authored project policy outside that block; they must not duplicate the route table or force a broad
index read before routing. A provider-specific wrapper may point to the shared block, but cannot
silently make a separate task-entry rule. This instruction is guidance, not proof of execution.
The ordinary development path keeps the current coding agent and fixed host model. Delegation is
exceptional: an operator request or an existing project-owned required review must call for it.
JEV context or category advice cannot itself create a child agent or authorize a second model.
Governed provider admission controls covered submissions; unrestricted host-native delegation remains
outside that claim until the adopter configures and qualifies its host controls.

1. Capture one validation subject, including non-ignored new files in worktree mode. Staged requests
   see only the index and its base. Never import unstaged drafts into a staged result.
2. Route from explicit relevant paths, otherwise task scope, otherwise the existing changed-path
   baseline for an unbound explicit request. Root/empty scope uses that baseline only for required
   guidance and records `bound-task-empty-scope`. Specific scope does not inherit unrelated dirty paths.
3. Combine required documents, skills and validations for every route matched by relevant paths.
   Equal scores on distinct explicit path owners are a multi-owner request, not an ambiguity. Pure
   prompt-only ties remain ambiguous. De-duplicate required material. Use the largest declared budget
   in each category across the selected and path-matched owners, within the existing global ceiling;
   never add budgets together or depend on route-name order. Report remaining required overflow.
   Overlapping paths declare joint owners, so an adopter must not model mutually exclusive alternatives
   with overlapping required path rules.
4. For the legacy body-selection path, query captured paths under the specific task scopes; exact files need no repository-wide inventory.
   Preserve all matching paths for required route/skill applicability. Rank optional path metadata
   before the source-inspection cap: exact files first, then changed paths, then paths whose names
   match task terms, then the prior inventory order. Term overlap is a cheap path-only prefilter;
   the existing lexical source ranking and JEV advice still work on captured content. Record bounded
   per-path match counts, priority flags and admission dispositions, without copying task prose.
   The 128-path preview reserves room for the leading ranked paths, all seeded paths and related
   discoveries; full inventory counts remain available when a large scope exceeds the preview.
   Inspect at most 256 source paths and seed at most 32,
   bounded further by the configured candidate limit. Reuse metadata discovery for related documents,
   manifests and tests. This prefix is a cheap filter, not a semantic guarantee; omitted counts and unavailable inventory
   or discovery remain visible. An inventory failure retains scope references but blocks required-context
   readiness with `context-inventory-unavailable`; directory owners cannot be inferred safely without it.
   A prospective path can match an owner before the file exists; a route match is not source-existence
   proof. If changed files fill the candidate cap, an unchanged task-named file can still be missed;
   narrow the task scope or name an exact file when that happens. Explicit discovery remains in the receipt's `discovery`; automatic discovery is under
   `selection.automatic.discovery`. This legacy relevance prefix does not apply to the RC6 metadata
   discovery path: the RC6 contract independently retains the complete permitted inventory before
   semantic assessment and exposes bounded continuation. Required route applicability remains here.
5. RC6 automatic local candidates use safe ordinary text paths independently of hosted sharing. Exclude
   required files, duplicates, unsafe paths and unavailable/oversized/binary candidates before calling
   a provider. Record exclusions and inventory limits. Explicit optional candidates keep their strict
   validation and existing sharing fallback; automatic discovery cannot broaden hosted sharing permission.
   Explicitly scoped ordinary task files remain available in the deterministic packet even when
   classifier sharing is off. Manually supplied optional flags take priority, then scoped files, then
   automatic additions within the 64-input bound. The legacy classifier assesses at most the first
   `min(max_candidates, 63)` approved files in that order, reserving one evidence slot for the task
   purpose; source-excerpt DL03 observes the same evidence-item ceiling. RC6's opt-in metadata
   question instead traverses the complete approved inventory in bounded batches before source capture,
   with shared purpose, permissioned literal descriptors, explicit partial coverage and continuation
   under the [RC6 contract](engine-rc6-linked-retrieval.md). It has no 126-path/two-batch relevance cap.
   Raw source files and historical summaries are not hosted by that metadata question. All other files keep their
   deterministic delivery slots. The legacy decision receipt records which candidate IDs were not
   assessed because of sharing scope, count limit or an unrepresentable excerpt, and the provider
   sees the omitted count. Unreadable task-derived files produce recorded exclusions; malformed
   manually supplied optional files remain input errors. Path length, sharing exclusion and source
   availability have distinct reasons.
6. Use existing excerpt selection and DL03 with configured limits, deadline, health and per-task
   budgets. No credential, low confidence, budget exhaustion or provider error uses the deterministic
   packet. Missing required context never calls JEV. Original references, digests and excerpt ranges
   remain available. Classifier excerpts and delivered excerpts are separately bounded from the original
   captured source. The task-bound `context-route` entry applies a 2 KiB default delivery excerpt
   limit to every optional file, whether named, task-declared or discovered; an explicit byte limit
   may override it up to 64 KiB. This changes `context-route` delivery for previously named large
   optional files; `selection.optionalClippedPaths` identifies delivered excerpts in the packet and
   receipt. Whole-line excerpts prefer nonblank content on equal task relevance.
   A single line that cannot fit, or a nonblank file with no informative whole-line excerpt, is
   omitted with a visible reason.
   Operators needing a full large file can follow its original reference or use the separate
   explicit `context` command, whose default whole-file delivery is unchanged. A smaller
   classification allowance cannot invalidate an already clipped delivery excerpt. Revalidate every
   captured candidate, including those omitted, before delivery.
   Lexical fallback ranks the original captured text of assessable candidates, independently of the
   delivery excerpt size. Blank optional files can still be delivered but do not enter model advice.
   Unrepresentable sources do not enter the optional ranking request, so one cannot suppress advice
   for other candidates. A candidate whose whole lines cannot fit the classifier allowance also drops
   out of model advice without suppressing its peers. Legacy advice submits only approved source paths
   and keeps unapproved or classifier-unassessable paths in their lexical delivery slots. Under a tight
   delivery budget, an earlier unapproved slot can crowd out an approved model pick; record this as a
   selection limit when evaluating actual tasks rather than silently moving unapproved evidence.
   An explicitly named path still fails if its source cannot be captured;
   captured text that cannot be excerpted is omitted with a reason in the returned packet and receipt.

Binding diagnostics distinguish missing session/store/workspace, stale version, non-open task,
incompatible store schema, requirement/acceptance/scope/path limits and scope outside the workspace.
An unsupported read-only schema is not migrated by observation; an explicit continuity command owns
any supported migration. Oversized task intent needs a smaller projection rather than silent truncation.

No successful selection is claimed when routing is blocked, binding is missing, scope is empty,
sharing excludes all candidates, or the packet has no optional material. Those states are visible
alongside provider and delivery status. A task can validly need no optional candidates.

## Exposure and measurement

Route receipts record resolution source/status, task ID/version when available, attempted automatic
candidate count, exclusions, selected/omitted sources, provider reason, optional delivery status and
provider receipt. Record
an entry exposure linked to the route receipt and decision receipts. Check exposure carries binding
status; detached results use their captured status. Content stays in existing local source/task
owners; telemetry carries hashes, identities and reasons, not duplicated task prose or source text.

Prepared/delivered bytes are observable; whether a model read them, subsequent manual reads, accepted
outcome and total model tokens remain unknown unless the host supplies matching observations. A
provider call is not a saving. Qualification and installation calls remain separate from ordinary
accepted development tasks.

Installation doctor compares the owned host block with the executing runtime without editing it or
interpreting authored prose. The normal installed launcher executes the selected generation. During
an interrupted activation, a candidate or older direct executable can report host-instruction drift
against its own block while the registry selects a different generation; the lock/selection findings
must be considered with that verdict. Decision doctor reports configuration eligibility. Neither can
establish that a top-level agent actually routed first. Compare ordinary task-binding, route and check receipts;
mark missing route evidence as unknown use, not a successful JEV exposure. A future native host-entry
adapter may deliver the route packet before the agent's first task read, but it must reuse the same
task, route and receipt owners rather than infer a task from a hook or add another router.

## Adopter correction and rollout

The adopter owns routes and sharing permissions. Add concise owner briefs and coverage for design,
reference documentation, specifications and plans. Test mixed documentation/source tasks. Expand
installation-only permissions to reviewed source/documentation patterns; exclude customer data,
secrets, assets and generated evidence. Preserve the fixed model and bounded DL03 activation.

Do not edit a pinned RC's installed code. Configuration compatible with RC4 may be corrected in place.
New runtime behavior requires a separately qualified immutable release and deliberate adoption. A
real assigned development task must exercise task entry, packet delivery and subsequent checks under
the installed candidate before claiming ordinary-task integration. Until then report source/package
qualification separately. Remote publication and host task acceptance retain their existing owners.

## Required focused proof

- Bound session once: ordinary route, check preparation, Git-hook subprocess and detached completion
  receive the same task/version without repeated decision flags.
- Isolation: another session, another worktree, missing host identity, closed/revised task and stale
  binding cannot select someone else's intent. Resolution does not create or mutate a store.
- Routing: design/reference/spec/plan cases and mixed source/document owners preserve required files.
- Capture: new drafts appear only in the appropriate worktree subject; stale/unsafe/binary/oversized
  sources and undeclared sharing are rejected or visibly omitted before model transmission.
- Selection: active fake-provider ordering reaches the returned packet; provider-free, uncertainty,
  deadline and budget fallbacks preserve required evidence and original references. Large explicit
  inputs remain deliverable as bounded excerpts. A broad scope can admit a task-named late path before
  the candidate cap. Contract tests use a fake provider; bounded live-provider trials separately
  establish actual transport, assessed coverage and delivered source references without claiming
  accepted-work or token savings.
- One integrated engine/continuity/typecheck and installed-package checkpoint after the coherent
  hook/selection batch, followed by Opus 5 extra-high architecture review and reconciliation.
- Host entries: installation preserves authored text while updating the one managed block; doctor
  detects a missing/stale block without writing; a conforming block still does not count as observed
  ordinary-task use.
