---
id: spec.engine-rc6-linked-retrieval
title: RC6 Prompt Entry and Maintained Repository Context
type: spec
status: active
owner: project-governance
created: 2026-09-23
updated: 2026-09-25
summary: Automatic prompt entry, a rebuildable SQLite repository index, source-backed relationships, bounded JEV selection with expansion and real-task qualification.
---

# RC6 prompt entry and maintained repository context

The [RC7 reliability amendment](engine-rc7-prompt-reliability.md) supersedes this contract's
timing and same-turn task-transition behavior. The retrieval and index boundaries below remain.

The accepted RC6 boundary is **automatic prompt entry, a maintained repository index, basic
relationships, bounded JEV selection with expansion, and evidence from real development tasks**.
The operator accepted this expansion on September 25. The earlier transient-index candidate is a
qualified implementation baseline, not completion of this expanded scope. The
[implementation plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md) owns progress and release
gates. The operator accepted the reviewed design and simplification recommendations on September 25
and authorized implementation. The maintained-index expansion still requires its implementation and
qualification slices; design approval is not runtime or release proof.

The [ordinary task context contract](engine-task-context-entry.md) owns task identity and required
routing. The [memory boundary](engine-memory-boundary.md) owns optional history providers. The
[repository-index research](../research/2026-09-25-repository-index-harness-practices.md) explains the
alternatives and their evidence limits. This specification narrows those alternatives to one first
implementation. Source documents, code, task records and checks retain their existing authority.

## Intended result and stopping point

A developer submits a request. Before task-specific reading, the supported host automatically
returns a small packet with current guidance, useful source spans, related documentation/tests and
explicit coverage limits. The fixed coding model diagnoses and changes code. It can ask for a
bounded expansion when the first packet is insufficient.

The first release requires all five parts of the accepted boundary. It does not require an embedding
service, graph server, general call graph, generated description for every file, background daemon,
automatic delegation, Mnemos adoption, or new build/test/release authority. Those remain outside RC6.
Existing decision consumers and local/remote CI continue through their present owners.

Automatic entry is qualified for the existing Codex prompt-hook owner first. Other hosts retain
explicit governed commands until independently qualified. A registered hook, a CLI stdin fixture,
or an answered JEV request alone cannot satisfy the native-host release gate.

A resumed Codex session may run under a new native process while the previous process's startup
reader is still recorded. If the old process is proven absent and the exact active runtime still
matches the pinned lock, the new prompt may prepare advisory context under a recoverable
observation reader. It is held through bounded selection and released on normal completion; an
abruptly terminated hook leaves an exact reader that observation recovery can clear after proving
process absence. A resumed SessionStart may return without discovery or update authority; the
subsequent submitted-prompt hook supplies context. It must not transfer or retire the old
startup/update owner, enable an automatic update, or claim
the old observation completed. If process absence or runtime identity cannot be proved, retain
the explicit lifecycle-unavailable output. Session-end or deliberate owner recovery remains the
cleanup path for the old reader.

## One flow and clear ownership

| Step | Code owns | JEV contributes | Coding model receives or does |
| --- | --- | --- | --- |
| Prompt entry | Validate host, workspace, session and turn; resolve existing task binding | Nothing | No manual setup judgment is needed to start local retrieval |
| Required guidance | Apply authored routes, deduplicate exact content, retain mandatory instructions | Nothing | Small current instruction packet, or an explicit overflow blocker |
| Index refresh | Reconcile source identities, reuse unchanged facts, extract changed facts within limits | Nothing | Coverage and freshness are visible |
| Discovery | Search the full eligible index by exact names/text and verified links; enumerate all metadata-approved paths independently | Assess relevance from the prompt and permitted descriptors, in bounded batches | Current optional spans with source references |
| Expansion | Fetch explicit originals, continue unassessed inventory, follow bounded verified links | Continue the same optional relevance question when useful and budget remains | Additional source with omissions and reasons |
| Work and measurement | Run existing checks/workflows; join entry, reads, usage and acceptance evidence | Existing optional completion/output consumers remain separate | Diagnose, edit, validate and record an accepted or reopened result |

