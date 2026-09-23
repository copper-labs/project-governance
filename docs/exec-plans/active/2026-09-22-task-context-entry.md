---
id: plan.task-context-entry
title: Ordinary Task Context and Selection Adoption
type: exec-plan
status: active
owner: project-governance
created: 2026-09-22
updated: 2026-09-22
summary: Implements and qualifies the post-RC4 task binding and context selection integration repair.
---

# Ordinary task context and selection adoption

Owner: corrective batch of the [major adoption programme](2026-09-21-major-adoption-and-measurement.md).
Contract: [task context entry](../../specs/engine-task-context-entry.md).
Status: implementation, local qualification and Opus 5 extra-high recheck complete.
RC5 release qualification is in progress; installed adoption remains a separate gate.

## Scope and acceptance

Repair normal task binding and context delivery so enabled optional decisions are actually reachable
before reading source. Keep deterministic enforcement, fast provider-free fallback, fixed models and
existing task/receipt owners. Adopter identities, snapshots and review evidence stay outside this repo.
Do not claim deployment or token savings from source tests. Preserve concurrent adopter edits.

## Priority and implementation slices

### C1 — Reuse continuity identity

- [x] Add read-only workspace lookup to the existing SQLite store; no schema or database migration.
- [x] Project an open, same-version, same-worktree task into the existing decision-context type.
- [x] Resolve explicit input before inherited session binding, with bounded fields and named fallback.
- [x] Connect ordinary plan/check preparation and provider submission. Freeze detached identities.
- [x] Keep explicit workflow authorization and approval IDs unchanged. Document native session
  inheritance and a portable `HARNESS_SESSION` host launch; no generic ungoverned child launcher.
- [x] Qualify session/worktree isolation, stale/closed tasks, explicit conflicts and read-only behavior.

### C2 — Deliver useful context automatically

- [x] Use resolved task intent and scope when ordinary context-route flags are omitted.
- [x] Preserve all path-matched mandatory route owners for mixed work; retain prompt ambiguity handling.
- [x] Reuse captured-path inventory and discovery; bound, filter and record automatic candidates before
  selection. Include appropriate new drafts without reading unrelated dirty work.
- [x] Reuse packet excerpts, model interface, no-token fallback and source revalidation.
- [x] Link route entry exposure and binding/candidate readiness to existing telemetry.
- [x] Qualify automatic delivery, privacy bounds, required-context preservation and fallback.

### C3 — Repair the adopter configuration

- [x] Recheck active worktree identity, dirty files and ownership before narrow edits.
- [x] Add missing design/reference/spec/plan routes and concise owner guidance; repair reviewed sharing
  patterns. Keep model routing off and existing required gates intact.
- [x] Replay the observed routing misses and a mixed source/docs case without provider calls or builds.
- [x] Document exact current-RC usage and the future task-once path. Do not patch installed RC4 or
  bind/alter another agent's active task. Preserve an external configuration handoff and receipts.

### C4 — Integrated proof and review

- [x] Run affected focused suites through development; run engine/continuity/typechecks once at this
  batch boundary. Run the existing installed-package decision pilot because selection/hooks changed.
- [x] Freeze the review diff and evidence. Ask Claude Opus 5 at extra-high effort for architectural
  review of identity, boundaries, capture, fallback, telemetry, rollout and unnecessary complexity.
- [x] Reconcile substantive findings and recheck affected proof/review. Record remaining limitations.
- [x] Finish the source/configuration handoff with release/adoption prerequisites. Live ordinary-task
  acceptance belongs to the subsequent immutable-release adoption; do not manufacture a task or
  count an installation probe as accepted-work benefit.

### C5 — Live selection qualification

- [x] Exercise task-bound routing on isolated, representative source/document corpora with live JEV,
  a repeated request, and missing-token fallback. Check candidate assessment, selected source
  references, required context, native-input preparation and normal check binding.
- [x] Repair explicit optional inputs disabling default delivery excerpts. Keep original captures
  available to the classifier; use the same bounded delivery default for every optional source.
  Omit unrepresentable single-line sources with a receipt reason rather than delivering them whole.
- [x] Record the `context-route` behavior cutover: explicitly named large optional files now use the
  same 2 KiB default excerpt as automatic files, can request at most 64 KiB, and report clipped
  delivered paths in the packet and receipt. The separate `context` command still defaults to whole files.
