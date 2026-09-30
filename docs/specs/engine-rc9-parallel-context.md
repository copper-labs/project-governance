---
id: spec.engine-rc9-parallel-context
title: RC9 Context Quality and Parallel Selection
type: spec
status: active
owner: project-governance
created: 2026-09-27
updated: 2026-09-29
summary: Improve prompt and metadata fidelity, rank useful context across the permitted inventory, and qualify bounded parallel JEV selection against frozen repository scenarios.
---

# RC9 context quality and parallel selection

The operator accepted this release direction on September 27, 2026. The first RC9 implementation
exposed a qualification defect: finding a relevant file or anchor line did not ensure that the
model received the implementation or assertion that answered the request. Passage correction and
release qualification remain open.
Installed RC8 behavior remains unchanged until
deliberate adoption. The [implementation plan](../exec-plans/active/2026-09-27-rc9-parallel-context.md)
owns delivery status.

This amendment replaces RC6's fixed metadata batch count and serialized transport, and RC7's
10-second operation / 3.5-second selection limits. Keep the
[maintained index and disclosure contract](engine-rc6-linked-retrieval.md),
[task-transition accounting](engine-rc7-prompt-reliability.md), and
[RC8 preparation, shared-hook and required-context repairs](engine-rc8-hook-sources.md).
The published [RC9.1 correction](engine-rc9-1-context-deadlines.md) removes RC9's original
per-request cap. The clock requirements below reflect that correction; its expedited qualification
limits remain in the RC9.1 delivery record.

## Problem and intended result

The current metadata caller batches questions but awaits each HTTP request before starting the
next. Its transport also holds a provider-health lock throughout network I/O and rejects overlapping
calls. Fast individual responses can therefore accumulate enough elapsed time to exhaust selection
while much of the permitted inventory remains unassessed. These are local implementation limits.

RC9 should assess more of the complete permitted repository inventory within one prompt entry.
Pack independent questions efficiently, run a bounded number of batches concurrently, and deliver
the validated results with honest coverage. Required guidance stays intact. The coding model stays
fixed; JEV still provides optional relevance judgments, never execution or governance authority.
Provider failure, missing credentials and unavailable coordination retain immediate local fallback.

More answers are not enough. The accepted scope also repairs the information presented to JEV
and the material returned to the coding model. Current extraction can mistake a multiline YAML
marker for a description; file eligibility omits some supported source types; purpose construction
can truncate the current request; positive answers retain baseline order rather than relevance.
RC9 must distinguish these defects from provider errors, disclosure exclusions and missing knowledge.

## Information quality before throughput

Use the existing maintained index, source facts, section spans and documentation-gap surfaces.
Do not add a summary-generating model, a second index or a new knowledge service.

| Weakness | RC9 requirement |
| --- | --- |
| Weak or misleading descriptions | Parse supported frontmatter with the existing safe YAML owner. Fold multiline summaries into useful text; ignore empty markers. Prefer authored purpose, actual headings and extracted symbols. Preserve extraction limits and source hashes. |
| Current and historical documents look alike | Retain declared document status and replacement references as metadata. An archive path is a clue, not proof of supersession. Keep historical material available for historical requests; declarations do not prove that code implements a proposal. |
| Eligible code disappears | Reconcile the source-extension policy with extraction support, including TS module variants and component files. Unknown syntax gets honest text-only facts. Replace the arbitrary short-path rejection with bounded canonical-path validation; retain traversal, secret, binary and generated-file exclusions. |
| Sparse or unfinished index | Distinguish path-only, parsed, truncated, pending and failed extraction from useful authored documentation. A cold or interrupted index must not report a complete semantic assessment. Reuse unchanged facts within the existing worktree identity. |
| Current intent is cut off | Preserve the complete accepted current prompt before optional prior-task background. Remove silent character slicing. If the provider payload cannot represent the current request, disclose the limit and use local fallback; do not classify a silently shortened task. |
| Relevant files arrive in the wrong order | Preserve mandatory and explicitly pinned material, then use metadata relevance to order optional files with stable path/identity ties. Positive passage judgments can promote the positive set for delivery but cannot use small probability differences to overturn its file order. Retain uncertainty and fallback candidates. Scores are model estimates, not calibrated guarantees. |
| Correct file, wrong excerpt | Prefer a complete, bounded test, declaration or document section over an arbitrary high-scoring line window. Preserve exact original ranges and hashes. Mark a selected unit incomplete when its body does not fit; never call its label or setup proof of its assertions. |

