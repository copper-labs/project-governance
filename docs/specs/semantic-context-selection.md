---
id: spec.semantic-context-selection
title: Optional Semantic Context Selection
type: spec
status: approved
owner: project-governance
created: 2026-09-17
updated: 2026-09-17
summary: Proposed off-by-default relevance selection for optional context, with a bounded JEV adapter and deterministic authority.
---

# Optional Semantic Context Selection

**Approved experimental implementation. Off by default; quality and savings evaluation remains pending.**

The operator approved proceeding after the delivery spike with mechanism-level qualification and
per-invocation `submitted` reporting. This supersedes the original requirement for a host receipt
on every request. The implementation does not claim that the model received or followed each packet.

This proposal helps maintainers decide whether to add semantic selection of optional background
before an agent reads it. The intended benefit is fewer downstream LLM input tokens and less
reading time without losing task-critical information. Start with context selection; broader JEV
uses remain outside this proposal. See the [implementation plan](../exec-plans/active/2026-09-17-semantic-context-selection.md)
and [research](../reference/typesafe-jev-research.md).

## Proposed Outcome

A task receives all required policy, plan, and skill context, plus a smaller set of relevant
optional documents. JEV scores supplied candidates. Local code decides what fits and materializes
exact source bytes. JEV does not write summaries, discover files, change policy, or approve work.

For example, a route might offer optional documents about cancellation, retries, caching, and
release packaging. A cancellation task should retain cancellation details and any relevant retry
interaction. Required instructions remain present regardless of their relevance score. The agent
can still open an omitted document when the task calls for it.

The feature is off by default. It remains removable without changing repository authority or the
agent provider. No JEV training, fine-tuning, persistent repository upload, or vector database is
needed: each request supplies the task, candidate text, and fixed relevance questions.

## Current Baseline And The Savings Limit

[Context routing](../governance/context-routing.md) already narrows context deterministically.
In `context.py`, `_groups` marks primary and active-plan context required; expansion is optional
and absent unless the caller requests it. `_context_items` currently reads files in declared
order and enforces byte budgets. Skills have a separate deterministic selection contract.

With JEV enabled, the proposed candidate pool expands automatically even when the caller did not
request expansion. This can add useful delivered context rather than shrink the initial packet.
It cannot save expansion tokens on baseline calls that currently include none.
Measure agent follow-up reading as well as packet size. If most spending is on mandatory reads or
code reasoning, this first feature will have limited benefit. A smaller packet that causes more
searches and rereading is a loss. Do not widen discovery just to manufacture apparent savings.

## Greenfield Design And Integration Decision

Starting from scratch, separate four jobs:

1. **Required context:** determine instructions and facts that must accompany the task.
2. **Candidate retrieval:** find a bounded set of optional sources using local routes or search.
3. **Relevance assessment:** score those sources against the task.
4. **Packet assembly:** apply source eligibility, stable ordering, and byte budgets locally.

That separation is the target design here. The existing route catalog can supply candidates
without becoming the relevance engine. Implement one narrow selection function and one JEV
adapter, not a provider framework. A future local scorer could implement the same data contract;
that does not imply JEV weights are available or that distillation is permitted.

| Approach | Decision |
| --- | --- |
| Agent reads every candidate and chooses | Baseline to measure; spends the tokens we intend to save |
| JEV as a native agent provider | Reject: scoring has no agent session, terminal, or tool lifecycle |
| JEV as a validation pack | Reject: relevance is not a check result; outages must not become governance failures |
| Separate retrieval platform or vector database | Defer: duplicates source ownership before a retrieval gap is demonstrated |
| Optional selection stage with deterministic assembly | Recommend: clean boundary, independently testable, small initial integration |

The deliberate architectural change is that an explicitly enabled context command may invoke a
hosted relevance service. Routing, facts, skills, checks, hooks, and governance authority stay
local and deterministic. Amend the existing architecture and routing contracts when implementing;
do not quietly claim the entire context path remains model-free.

## Scope Of The First Version

- In shadow/on modes, automatically consider the matched route's declared `expansion_context`
  files, without requiring `--include-expansion`. This expands the scoring pool, not the LLM packet.
  Do not infer a route after a miss or ambiguity; preserve current blockers.
