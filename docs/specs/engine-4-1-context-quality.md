---
id: spec.engine-4-1-context-quality
title: 4.1 Context Quality and Ordinary-Work Evidence
type: spec
status: approved
owner: project-governance
created: 2026-10-05
updated: 2026-10-06
summary: Refines conversational context, selection quality, outcome linkage and reliable entry through existing runtime owners.
---

# 4.1 context quality and ordinary-work evidence

## Problem and intended behavior

The operator accepted four next-release priorities: useful context selection, complete outcome/cost
links, reliable initial configuration and less entry/continuation friction. Conversational requests
such as “I need an update on progress” belong in the selection-quality scope. Successful provider
calls alone do not establish useful context or cheaper accepted development.

The published baseline is 4.0.0. Its deterministic plan/specification tools, focused linting,
release evaluator and narrow default-off log pilot remain the implementation owners. The operator
authorized source implementation of this specification and its active plan. That authorization
does not adopt a release, certify an archive or authorize work in an adopter. Passive evidence
from older installations identifies cases to reproduce; it is not evidence of a 4.0 regression.

## Current behavior and proposed change

The qualified prompt adapter currently treats a progress question as an ordinary new retrieval
request. Code verifies the native session/worktree and resolves an existing task binding. The
complete current prompt is the retrieval request; the bound task's goal and acceptance criteria
are optional background. Configured JEV questions assess permitted metadata and selected passages.
The adapter prepares required guidance and selected evidence for the host. The main model answers.

The bound projection does not automatically include completed work, original check outcomes,
blockers or the next action. Optional recent-task history is not a complete conversation transcript
or a current-task progress report. There is no dedicated status-intent branch in this entry path.

Agreed first-version behavior: attach a compact, read-only current-task facts block to every new
prompt with a valid same-chat/worktree task binding, through the existing task, attempt, plan and
check readers. Its presence does not depend on recognizing a progress phrase or calling a model.
This supplies evidence before the model has to collect it.
Do not add a separate conversation router, task database or model-written progress summary.
JEV continues to advise on useful optional source; code supplies facts and the main model explains
them. Question wording must distinguish the current turn's need from the full implementation goal.

## Ownership and boundaries

| Responsibility | Existing owner |
| --- | --- |
| Native prompt, session and host delivery | Supported host adapter; unsupported delivery/consumption remains unknown |
| Worktree, task binding, revision and spending | Existing continuity, prompt observation and context-family code |
| Current-task facts and references | Existing task/attempt, structured-plan and original check readers |
| File inventory, sharing scope and original capture | Existing repository index, context route and source capture |
| Optional semantic relevance | Configured JEV metadata/passage questions behind existing deterministic admission |
| Meaning of the request, diagnosis and user-facing answer | Fixed primary model |
| Actual task acceptance | Existing task acceptance authority; never inferred from a reply, checkbox or successful check |
| Outcome and cost comparison | Existing producers and `release-evaluation-1`; no second reporting store |

A question about progress does not create a new task or mark implementation complete. A stored
task binding is a factual association, not proof that every new turn is about that task. Code
records an explicit task switch through the existing owner. The primary model resolves ambiguous
intent; JEV cannot bind a task, resume execution, accept work or grant permissions.

An unbound harness task does not mean an unlinked Codex chat. The hook still observes that chat's
session and turn. The main model retains its host-provided conversation context, which may have
been compacted; the selector does not automatically receive that history. Do not export the whole
conversation to repair a missing task association. Use and validate the existing binding when work
is created or resumed, and expose missing/stale binding explicitly rather than reconstructing it
from a vague prompt or silently choosing another task.

## Conversational context contract

1. Keep the full current prompt primary. Stored goals and prior tasks are labelled background.
2. On every new prompt with an exact same-session/worktree binding, obtain current task identity,
   revision, status and original evidence references. Include the active attempt and linked plan
   batch where available. Code provides the same facts mechanism for progress, explanation,
   implementation and other conversational wording. No phrase list, separate intent classifier,
   JEV call or LLM-written summary is needed to decide whether this block is present.
3. Preserve distinct implementation declarations, executed verification and accepted outcome.
   A checked implementation item is not proof that its verification passed.
4. Include recorded blockers and current/next actions only when their original owner supplies them.
   Label observation time and stale, missing, interrupted or incomplete evidence. Do not invent a
   blocker from a missing record or a next action from an old passing check.