No model chooses source permissions, waives a check, grants an Apple approval, accepts its own result,
or changes the coding model. Single-model operation remains the default. An operator-requested
review is a separate, attributed provider job.

## Automatic entry and instruction discipline

Use the actual submitted prompt from the supported event. Do not ask the LLM to summarize or classify
it before retrieval. Follow-ups combine that prompt with intent from the current session-bound task
and the prior turn reference, when available. Do not infer a task from global recency.

Reuse an existing valid continuity binding. Without one, create an idempotent provisional entry
receipt keyed to the validated host/session/turn/worktree; do not create an accepted task or execution
permission. When that same session deliberately creates or resumes a task, the normal entry owner
links the provisional entry to the exact task revision. Older provider jobs retain their captured
binding, including an absent one; later bindings must not retarget them. A new job can use the new
binding. Shared policy and facts still have one owner.

The first explicit task link is an append-only association, not a new retrieval family. Preserve
the original purpose, cursor, expenditure and receipts. Do not silently add the task's rewritten
intent to already asked questions. If more intent is needed, treat it as an explicit clarified
purpose for subsequent assessment. Reuse semantic answers only when their complete supplied
question/evidence/model/config identity still matches; linking a task does not justify reusing an
answer for changed wording. A later revision of an already-bound task is a distinct invalidation.

New installations receive a conservative default route and the existing backed hook installation.
Existing authored profiles and host settings are reconciled deliberately. Hook configuration cannot
grant host trust. Readiness distinguishes installed, trusted when observable, invoked, packet
submitted, and host-visible delivery. Missing host evidence stays unknown.