- Start with whole Markdown files. Read each eligible file under a separate candidate-input bound,
  before output-budget pruning. Otherwise a useful file late in the catalog never reaches JEV.
- No recursive crawling, historical search, generated summaries, semantic skill selection,
  required-context pruning, source-code retrieval, or expansion beyond the declared matched route.
- Whole files preserve nearby qualifications and exceptions. Section-level selection with parent
  headings and exact byte spans is a later option if measured file size limits the benefit.
- Candidate retrieval is independently measurable. A scorer cannot recover a missing candidate.
  Add local lexical retrieval only if the pilot demonstrates that route catalogs miss needed sources.

## Feature Control

Proposed configuration shape; this is not accepted by the runtime today:

```yaml
context_router:
  semantic_selection:
    mode: off  # off | shadow | on; absent means off
```

| Mode | Network and credentials | Agent packet |
| --- | --- | --- |
| off | No provider import, credential lookup, request, or selection-cache read | Existing behavior and output contract |
| shadow | Automatically score authorized expanded candidates | Exact baseline packet; separate comparison receipt |
| on | Automatically score authorized expanded candidates, or use a valid cached decision | Required context plus selected optional files |

Turning the mode off takes effect on the next invocation, including bypassing cached decisions.
A per-invocation disable option should support diagnosis; a CLI flag must not override project
prohibition of hosted processing. Shadow is not a privacy mode: it sends the same authorized text.
No credentials or network activity during import, installation, validation checks, or default
startup. An explicitly adopted task-entry delivery integration may invoke the context command;
only enabled selection within that command may call JEV. Git validation hooks never call JEV.

Enabling shadow/on also requires explicit project-owned egress configuration: allowed candidate
paths and authorization to send task text. An empty allowlist permits no transmission. The adapter
receives only that text and opaque IDs, not absolute paths, whole facts files, Git credentials,
conversation history, or unrelated source. The allowlist is an authorization mechanism, not a
claim that arbitrary allowed text contains no secrets. Credentials remain outside tracked files.
Private data approval and retention terms belong to the adopter, not this generic repository.

## Developer Readiness

Project permission and configured mode do not establish developer access. Shadow/on become active
only when developer-local credentials, pinned-model entitlement and an explicit synthetic setup
request have been verified. Setup must disclose its network call and use no repository text. Store
no credential in project files; a private readiness receipt binds credential identity and model,
has bounded validity, and is invalidated by credential changes. Project egress policy and bounds
are validated independently on every invocation.
Missing/expired readiness reports configured-but-inactive and uses local routing. Check receipt
validity locally during use; never authenticate or spend tokens merely because governance starts.
Later authentication, quota and provider failures still fall back. An optional thin skill explains
setup/status/disable; it is not a model caller. It must not suggest enabling before delivery qualification.

## Selection Contract

The internal input contains task text, normalized repository-relative changed paths, ordered candidate IDs, exact UTF-8 bytes and content hashes,
required-byte accounting, an optional output budget, and a versioned scoring policy. IDs refer to
existing local sources and cannot authorize a new path. No hidden host conversation is assumed. Changed paths inform local routing and the local comparator.
In v1 the JEV request deliberately uses task text and candidate contents only, excluding changed
paths to avoid implicit repository-structure egress. Evaluate this information disadvantage
explicitly; adding paths later requires a versioned scoring/egress change and renewed evaluation.

The output contains one finite relevance value in [0,1] for every submitted candidate, provider
and resolved model identity, scoring-policy version, request usage when available, and a bounded
failure category. JEV returns scores, not file contents. Code owns source mapping and inclusion.

Use independent `Noul` relevance questions first. Define useful context as information needed to
perform or verify the task, including constraints, exceptions, dependencies, and evidence that
challenges the task's assumptions. Mere shared vocabulary is insufficient. A low score is never
proof that a policy does not apply.

Prefer one candidate per request for the initial quality baseline, with bounded concurrency.
This matches the official reranking pattern and avoids cross-candidate interference. Experiment
with multiple candidate-specific questions sharing one request only if it preserves recall and
improves measured latency/cost. Put candidate references in question instructions: question IDs
alone are not semantic input. Cap aggregate request bytes, request count, and elapsed time.