5. Read an explicitly linked plan batch using the existing compact inspector. Current task/attempt
   records do not have a typed plan/batch association; settle a minimal exact reference with their
   existing owner before using a plan as current-task evidence. Do not scan every plan and guess
   which belongs to this task. Unbound or unavailable plan state remains unknown.
6. Keep the task facts local under existing handling unless the configured sharing scope explicitly
   permits relevant task material in a provider request. New fields do not expand disclosure.
7. A status-only request can legitimately need no optional repository excerpts. An uncertain or
   partial answer is different from a verified no-match; retain existing conservative fallback.
8. Preserve full permitted inventory availability. Do not hide files because a keyword detector
   guessed that the request was conversational. Mixed requests retain development/source retrieval.
9. Without a valid binding, retain provisional context and an explicit missing/ambiguous association.
   The model uses visible conversation or clarification; code never borrows a sibling task or chat.
10. Exact same-prompt replay and explicit task refresh preserve original identity, history and shared
    spending. Steering can submit changed input within the same native turn; a turn ID is not a
    unique prompt ID. A runtime upgrade never changes a native conversation's working directory.

Adding task facts does not itself eliminate metadata requests or optional source delivery. Current
fallback can retain baseline files after metadata negatives. Qualify deliberate no-source delivery
separately, protecting required/task pins and uncertain evidence. Reuse underlying read-only readers;
do not call resume or concurrency status operations that bind tasks or write activity merely to
answer a progress request. Recorded checkpoint and next-action text remains a caller declaration,
not independent executed or accepted proof.

### Exact task-to-plan reference

Use one active typed `plan-reference` item in the existing versioned Task. Its body contains version
1, a safe workspace-relative structured-plan path, exact batch ID and definition digest. Record or
replace it deliberately through the existing expected-version task create/revise owner; a prompt
observer never writes it. Validate the actual plan/batch through the engine's existing parser. The
continuity core stores the small typed reference without acquiring a dependency on the engine's
Markdown/YAML parser. Duplicate active references are invalid.

Use `planBytesDigest(normalizedPlanContent(plan))` for the definition digest. Normalization removes
parsed completion/evidence slots and the contents of explicit `governance:notes <id>` regions.
These regions contain changing commentary or current/next notes, never requirements, approvals,
check declarations or machine-owned slots. Updates there retain the link; unmarked prose,
requirements, check declarations and note identities remain definition-bearing. Malformed, nested,
duplicate or mismatched regions refuse; fenced examples stay literal. The facts block records the
observed whole-file digest separately. Neither digest certifies that the implementation passed.

The same commentary convention applies to deliberately structured specifications. Their bound
definition digest preserves all bytes except marked notes; documents without notes keep the existing
whole-file SHA256. The existing read-only `implementation-plan inspect --specification PATH` returns
the definition digest and exact observed file digest. Original captures and native input manifests
remain byte-exact. A commentary update does not grant current-candidate freshness to older check
inputs, accept work or rewrite a receipt. Required behavior belongs outside notes and in the existing
criterion declaration; do not use commentary to change policy or waive a requirement.
Unstructured plans remain valid documents but have unknown machine-readable batch progress.

Do not inherit an active plan/batch association automatically when a task forks, especially into a
different worktree. Preserve its parent attribution as history and require explicit child association.
Keep original task revisions, bindings and checkpoints intact.

The public arguments are `--plan-path PATH --plan-batch ID`, paired exactly once on
`project-governance harness task create` or `task revise`. The engine resolves the actual plan and
batch before continuity opens its writable store. Its injected
`resolvePlanReference(workspace, path, batch)` callback returns the strict object
`{version: 1, path, batch, definition_digest}`. The continuity parser checks its shape and requested
identity; standalone use without that resolver refuses. Replacement explicitly revokes the former
item sequence with the existing host authority reference and expected task version. Core revision
admission and final active-item validation occur in the existing Store transaction.

### Current-task facts fields

The local `TaskFacts` envelope has `version: 1`, ISO `observed_at`, `association`, optional `task`,
`plan`, `checkpoint`, `actions` and `checks`, plus explicit `unavailable` and `omitted` arrays.
Omitted sections have no extracted facts; absence is not a successful result.