- [x] Repair observed broad-scope candidate starvation when changed files leave room under the cap:
  score captured path names against task terms before source inspection, while keeping exact and
  changed paths ahead of term matches, permission filtering and mandatory route owners deterministic.
- [x] Replay a read-only, live-provider adopter-shaped document task and a broad-scope task against
  current source code. Keep provider receipts and host evidence outside this repository. These are
  local qualifications, not installed-release or accepted-development proof.
- [x] Complete focused regressions, full selection-contract proof and installed-package proof after
  the corrections. Inspect the final diff and retain the external evidence summary.

### C6 — Host entry and adoption visibility

- [x] Keep the managed host instruction block brief and explicit: bind once, route before task-specific
  source or documentation reads, then expand when the packet is incomplete. Preserve project-authored
  instructions and avoid a second route table in the host file. State that the normal path is one
  coding agent on its fixed host model; operator-requested or project-required review is the exception.
- [x] Add a read-only installation-doctor finding for a missing or stale managed block. Do not scan
  authored prose for semantic conflicts or claim that a passing doctor proves task-entry use.
- [ ] At immutable adoption, reconcile each adopter's authored start instructions with the managed
  block, inspect ordinary task/route receipts, and qualify host controls for any claim that native
  ungoverned delegation is blocked. Do not edit active adopter worktrees in this batch.
- [ ] If ordinary tasks still bypass routing, design a native host-entry delivery adapter that reuses
  the existing binding, selector and telemetry owners. Do not infer tasks from startup hooks.

### C7 — RC5 candidate and publication

- [x] Freeze the RC5 package identity, release notes and source diff. Run Opus 5.5 at medium effort
  against that exact candidate; reconcile substantive findings and recheck affected proof.
- [x] Run the release-equivalent engine, continuity, Python-wheel, TypeScript and installed-archive
  checks, plus the source governance signoff, on the final candidate.
- [ ] Commit and tag one immutable RC5 source state, publish its compiled archive and matching lock,
  and read back the public release, asset digests and source commit. Do not treat that as adopter use.

## Deferred work

No new retrieval service, global task registry, automated model cascade, task guessing, forced JEV
availability, full mobile build, device disruption test or new evaluation platform. CI request-size
optimization can follow measured evidence; do not bundle it into this binding/selection repair unless
it prevents basic qualification. Public release and real development acceptance are distinct gates.

The live comparisons show useful source delivery and fast fallback, but mixed results for JEV's
incremental value. One adversarial local case improved useful-file selection; other local cases
already selected the useful file without JEV. Provider input tokens are measured separately from
native input, and no accepted-work saving is established. Candidate caps and excerpt windows remain
visible limits; a changed set that fills the cap can still exclude an unchanged task-named file.
Measure missed useful spans and later reads in adoption before claiming benefit.

## Qualification checkpoint

Engine tests: 513 passed with four concurrent test-file workers. Continuity: 73 passed. Packaging
helpers: 4 passed. Both TypeScript
checks passed. Reconciled offline installed-package proof passed, including task creation, automatic source
selection with fixture inference, no-token fallback, native checks and task identity retained after
host rebinding. The source pre-push gate has no blocking findings; comment advice remains advisory.

The installed-package fixture initially exposed its own unowned configuration changes in the
validation plan. Capture the fixture configuration before testing a source-only task; do not weaken
the planner. The corrected probe passed. New documentation metadata/index findings were repaired.
Runtime, configuration and ordinary-task acceptance are separate: current-RC route corrections are
qualified; new automatic behavior remains source/package-qualified until immutable adoption.
Mixed source/document requests remain blocked by ambiguity in installed RC4 until that adoption.

Opus 5 at extra-high effort identified root-scope regression, ambient-task replay conflicts,
route-name-dependent mixed budgets and vague binding failures. Reconciliation preserves required
routing for empty scopes, freezes replayed intent before ambient lookup, combines budget envelopes,
and emits distinct projection diagnostics. It also retains provider-free explicit source delivery,
queries scoped captured metadata, preserves every required skill path, makes revision/rebind atomic,
and separates classifier excerpts from delivery excerpts. Focused regressions cover these cases.
The reviewer rechecks closed the original blockers and the ordinary-entry fallback/inventory follow-ups.
Task-derived non-text files now produce recorded exclusions while manually flagged invalid inputs
retain their strict errors. The legacy selector's whole-request sharing fallback is documented; the
current DL03 relevance consumer assesses permitted candidates individually.