Do not use a single `Choice` distribution as independent relevance scores. Its probabilities
compete and sum to one: several documents can all matter, and the best of several bad candidates
still ranks first. The official semantic-find example adds a separate existence question for
that reason. Do not transplant cookbook confidence thresholds into governance.

## Assembly And Failure Behavior

1. Resolve the current route, required files, and skills using existing rules. Preserve all
   existing failures. If there is a required-source blocker, skip remote optimization.
2. Preserve the baseline packet result for fallback. Build bounded optional candidates from the
   same source snapshot, subject to egress eligibility. No arbitrary truncation to fit a request.
3. Skip scoring when the mode is off, the route is blocked, no candidate is eligible, or limits are exceeded.
   Mixed eligible/ineligible pools use baseline in v1; do not hide unsent documents by omission.
4. Validate the entire response against expected IDs, answer types, ranges, and model identity.
   Missing, duplicate, extra, non-finite, stale, or mismatched output invalidates the selection.
5. In on mode, retain candidates above a recall-calibrated inclusion threshold, sort by relevance
   with declared order as the tie-break, and pack whole files within existing expansion and packet
   bounds. Never borrow required-context capacity or relax skill limits. Record threshold and
   budget omissions separately. No threshold is approved until evaluation.
6. If no candidate clears the threshold, use baseline in v1 and record abstention. Any provider,
   response, permission, cancellation, or hard-deadline failure also returns baseline. A partial
   batch never filters the packet. Local path/configuration errors retain their normal behavior.
7. Materialize the exact bytes that were scored. If sources change during selection, discard the
   decision and recompute a fresh local baseline. Never pair an old score with new content.

Fallback baseline means the same invocation with semantic selection off, including its original
`--include-expansion` value. Automatic candidate expansion never changes fallback to all-candidate
delivery. Shadow also delivers this exact baseline.

Fallback preserves existing behavior, including its limitations and blockers; it is not a promise
that baseline retrieval is complete. Optional selection never changes validation outcomes.

The receipt records candidate IDs/hashes, selected and omitted IDs, configuration/scoring digest,
model, elapsed time, usage, cache status, and fallback reason. Keep it in ignored local runtime
storage, bound its size/count, and exclude raw task/document text and secrets from logs. Public
packet identity remains based on exact materialized content; the selection receipt has a separate
identity for explaining how it was chosen. Do not treat either as validation evidence.

Cache only complete validated decisions. Key by repository scope, exact task digest, ordered
candidate IDs and byte hashes, pinned model, scoring policy, budgets, and egress policy. Apply
current permissions before any cache use. Use bounded local storage and expiry; no shared/global
cache. Assume no cache savings in the business case until real hit rates demonstrate them. Keep scoring outside the existing packet-materialization lock.

## JEV Adapter And Service Boundary

Use the documented hosted System One endpoint through a small HTTP adapter. The v1 payload is
simple enough that a required SDK dependency adds little value. Do not implement generic retries,
provider discovery, or alternate endpoint routing. Keep transport replaceable for deterministic
failure tests, not as a public plugin registry.

Pin `jev-1.13.0` for the first experiment, subject to live account verification. Do not use a moving
latest alias. Validate the resolved identity returned by the service. The adapter must enforce
request/response byte limits, a hard operation deadline including concurrency and cancellation,
and no automatic retries initially. SDK defaults, if later used, must not extend that deadline.

The vendor documents 32k tokens for state plus the longest question and 64k across state and all
questions. The runtime's four-bytes-per-token estimate does not validate those model limits. Use
small conservative byte caps; reject/fallback on oversize or provider rejection. Record actual
usage separately and resolve tokenizer/preflight behavior during contract verification. No
silent provider truncation is acceptable.

Before sending, scan the exact outbound task and candidate bytes using a narrow reuse of existing
secret detector definitions. The current secrets pack scans repository selections, not arbitrary
request payloads, so do not invoke the whole pack as an egress gate. Extract the shared detector
patterns and chunk/overlap constants into one importable `checker_scripts/secret_detectors.py`
owner; both the security checker and egress scanner consume it. Do not copy definitions or
dynamically load the checker entry script. Preserve existing security-check behavior with tests. A detection or scanner failure
means no transmission and local fallback. A repository secret waiver is not egress authorization.
No automatic redaction changes the text being scored. Detection is incomplete by nature; explicit
egress authorization remains necessary.