| Section | Original fields and interpretation |
| --- | --- |
| `association` | `status`, task/attempt/workspace IDs, `boundRevision` and `observedRevision`; unavailable or historical association grants no execution permission |
| `task` | Outcome, recorded status/mode, revision time and acceptance items with sequence/provenance; accepted lifecycle remains a host-reported decision |
| `plan` | Exact path/batch, association status, recorded/observed definition digests and observed whole-file digest; compact batch items preserve implementation, verification and closeout separately |
| `checkpoint` | Original ID, revision, attempt, creation time, summary/next text and evidence IDs; applicability distinguishes the current revision/attempt from history |
| `actions` | Recent original action IDs/task revisions/statuses/times, recorded refusal reason and job/result references; the latest 64 records are an explicit subset, and uncollected results stay unknown |
| `checks` | Explicit plan evidence reference and native run ID, original outcome/time/result digest, task attribution, historical qualification and limits; current candidate freshness remains unknown unless independently established |

Check qualification distinguishes invalid references, unavailable originals, original outcome only,
historical qualified and historical limited evidence. A compact reader does not re-run a check,
collect an executor result, scan unrelated runs or silently certify current candidate inputs. When
the original packet lacks the plan snapshot, it may expose the matching original outcome with that
specific limitation. Recheck binding/revision/ledger cursor and observed plan bytes around capture.

### Read-only status across task states

The existing decision-context resolver admits only an open task at its bound attempt revision.
Do not loosen that execution/decision eligibility to support status answers. A separate read-only
projection may report the exact associated task in `needs-input`, `accepted` or `cancelled` state.
It labels the recorded attempt revision and observed task revision; an old binding is historical
or stale association, not a newly current execution binding. No new permission follows from it.

Use underlying readers with `Store(..., {readOnly: true})`. Do not shell out even to `harness task
show`: its current CLI opens a writable store and registers the workspace before dispatch. Recheck
association/revision around projection and expose a concurrent change conservatively. Checkpoint
summary/next text keeps its original revision, attempt and observation time. Exact replay remains
a capture-time snapshot; checkpoint changes alone do not establish a fresh replayed status.

The facts block works with JEV enabled, disabled or unavailable. Required guidance retains priority;
if some facts are unavailable or cannot fit the existing packet allowance, preserve task identity,
references and the explicit limitation rather than inventing completion or introducing a new small
budget. A new prompt refreshes facts from current originals. Duplicate delivery of the current prompt
in the same session/turn replays its validated historical packet under existing freshness rules. The primary model interprets
“Where are we at?”, “What remains?” and other wording using these facts and its conversation context.

### Changed input during an active turn

The native host can append input to an active turn without starting another turn. Treat a changed
prompt as new intent, not as a missing duplicate packet. Keep the original per-turn preparation
reservation as the accounting anchor. Record changed input through an immutable claim in the existing
preparation store, with its exact prompt entry and a validated reference to that turn's original
context family. Repeating the current input replays its current claim. Returning to earlier text
after another input creates a new occurrence, bound to the immediate predecessor's immutable claim.
That relation records ordering, not spending authority. Validate it directly without recursively
reading the conversation. Never replace earlier packets, reservations or task associations.

Reuse the existing family continuation admission and remaining allowance. A completed preparation
may admit a fresh purpose through its remaining continuation; in-flight, incomplete, closed or
exhausted admission uses current local fallback and required guidance. It never creates another
paid pool or dispatches a duplicate call. Prior relevance judgments are not evidence for the changed
purpose. Exact duplicate current delivery remains replay-only. An invalid anchor grants no paid admission.

The newest observed prompt supersedes an older selection for current reuse and task association.
Validate the same native session, worktree, turn and original accounting relation before expansion.
Concurrent sibling claims do not establish one current input; expose ambiguity and use local fallback
instead of choosing a winner from timestamps. If one native usage turn has multiple entries or task associations, preserve ambiguous attribution
as unknown; do not count its model usage twice or reassign the earlier work. Preparing a packet still
never resumes execution or supplies task acceptance. Test steering both after completion and while
preparation is in flight, alongside current replay, A-to-B-to-A recurrence, exhausted admission,
ambiguous concurrent claims and cross-owner refusal. A late superseded preparation must emit a
superseded notice rather than present its old guidance, status or selected originals as current.

### Separate retrieval-skipping experiment

