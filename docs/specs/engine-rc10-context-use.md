---
id: spec.engine-rc10-context-use
title: RC10 Reliable Context and Procedure Selection
type: spec
status: approved
owner: project-governance
created: 2026-09-29
updated: 2026-10-02
summary: Make context reach the correct worktree, expose semantic coverage gaps, reduce repeated selection, and select project procedures before ordinary development work.
---

# RC10 reliable context and procedure selection

This is the approved next release after RC9.1. The operator authorized implementation after the
Opus 5.5 medium design review, reconciliation and simplification pass. This document does not declare implementation,
publication, configuration changes in adopters or measured savings. The
[implementation plan](../exec-plans/active/2026-09-29-rc10-context-use.md) owns delivery progress.
Private repository identities, receipts, transcript analysis and pilot records stay outside this
checkout. Generic requirements below follow the code owners and those externally retained findings.

## Result we want

The first packet must help the coding model take the right next step. It should contain the
relevant project procedure and the source evidence needed for the request, with access to originals.
A configured classifier or an answered relevance question does not establish that result.

RC10 concentrates on this path. Preserve the fixed coding model, optional JEV, the complete
eligible inventory, explicit disclosure, mandatory guidance and deterministic fallback. Retain
RC9.1's one 30-second retrieval envelope and 40-second managed host hook. Do not reintroduce a
per-request timer, a narrower lexical discovery list or a second paid allowance.

## Current owners and gaps

| Current owner | Existing behavior | Gap to close |
| --- | --- | --- |
| `prompt-context.ts`, `decision-task-binding.ts`, continuity store | Native entry uses its event workspace; task binding is scoped to that worktree | A chat attached to a primary checkout can issue commands in a sibling. Valid local configurations do not establish a matching prompt/command workspace |
| `context-metadata.ts`, `context-projection.ts` | Maintain a complete eligible path inventory, cache descriptors and traverse approved candidates in parallel | Cached descriptions and transmitted descriptions are different. Current descriptor disclosure also requires the source class and source-path permission; a broad metadata allowlist can still mean path-only inference |
| `context-route-command.ts`, `context-observations.ts` | Capture route/entry identities, support task refresh and two expansions | An ordinary repeat can create another selection instead of reusing the current packet; wrong-worktree entry lookup often becomes a generic failure |
| `context-passage-advice.ts`, packet builder | Select optional implementation/test/document spans under separate source permissions | File discovery, permission to judge its body, a positive passage judgment and actual packet delivery can fail independently |
| `context-doctor.ts` | Check local configuration, shared hooks, required budgets and index readiness | A configured result can coexist with disabled inference, almost no semantic descriptors or no native entries in the execution worktree |
| `decision-workflow-advice.ts` | Recommend one caller-supplied executable recipe; native prompt entry skips this advice | This is not a general runbook-section picker. Do not relabel it as one or make procedures require executable recipes |
| Telemetry readers and existing SQLite projections | Preserve operational receipts and bounded measured summaries | Directory limits can omit newer matching work. Parallel duration sums can be mistaken for wall time. Delivered packets and accepted outcomes remain weakly joined |

Correct adopter configuration and runtime changes are separate work. Updating a main checkout does
not update its siblings. No new runtime can make a chat's configured checkout equal the directory
chosen by an unrelated host tool without an explicit host/workspace change.

## Workflow and responsibilities

| Step | Responsibility | Required behavior |
| --- | --- | --- |
| 1. User submits a prompt | Supported Codex host | Supply the current prompt, session/turn identity and execution workspace to the approved hook |
| 2. Establish identity | Runtime code | Resolve canonical Git worktree/locator, installed runtime, definition source and this session's binding. Never choose a sibling from recent activity |
| 3. Prepare candidates | Runtime code | Preserve required instructions; maintain complete eligible inventories of files and declared procedure sections; enforce disclosure and record missing facts |
| 4. Assess relevance | JEV, when eligible | Judge approved file descriptors, then captured source and declared procedure units through the existing passage pipeline. Preserve uncertainty and unassessed candidates |
| 5. Deliver useful evidence | Runtime code | Capture selected complete sections/spans, optionally judge approved passages, revalidate source identity, compose the packet and retain references/omissions |
| 6. Diagnose and implement | Coding LLM | Use the packet, inspect originals when needed, bind or resume explicit tasks, make changes and invoke the normal governed check/workflow owners |
| 7. Observe completion | Existing task/check/host owners | Link outcomes, usage and later reads where actually observed. Neither JEV nor a passing check silently accepts the task |