Current public documentation describes hosted inference; this plan assumes no local JEV model.
The vendor's agreement restricts distillation and publication of performance results. Keep pilot
results private and resolve account-specific contractual terms before those activities. Do not
use JEV outputs to train a replacement model under this plan.

## Packet Delivery Contract

Delivery is a prerequisite for production on-mode, independently qualified per host and role.
Packet generation is not delivery; delivery is not proof that the model followed the content.
The host boundary must supply the actual packet text as model input before task work proceeds,
with source attribution and packet identity. A file path or an agent's acknowledgement is not
verified delivery. Existing checks and task evaluation establish compliance separately.

The delivery envelope contains an opaque task identity, main/subagent role, scope revision,
packet content digest, ordered source identities/hashes, and exact selected text. Do not promote
optional document text to system authority. Preserve the host's instruction hierarchy and mark
source text as quoted repository material. Missing required text, host truncation, or attachment
size overflow is a delivery failure, not a complete packet.

The integration distinguishes `submitted` (complete text returned through the bounded hook),
`unverified` (only a file or agent report exists), and `failed` (missing, oversized or rejected text).
Supported host/request evidence may separately establish delivered bytes in qualification tests.
The operator explicitly accepted that ordinary desktop hooks do not provide a per-request receipt.
Qualification tests must cover full text, truncation, merged handlers, refresh and compaction. Repeat
host qualification when the host behavior/version changes. Submission never proves model compliance.

Do not convert host delivery failure into a governance validation failure. Where required text
cannot be supplied, the integration must surface incomplete context and use the host's existing
missing-instructions path rather than silently proceeding as fully prepared.

The caller owns scope declarations. Compute scope revision locally and deterministically from an
explicit refresh flag or a changed normalized relevant-path set; never call a model to decide
whether to refresh. A changed objective with unchanged paths requires the caller to declare refresh.
At task entry, route using the actual task and known paths. On declared scope change, increment
the scope revision and route again. In an existing conversation, deliver changed/new source text
with an explicit supersession notice; removed text may still exist in history and is not erased
or refunded. Delivery occurs once per task entry and explicit scope revision, never on every prompt. A bounded
per-task budget separately caps JEV requests, delivery events, and cumulative serialized delivery
bytes. JEV-budget exhaustion uses local selection fallback only while delivery allowance remains.
Delivery-budget exhaustion stops automatic attachment and reports incomplete current context; it
must not pretend a stale packet covers a changed scope. The caller must explicitly reset the
context/task boundary before further automatic delivery. Required content is never silently trimmed. On a new session, send the full
current packet. Compaction recovery is supported only where that host exposes a qualified
compaction/context-loss signal and reinsertion path. Otherwise retention becomes unknown and
production on-mode is unsupported for continued tasks after that boundary. Do not silently resend
on every prompt or equate a persistent session ID with preserved context.

For subagents, the parent names the child objective and applicable sources. Resolve a child-specific
packet and supply its actual text in the assignment through a separately qualified child delivery
path. Do not copy the parent's entire history or assume parent delivery transfers to the child.
Required child instructions still derive from the repository; delegation cannot omit them.

Qualification records must name the host/version, role, supported insertion mechanism, full-content
proof, truncation behavior, scope-refresh behavior, and usage visibility. Test that quoted-source framing
survives insertion, including a candidate containing imperative instructions; never promote its
text to policy authority. A marker echo is a useful loss probe but cannot certify the entire payload. No host is certified by
this draft. Initial implementation qualifies one main-agent path; other hosts remain explicitly
unsupported until tested. Use existing host integration surfaces rather than a new agent runtime.

Codex uses `additionalContext` on UserPromptSubmit and SessionStart compact/resume. The synthetic
loopback qualification demonstrated that default hook limits spill long content to a file. Managed
context hooks therefore set `additionalContextLimit: 0`; the runtime rejects envelopes over 256 KiB
and applies cumulative task allowances. Other hosts remain unsupported. The controlled probe proves
request construction for the tested executable, not each desktop invocation or model behavior.