Two broad-run fixture deletions raced detached final bookkeeping. The affected recovery/timeout
fixtures now wait for their own recorded processes to exit before deleting evidence. Runtime assertions
remain intact; the final integrated run and installed package proof pass. No application build or device
session was needed for this context/identity batch.

The C5 live trial found that naming one optional file disabled delivery excerpts for all candidates:
JEV assessed the relevant large documents, but the packet delivered only shorter unrelated files.
The corrected default keeps bounded delivery with or without explicit optional paths. A separate
broad-scope trial found a task-named file outside the first 16 alphabetic candidates; task/path
metadata ranking admitted it without changing the required route or source-sharing limits. Focused
regressions, 519 engine tests, 73 continuity tests, four package-helper tests, both TypeScript checks,
compiled decision-pilot proof and an independently installed scratch-package decision pilot passed
after the single-line omission correction. The installed scratch package also passed the legacy
adapter case with an undeliverable single-line source and a blank source beside a useful source.
An earlier installed scratch package completed a live bounded provider call against a read-only host
scope and delivered the intended approved source. These are local qualifications only, not an
immutable published release or ordinary-task acceptance.

After the M1–M5 recheck, the source also prefers nonblank whole-line excerpts on ties, records
undeliverable useful evidence, retains the provider reason separately from optional delivery status,
shows discovered and admitted candidates in the bounded preview, and shares only approved legacy
source candidates with JEV while retaining unapproved baseline slots. Focused regressions and both
TypeScript checks passed. The final integrated run passed 523 engine tests, 73 continuity tests and
four packaging-helper tests. A broad-run cleanup race in an existing detached command fixture was
repaired by waiting for its own owner and guardian before deleting evidence; the focused suite and
final full run passed. Both compiled and newly installed decision pilots passed. The new installed
scratch package also passed the mixed approved/unapproved source boundary and one read-only live
JEV route with 16/16 candidates assessed and the intended source delivered. The scratch archive
is not a published RC asset and carries no adopter authorization. The direct full-index experiments
and host-specific outcomes remain in external evidence, not in this project-neutral plan.

The follow-up review found a preview cap that could hide discoveries, a repeated-event key that
ignored source approval changes, and one indivisible classifier line that could disable advice for
its peers. The corrected source retains the full bounded preview, keys an event to its approved
candidate set and policy, and drops only the unassessable classifier candidate. An unapproved file
still keeps its conservative baseline delivery slot; if the packet fits only that file, JEV's top
approved pick can remain undelivered. This is a measured selection limit to revisit with ordinary
task evidence, not a reason to expand the current local migration scope.

The final C5 tree passed 528 engine tests, 73 continuity tests, four packaging tests, both TypeScript
checks, the compiled decision pilot and an independently installed scratch-package pilot. The scratch
archive SHA256 is `eee7538eca4619a8c7f95b500586be3bff356dd7d94a9256f6393f66a0c31aae`;
it is not a published RC. That exact installed package made one read-only live JEV call, assessed
16/16 optional sources and delivered the intended source while retaining all required context.
The call was an explicit local probe with `task-store-unavailable`; it is not ordinary development
adoption. A synthetic 100,000-path candidate run took 54 ms on the local host and retained all
64 discoveries in the 128-path preview; this is not an adopter latency measurement. No main-model
token saving or accepted-work benefit is established.

The final review exposed a default-cap case where 16 automatic sources plus one explicit source
disabled legacy JEV advice. The corrected question truncates to the approved cap while preserving
the full deterministic baseline. Unrepresentable classifier lines now return their unused excerpt
budget to assessable peers. The full 128-path diagnostic preview stays in the route receipt but is
omitted from the immutable exposure episode. A synthetic 1,000-episode outcome report joined 635
full-preview episodes before the 16 MiB read bound and all 1,000 compact episodes within 6.6 MiB.
This proves the telemetry bound, not an adopter measurement. The latest integrated source run passed
531 engine tests, 73 continuity tests, four packaging tests and TypeScript typecheck; compiled and
independently installed decision pilots passed. Its scratch archive remains separate from the
published RC4. At this checkpoint, the focused Opus 5 recheck and immutable adoption were still pending.