The prompt, rather than an old task's wording, remains the immediate retrieval query. Prior task
context is background. Breaking mixed intent into implementation tasks remains the coding agent's
job under operator direction; retrieval does not create tasks or authorize actions.

## A. One execution worktree for the prompt and its work

Record the native event workspace, canonical execution workspace/locator and hook definition source
separately in the existing entry/route chain. Include the execution workspace in the compact packet
header and continuation reference. Shared definitions are not a shared runtime or source index.

The initial adoption contract is one primary execution worktree per chat. Rebind through a supported
host operation at a pause seam; when an existing-directory rebind is unavailable, resume a verified
checkpoint in a chat attached to that same existing directory. This does not require another Git
branch or worktree. Incidental reads of an explicitly permitted companion repository do not change
the primary execution workspace.

RC10 does not introduce transparent cross-worktree prompt redirection, a last-active-tree heuristic,
or another session-target registry. Existing explicit continuity bindings remain authoritative within
their workspace. Doctor may report observed sibling activity and missing native-entry linkage; it
must not use that activity to choose a target or rewrite a binding.

An entry from another worktree must not be consumed as local context. Report distinct typed reasons
for an unavailable entry in the current workspace, explicit workspace/locator mismatch, stale task,
stale source, unsupported receipt and malformed input. Identify known expected/actual workspaces
without exposing prompts. Do not call an unavailable entry a confirmed cross-worktree mismatch
unless its provenance establishes that fact. RC10 does not scan sibling prompt indexes. An absent
local entry is `entry-unavailable-in-workspace`; a known mismatch requires supplied local provenance.
The context command cannot observe every native tool's directory or enforce host attachment.

On a mismatch, return the known cause and the supported host-alignment action, plus ordinary local
fallback where required guidance can be validated. Do not repeat paid selection, create a replacement
task or reset spending merely to recover an entry. Required-context failures retain their existing
behavior. A local fallback does not claim native-before-read delivery or acceptance.

## B. Readiness must describe what JEV can actually see

Keep existing data classes and path permissions. Do not automatically reinterpret metadata approval
as source approval, widen allowlists, or add a new disclosure switch in this iteration. At adoption,
review the areas used by ordinary tasks and explicitly approve the descriptions/passages intended
for hosting through the existing profile fields. RC10 accepts the existing coupling: the `source`
class and `allowed_source_paths` permit both descriptors and passage/procedure bodies for those
paths. Enabling metadata alone does not send bodies; the passage consumer must also be enabled.
Procedure documents outside that permission yield local references, not hosted section judgments.

For each retained route, distinguish these stages:

1. Eligible local paths and current cached descriptors.
2. Metadata-permitted paths, descriptor-permitted paths and path-only candidates, with reasons.
3. Submitted and validly answered candidates, distinguishing descriptor-backed and path-only answers.
4. Selected files, source-permitted passages, prepared/assessed passage units and incomplete units.
5. Delivered complete/partial sections, budget omissions and later observed original reads.

Full path assessment is not full semantic coverage. A cached descriptor is not transmitted evidence;
a transmitted descriptor is not the file body; a judged passage is not necessarily delivered.
Preserve these distinctions in receipts, doctor and operator guidance. Low relevance judged from a
path alone cannot establish that the file's contents are irrelevant.

Doctor remains passive. Its configuration verdict must sit beside inference mode, disclosure
coverage, index quality, required-budget readiness and observed native-entry linkage. Report missing
token, disabled passage advice, approved metadata without descriptions, expired/stale index facts
and unobserved delivery separately. Missing credentials are a supported fallback, not an installation
failure. Observe only available receipts and supported identity; host trust and unobserved reads
remain unknown. Show compact configuration facts and a reference to the latest retained route and
native-entry evidence; reuse their coverage fields rather than independently recomputing them.
Do not add a provider probe to doctor or a new universal gate.