The host-entry adapter owns one output composer, separate from the updater and selector. It
collects the updater's optional status message and context delivery result independently, then
serializes one additionalContext field in stable order: update status, then framed context. An
empty updater result must not skip context handling. Neither operation invokes the other; no
provider call occurs inside release discovery/application or updater locks. Validate the combined
serialized size, not just packet bytes. If required context cannot fit, report delivery failure;
never silently truncate or overwrite another host message. Preserve user-authored handlers.
Batch 0 must establish whether the host merges multiple handlers, their ordering and combined
limits, because those handlers may coexist even though governance emits one composed field.
No assumption of host merge behavior qualifies delivery.

## Router Adoption And Measurement

Establish use of the existing router before optimizing it. The current user guide assigns context
selection to the coordinator before editing; it is not a subagent-only facility. A profile,
instruction, installed command, or materialized directory alone cannot prove regular consumption.
The context CLI currently resolves and emits a packet without a context-usage telemetry event.

Audit each participating adopter read-only for five separate states: configured, instructed,
invoked, supplied to the model, and followed by useful work. Distinguish main/coordinator from
subagent calls. Preserve unknown attribution rather than guessing from directory timestamps.
The first pilot must cover the main agent. An integration that only improves subagent context
cannot establish whole-task savings. Keep adopter names and audit records outside this repository.

Before enabling JEV, qualify one host path that invokes the existing router at task entry and
declared scope changes, then actually supplies the selected content. Reuse the host's existing
entry/tool path where available. Avoid a second startup framework or per-turn mandatory command.
An agent instruction is a fallback integration with reported compliance, not verified injection.
If the host provides no trustworthy consumption signal, label consumption unknown and run the
quality/cost experiment through a controlled caller that owns the actual model request.

Track three different quantities:

| Quantity | Measurement | What it establishes |
| --- | --- | --- |
| Packet reduction | Exact comparator/selected bytes, with comparator named; tokenizer count only when the receiving model's tokenizer is available | Potential context reduction, not billed savings |
| Provider use | Actual per-request LLM and JEV input, cached-input, output, and separately exposed reasoning usage | Observed tokens for calls with coverage |
| Whole-task impact | Matched task runs, accepted outcomes, follow-up reads/calls, total cost and elapsed time | Whether selection helps in practice |

Missing usage is null/unknown, never zero. The existing four-bytes-per-token context budget is an
estimate and must be labeled as such. Native provider wrappers already capture some aggregate
usage; existing test-execution telemetry accepts available token totals. Neither provides universal
main-agent measurement or causal attribution to a context packet today.

Proposed content-free events correlate opaque task/run, invocation, packet, and request IDs with
role (main/subagent/unknown), mode, route outcome, bytes, latency, and consumption evidence
(host-confirmed/reported/unknown). Reuse the local telemetry storage/locking primitives with a separate bounded context stream
(maximum 1,000 records and 1 MiB); do not append context events to validation `runs.jsonl`. Give the
context stream its own versioned sanitizer and deduplication rules, preserve validation retention,
and include write overhead in latency measurement. Use fail-open writes and an
explicit measurement opt-in independent of the JEV mode. Off-mode equivalence refers to selection:
observability enabled for a baseline must not activate scoring or change its packet/output.
Do not add a required utilization closeout, scrape private transcripts, or log task/source text.

Normalize host usage at the boundary. Record whether counters are per-request or cumulative;
deduplicate request/event IDs and difference cumulative counters only within a known session
segment. Handle resets and retries explicitly. Count child requests once; do not add a parent's
inclusive aggregate to the same child totals. Cached input is normally a subset of input, and
reasoning may be a subset of output: preserve provider semantics rather than double counting.
Where the host cannot expose actual usage, report the covered fraction and packet estimates only.