Required instructions cannot be shortened or demoted by these changes. Excluded paths remain
excluded. Better metadata does not replace source inspection for diagnosis or code changes.
An apparent contradiction between prose and source must remain visible, not be resolved by JEV.
Literal test descriptions can supplement declarations, with their own bounded metadata field and
exact source spans. They are authored clues, not proof that a test ran or passed. Keep them out of
symbol/signature counts, disclose capped extraction, and allow nested source spans to overlap.
Within the existing 96-span bound, test files reserve eight slots for literal test labels. This
keeps abundant declarations from hiding every authored test body; reaching either bound remains
visible as partial extraction.

After metadata selection across the complete permitted inventory (which may return partial
coverage), optionally ask JEV whether each captured passage directly
contains evidence for the original request, and classify its role (implementation, test,
documentation, operations or other) only where the source path does not already establish that role.
These are distinct typed questions over the same bounded,
source-permitted passages. An uncertain, invalid, missing or late answer cannot exclude a source;
the existing local order remains available. This stage is explicitly enabled in the DL03 question
list and shares the same retrieval clock, source permissions, family spend and receipt chain. It
never adds a second source index or authorizes an action. The passage judgment refers to the
actual captured constituent passage, not a file description. Record its exact range and digest;
deterministic composition may join several positively judged constituents for delivery.

Group consecutive small declarations of the same observed syntax kind into a passage of at most
1,024 bytes when only blank or comment lines separate them. Preserve each member's original span
and completeness. This reduces repeated question framing and lets related validators or assertions
reach JEV together. Rank these observed units using the existing source terms. Offer two rounds
across the four strongest permitted file ranks, then continue breadth-first across the remaining
files, with at most 64 prepared passages. This bounds source work without removing any path from
the metadata inventory. Record eligible, prepared, assessed and capped units separately.

For this opt-in stage, retain up to one quarter of the existing byte allowance, capped at 65,536
bytes, and up to two calls for passage work. Leave at least one configured call for metadata.
Read cumulative family spending, including prior passage calls, before planning each stage. Fit
passage batches to the remaining allowance before dispatch; never open a second paid allowance.
The transactional runtime still owns admission if concurrent work consumes the planned capacity.
Reduced metadata coverage must remain explicit. A large inventory may need an operator-approved
budget change; a longer clock alone cannot resolve a spending limit.

The deterministic packet builder keeps required and explicit material first. For optional material,
it promotes positive direct-evidence judgments in existing metadata/local order, choosing the
earliest positive with a new role before repeating a role. Passage probabilities determine the
positive threshold; they do not replace the file or prepared-unit ranking. Promote positive files
only within contiguous runs of files actually assessed at passage level. An unassessed or invalid
judgment keeps its original position and cannot be displaced by lower-ranked positives. It does not impose a fixed
role quota: a request may need two tests or no test. A role label alone is not evidence of relevance.
Uncertain judgments retain metadata/local order and local excerpts. Join adjacent positive source
ranges when their bounded union fits, keeping the separating source lines and exact hashes. Admit
passages in judgment order before joining; a later neighbor cannot crowd out an earlier admitted
passage. If a
judged composition cannot be represented or its source changed, return the local excerpt and a
named judgment limitation.
The packet records complete-unit versus partial-unit coverage, omitted useful candidates and the
reason a candidate did not fit. Original files remain addressable for follow-up reads.