Skipping repository selection for a conversational request is a different decision from supplying
task facts. It would require establishing whether the complete current request needs repository
evidence, including mixed requests such as “update me, then fix this.” Do not introduce that classifier
as a dependency of the facts block or enable a keyword-only shortcut. A future opt-in JEV experiment
may advise on retrieval need after labelled comparison proves it preserves useful source and improves
accepted work. It cannot bind tasks, suppress required guidance, authorize execution or narrow the
permitted inventory for requests that still require retrieval. This experiment is not core 4.1 scope.

### Required examples

| Request | Evidence needed | Prohibited shortcut |
| --- | --- | --- |
| “I need an update on progress” | Bound task/batch, completed declarations, check outcomes, blockers, remaining items, original references | Reopen broad source or run tests merely to produce a status answer |
| “What is left?” | Declared acceptance and current implementation/proof state | Call unverified implementation complete |
| “Why are we blocked?” | Exact refusal/failure and retained ownership, with observation time | Infer a runtime crash or force-release a live owner |
| “Continue where you left off” | Current objective, latest valid checkpoint and next action | Use an unrelated former objective |
| “Explain why we chose this approach” | Current task plus relevant rationale/specification originals | Treat progress fields as sufficient design evidence |
| “Give me an update, then fix the reconnect issue” | Status evidence plus relevant implementation/test sources | Classify the entire request as status-only |
| “Switch to the other task and give me an update” | Explicitly resolved task association and refresh | Reassign earlier packets or usage to the new task |
| “Is it done?” without a valid binding | Missing association plus visible conversation/clarification | Guess a task from a sibling worktree or most recent repository task |
| “Thanks” or “Pause at the next seam” | Current association and instruction boundary, with no invented work | Create another task or start a check because a conversational turn arrived |

## Four delivery areas

### 1. Selection quality and conversational evidence

Freeze representative investigation, implementation, review, continuation, task-switch and no-match
cases before tuning questions. Label decisive original passages and status facts independently of
the selector. Include similar headings, long documents, weak metadata, misleading quoted content
and mixed requests. Check useful-file discovery separately from complete decisive-passage delivery.

Include repeated check-ins in a long-lived chat: a new prompt after several implementation seams,
interruption/restart, host compaction where observable, a missing/stale binding and an explicit task
switch. Test the same bound-task facts mechanism with several status phrasings and an unrelated
wording that would not match a phrase list. Inspect exact task/plan/check revisions and unknowns,
not a model's self-reported understanding. Synthetic hook sequences prove the adapter, not actual
desktop compaction or main-model consumption.

Compare current questions with direct usefulness questions over the current turn and necessary
background. Inspect clipping, source representability, probability semantics and fallback before
changing thresholds. A higher positive count is not an acceptance goal. Preserve mandatory guidance,
original references, permissions, fixed model settings and complete permitted metadata coverage.

### 2. Outcome and cost links

Extend existing producers at their owned entry, execution, observation and explicit acceptance
transitions. Bind executing generation, source/case/profile/questions/permissions/model, decision,
native check/provider, available usage and original acceptance evidence. Assemble existing evaluator
inputs deterministically; do not synthesize acceptance or recover old archive identity from today's
runtime lock. Avoid repeatedly parsing an entire growing native log when incremental collection is
supported; declare unsupported versions and incomplete windows.

Measure total work, additional reads, failures and rework. Prepared output is not confirmed model
consumption. Missing host observations and eligible-attempt denominators remain unknown. Compare
matched accepted outcomes, not call counts or prepared packet bytes alone.

### 3. Reliable configuration

Reuse current context doctor/readiness output at initialization and explicit JEV activation.
Distinguish intentionally off, requested-but-not-configured, metadata-only, passage-enabled, missing
credentials, unavailable provider and restricted sharing scope. Effective flags do not prove use.
Preserve explicit egress consent and project-owned source paths; never silently widen them.

Greenfield and existing-repository fixtures must exercise the configured ordinary entry path.
Configuration diagnostics must not launch provider probes, repeat tests or activate features.
An intended active configuration omitted in one project is repaired at its project seam; it is not
automatically a runtime defect requiring a new release.

### 4. Entry and continuation friction

Return the exact existing entry reference in a clear machine-readable field and compact human
instruction. Qualify caller roundtrips rather than inventing another identifier or relaxing integrity.
Keep stale-source refresh explicit, shared-allowance-preserving and distinct from unchanged replay.
Reproduce the original malformed input, rich task projection and short unbound continuation cases
against the current baseline before deciding which runtime owner needs a change.