### RC10.2 fresh-project operational proof

Installed-package release proof includes a dedicated greenfield suite from an empty Git repository
through its first bound task, native-format prompt selection and ordinary packet reuse. It exercises
newly authored project records and local skills, successful fixture inference, missing credentials,
billing denial, explicit disclosure repair, compact output, external read accounting and cleanup.
In a repository without its first commit, the full added-file inventory still controls checks and
route applicability. It must not automatically pin every file ahead of semantic selection.
Explicit requested paths, task source declarations and mandatory guidance keep their existing
priority. Generated installation instructions must not crowd out the first task's project evidence.
Live inference is a separately labelled run of the same packaged path on synthetic content. Safe
fallback cannot satisfy a live-success assertion; unavailable provider credit is an external proof
limit and must not be labelled successful JEV operation.

Transport receipts retain HTTP status and fixed operational reasons without response bodies or
arbitrary messages. HTTP 402 is `billing-unavailable`; other client rejection is `request-rejected`,
while authentication and overload retain their established classification and cooldown behavior.
Passive decision doctor reports the most recent dispatched result for the current workspace,
runtime and configuration, distinguishing unobserved health, failure and successful delivered advice.
It never calls the provider. Success does not imply relevance quality or savings.

Passive context doctor compares eligible local Git path names with the existing metadata and body
disclosure scopes, including files created after installation. It reports bounded missing-path
previews and never reads bodies or broadens approval. Intentional restrictions are not configuration
errors. The normal context CLI returns selected evidence, mandatory guidance, omissions, status and
the full receipt reference. `--json` exposes full diagnostics; native replay and programmatic route
contracts remain unchanged.

An explicit `telemetry context expansion --source-workspace <Git-root> --path <relative-path>`
records a verified worktree locator and current source digest for an external read. It neither
imports source into the local packet nor grants hosted disclosure. Reject unsafe paths and secret
or generated-file classes. Distinguish external reads from local observations; neither counter
alone establishes a retrieval miss.

For required-context overflow, separate true always-required rules from task-specific procedures by
an authored policy revision. Never let JEV shorten mandatory instructions to fit. Keep AGENTS and
provider files thin; route to one source of shared process. Use the existing documentation/comment
checks and improve frequently expanded or touched modules gradually; no bulk prose rewrite.

### RC10.4 saved-evidence and capture boundary

An unrelated large generated artifact must not prevent native prompt context or a scoped provider
review from preparing. Working-copy inventory captures exact hashes in a stream, independently of
the limits for reading and delivering source bodies. This also applies before a repository's first
commit. Preserve every inventory path, captured line ranges, symlink checks and concurrent-edit
refusal. Actual source reads and validation materialization retain their existing limits; the
staged first-commit body allowance remains unchanged.
Exact working-copy identities still require two complete streaming passes for concurrent-edit
checks. Keep bulky generated output in deliberate Git ignore rules or external evidence storage;
constant memory does not make multi-gigabyte inventories free to read.

Reuse the documentation owner's saved-evidence convention for automatic context retrieval:
`docs/**/evidence/**` contains raw artifacts by default. Authored `README.md` and `index.md`
summaries remain eligible; `before/` and `after/` snapshots do not. Active execution plans keep
their live-guidance role. This is an explicit artifact classification, not a relevance filter on
code or project guidance. Catalog-declared references and guides keep their authored exemption;
catalog `sources` do not promote raw evidence. Record exclusions through the existing catalog receipt. Required routes,
declared task sources and explicit original requests retain their normal delivery and disclosure
checks. Raw artifacts stay in the validation subject and are never deleted or rewritten. Large
originals still need a bounded reader or an authored summary rather than an unbounded model packet.

Prove a scoped provider review with unrelated evidence larger than the normal content-read limit:
required instructions and both declared documents reach native input, raw evidence does not enter
automatic classifier requests, and summaries remain discoverable. Prove exact large-file identity,
stale-source refusal and explicit bounded-original access. The installed greenfield suite must
exercise the same situation through native prompt entry, not only passive doctor checks.