If the maintained index lacks current syntax facts for an already captured optional source, use
the same literal extractor on those bytes before passage selection. Reuse matching cached facts;
bound new extraction to 64 captured files, 256 KiB each and the remaining selection clock. Record
reuse, extraction and limitations. This neither writes a second index nor scans more source paths.
Cold index state must not reduce an available captured file to one lexical window merely because
its syntax facts have not reached the cache yet.

For a new repository, readiness should distinguish an empty inventory from a broken index and
identify missing project purpose or authoritative guidance. Do not invent architecture to fill an
empty packet. For an established repository, report actionable documentation gaps and improve
authored overviews when the owning module is touched or repeatedly missed. Do not require a bulk
documentation rewrite or make prose completeness a new global gate.

Question layout is an evaluation variable. Compare the existing shared candidate descriptions with
a shared request plus each file's bounded metadata in that file's own structured question. Both
arms receive the same permitted facts. Adopt the simpler layout that preserves needed evidence;
do not increase batching merely because requests fit. TypeSafe documents
[shared state](https://docs.typesafe.ai/concepts/state),
[structured questions](https://docs.typesafe.ai/primitives/advanced), and
[distractor/indirection limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
These motivate a comparison, not a claim that either layout already performs better.

## Verified provider contract

Checked against TypeSafe's official documentation on September 27, 2026:

- Questions in one request run independently in parallel against shared state. TypeSafe recommends
  [packing related questions together](https://docs.typesafe.ai/patterns/fan-out).
- Separate requests can also run concurrently. The
  [parallel-questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions) explicitly
  distinguishes this from its sequential latency comparison. Its benchmark is not our performance proof.
- The [model reference](https://docs.typesafe.ai/models) lists 64,000 tokens for state plus all
  questions, and 32,000 for state plus the longest question. It lists 250,000 input tokens/second
  and 1,200 requests/minute; those rate limits may change without notice.
- The [API reference](https://docs.typesafe.ai/api) documents rate-limit and overload responses.
  Respect applicable Retry-After and backoff. RC9 adds no hidden retry loop to an interactive turn.

The published documentation does not establish a fixed simultaneous-request maximum or a
63-question ceiling. RC9's concurrency and question-count bounds below are product choices.
This uses the existing evaluation endpoint, not a new asynchronous bulk-job API or provider SDK.

## One retrieval clock

| Boundary | RC9 behavior |
| --- | --- |
| Complete retrieval operation | At most 30,000 ms of cooperative work, starting before local preparation |
| Provider selection and admission | Use the remaining operation time, reserving the final 500 ms for delivery and cleanup |
| Opt-in passage stage | Reserve the last 5,000 ms of selection for passage preparation and judgment; unused time does not delay return |
| Individual metadata or passage request | Use the remaining operation deadline; RC9.1 removes the separate one-second cap |
| Managed prompt hook | 40 seconds, allowing process startup and return/cleanup around the runtime's 30-second operation |

The 30 seconds is an upper bound, not an intended delay or 30 seconds per batch. Return as soon as
useful work is complete. Preparation, queue waiting, packing, selection and validation share the
same operation deadline. Do not retain a hidden 3.5-second selection default in CLI, prompt,
provider-context or expansion callers. A caller cancellation can end work sooner.
Other decision consumers retain their configured total call allowance, including admission; they
do not gain a second full HTTP allowance after waiting. Without an explicit caller cutoff, expiry
of that original allowance remains provider-owned for failure reporting and scoped suppression.
Compute the selection cutoff as operation start plus 29,500 ms. Each context call uses the
time remaining to that cutoff, without a separate per-call timer. Preparation that consumes
the selection allowance proceeds directly to local delivery, without opening another clock.

At the selection cutoff, stop admission, abort owned in-flight requests, settle their bounded
local handlers and assemble the packet from valid completed answers plus local fallback. Preserve
already-dispatched spending. No detached calls or later mutation of a delivered packet. Do not
label caller cutoff or queue exhaustion as provider failure. Synchronous I/O is still size-bounded;
record overruns rather than claiming that JavaScript timers can interrupt arbitrary synchronous work.

Each explicit expansion has the same operation envelope and shares the original family's paid
allowance, lifetime and two-expansion ceiling. A task switch or expansion cannot reset spending.
The hook installer reconciles exact known managed definitions to 40 seconds through the existing
backed process; preserve authored handlers and follow RC8 shared-source discovery. Doctor must
identify an older effective timeout. Host approval and observed prompt delivery remain adoption proof.

## Fuller batches without narrower discovery

Retain every eligible path and existing sharing exclusions, exact/changed-file priority and general
inventory coverage. Do not introduce a lexical shortlist, drop descriptions to hit a count target,
or equate the source-delivery limit with the inventory JEV may assess.

Use one shared purpose per request and one relevance question per candidate. For this registered
metadata layout only, allow up to 256 questions and the necessary purpose-plus-candidate evidence
items. This is a safety ceiling, not a required batch size or a claimed vendor limit. Other
question definitions keep their existing bounds. Reconcile the packer, request validator and
preparer through one declared metadata-group limit rather than scattered numeric exceptions.

Pack against the actual serialized payload and both provider token constraints. Keep the existing
65,536-byte request ceiling, profile evidence-byte limit and cumulative family allowance. Use the
existing conservative UTF-8-byte token estimator consistently; label estimates separately from
provider-reported usage. Split a batch when any bound would be exceeded. An item that cannot fit
alone retains its path/fallback and an explicit limitation. Larger count capacity alone does not
guarantee fewer batches when an existing byte limit is already binding.

The request layout, batch membership and question definition remain part of semantic replay
identity. A packing change may invalidate reuse but never erase earlier spending. Reuse valid
exact batches first and assess only remaining work. No second selector or cache is introduced.

## Bounded dispatch and shared provider admission

Start with at most four in-flight JEV requests per local provider pool, and no more than four
per retrieval. Refill a free slot as calls settle; there is no need to wait for a whole wave.
Independent batches may complete out of order. Join each result by immutable batch identity and
apply the relevance ordering above with deterministic ties, not completion order. Preserve useful completed siblings when one
batch fails. Global cooldown, cancellation or exhausted spending stops new dispatch.

The decision transport owns provider admission for all its consumers. Use a small, user-local
SQLite coordination store with short transactions and expiring dispatch leases; no daemon,
durable job queue, second task ledger or new service. Replace the network-long health lock.
The existing per-workspace decision budget remains the sole authority for task/family expenditure.
Provider coordination stores only counters, lease/attempt identities and health state, never
prompts, source contents, credentials, task briefs or a shared repository index.

For RC9, use one conservative local rate/concurrency pool for the approved JEV endpoint across
projects, worktrees, models and configuration revisions. Different local API keys share that pool
too; this avoids needing an account-ID discovery mechanism. Start at 200,000 estimated input
tokens/second and 960 requests/minute, leaving headroom below the published limits. Record the
effective limits. This pool covers cooperating processes for one OS user on one machine; it cannot
control other machines or unrelated clients using the same account. Provider responses remain
authoritative. Do not let per-project configuration create fresh pool capacity.

Admission proceeds as follows:

1. Check eligibility and prepare an immutable, validated batch. An exact retained answer needs no
   slot, wait or new reservation. A duplicate with an uncertain prior dispatch uses fallback.
2. Wait asynchronously for a local slot and both rate allowances, bounded by the selection deadline.
   Waiting is not provider latency, does not consume a paid call, and never holds a SQLite transaction.
3. Claim the shared lease and conservative rate allowance, revalidate that admission, then reserve the existing task/family
   budget immediately before dispatch. No fallible coordination write follows the paid reservation. Recheck deadline, cancellation and family eligibility.
   A declined reservation releases unused admission; no request is sent.
4. Dispatch under the individual request deadline and retain attempt identity. Committed task
   reservations and possibly dispatched requests remain spent even if their outcome is uncertain.
   A crash between the two stores may waste capacity; it must never create unaccounted dispatch.
5. Validate the response, publish that batch's receipt, and release only its matching lease.
   Reconcile provider token usage without retroactive refunds of ambiguous spending. Unknown usage
   keeps the conservative charge. Expired leases recover capacity during bounded admission; they
   do not delete receipts, reset rate history or release unrelated runtime/device ownership.

Use rolling rate windows or an equivalently conservative limiter; no accumulated burst may exceed
the configured window allowance. Leases outlive the request's enforced deadline plus bounded
cleanup. A late completion cannot release a replacement lease. Store contention, corruption or an
unknown schema returns named local fallback without destructive reset or unlocked provider access.

Keep authentication suppression credential-scoped using an opaque local identity, with no secret
in receipts. A rejected key must not disable a different key. Rate/overload cooldown applies to
the shared pool and respects bounded Retry-After; a stale successful response cannot clear a newer
cooldown or authentication failure. Other provider failures retain bounded suppression scoped to the credential and workspace/configuration identity.
Authentication suppression expires after five minutes; expiry permits a later explicit request, not
a background retry. It cannot permanently strand a key repaired on the server. Local database
contention never creates provider cooldown. A valid paid answer survives unavailable usage reporting
with a named coordination limitation; conservative rate accounting remains. Short coordination
transactions retry asynchronously within the existing caller limit or one 100 ms cleanup allowance.
The coordinator must merge concurrent health observations safely, not overwrite the newest state.
No automatic retry or new credential discovery is part of this release.

## Telemetry that explains the wait

Extend existing decision, route and prompt receipts and their compact status views. Keep joins to
the original prompt, task/revision, worktree, family and batch. Record:

- Preparation, index, batch packing, admission wait, selection wall time, delivery and operation
  wall time. Per-call HTTP elapsed time includes network/server work; do not label it pure inference.
- Per-batch queue, dispatch, completion, request bytes, estimated/reported tokens, dispatch outcome
  and active concurrency; summarize peak concurrency and completed/failed/cancelled batch counts.
- Eligible, permitted, excluded, submitted, answered and unassessed candidates. Report complete
  permitted coverage separately from sharing exclusions. Unanswered never means irrelevant.
- Prompt completeness, descriptor quality/limitations, ranking and selected section identities.
  Link expected-source evaluation to delivered passages; do not equate a positive file answer
  with the coding model receiving the needed passage.
- Distinct operation cutoff, admission/rate wait exhaustion, individual request timeout, external
  cancellation, budget exhaustion, provider rejection and storage failure reasons.

Concurrent call durations can sum to more than elapsed time. Preserve old aggregate fields for
receipt compatibility with an explicit meaning; add wall-time fields rather than silently
reinterpreting historical measurements. Report overlapping waits as aggregates, not additive
phases. Record received usage for discarded/late outcomes when available; unknown is not zero.
Byte estimates remain admission estimates, not invoiced tokens or claimed model savings.
Transport total time includes final lease-release retries. Admission and HTTP fields remain
separate from this cleanup time; completed receipts contain the settled timing and limitations.

## Repository-grounded qualification

Maintain a small external evaluation pack representing three different repository shapes: a large
mobile SDK with native bridges and device tooling, a multilingual library with platform contracts,
and a web application with background jobs and release controls. Start with three requests per
shape. Product identities, source copies, Git references, receipts and expected answers stay outside
this project-neutral checkout. Generic regression fixtures and this contract belong here.

Each case records a frozen commit, inventory digest, relevant source blob hashes, a realistic raw
request, expected evidence groups, required passage anchors, known misleading/historical material,
and the effective sharing policy. These are mock development requests grounded in real source,
not reports of new application defects or accepted tasks. Read Git objects without checking out,
resetting, installing into or running commands from an active adopter. Uncommitted work is outside
the frozen case and must be disclosed as such.

Keep expected answers separate from provider inputs. JEV sees the full policy-eligible inventory,
including unrelated files, not just the case's expected files. Selected source copies provide
reviewable answer evidence; they are not a miniature repository used to claim full-inventory recall.
Use the existing extraction/selection entry point against a frozen local snapshot when executing
the benchmark. Record generated/dependency, sensitivity, extension and disclosure exclusions.
No script from the reference project is executed as part of retrieval evaluation.

Two policy views serve different purposes. The installed policy explains current adoption limits.
A separately recorded evaluation policy may test wider coverage only within explicitly authorized
disclosure. Do not silently broaden the former or send locally inspected sources to a provider just
because they were useful for constructing the answer key. A blocked expected source is a policy
limitation; it must not count as a successful semantic exclusion or vanish from the total denominator.

Compare three bounded arms: frozen RC8, repaired RC9 without a provider, and RC9 with live JEV.
Keep raw requests, source revision, disclosure, packet bytes and required guidance constant; record
unavoidable version differences. Use cold/warm index trials separately. Within the JEV arm, compare
sequential/concurrent transport and the two metadata layouts without changing the expected answers.
Mark development cases versus reserved cases before tuning; do not tune on every case and call the
same set independent validation. Pin the model, attempt limit and spend ceiling before live execution.

Score evidence groups rather than demanding one exact file when equivalent authoritative evidence
exists. A source satisfies a group only when delivered lines contain the substantive behavior or
assertions named in its frozen answer rubric; a matching path, heading, test label or setup line is
insufficient. An inclusive proof range requires every line in that range, not just its endpoints.
Independently review any equivalent source and record why it proves the same point
before comparison. Check both retrieval and delivery: needed files found, needed passages delivered, misleading
material included, required guidance retained, bytes delivered, follow-up reads, latency and provider
usage. Record a reason at each lost step: missing source, extraction, disclosure, ranking, packet
budget, dispatch or host delivery. Where a downstream model is not run, extra reads and task outcome
remain unknown. Never infer main-model token savings from packet size alone.

Keep controlled overlays separate from unmodified real cases: an empty/new project, incomplete
documentation, a multiline summary, a long multi-intent prompt, a superseded document, extension/path
edges, and two worktrees whose same-named file has different contents. These fixtures prove behavior
without injecting fake defects or changing reference projects. Add one unavailable-answer case that
requires the system to expose insufficient evidence rather than manufacture a source.

## Qualification and release boundary

Prove deterministic concurrency, accounting, cancellation and cleanup using synthetic fixtures and
temporary worktrees. Then perform one bounded live-JEV comparison on the same permitted synthetic
inventory: sequential and concurrent dispatch, identical pinned model and question semantics.
Compare normal and larger feasible batches without silently narrowing scope or raising source
permission. Measure coverage, expected relevant-file recall, elapsed time, rate errors and usage.
If larger batches lose needed evidence, revise their ceiling before release; speed alone is not success.

The repository cases must additionally demonstrate useful passage delivery across all three shapes.
Deterministic contract cases must pass. Every real-case miss must have an attributed stage; an
unexplained loss of required evidence or a regression against the matched baseline blocks closeout.
Record policy-blocked cases separately from completed live cases. Release notes must identify any
repository shape that lacks authorized live proof. A small benchmark supports this release decision,
not a claim of broad accuracy or production savings.

A healthy representative inventory larger than one batch must finish with complete permitted
coverage within the 30-second operation, without lost required context or leaked leases. A larger
or deliberately slow inventory may return partial coverage with correct cutoff/fallback evidence.
No fixed inventory size can guarantee complete live service responses under every workload.

One frozen implementation review and affected reconciliation precede immutable RC9 publication.
Coordinated adoption uses the actual shared hook source and each active worktree's runtime pin;
it does not write across busy trees. Clean cutover is preferred to a dual RC8/RC9 provider owner.
Subsequent ordinary accepted tasks establish usefulness; a synthetic integration run does not
establish developer token savings. Computer use, automatic model delegation, new graph services,
and broadening provider disclosure remain outside this release.