Expose `nativeEntryReference` only for an actual native entry. Its version, kind, exact 64-character
entry ID and replay arguments are separate from the route receipt UUID. `reuses: original-packet`
distinguishes the original turn packet from an expansion. Human output labels both.
A malformed supplied reference is refused without guessing another entry. Failure receipts identify
the executing runtime; an unverified archive stays unknown. An unchanged-replay refusal records
zero provider calls because validation fails before dispatch.

A single finalization step records the final rendered packet digest, byte count and captured limit
after successful, failed or blocked preparation has settled. It cannot replace those distinct statuses.
A retained preparation failure records the digest and byte count of the final fallback text,
including any local task facts, under its captured packet limit. Exact replay and duplicate
native delivery preserve that failed result without another provider call. A readable fallback
does not become a prepared route, execution permission or accepted task outcome. Altered text
and other-session replay remain refused by the existing integrity and identity guards.

For stale captured context, expose safe causes for receipt, policy, required guide, skill or optional
source drift. Identify a path by digest, never by raw private contents or parser errors. A recovery
descriptor names the existing `context-route` expansion with the same native entry. The arguments
omit `--task` and declare `requires: ["task"]`; the caller
must supply actual current purpose before admission. It is advice to use the normal command, not
admission or permission to retry. Retained receipt/delivery corruption is `entry-packet-invalid`
with no source-refresh advice. Ineligible delegated/foreign-worktree callers receive no recovery.
The existing session/latest-turn/task/worktree guards and budget owner still admit the refresh.
No automatic paid retry occurs; earlier packets and spending remain intact.
An unavailable continuation slot or exhausted provider allowance can still deliver current local
evidence. It does not reset spending or guarantee additional JEV selection. Admission owns that
decision at invocation; do not add a separate budget preflight authority.

### Retained test-report integrity

Add an opt-in `junit-evidence` built-in to the existing captured-subject pack runner. A project must
declare its report roots in a target-owned pack. The executing pack's `path_globs` are the only path
authority; another registered pack cannot widen them. Do not install a global XML owner or widen
lexical test-file rules to pretend they parse reports.

For selected `.xml` or byte-identical `.xml.txt` captures, code validates JUnit structure, suite/case
identities, declared versus observed counters and recorded case dispositions. Reject malformed
UTF-8/XML, DTD/entity declarations, duplicate identities and inconsistent counters. Read only the
captured candidate, so an unstaged correction cannot clear malformed staged evidence. The existing
source-reader allowance applies; do not add another small report-size cap.

Return artifact hashes, observed counters and recorded execution separately from artifact integrity.
A valid historical failed report is valid retained evidence. Parsing a passing report never proves
current execution or task acceptance. Project-owned adapters retain source/run/platform/manifest
provenance and reconcile any stronger outcome claim. No tests, models or network calls are launched
merely to check a retained report. Arbitrary XML remains subject to its own validation owner.

## Failure cases and non-goals

Missing or stale binding, concurrently revised task/plan, missing original receipts, interrupted
attempts, oversized evidence, absent credentials, provider refusal and unsupported host observation
must remain explicit. Required guidance and task identity cannot be displaced by optional facts.
Facts referencing another worktree do not become current-task state. Unavailable evidence never
becomes a passing outcome. Keep current generous operation/input allowances; do not add a small
per-call cap or expand a limit without reproducing the actual failure.

No default delegation or model switching, new conversation/state store, full transcript export,
general tool hiding, broad output pruning, automatic acceptance, per-edit test loop, computer-use
executor or new generic lint/plan framework is included. Keep the existing log-filtering pilot
default off. Skill/procedure suggestion remains a separate conditional experiment after ordinary
outcome linkage and a supported host delivery seam are demonstrated.

## Acceptance criteria