## C. Spend once on useful assessment

Continue presenting the entire permitted inventory to JEV across bounded batches. Byte, token,
family spending and the operation envelope may yield partial coverage; name the actual limiting
resource and preserve the cursor. More elapsed time cannot fix a byte allowance or missing disclosure.

Reduce avoidable wire framing before increasing budgets. Implement one compact structured layout that
keeps the complete current request and approved distinguishing facts, uses short stable request-local
IDs, and retains full hashes/provenance locally. Preserve paths, useful descriptions, document status
and source limitations. Do not achieve compression by silently replacing available descriptions with
paths or by hiding whole branches of the inventory. Version the layout in exact replay identity.
Use the same named-item layout for approved source passages. Keep the current request once in
state and refer each question to its exact passage and registered instructions. Distinct sections
must carry distinct bodies, including when the complete file would fit a single excerpt. Hashes,
permissions and original ranges remain locally owned; compact framing does not relax them.

TypeSafe's current [state contract](https://docs.typesafe.ai/concepts/state) supports one structured
state shared by independent questions. Its [structured question guidance](https://docs.typesafe.ai/primitives/advanced)
supports referring to named fields. These capabilities support a layout experiment; they do not
establish retrieval accuracy or a saving. Compare the current and compact layouts on the same facts
and withheld source-backed expectations before selecting one production layout.

Keep the existing bounded concurrency, shared admission and provider constraints. Report per-call
HTTP time, admission/rate wait and operation wall time separately. Estimate whether the prepared
catalog fits the configured family budget; show an explicit budget recommendation when it cannot.
The existing decision-budget schema caps the family request allowance at 8 MB. The measured large
and web catalog shapes depend on compact framing to qualify within that ceiling. If the compact
layout loses decisive evidence or cannot fit the complete fully approved generated case, stop release
qualification and report the failing constraint; do not silently expand authority or switch to a
smaller inventory. An operator-approved allowance change within 8 MB uses the current budget owner. Do not open an unlimited
retry loop or hide the shortfall with a smaller candidate set.

The shared rate owner reserves a conservative token estimate before dispatch. When a valid provider
response supplies measured input tokens, settle that rate-window reservation to the measured count.
Repeated reports can only increase the known count. Unknown usage retains the estimate. Settlement
does not remove a request from the rolling minute, release an execution lease, refund family bytes or
calls, or change the operation clock. This avoids treating wire bytes as measured tokens indefinitely.

The index retains up to 32 MiB of extracted facts within its existing 64 MiB SQLite envelope.
Version the extractor when changing this capacity so entries suppressed by the older fact limit can
be revisited. Distinguish capacity-suppressed facts from truly unavailable extraction; paths remain
eligible in either case. Cold index preparation and warm selection remain separate measurements.

Read-only reuse uses `context-route --entry <id>` without expansion flags. The reference comes from
the native packet. Session identity comes from the explicit runtime caller, `HARNESS_SESSION`, or
`CODEX_THREAD_ID`, in that order; absence means `entry-session-unavailable`. The entry must match
that session, workspace and its newest preparation. Revalidate task, policy, runtime assets and
captured sources. Show the served entry's turn, capture time and replay status in the output.
A bare command cannot establish the current host turn from a session alone. Without an explicit entry reference or supported
caller-supplied turn identity, return `entry-turn-unobserved` and request the packet's entry reference;
never silently reuse an older prompt or a bound task's prose. A newer prompt that wrote no marker
cannot be detected by a shell; an explicit entry reference is therefore an operator/agent declaration,
not proof of native current-turn observation. Newer refused/incomplete markers always prevent reuse.
With `--entry` and a validated matching session, workspace and newest preparation, serve the packet
as declared reuse, even when no host turn is independently observable. Explicit changed intent,
sources or binding require refresh/expansion under the same family.

Retain the existing exact-batch and event-answer reuse. Record packet reuse, answer
reuse, continuation, invalidation and fresh selection separately. Different prompts are not
equivalent because they selected the same files. Preserve prior receipts and spent/uncertain calls;
task switches, cancellation, source changes and expanded context do not refund spending.

## D. Select procedure units through the existing passage pipeline

Add one opt-in declaration: `context_router.procedure_sources`, a list of safe repository-relative
Markdown paths. It identifies existing project-owned procedure documents; it is not a second catalog,
permission grant, command inventory or new skill package. Omitted/empty means no procedure selection.
Existing developer guides can be referenced directly. Required routing remains separately declared.

Use the maintained index's Markdown section spans to build the declared section inventory. Record
heading levels and derive ancestry. A section ends at the next heading of the same or higher level,
so its child steps stay in its body. Version the extractor and refresh outdated cached facts.
Each candidate carries a source path/hash, heading ancestry, exact span and extraction/status limits.
Use authored purpose only when present in source; do not generate summaries with another LLM.
Assessment units partition the document into nonoverlapping top-level procedure sections (level two
under a document title, or level one when no title exists). Child steps stay within their parent unit;
ancestor headings and the document prelude accompany it as context. The prelude may contain shared
prerequisites; preserve it once when several sections are delivered. Nested headings are not separate overlapping assessments.
An oversized unit is reference-only with `procedure-unit-too-large`; never assess a clipped body as a
complete procedure. Delivery retains the original ranges and ancestor headings.
Missing or changed spans require re-extraction or an explicit unavailable result, not a stale excerpt.

Declared procedure files enter the existing DL03 passage preparation directly, independently of
their file-metadata score. Interleave permitted complete procedure units with optional source units in
that queue, giving each category its first unit before deeper units, with the existing `context.passage-evidence/1` question. Retain every declared section
in the inventory; limits leave explicitly unassessed sections rather than silently deleting them.
Mixed requests may select several; no relevant procedure is valid. Required rules never compete
for these scores. Uncertain answers preserve local references and fallback. Treat source instructions
as quoted project material, never provider authority. Add no new classifier stage or deadline class.

For captured source files, literal names may order dispatch but must not remove units with no
word overlap. Retain every extracted unit as eligible, including oversized units represented by
explicitly partial source excerpts. Classification uses the existing approved evidence allowance,
less purpose/framing, rather than the smaller main-model delivery allowance. JEV must see a complete
unit when that approved input can represent it. Record actual assessed ranges and completeness;
do not describe a clipped input as the complete unit.

A source file that fits the existing ordinary excerpt and approved classification allowance is one
intact assessment/delivery unit. Keep its fixture, constants and helpers together instead of asking
several questions about tiny fragments. Uncertain whole-file advice retains the same ordinary
allowance and uncertainty label. Larger files continue through bounded literal units: include
attached declaration prose, Kotlin backtick names and their annotations; group adjacent small
declarations within the ordinary 3 KiB default cluster target. Grouping does not remove the other
units or raise confidence, disclosure or packet limits.

Prepare procedure/source units lazily in alternating, per-file rounds. Bound retained prepared
evidence bytes by remaining family bytes; the existing exact serialized request fitting owner
enforces the stricter complete wire/call allocation before dispatch. Source capture still bounds
the operation to 64 files of at most 1 MiB each, and extraction retains its declared limits. Check
the original operation deadline during preparation. Remove the separate 256-unit allocation;
unused approved capacity must not strand a decisive later unit. Record eligible, prepared and
answered counts, preparation/packing time and real budget/deadline omissions.

The existing passage questions must be explicitly enabled in the DL03 configuration. The new
declaration identifies local candidates; existing source/metadata permissions control hosting. Plain
file metadata selection and passage selection continue to work without it. For missing
credentials, return applicable deterministic required guidance and declared procedure references,
with no paid attempt or invented procedure match.

Metadata assessment and the procedure/source passage queue share the existing operation deadline,
family budget, passage allocation and admission owner. Compute the combined allocation before
dispatch and expose competing limits. Alternate procedure and source units until one category is
exhausted; each gets a first representable unit before further units from the other. The passage
owner may use all remaining family capacity, including unused metadata capacity. The existing
reservation of at most two calls and the smaller of 65,536 bytes or a quarter of the family allowance protects initial capacity; it is not a separate passage ceiling.
A unit that cannot fit remaining serialized capacity is omitted with `passage-budget`, without
spending or preventing smaller units from the other category. Do not add another reserve, clock
or spending partition.

Deliver selected complete procedure sections through the existing packet builder, with source
ranges/hashes and originals, alongside implementation/test evidence. Preserve required and explicitly
pinned material first; optional useful procedures precede generic optional background. If a section
does not fit, label it partial or return its reference and omission reason. Do not present a heading
as the procedure. Materialization grants no permission to execute commands or waive checks.

Within the optional envelope, give each file its ordinary bounded excerpt before extending it.
Keep required and explicitly pinned material intact and first. Larger complete procedures receive
one section before later section rounds; an ordinary excerpt that cannot fit may retain its first
validated unit. Then extend admitted files in rounds rather than allowing one file to consume the
remaining envelope. Confirmed
optional evidence precedes unassessed background; unknown files remain eligible but cannot form
barriers that strand useful lower-ranked evidence. Confirmed source bodies retain their answered
relevance order; uncertain files preserve metadata order across files. Use uncertain passage scores
only to order units within their original file. Retain the existing role balance for
complementary source/assertion coverage. Curated answered guides
retain their separate declared category. Fill ordinary background only after these evidence rounds.
Record omitted judged units and
label a delivered subset distinctly. This prevents several sections of a guide from displacing the
implementation and test evidence. Revalidate the original judgment and source before taking a
subset; unvalidated advice must never choose new excerpts or alter required context.

The ordinary per-file allowance bounds its first source excerpt. Additional **confirmed** source
units may use remaining capacity in the same declared packet, capped by the existing 65,536-byte
excerpt representation limit. No second allocation or paid stage is added. Only previously
validated positive spans enter this extension; uncertain spans retain the ordinary limit. Keep the
first delivered ranges intact while adding exact whole-line windows from further confirmed units.
An incomplete further unit is visibly partial. A later ordinary/mixed excerpt must not replace or
erase already delivered evidence. Fit exact serialized packet bytes, including range/unit framing,
before accepting any extension. This increases neither the total packet budget nor source disclosure.
An answered uncertain score may order already captured units in a metadata-admitted file,
at the ordinary excerpt allowance, after source/hash and representability checks. Record this as
`uncertain-score`, not positive relevance. Supported-negative units are never preferred. Order by
score, then original source range for deterministic ties independent of batch composition.
Keep this advisory order separate from positive judgments: it cannot pin a file, establish relevance
from a role, grant the larger procedure allowance, or mark a procedure selected. Validated non-negative
source quotes also take their ordinary evidence round before generic background. Do not compare
uncertain probabilities from different partial fragments to replace whole-file metadata order.
Keep confirmed body relevance distinct from uncertain sequencing. Positive and uncertain scores
order units within their file, without interpreting uncertainty as irrelevance. A supported
literal or Choice role can participate in advisory complementary sequencing, without establishing
relevance. No new role is inferred from a missing or invalid answer. When a file has
both positive and uncertain sections, fit their ordered combination within one ordinary file slot.
Retain the confirmed anchor before applying positive treatment; if it cannot fit, preserve the
original positive excerpt rather than discarding it. The mixed excerpt keeps its unconfirmed label.
Missing, invalid or stale advice uses the same local baseline. A procedure declaration must never
remove a file's ordinary opportunity for delivery. Unconfirmed sections keep their original reference.
The strongest answered non-negative procedure section cannot be replaced by weaker sections merely
because it is large. If it cannot fit intact at the ordinary allowance, quote an explicitly partial
window **inside that section**, retaining the section/prelude reference and incomplete-unit label.
Lower-scored sections follow where they fit; keep a visibly partial additional section when only
that fits the remaining ordinary allowance. Preserve the strongest section, prelude and every
already quoted range instead of replacing them. Positive procedure selection still requires
complete representable sections and retains its existing larger allowance.

The operator's explicit `procedure_sources` declaration supplies a separate delivery category.
Alternate representable answered procedure excerpts with the remaining source files after pinned
material, preserving advisory quote order within both categories. A procedure with uncertain sections
uses only its ordinary slot and remains unconfirmed; it never receives the larger allowance or
execution authority. Undeclared uncertain documents cannot enter this category. Positive-only
multi-section excerpts still receive one section before budgeted upgrades. This bounded category
balance prevents a curated guide near the bottom of metadata order from being assessed but never
shown, while preventing several guides from excluding source and assertions.

File-metadata scores choose which optional originals to inspect, not whether their bodies are proven
relevant. Preserve explicit pins first, then positive scores, then answered uncertain scores in
descending order, with path ties deterministic. Retain supported-negative, unanswered and unassessed
files in their local fallback order afterwards. Missing, invalid, stale, off or shadow advice never
changes that local order. Do not drop a high-ranked file merely because its score falls below the
positive threshold: uncertainty must remain visible and the passage stage still checks its body.
Record positive, uncertain and supported-negative counts plus a bounded uncertain-order preview.
This advisory file ranking grants no larger excerpt, confirmed evidence status or execution authority;
the within-file passage rules above remain separate. Keep the existing confidence thresholds.

After complete metadata assessment, fill the configured source-body window from that ranked order.
Do not reserve half of it for lexical discoveries. Explicit relationship expansion remains available.
Required originals remain separate. Within the combined 64-file optional capture limit, explicit
inputs and task-declared files come first. Remove those pins from the remaining queues before
alternating metadata-ordered procedure declarations and ranked ordinary source files. Procedure
declarations do not consume the ordinary source-ranking limit before that shared allocation.
Retain references and named capture omissions for declarations outside the window; add no second
allowance or smaller procedure declaration cap.
The existing `max_candidates` declaration controls this window, with a legacy default of 16 and an
accepted maximum of 64. Doctor exposes it separately from full metadata coverage and remaining
family capacity for source-unit assessment. The qualified large-repository profile declares 64; smaller declarations
remain valid but cannot claim the same body coverage. Defaults and actual delivered text must be
reported separately from index coverage.

Native prompt delivery honors the already declared route expansion/total envelope. Remove the
additional hard-coded 8 KiB optional ceiling; keep the route owner, actual required-byte use,
framing reserve and native packet validation authoritative. A manual 16 KiB packet alone is not
evidence of delivery through a smaller configured native hook. Installed proof must cover the
normal hook, complete versus partial unit labels, and unchanged-packet replay.

Expose the existing ordinary excerpt allowance to native hooks as
`context_router.optional_excerpt_bytes` (128–65,536 bytes). The manual flag overrides it; an omitted
field retains the existing 3,072-byte passage or 2,048-byte inactive-passage default. One shared
validator serves configuration checks and the command. This setting changes the ordinary file slot,
not the total route budget, source disclosure, classification allowance or confidence thresholds.
Doctor reports the configured/effective slot; no value establishes universal retrieval quality.

Reuse current literal `import`/`require` relationships from the maintained index during packet
fitting. A validated positive test may bring its already captured, answered non-negative
implementation immediately after it, ahead of unrelated optional background. Revalidate both source
digests. Required guidance and explicit pins stay first. The implementation remains uncertain where
its answer was uncertain; missing, negative or stale advice cannot gain this treatment. This rule
does not capture another file, infer a relationship, grant a larger allowance, issue another call
or recurse through dependencies. Record paired references and whether both originals were delivered.

The experiment tests whether procedure delivery changes decisions and accepted outcomes. It does
not duplicate DL04's executable recipe selection, add automatic model routing, launch a new worker,
or load all skill/runbook bodies into every prompt.

## E. Measure actual use and avoid the five demonstrated traps

| Lesson | RC10 response | Boundary |
| --- | --- | --- |
| Relevant procedures can change an outcome | Select and deliver procedure sections before task-specific reading; compare against source-only packets | A small demonstration motivates testing; it does not prove general superiority |
| A truthful report can describe a bad result | Existing quality/claim capture includes original requirements, constraints and applicable native evidence; test an honest harmful result | Claim support, requirement satisfaction and acceptance are separate; JEV cannot establish correctness or waive deterministic proof |
| Blocking can cause more retries and tokens | Existing owned denials return a named cause, the allowed next step and evidence reference; count repeated attempts where observed | Do not add a classifier gate to every native tool call |
| An alternate tool can bypass a narrow gate | Enforce resource/action authority in existing deterministic executor/permission owners; test covered alternate entry paths | Do not claim governance controls every shell, browser or native Codex action |
| The agent can read its evaluator's answer key | Keep frozen expectations and scoring results outside worker-visible fixtures, tools, credentials and mounts | An absolute directory outside the checkout is not sufficient isolation on an unrestricted host |

Extend the current observations and bounded SQLite telemetry projection owner. Filter by workspace,
runtime, time and event before applying result limits; order recent captures by time, not UUID. Expose
retention, incomplete ingestion, invalid records and write failures where known. Operational receipts
remain the evidence owner. Use the current projection to prioritize reads of recent originals, then
scan the remaining receipt inventory within the same 10,000-file and byte limits. Cache creation,
eviction or a missed concurrent write cannot hide receipt-only history. Mark partial scans and cache
write coverage separately; do not create a join store or ingestion retry loop. Passive reads neither
create stores nor call JEV, repair state or scan source/evaluation contents. Unknown coverage is not
zero activity.

Join prompt entry, route/family, task revision, decision request, delivered packet, expansions and
native check/workflow receipts using their existing identities. Import supported native usage at
the existing host observation seam, away from prompt latency. Observe governed later reads and
explicit accepted/reopened task evidence where their current owners expose them. Preserve unknown
native reads, acceptance and usage; do not infer acceptance from a commit or passing test.

Report total input/output, cached-input subsets, additional reads, JEV spending, operation/task time,
rework and the outcome source. Repeated cumulative conversation input is not uniquely read project
content; cached input is not another input total. Smaller packets and higher classifier usage alone
are not savings. Compare matched accepted outcomes before estimating a percentage.

## Qualification, adoption and stopping point

Use a reproducible generated large-inventory fixture for public release proof and small frozen cases
for a large multiplatform codebase, a mixed-language library and a web/release
repository, plus new-project and concurrent-worktree edges. Include a misleading easy request that
needs a procedure, a path with weak metadata, stale guidance, permission-denied body evidence and an
honest harmful completion claim. The plan defines the focused suites and one installed-package seam.

Freeze source, profile, toolchain, model, sharing and expectations. The release simulation runs
selection before an external scorer reads expected ranges. Autonomous outcome comparisons remain
a later isolated experiment; receipt and packet proof do not establish accepted-task savings.
Withhold expected answers from
workers using an enforced process/tool boundary; local code can score replayed packets without
giving the coding model evaluator access. Where native-host isolation is unavailable, do not call
an unrestricted autonomous run a blinded test. Keep live provider experiments outside adopters.

Name the configuration behind each retrieval result. Complete metadata coverage does not establish
delivery of every needed body or section. Smaller/default packet profiles may retain misses even
when a larger profile passes the same cases. Report index preparation separately from warm selection
and leave cold latency unknown until measured. Library-composed retrieval, an actual packaged-command
run and installed synthetic native-hook proof are separate evidence claims.

Adopt first in one paused, verified execution worktree with its chat attached correctly. Enable JEV
metadata, procedure and passage advice only for explicitly approved content; keep one coding model.
Observe a small set of ordinary accepted tasks before extending to the other repository shapes.
Record configuration-only fixes separately from runtime changes and installation probes separately
from development. Do not update active sibling checkouts as a side effect.

RC10 is ready for release when the focused identity/fallback/use contracts, decisive procedure/source
delivery in supported held-out cases, complete assessment in the healthy fully approved large-repository
case, recent telemetry and installed-package proof pass. A named omission alone does not qualify a
supported case; stress and permission limits remain explicit. Adoption effectiveness remains a separate
field result. No unqualified savings claim is needed to publish an experimental RC.

Deferred: transparent cross-worktree routing, fuzzy prompt caches, bulk model-authored descriptions,
vector/graph services, autonomous model selection, new per-tool JEV gates, computer use and another
analytics service. Revisit them only when the focused experiment identifies a need they can satisfy.