The managed Codex prompt handler delivers its complete `additionalContext` (`additionalContextLimit:
0`), with governance enforcing the 24,000-byte packet cap. The host's default preview must not silently
shorten required guidance. A changed hook still needs native trust review; configuration alone is no
proof of delivery. See [Codex hook output behavior](https://learn.chatgpt.com/docs/hooks#large-hook-output).

Record the native turn before optional preparation, including a refused or interrupted turn when its
session/workspace identity is valid. A newer turn without a completed entry must not cause task
association to search backward for an older prompt. Duplicate turns do not repeat paid selection.
If turn recording is unavailable, preserve deterministic local guidance and make no paid call;
binding, replay and usage coverage remain unproven. Do not infer missing events after a storage loss.

Keep the managed instruction block short: use the normal entry, preserve source references, expand
when needed, and bind clear intent once. Doctor identifies missing routes, conflicting startup
instructions, old task-specific disclosure lists, required-document overflow and enabled consumers
that receive no eligible input. It reports literal configuration/receipt evidence, not a speculative
verdict about agent intent. Authored files are not silently rewritten.

Required instructions cannot be demoted or truncated by JEV. Doctor reports which required files
consume the packet budget. A reviewed profile may move background indexes or reference collections
out of always-required material, preserving their originals and retrieval links. Overflow returns a
compact blocker and original references. If required guidance fits but optional sources do not,
deliver the guidance plus bounded references and an explicit partial status.

Unborn Git remains valid. First staged and untracked files can enter a content-bound subject without
creating a commit. Invalid explicit bases, unsafe paths and stale captures fail their existing
validation. Existing first-commit limits of 4,096 files and 8 MiB remain explicit capture limits,
not a claim that a larger repository was searched completely.

## A maintained, disposable local index

### Storage and identity

Use one per-worktree SQLite projection under the existing external context state root, separate
from the critical continuity database. This is derived retrieval data, not a second operational
store. Rebuilding or removing it must not change tasks, checks, permissions or evidence. Do not add
a service, shared cross-worktree cache or migration to the task schema in this iteration.

Logical records are deliberately small:

| Record | Required facts |
| --- | --- |
| Generation | Canonical repository plus existing worktree filesystem locator, selected source view, subject identity, schema/extractor versions, refresh progress and limits |
| File | Relative path, source digest, language, byte size, indexing disposition, literal description provenance and source ranges |
| Span | File/digest, kind, symbol or heading, signature where available, start/end line and bounded literal descriptor |
| Relation | Typed endpoints, declared or parsed origin, original path/range, source digest and resolved/unresolved state |

File facts are keyed by captured content digest and extractor version. Path maps are specific to
the selected worktree and source view. A staged request must never reuse unstaged facts merely
because the path matches. Config identity is included when it affects eligibility or resolution.
No cached judgment or index record establishes that current source is unchanged.

Automatic prompt entry uses the current worktree view, including eligible non-ignored untracked
files. Explicit staged checks use the staged view only. Branch names and directory paths alone are
not identities: a recreated worktree must validate its filesystem identity before cache reuse.
Use the existing continuity `workContext().locator`: device, inode and birth time of that worktree's
Git administrative directory, alongside its canonical worktree path. It is not the path hash used
to locate today's external context directory. Compare this recorded locator before cache reuse;
unavailable identity falls back without claiming a verified projection. No identity service is added.
The owner currently substitutes the worktree directory when Git lookup fails; the index must detect
that case rather than treating it as verified Git identity. Missing/zero birth time is also an
unverified discriminator. Do not promise recreation detection on every filesystem: source digest
and delivery revalidation remain the correctness boundary, and uncertain identity disables cache reuse.

Store bounded literal descriptors, symbol facts and ranges, not whole source bodies or another
prose knowledge base. Search descriptors through SQLite FTS5 in the same projection; use parameterized
queries and treat the prompt as text, not SQL or an unrestricted search expression. Retain ordinary
path/exact-name lookup if FTS is unavailable. Installed proof must verify FTS support in the shipped
Node runtime; it must not download a loadable extension at runtime.

### Refresh and lifecycle

Use the existing immutable-subject capture to enumerate safe eligible paths. Tracked files observed
clean through Git may reuse facts keyed to their index blob ID and extractor version; dirty/untracked
files require captured-byte digests. Reconcile tracked inventory with Git's dirty/untracked view;
do not use size/mtime as proof of unchanged content. Treat assume-unchanged/skip-worktree flags,
unmerged entries and unavailable dirtiness evidence conservatively as unverified, not clean.
Record the freshness basis: Git-observed clean, captured bytes, or unverified. This avoids hashing
the entire clean tree on every prompt without pretending Git observation is an atomic snapshot of
concurrent writers. Selected source is always captured/revalidated before delivery. Invalidate
deleted, renamed, changed or newly ineligible paths, and re-extract only missing/changed facts.
Reconcile on normal context entry and explicit refresh; no always-running watcher is required.
Keep Git blob identity distinct from the digest of extracted working-tree bytes. EOL normalization
and clean/smudge filters can make them differ; extraction and delivery revalidation must compare the
same byte representation. Include filtered files in freshness qualification without invoking an
untrusted filter merely to generate metadata.

A cold or large repository may need several bounded refreshes. Every current eligible path remains
in the inventory even when detailed extraction is pending. Such entries remain path-only candidates;
they are not silently dropped from JEV discovery. Publish refresh batches atomically with a visible
watermark. Never call a partially refreshed generation complete.

Use short SQLite transactions and bounded writer waits; a busy, incompatible or corrupt projection
falls back to current deterministic retrieval with a named reason. The repair surface is an explicit
rebuild of this cache only. Readers must not open or migrate the task store to repair retrieval.
Use SQLite snapshot reads and a generation-checked publish transaction. Two sessions in the same
worktree may duplicate a bounded extraction batch; the losing publisher discards/reconciles it rather
than replacing newer facts. Do not add a separate refresh lease manager merely to eliminate that
small amount of duplicate work. Status can identify a cache whose recorded worktree no longer exists;
explicit cache removal/rebuild affects only that verified projection, never task/evidence history.
Invalidate stale endpoints before using links. Garbage-collect orphaned derived rows during bounded
refresh/rebuild and enforce a byte cap so repeated source versions cannot grow without bound. Retain
generations referenced by the current worktree/staged views or active readers only; do not archive
old source-index generations. Preserve referenced file facts until those readers finish. A branch
switch may require extraction again; measure that cost. Existing source evidence and task history
are outside this cache reclamation. Source
withdrawal/deletion and local eligibility changes invalidate the corresponding projection before use;
physical removal follows the source owner's retention requirements. Hosted permission revocation
is enforced on every request even if local metadata remains legitimately cached.

Select and revalidate the authoritative source bytes before producing excerpts. A failed digest,
missing target or renamed path triggers a bounded refresh/retry or an explicit unavailable reference.
It does not fall back to a cached old body. Keep one retry through the existing source owner.

The implemented cache uses schema 1 with source facts stored as JSON rows; spans and raw links live
inside those content-addressed facts. Endpoint resolution stays against the current inventory instead
of duplicating it in another graph table. Warm opens and unchanged generations do not take a write
transaction. SQLite's rollback journal holds a reader's snapshot and can delay a publisher, whose
bounded wait falls back; it does not require WAL or a separate lease service.

The physical file cap is 64 MiB. Each of the two views admits up to 16 MiB of unique fact JSON,
leaving space for path maps and search indexes. Additional facts retain a key-scoped `index-capacity`
disposition until their source changes or an explicit rebuild. A physical SQLite capacity failure is
also named. This does not promise unlimited repository size or silently drop eligible paths.

An explicit rebuild initializes a fresh owned filename and atomically switches the cache pointer.
Old connections cannot publish into the replacement. Retired files are reclaimed only after acquiring
an exclusive SQLite lock; busy or damaged files remain inspectable. At most four owned files may
coexist before rebuild reports capacity and asks for inspected cleanup. This small recovery pointer
is not a second runtime authority. `context-index status --cache-root <path>` can passively identify
an orphaned recorded workspace. Refresh/rebuild cannot target another explicit cache root.

### Extraction coverage

For TS, TSX, JS and JSX, reuse the already packaged TypeScript compiler API for syntax-level
definitions, signatures, ranges and static import/export declarations. Do not create a full compiler
program, type-check a host application, run its build or claim runtime call-graph precision. Extract
Markdown titles, headings, literal summaries and local links through the existing document owners.

Other languages retain safe file paths and the existing literal overview/symbol clues, clearly
labelled heuristic. Unsupported or oversized files remain represented with a reason. A TypeScript
parser is not proof of Swift, Kotlin, Python or Flutter structural coverage; current comment analyzers
remain their separate enforcement owners. New parsers require a demonstrated retrieval need and
packaging qualification, not a universal multi-language index in RC6.

Reuse the existing per-file and per-window source limits as initial bounds: 256 KiB per file,
4 MiB per window and 32 MiB per foreground invocation. Detailed extraction can stop; inventory
coverage and explicit original references cannot pretend the skipped data does not exist. Track
cold, warm and changed-file refresh costs separately. Status/doctor reads existing metadata without
triggering a full refresh or provider request.

## Basic relationships, not inferred dependencies

Build only relationships with inspectable source provenance:

- Existing capability catalog links between an owner, guide and declared sources. Tests and workflow
  files explicitly listed as sources participate as declared membership, not inferred test coverage
  or executable workflow dependencies. Store the catalog digest and record pointer, plus endpoint
  digests when extracted. At most 256 records, 32 members per record and 4,096 edges are materialized;
  truncation remains visible. Do not invent a second catalog or extra typed fields for absent relationships.
- Markdown local links, with the originating document/range and current target validation.
- TS/JS relative static imports/exports resolved against the captured inventory using a small,
  declared extension/index-file policy. Ambiguous targets, aliases, package exports, dynamic imports
  and generated paths remain unresolved unless an existing exact owner supplies the mapping.
- Existing task-to-attempt/evidence/artifact and check-to-subject references, queried from their
  current owners. Preserve historical status and link to current source before claiming currency.
  Query these live; do not persist a second task/evidence graph in the source index.

A name resemblance such as `foo.ts` and `foo.test.ts` may be a search clue, never a verified edge or
proof of test coverage. Relationship expansion is one hop per request, bounded by the same result
and byte limits. Deduplicate cycles by stable source identities. Links support discovery and explain
why a file appeared; they cannot authorize test skipping, build reuse or release acceptance.
Forward results report coverage for their source. Reverse results also report the generation's
extracted-file coverage and remain partial while possible referring files are unparsed. No edges
found in a partial projection is not proof that no callers/importers exist.

The existing history baseline remains up to 32 recent non-cancelled task references, at most three
local summaries in 2 KiB. Historical prose stays local and labelled background. This iteration does
not add a historical full-text corpus, JEV ranking of historical prose or a Mnemos adapter. The
memory port remains available for separately qualified future providers.

## Complete inventory, bounded semantic assessment and expansion

### Discovery before packet limits

Keep four coverage measures separate: current eligible inventory, permitted hosted metadata,
actually assessed metadata, and source spans finally delivered. The local inventory can include
safe text not approved for hosted disclosure. `allowed_metadata_paths` and the metadata data class
control hosted paths and the submitted purpose. Body-derived descriptors additionally require the
source data class and `allowed_source_paths`. Permission for local indexing is not permission to send
its contents to JEV. Credentials, generated/dependency trees, binary bodies and unsafe paths remain
excluded by the existing path/safety owner.
Relationship facts, edge reasons and other endpoint paths stay local in RC6; they are not appended
to JEV state. Each hosted candidate independently passes path/descriptor permissions. This avoids
disclosing an unapproved endpoint through a locally approved relationship.

Search exact paths, symbols and descriptor text across the complete local eligible projection.
Verified relationships are an additional route. These results improve deterministic fallback and
help select spans; they are not a relevance filter deciding which paths JEV is allowed to assess.
The independent JEV discovery traversal retains the complete metadata-approved inventory before
packet, seed, keyword, directory or task-scope relevance caps. Required route applicability and
hosted permissions keep their existing deterministic owners.

Use the existing DL03 `context.metadata-relevance/1` question, shared purpose per batch, conservative
positive-answer interpretation and provider health/budget owner. Ask one relevance question per
candidate, in batches of at most 63. Do not add novelty, sufficiency, model-routing or another judge
question in this iteration. Merge valid JEV picks with required and explicit task-named sources and
current relevant changed sources; preserve their priority independently of relevance scores.

Cached metadata reduces repeated extraction. It does not make meaning or relevance independent of
the current request. Reuse paid decisions only for the existing exact replay identity: same prompt,
task revision, source metadata/digests, permission/config version, model/question version and request
shape. Do not reuse a prior turn's answers merely because files are unchanged.

Budget/deadline exhaustion must expose assessed, unanswered, unvisited, unsupported and
outside-sharing-scope counts separately. Do not report unvisited files as JEV rejections. Keep the
stable hash-derived order for the general inventory, but interleave it with exact/descriptor/link
hits: while the general remainder exists, at most half each batch's slots come from the priority
stream. Fill unused priority slots from the remainder and deduplicate identities. This changes
assessment order, not eligibility, and prevents either a random-only scan or lexical hits from
consuming every slot. Record priority/remainder assessed counts and the complete unvisited remainder.
The cursor stores its generation and exact completed batch receipts. It reconstructs the complete
unvisited remainder from the current permitted inventory rather than storing a second path list;
repeated requests must not silently rescan the same prefix. No low score or empty partial result proves absence of a useful source.

### Expansion through the normal command

Add a continuation mode to the existing `context-route` command, not a new agent or query service.
A returned packet includes its entry ID and the supported expansion invocation, with an instruction
to supply the current or clarified `--task` purpose. The cached packet never copies the raw prompt
into a persisted command. The contract
is: parent entry, validated current caller/workspace/task, optional explicit paths or clarified
purpose, and a bounded continuation result. CLI flag spelling is finalized with its existing owner.

An unchanged-purpose continuation first fetches requested originals or one-hop links and then
continues unassessed semantic candidates. Reuse prior exact answer receipts when valid. An explicit
file read remains possible without JEV. A clarified purpose invalidates semantic answers for that
purpose and records a new question digest; it does not widen permission or reset the family's budget.
A source edit reconciles the cursor against the new inventory: remove deleted paths, requeue new or
changed descriptors, and retain progress on compatible unchanged entries. Old answers are reusable
only when the complete supplied semantic input remains identical. If one shared batch's evidence
changes, do not assume its other answers are exact replays based on per-file digest alone. Preserve
the old receipt as provenance and requeue affected questions within the remaining family allowance.
Permission/config changes or revision of an already-bound task invalidate incompatible semantic
state, retain prior spend, and report why the remaining search changed. Closed/mismatched task
bindings cannot inherit authority. The first provisional-to-task association follows the special
link rule above; it does not restart traversal.

The initial entry and up to two agent-requested expansions share one existing metadata budget
partition keyed to the entry family. Count actual calls/bytes across the family; duplicate requests
cannot spend again. Each response retains the 3.5-second provider-selection limit and one-second
individual-call cap (or stricter profile settings), leaving time for fallback. No separate budget
system or automatic retry loop is added. Exhaustion returns references, coverage and the ordinary
search/read fallback; it does not prevent deliberate original reads. Further expansion requires a
new explicit operator request, not a hidden refresh of the same allowance.

The family key is the original entry ID, independent of subsequent purpose, batches or first task
association. Extend the existing budget owner explicitly: today's close-after-every-invocation
behavior cannot implement this family contract unchanged. Keep counters/reservations durable, close
the family after its second expansion, on a newer root turn in the same host/session/worktree, or
after 15 minutes. Expiry is checked by that owner on reservation; passive status only reports it.
Admission must also exclude expired families from the open-capacity count, even if their callers
never return. Reclaim them through the existing bounded reservation path, not a timer or daemon.
An in-flight reservation stays spent and its result remains tied to its original snapshot. A closed
family cannot start a new call. Capacity exhaustion returns a named local fallback. Inactive or
missing-token entry does not allocate paid-family accounting. After the original 15-minute lifetime,
the next admission retires at most 128 expired family/request rows, their family-only accounting and
owned cursor files. Ordinary decision scopes and all audit receipts remain retained. The immutable
prompt preparation and its original timestamp prevent reopening an expired entry; moving or deleting
an optional cursor cannot reset expenditure. Completed steps may replay without spending within the
original lifetime, including after the second expansion; expiry refuses even that replay. A cursor
read failure releases only the newly claimed, undispatched step. It never refunds a provider call.
Any needed budget-schema change is
qualified at I4; it is not a continuity schema change or a new budget service. Family expiry does
not release any process, device, runtime-reader or workspace ownership.

Each new operator turn can create a new bounded family; RC6 deliberately has no automatic session-wide
monetary ceiling. Long sessions can therefore accumulate calls/latency. Report that cumulative usage
and measure short follow-ups in I5. Keep the existing off switch and per-family bounds; do not add
a model to decide whether a prompt deserves another model call.

Synchronous source work is size-bounded, not a hard host wall-clock guarantee. Native-host timing
qualification must include cold indexing and slow paths. A caller cutoff does not trigger provider
cooldown; actual provider errors and the provider's own timeout retain existing suppression.
No account, missing credentials, off mode, uncertainty, provider error or index failure must prevent
the normal local context path. Index refresh itself never calls JEV.

## Documentation from both ends

Improve authored intent while improving retrieval. Changed behavior needs its canonical purpose,
public contract and important constraints documented at the owning module/guide. Prefer one useful
module overview and existing capability links over a generated paragraph in every file.

Existing comment/document checkers remain the enforcement owners. Compared/explicit selected
Markdown requires a non-empty title and summary. New/touched declarations follow configured,
supported analyzers; untouched debt and unsupported languages remain advisory. All-files inventories
lack change provenance and retain their prior enforcement, rather than gaining a new global debt gate.

The index distinguishes literal overview prose from names/headings. Existing telemetry aggregates
bounded `overview-not-observed` references with source digests and repeated retrieval misses. An
unread, unsupported or oversized file is unknown, not poorly documented. A module guide may already
explain a flagged file. Revalidate source and inspect the canonical guide before gradual backfill.
No extra scan, model call or new documentation-debt store exists only to score documentation.

## Observations and ordinary-task proof

Extend existing entry/route/decision/usage/outcome receipts; do not create a competing event system.
Record index generation and freshness, extractor coverage, refresh/reuse work, discovery reasons,
assessed/unvisited counts, selected span references, packet bytes, provider calls/latency, fallback
reasons, expansion parent and original-read coverage. Keep raw prompts/source bodies out of telemetry.
No enabled flag or synthetic provider-job scope substitutes for ordinary task linkage.

Link entry to host session/root turn, packet submission, first observable task-specific read, later
expansions, bound task/revision, provider jobs, known model response usage and explicit accepted or
reopened outcome. Capture auxiliary model usage separately; a requested model name is not proof
that no other model ran. Do not add cumulative resumed-session counters as new per-call spend.
A known observation window is a subtotal unless complete coverage is established.

Preserve unsupported/unknown host usage and read coverage as unknown. A prepared packet is not proof
that the model used it. First-read order can be evidenced by a supported host trace; semantic use
requires an observed source reference or task outcome and must not be invented from transport alone.
Native usage import runs on session end or explicit import, not on every prompt's critical path.

Release qualification uses about twelve frozen retrieval cases and at least two ordinary development
tasks, one code fix and one cross-file change involving documentation/tests. At least one must exercise
live JEV selection through the actual supported host before task-specific reads. Bind both accepted
outcomes to the exact candidate and source, record available response usage and read coverage, and
show an actual expansion recovering a missing useful source in either the tasks or a controlled case.
Installation probes and synthetic cases cannot replace this task evidence. Use this repository or
an explicitly authorized pilot workspace; this contract does not authorize writes into adopters.

Compare current transient retrieval, maintained deterministic retrieval and that same maintained
index with JEV, holding source, main model, instructions and delivery budget fixed. Include index
preparation/refresh cost, useful spans, later reads, rework and completion time. Live variants receive
the same permitted source corpus; the deterministic top results must not become JEV's only input.
Run the old transient baseline from a frozen, hash-identified evaluation artifact outside the RC6
distribution. The evaluation harness may adapt its invocation/output, but must not alter its retrieval
behavior or feed it answers from another arm. Keep baseline state isolated from candidate stores and
include adapter/initialization cost where comparable. RC6 ships one maintained-index implementation;
do not retain an old/new production backend switch. JEV-off mode, missing-token fallback and cache
failure recovery remain supported by RC6's ordinary local retrieval path.
When repeated tasks would leak answers, use clean reset copies or separately labelled prospective
observations. A small trial can qualify working delivery without establishing a statistical savings
claim. Missing all ordinary host use or accepted outcomes is a release blocker, not a successful
experiment with unknown value.

All deterministic safety, identity, required-instruction and fallback cases must pass. A material
omission or rework regression on the frozen cases must be resolved or the optional effect reduced
before release. Do not promote new dependencies or model passes on API price alone.

## Configuration and deferred scope

### Multiple worktrees and coordinated upgrades

Use the existing repository namespace and worktree filesystem locator plus host/session/task IDs.
Each worktree owns its current source map, index generations, prompt families and installed runtime
selection. A shared continuity store may retain repository history under its current owner; it does
not make two worktrees' live source or task bindings interchangeable.

By default, linked Git worktrees share `<git-common-dir>/harness/harness.db`. Independent clones and
other repositories do not share that store. SQLite transactions coordinate concurrent writes; they
do not establish compatibility between runtime versions. RC6 retains continuity schema version 6.
RC6 adoption uses a clean cutover: finish active RC5 jobs, approve the RC6 pin in one integration
tree, then reconcile each linked worktree at its safe seam before it writes shared history again.
Mixed RC5/RC6 writing to one continuity store is not a release claim. Equal schema numbers alone
are not proof of behavioral compatibility. Do not automatically migrate a shared continuity store
as part of this per-worktree index feature.
The existing continuity owner already upgrades schema 4/5 to 6 on writable open. This feature does
not change that behavior or make pre-v6 sibling runtimes safe. Older or unknown siblings must also
be reconciled before shared-store writes resume.

A future incompatible continuity migration requires a deliberate repository-wide pause of every
process using that shared store, a verified backup and qualified migration before work resumes on
compatible runtimes. Draining only one tree's runtime readers is insufficient. That future operation
is outside RC6; do not add an upgrade coordinator or imply the current per-tree guard enforces it.

A merge/rebase/checkout creates a new destination subject. Refresh its index from those destination
bytes and invalidate affected spans/links. Do not merge cache databases, transfer prompt cursors or
rewrite source-worktree receipts as destination proof. Link the original work as history where useful;
Git merge does not itself close a task, transfer agent ownership or prove the merged result. Rerun
affected required checks for that result; reuse only evidence whose current applicability is proven.
Unresolved Git conflicts are an explicit degraded retrieval/validation state, not a clean generation.

Recommended operating practice is one designated integration worktree to qualify and commit each
governance version/profile/hook update. Use the existing manual-adoption default for this coordinated
workflow; do not add a leader service or allow every agent to independently select a newer pin. This
is a project-owned workflow convention, not automatic discovery of a privileged `main` path.

Feature worktrees receive the reviewed tracked pin/configuration through Git at their own safe seam.
They then reconcile their local launcher, runtime selection, hooks and context index to that pin.
They may finish already-started jobs under their original retained runtime. A pin change must not
switch a live job mid-run; runtime replacement still requires drained readers and owned maintenance.
Do not merge/update files in a worktree while another owner is changing them. A merged pin that
differs from the installed generation blocks new governed execution until installation is reconciled;
do not bypass that guard or silently reinstall another worktree.
When a merge brings a new pin, resolve the installation footprint first: lock, profile, hooks and
managed instructions. Explicit manual reconciliation of that destination installation is permitted
while the merge is still open, after its readers drain. Preserve the merge state and unrelated index
entries. If the installer changes tracked managed files, review and stage only those changes within
the resolved footprint as part of the same merge resolution. Verify that footprint matches the index,
read back the installation, then run the merge commit's own governed hook. Automatic startup
adoption remains forbidden during a Git sequencer operation. I6 must prove this sequence through the
existing installation owner; an unsupported sequence blocks qualification rather than justifying a
hook bypass or an extra upgrade commit inside the merge.

Runtime artifacts can reuse verified immutable downloads where the existing installer supports it;
mutable registries/launchers remain worktree-specific. Git configuration can be shared across linked
worktrees. Preserve the existing hook owner's worktree-config guard and relative `.githooks` launchers;
never write a shared absolute hook path pointing into one sibling checkout. Do not implicitly enable
repository-wide worktree configuration or rewrite host-global settings during a local update.
The tracked `.codex/hooks.json` must also be portable: resolve the active Git worktree at invocation,
call only that tree's ignored launcher, and use `startup.sqlite` next to that launcher's registry.
For native Codex stdin observations, verify both the invoking process's Git worktree and a supplied
event `cwd` against the launcher's workspace before creating or closing a receipt. A stale sibling
hook pointing at another tree's launcher must not write that tree's startup receipts during cutover.
An absolute startup receipt override cannot be encoded in a tracked multi-worktree hook. Reject it
for managed hook installation; reconcile an older absolute-path handler deliberately at cutover.
Read back the actual hook/launcher/runtime identity in the target tree. No new branches or worktrees
are required just to upgrade governance.

### Scope and configuration

Local index maintenance requires no JEV account and follows the existing local text eligibility.
Hosted metadata selection remains explicit opt-in. Use stable project-approved source/doc/test roots
for a pilot, rather than a few installation files, and diagnose exclusions without silently widening
sharing. Preserve daily update-discovery throttling and fixed coding-model defaults.

Use current delivery/count/byte limits and the existing decision budget declaration. Add only the
cache lifecycle/cap and bounded expansion controls that those owners cannot express; avoid a matrix
of new routing strategies. Status/doctor is passive; one refresh operation with a rebuild option owns
incremental maintenance and cache recovery. Do not add separate repair, GC or migration command
families. Refresh/rebuild and explicit expansion are local
read operations with their own observable costs. Final operator commands belong in the updated guide
when implemented, not as fictional available commands now.

Embeddings, vectors, full dependency/call graphs, advanced alias resolution, cross-worktree cache
sharing, all-language structural parity, generated descriptions, automatic documentation rewrites,
new semantic question families, JEV-ranked history and a second excerpt-selection model pass are
deferred. They need a demonstrated miss and comparison with this smaller source-backed design.