Compute observed run cost using the applicable model/rate version and separate cached-input rates.
Keep model/rate identity in a private evaluation record; the shared telemetry can retain only the
bounded content-free fields its contract allows. No model identity extension is assumed silently.
Report two deltas separately: current-workflow cost minus selected-workflow cost (total product
impact), and deterministic-expanded workflow cost minus JEV-selected workflow cost (incremental
selection impact). Both include JEV where used, retries, and
recovery. Shadow yields hypothetical packet savings and real selector overhead, not observed
reduced LLM consumption. Use matched replay or a controlled on/off comparison for causal estimates.
Randomize ordering or balance warm caches; hold task/model settings fixed and verify outcomes.

The readout should show routing coverage by role, confirmed/reported/unknown consumption, measured
usage coverage, estimated packet reduction, observed token/cost deltas, quality, and p50/p95 time.
Report denominators only for tasks whose starts are actually observed. Lack of retained records
cannot establish non-use because retention is bounded and worktrees may have separate packets.

## Evaluation And Acceptance

Compare the current packet-and-follow-up workflow, bounded deterministic expanded delivery,
simple local relevance selection over the expanded pool, and JEV
selection on the same labeled tasks. Include a conventional reranker or small LLM baseline if
available within the agreed evaluation scope. JEV must earn its adapter and hosted dependency.

Define the zero-egress comparator before hosted experiments: deterministic, case-normalized term
overlap between task terms and candidate title/path/body, with declared order for ties and the same
whole-file packing bounds. Reuse the boundary-matching helper where appropriate; do not blindly
copy route weights because routes score authored aliases/path globs, not document relevance.
Measure candidate-pool bytes divided by expansion budget and irrelevant-byte share. A low ratio
is not proof of no value: filtering can still remove irrelevant files that all fit. Stop before
hosted work if optional-reading cost is immaterial or the local comparator already meets the
predeclared quality/cost objective.

Name every evaluation comparator. The fallback baseline preserves current invocation flags;
bounded deterministic expansion uses the automatic candidate pool without JEV. Report initial
packet change against both. A larger packet versus current default can still reduce whole-task
cost. Require a worthwhile incremental benefit over the local comparator as well as an improvement
over current task outcomes/cost before promoting a hosted dependency.

Use separate calibration and held-out sets, grouped by source/task family to reduce leakage.
Cover explicit and paraphrased requests, multi-document dependencies, misleading overlap, no
answer, contradictory context, long documents, route misses, edits during a request, provider
outages, and instructions embedded in candidate text. Embedded instructions remain data;
relevance classification is not a prompt-injection security boundary.

Measure required-content invariance, task-critical optional-source recall, candidate recall,
accepted task outcomes, follow-up reads, total downstream LLM input/output tokens, cached versus
uncached billing, selector usage/cost, and end-to-end p50/p95 time. Count failures and fallback
requests; do not compare only successful model calls. Count overlapping repeated context once per
actual transmission, not once per source file.

Acceptance requires zero required-context removals, preserved blocker semantics, no lost labeled
critical sources in the held-out pilot, no observed accepted-outcome regression, and positive net
cost savings without a p95 workflow slowdown. A finite pilot is not proof of zero future errors. Report an appropriate uncertainty bound for
critical-source misses and cost/time deltas; zero observed misses is only a pilot criterion.
Compare routing-delivery improvement separately from the incremental effect of JEV, using the same
qualified delivery path for selection comparisons. Set sample size and minimum practical savings
before running held-out evaluation. Keep the
feature off if the quality or economics case is weak; ship shadow-only if evidence is incomplete.

No savings percentage, calibrated threshold, timeout, or production readiness is established by
this draft. The implementation plan defines how to settle them.

## Proposed Boundary Amendments

At implementation, apply these precise clarifications together. Current contracts remain active
until then; this section records the proposed architectural decision without a competing authority.

- `docs/architecture/governance-runtime.md`, provider ownership and out-of-scope sections: name
  optional semantic selection separately from agent delegation. Preserve model-free validation
  and the prohibition on routing invoking the native provider-agent helper.
- `docs/specs/provider-agent-skills.md`, runtime boundary: preserve no native-agent launch/import
  by context selection; clarify that a typed JEV HTTP scorer is a separate optional capability.
- `docs/specs/startup-runtime-updates.md`, startup boundary and release selection: runtime updates
  remain model-free. A task-entry context operation must be separately dispatched after startup
  identity is settled, never inside release discovery/apply or while updater locks are held.
  Context refresh never authorizes release discovery on resume, fork, or compaction.