The focused recheck closed the count-cap, exposure-size and excerpt-budget findings. It found that
the legacy classifier could report complete coverage after sharing scope, candidate count or excerpt
limits withheld sources. The current correction records the omitted candidate IDs and limit reasons
in the decision receipt and sends the omitted count to JEV. The provider still receives only approved,
bounded source text. It also clarified that installation doctor compares host instructions with the
executing runtime; a directly invoked candidate during an interrupted activation may differ from the
registry-selected generation. A frozen reviewer recheck remains open.

The corrected tree passed the focused coverage/route tests, TypeScript typecheck, the integrated
engine, continuity and packaging-helper suites, the compiled decision pilot and a separately packed,
offline-installed pilot. The pre-boundary scratch archive SHA256 was
`d1dec602ce2865eb251ecebe91d629fa857a093d8d93a3559e0f23768160a3d0`; it remains local
and carries the old `rc.4` package label only because no new immutable release has been prepared.
The final Opus recheck, release identity and ordinary adopter acceptance remained open at this checkpoint.

The legacy `legacy.context-rank/1` adapter and expanded `context.relevance/1` DL03 consumer remain
two question versions during the RC5 transition. They now both filter source paths and report
omitted candidates, but they do not produce identical rankings or excerpts: the legacy route keeps
explicit/task path order at its count cap, chooses scattered whole lines and reallocates allowance
after an unrepresentable candidate; expanded DL03 uses lexical cap order, one contiguous excerpt
window, an additional byte-derived count cap and no reallocation. Legacy asks one Choice question;
expanded asks one relevance question per file and merges those scores with the baseline. The expanded
path can therefore assess less text after a large source drops, while the legacy path has no
contiguous source range. An adopter configuration selects only one question version for DL03, so
the two owners do not answer the same task concurrently. Keep outcomes separately labeled in
receipts and comparisons. Converging or retiring the legacy version is a later deliberate cutover,
not a claim of one identical DL03 rule in this release.

Opus 5's frozen recheck closed both medium findings and accepted that transition disposition. Its
one actionable low finding was the admitted `max_candidates: 64` setting producing 65 evidence
items after adding the task purpose. Both DL03 paths now reserve that slot, assess at most 63 files
and record the final omission. The focused boundary tests, TypeScript typecheck, full 534-engine /
73-continuity / four-packaging-helper suites, compiled pilot and independently installed pilot pass.
The final local scratch archive SHA256 is
`6bdb220da4a1ab59b6af231a5eb674156853695e11d77fb922240607cc0248a6`; it is not a
published release asset. If the optional decision receipt cannot
be written, per-candidate omission detail is unavailable even when provider advice succeeds. That
telemetry loss remains nonfatal by design and must not count as complete exposure evidence.

The RC5 review used Opus 5.5 at medium effort with fallback disabled. Reconciliation made the pinned
runtime path unconditional in host guidance, included policy identity in expanded DL03 events, and
documented the explicit managed-block refresh required after upgrade. The review also found that a
larger greedy classifier window could replace useful text with blank lines, and that path-preview
labels could disagree with actual delivery. Both are corrected with focused regression proof. The
final focused rechecks closed the substantive findings. A simpler path-term prefilter and actual
host entry remain subjects for measured adoption, not reasons to add a new index or scheduler here.
The RC5 candidate passed 535 engine tests, 73 continuity tests, four packaging tests, 468 Python
runtime tests, TypeScript typecheck, a source wheel build/verification, and an offline installed
RC5 archive pilot. The source pre-commit and pre-push gates exited successfully with advisory-only
comment findings. The Python wheel remains development-version compatibility proof for an RC tag;
the published RC5 identity belongs to the bundled Node archive and its matching lock. Those exact
release assets are verified during publication. Two broad-run fixture failures
exposed a detached-process cleanup race and a 20 ms response-stage timing assumption; the focused
corrections and the final integrated suite passed. No adopter task, build or device run was part of
this candidate proof.