```governance-spec
{
  "version": 1,
  "criteria": [
    { "id": "R1", "claim": "Current prompt, binding, original source identities and complete permitted inventory remain distinct and preserved during selection.", "verification": "mechanical" },
    { "id": "R2", "claim": "Every valid bound-chat prompt receives read-only task facts from existing task, attempt, explicitly linked plan and check evidence without phrase classification or extra model calls, separating implementation, verification and acceptance.", "verification": "mechanical" },
    { "id": "R3", "claim": "Conversational, mixed-intent, continuation and task-switch fixtures deliver the evidence required by independently frozen labels without unrelated task substitution.", "verification": "semantic" },
    { "id": "R4", "claim": "Absent, stale, ambiguous or cross-worktree associations remain explicit and neither create tasks nor authorize execution.", "verification": "mechanical" },
    { "id": "R5", "claim": "Entry and explicit outcome transitions supply original generation, decision, check, provider, usage and acceptance links to the existing evaluator where supported, retaining unknown coverage.", "verification": "mechanical" },
    { "id": "R6", "claim": "Efficiency claims require matched accepted outcomes with complete declared coverage and total cost/rework rather than successful calls or smaller packets alone.", "verification": "semantic" },
    { "id": "R7", "claim": "Initialization and activation reuse existing readiness diagnostics and preserve intentionally off profiles, approved sharing paths and passive inspection.", "verification": "mechanical" },
    { "id": "R8", "claim": "Exact entry references roundtrip through the existing caller; stale-source refresh, explicit task refresh and changed same-turn prompts preserve immutable history and one shared spending family.", "verification": "mechanical" },
    { "id": "R9", "claim": "Installed greenfield, existing-repository and concurrent-worktree proof exercises normal entry and fallback without moving native conversations or affecting another owner.", "verification": "mechanical" },
    { "id": "R10", "claim": "Code retains governance authority, bookkeeping and target-owned retained report integrity without implying execution or acceptance; JEV remains optional semantic advice and the primary coding model remains fixed.", "verification": "mechanical" },
    { "id": "R11", "claim": "Read-only facts can report exactly associated blocked or terminal tasks while current execution/decision eligibility and stale-binding diagnostics remain unchanged.", "verification": "mechanical" },
    { "id": "R12", "claim": "One explicit versioned plan/batch reference survives machine bookkeeping updates, diagnoses definition drift and does not silently become an active child reference on fork.", "verification": "mechanical" }
  ]
}
```

## Verification and implementation sequence

1. Freeze 4.0 originals and labelled cases; reproduce suspected failures before changing owners.
2. Deliver the always-present bound-task facts block, exact task/plan linkage and multi-turn
   regressions as one coherent context batch. Refine existing source-selection questions against
   frozen labels; do not make a retrieval-skipping classifier a prerequisite.
3. Connect ordinary outcome/usage producers to the existing evaluation contract.
4. Wire configuration readiness and exact entry-reference caller recovery through current owners.
5. Run one stable installed package proof covering affected entry, sharing, generation and worktree
   boundaries. Review consumes retained batch proof rather than restarting a broad test cycle.

Write focused tests alongside changes; run them at the owning batch boundary, or earlier for a named
blocking reproducer. The [implementation plan](../exec-plans/active/2026-10-05-4-1-context-quality.md)
names actual owner commands and mappings, distinguishes implementation/proof/closeout, and uses
the existing typed updater at each seam while retaining failed evidence.
An adopted real development cycle and actual host observations remain distinct from simulation.

The context batch checkpoint must cover ordinary and alternative wording, mixed intent, facts with
JEV off/unavailable, repeated turns, unchanged replay, evidence changes, interrupted work, absent or
stale binding, task switching, changed input during an active native turn and sibling-worktree isolation. Assert no extra model calls for preparing
facts and no progress-answer-triggered tests, task creation, resume or acceptance. Reuse the existing
plan inspector rather than making the main model reparse complete documents for bookkeeping.

## Related artifacts and open decisions

- [Published major contracts](engine-4-verification-feedback.md).
- [Release evaluation](engine-release-evaluation.md).
- [Task context entry](engine-task-context-entry.md).
- [Prompt timing and explicit task transitions](engine-rc7-prompt-reliability.md).
- [Reliable context and procedure selection](engine-rc10-context-use.md).
- [Structured delivery tools](../developer/guides/structured-delivery.md).
- [Validation strategy](../governance/validation-strategy.md).

The public plan-reference seam and source proof mapping are settled above and in the active plan.
Open: host-supported consumption observations and case-specific calibration promotion criteria.
Resolve these through existing owners without adding another state or reporting authority.
The requested podcast reconciliation is pending a transcript containing the intended harness material;
unrelated source material contributes no release requirements.