- `docs/governance/context-routing.md` and the kernel/CLI guide: document automatic candidate
  expansion, qualified delivery, bounds and off-default hosted scoring.
- `checker_scripts/context_check_profile.py`: keep validation offline; add shape/limit validation,
  without weakening its no-provider guarantee. New optional keys must receive explicit validation.
- Context output's existing `external_content`/`external_provider` marker is unrelated to JEV.
  Preserve legacy off-mode output; do not treat the marker as egress authorization or a second
  provider configuration. Its possible retirement needs compatibility evidence, not incidental deletion.

A generic promotion record will document disposition, methodology, limitations and the identity of
the private evidence custodian. Publish adopter-free performance aggregates only if applicable
terms permit. Otherwise retain numerical evidence in the authorized private review location and
record the reviewed decision here without publishing restricted benchmarks. If decision-makers
cannot access sufficient evidence, do not promote. No private adopter paths or identities enter this checkout.

## Official Sources And Open Decisions

Official sources accessed 2026-09-17:

- [Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe): local shortlist followed by
  independent candidate scoring; supports the proposed separation, not governance accuracy claims.
- [Classifying RAG passages](https://docs.typesafe.ai/cookbooks/classifying_rag_passages): relevance,
  evidence, and contradictions are different questions; source safety cannot rest on model scores.
- [Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find): relative Choice ranking
  needs an existence check; whole-file v1 avoids premature line-selection machinery.
- [API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), and
  [limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13): transport, pinned identity,
  input bounds, and model weaknesses. These were read, not exercised against an account.
- [Customer agreement](https://typesafe.ai/legal/mca), section 2.3: distillation and publication
  restrictions. The adopter's actual agreement remains to be checked.

Before implementation, discuss whether the bounded whole-file scope reaches enough spending,
which task corpus can be evaluated privately, and the acceptable latency/cost target. Before
hosted experiments, settle allowed data and account terms. Later choices include threshold,
candidate/request caps, deadline, concurrency, and whether batching earns its complexity.

## Implemented Operator Surface

Configure `context_router.delivery.enabled: true`, then run `project-governance context-delivery enable`
to install explicit Codex hooks. This does not enable runtime updates. Existing startup hooks compose
update guidance and context into one field; authored handlers remain intact. Trust hooks through the
host's normal mechanism. No command automatically bypasses hook trust.

Use `context --task "current objective" --emit-text` for explicit full-text delivery. Use
`context-delivery refresh --session-id <native-session-id>` before the next prompt when the objective
changes. First prompt supplies the task; later prompts do not reroute automatically. Compact/resume
replays the same packet only if all sources still match. Missing/stale packets report incomplete
context and require refresh. Current hooks have no reliable changed-path field; explicit CLI routing
accepts `--changed-path`, while automatic scope refresh is caller-declared.

JEV setup is explicit: export `JEV_TOKEN`, then run `project-governance jev setup`. It sends synthetic
text and writes a private, 24-hour credential/model readiness receipt. Project egress controls are
validated on every selection independently. `jev status` stays local; `jev disable` revokes the local
receipt. Runtime code never sources shell profiles. Setup does not enable project scoring.

Example profile fragment (replace the example path with an authorized optional source):

```yaml
context_router:
  delivery:
    enabled: true
  semantic_selection:
    mode: shadow
    allow_task_text: true
    allow_paths: [docs/optional-reference.md]
    threshold: 0.7
```

The example threshold is illustrative, not calibrated. On-mode requires an explicit threshold and
enabled delivery; do not adopt it before the private quality comparison. Shadow leaves the ordinary
packet unchanged while recording candidate scores and proposed optional bytes. The full pool must
be allowlisted; mixed authorization falls back without sending. Required sources never enter scoring.

`context-delivery status` exposes up to 128 private content-free observations. Byte counts and proposed
candidate bytes estimate payload opportunity, not billed LLM tokens. JEV usage is recorded only when
reported by JEV. Actual downstream LLM usage, follow-up reading and net cost are unknown in this host
integration. No cache or automatic threshold tuning is implemented. The expanded-byte comparison is
pre-assembly and must not be presented as actual packet or token savings.
