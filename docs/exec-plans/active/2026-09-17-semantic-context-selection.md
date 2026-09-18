---
id: exec-plan.semantic-context-selection
title: Optional Context Selection Implementation Plan
type: exec-plan
status: active
owner: project-governance
created: 2026-09-17
updated: 2026-09-17
summary: Approved implementation of off-by-default JEV context selection, beginning with delivery feasibility.
---

# Optional Context Selection Implementation Plan

**Implementation authorized. Mechanism probe completed; optional adapter and main-agent hook integration are implemented for local validation. Quality evaluation and adopter rollout remain pending.**

Operator amendment after Batch 0: proceed with tested mechanism-level delivery and `submitted`
per-invocation status. A receipt proving each model request is no longer a prerequisite. References
below to the original strict stop gate record the initial plan and are superseded by this amendment.
The implementation is experimental and off by default; no savings or quality promotion is claimed.

The [approved specification](../../specs/semantic-context-selection.md) owns the proposed behavior.
This plan starts with evidence that optional reading costs enough to optimize, then implements
one clean selection boundary. It does not authorize changes to an adopter or remote publication.
The operator approved the spec and plan on 2026-09-17. Keep each go/no-go checkpoint intact.

## Batch 0: Test Delivery Feasibility Before Building Integration

- Audit participating projects read-only: profile routes, main-agent and subagent instructions,
  entry-point wiring, retained invocation evidence, and packet consumption. Do not infer use from
  installation or infer consumption from packet creation. Keep the project inventory private.
- First probe Codex `startup.hook_output` / `additionalContext` using synthetic payloads and
  supported host behavior. Codex is the sole enabled startup-adapter candidate, not yet qualified
  for packet delivery. Require per-invocation exact-payload acceptance evidence; a qualified
  mechanism without that signal remains unverified. Probe multiple-handler merge behavior, order,
  combined limits and interactions with preserved authored hooks. Marker echo is diagnostic only. If complete delivery/limits/refresh cannot
  be verified, stop production integration and report the unsupported path; do not build a new
  agent runtime or downgrade the main-agent requirement.
- Only after this feasibility checkpoint, implement and qualify the main-agent delivery path, following
  the spec delivery envelope, evidence levels, scope revisions, compaction and failure semantics.
  Use the host-entry composer defined in the spec; an empty updater message must not skip context.
  Record host/version capability and keep unqualified hosts out of production on-mode. Identify whether it is
  automatic, explicitly agent-driven, or absent. Any adopter integration change needs its own
  authorization; this plan does not authorize writing to other projects.
- Add optional bounded content-free router observations using existing storage primitives in a separate bounded context stream,
  independently of JEV mode. Correlate opaque task/role/invocation/packet/request identities;
  distinguish host-confirmed consumption, agent reports, and unknowns.
- Reuse actual native provider counters where available. Normalize cumulative versus request
  usage, cached-input subsets, retry events, and parent/child totals. Report coverage and unknowns;
  never replace missing usage with zero or a byte estimate labeled as actual tokens.
- Qualify a controlled main-agent evaluation caller if the desktop host cannot expose consumption
  or request-level usage. Do not promise native-host instrumentation until its access is verified.

**Go/no-go checkpoint:** a failed delivery spike ends production work before Batches 1–4; a
controlled-caller experiment requires explicit scoped continuation and does not qualify desktop use.
For a successful spike, demonstrate one main-agent task that invokes routing, receives the selected bytes,
and produces an attributable usage observation or an explicitly labeled measurement limitation.
No JEV experiment claims impact before this dependency is understood. Run focused telemetry
retention/deduplication and caller tests; observational failure must not block normal work.

## Batch 1: Establish The Opportunity And Evaluation Contract

- Inspect representative context invocations and subsequent agent reads using permitted local
  records. Separate mandatory context, optional packet content, follow-up reading, and code work.
- Establish current expansion use and the proposed automatic expanded candidate pool in shadow/on.
  Measure bounded deterministic expansion separately so retrieval gains are not attributed to JEV.
- Build independently labeled task/source fixtures. Include task-critical optional sources and
  acceptable outputs, not just relevance labels supplied by JEV or an LLM.
- Use 60 cases (20 calibration / 40 held out) only as an illustrative initial floor. Derive the
  held-out size from measured cost variance and the required recall uncertainty bound before
  freezing evaluation; group by task/source family. Include
  narrow, cross-document, paraphrased, no-answer, contradiction, and long-document cases. Expand
  before a production decision if the sample is unrepresentative; no zero-error guarantee is
  inferred from any finite sample. Keep failure/transport fixtures separate from task-quality cases.
- Run the spec-defined local term-overlap comparator before hosted work. Measure expansion
  oversubscription and irrelevant-byte share; a pool fitting the budget can still benefit from filtering.
- Define the measured model/workflow comparators, minimum practical savings,
  acceptable p95 elapsed time, and fixed evaluation rules before looking at held-out outcomes.
- Verify account terms, pinned-model response, actual usage fields, payload/token-limit behavior,
  candidate egress, retention, and permission to keep/share evaluation results. Use public or
  explicitly approved text for any later live verification.

**Checkpoint:** a bounded private evaluation corpus and measured baseline. Stop if optional
context is not a material cost or a simpler local selector solves the problem. Store private
records outside this generic checkout; only reusable synthetic fixtures belong here.

## Batch 2: Build The Optional Boundary And Shadow Path

- Add an explicit synthetic setup probe for local developer credentials and pinned-model access.
  Keep readiness receipts private and bound to model/credential/config identity; missing readiness
  leaves project configuration inactive and ordinary local routing usable. No startup authentication
  probe, automatic account creation, or credential storage in tracked files.
- Add validated `off | shadow | on` configuration with absent/off preserving current behavior;
  initially expose on only to the test harness until the quality checkpoint is met.
- Refactor the smallest part of `context.py` necessary to separate required reads, bounded
  candidate loading, and final optional assembly. Shadow/on automatically consider route expansion;
  off and fallback retain the original invocation flags. Preserve deterministic route and skill logic.
- Extract shared detector definitions and chunk/overlap constants from `check-security-policy.py`
  into importable `checker_scripts/secret_detectors.py`. Both the existing blocking checker and
  new outbound-byte scanner consume that owner. Prove unchanged checker results, including
  chunk-boundary matches and existing waiver semantics; egress does not inherit waivers.
- Add one typed selection result and a narrow JEV HTTP adapter. No agent-provider, pack, or
  generalized model-router integration. Pin the experiment model and scoring-policy version.
- Add explicit egress allowlists/task authorization, bounded transport, credential isolation,
  hard deadline, complete-response validation, fallback, and ignored bounded receipts/cache. Scan exact outbound bytes with reused secret detectors;
  scanner failure/detection falls back without sending. Do not inherit repository waivers for egress.
- Add an invocation-level disable path that cannot override a project prohibition. Keep network
  calls outside the packet lock and validation checks/hooks. An explicitly adopted task-entry
  integration may call the context command after host delivery qualification.
- Update owning routing/runtime architecture and configuration documentation in the same batch;
  clearly separate deterministic routing from optional remote scoring. The draft does not amend
  those current contracts ahead of implementation. Follow the spec's enumerated Proposed Boundary
  Amendments, preserving model-free updates, checks, and native-agent separation.

**Focused checks:** off has no network/credential access or new output fields; shadow has identical
packet bytes/order/status while scoring automatic expansion; fallback never dumps the expanded
pool; unqualified hosts cannot enable production on-mode; no mandatory omission; source mutation cannot reuse a stale decision;
path escape/symlink rejection; unauthorized egress denied; timeout/cancellation and partial batch
fall back; 401/429/5xx and malformed/oversized responses cannot block previously valid work;
cache invalidation covers task/source/model/policy/permissions; receipts contain no raw payload;
validation telemetry retention is unchanged; changed paths never enter JEV payloads; per-task
request/event/byte caps prevent repeated scoring and injection; delivery-cap exhaustion reports
incomplete context; refresh decisions use only declared local signals; quoted-source
framing survives host insertion; scope-change/compaction behavior does not inject on every prompt.
Use local fake transport for failure tests. Never test limits by attacking the hosted service.

**Batch boundary:** one integrated context/skill/configuration regression pass and applicable
independent QA. This touches configuration and a network boundary, so run the relevant broader
contract proof under the validation strategy once at this boundary, not after every edit.

## Batch 3: Run Shadow Scoring And Controlled On/Off Evaluation

- Compare fallback baseline, bounded deterministic expansion, the spec's local term-overlap comparator, and JEV using the same required envelope, candidate
  corpus, and accepted-outcome criteria. Optional alternative scorer baseline depends on access.
- Start one candidate per request, bounded concurrency, no retry. Measure remote cost and elapsed
  time, not the vendor's demonstration latency. Test multi-candidate batching only as a separate
  candidate configuration; require equivalent critical-source recall before accepting it.
- Tune inclusion threshold, byte/candidate/request caps, concurrency, and deadline on calibration
  cases only. Freeze those choices before the held-out comparison.
- Report candidate misses separately from JEV selection misses. Measure whole workflow costs,
  including downstream follow-up reading, recovery, cached LLM input, selector calls, and failures.
- Use the controlled on-mode test harness to deliver selected packets for matched task trials.
  Shadow alone cannot establish downstream token savings or quality. Main-agent delivery must
  already be qualified; a harness result applies only to that harness, not untested hosts.
- Record zero required-content removals and held-out critical-source misses, accepted-outcome
  comparison, uncertainty bounds, both whole-product and incremental JEV cost deltas, and p50/p95
  elapsed time. Assume no selection-cache savings without observed hits. Repeat across normal cold/warm conditions.
- Write an adopter-free promotion disposition and methodology in governed docs; keep numerical
  benchmarks private unless terms permit publication. Authorized reviewers must be able to inspect
  the private evidence; lack of auditable evidence prevents promotion.

**Decision:** promote on-mode beyond the evaluation harness only if the spec's quality/economics criteria pass.
Otherwise remain shadow-only, simplify to local selection, or remove the adapter. Do not publish
JEV benchmark numbers without resolving the applicable contractual restriction.

## Batch 4: Finish On Mode And Deliver A Reversible Opt-In

- Apply validated decisions to automatically considered route expansion; preserve required files, skills,
  local errors, route blockers, and baseline fallback. Report omitted IDs so further reading stays
  possible. Do not present a probability as an explanation or a claim of completeness.
- Document off/shadow/on, eligible data, fallback, normal disabling, and limitations. Wire only the
  intended context entry point; do not cause every governance invocation to call the provider.
- Prove the host actually consumes the selected packet. If it rereads everything anyway, there is
  no established token saving and the host integration needs correction before claiming success.
- Run focused acceptance fixtures, one integrated QA boundary, and clean-wheel/install proof for
  a proposed release. Check off-default operation in an environment with no credentials/network.
- Leave the default off in source and packaged templates. Adoption and any wheel publication are
  separate operator actions. Changing mode to off restores baseline on the next invocation.

## Ownership And Expected Source Surfaces

| Surface | Proposed responsibility |
| --- | --- |
| `context.py` | Existing route/required context; invoke optional selection; deterministic assembly |
| Small new selection module | Typed candidates, inclusion policy, fallback and decision identity |
| Small new JEV transport module | Hosted request, bounded decoding, no agent lifecycle |
| Existing profile validation/context checker | Validate mode, limits and egress contract |
| Existing CLI context entry | Automatic candidate expansion in shadow/on, disable switch, selection receipt |
| Qualified host integration | Actual-text delivery, role/scope identity, refresh and delivery evidence |
| Host-entry adapter/composer | Combine independent updater and context messages; preserve authored hooks and combined limits |
| Shared secret-detector helper and egress scanner | Single detector authority; exact outbound scan; unchanged checker behavior |
| Existing runtime storage helpers | Bounded ignored cache/receipts and safe materialization |
| Context/configuration/skill tests | Invariance, failure and selected-packet proof |

File names for new modules and final configuration fields are implementation choices after review.
Do not create a second source catalog, authority database, permanent service, or training pipeline.

## Architectural Review

See the [Opus 5 architectural review reconciliation](../../reference/semantic-context-selection-review.md).
The review used extra-high effort with model fallback disabled. No implementation is authorized by
a favorable design review; delivery feasibility and empirical promotion remain explicit checkpoints.

## Batch 0 Disposition

Implemented `tools/probe_context_delivery.py` and focused evidence/trust-boundary tests. The probe
uses temporary synthetic hook payloads, an isolated app-server process and a loopback fake model;
it sends no JEV inference request. It inventories enabled hooks before allowing its vetted fixture
handlers to bypass trust. This test-only mechanism must never become production hook installation.
The result contains hashes/counts/booleans, not model request bodies, task text or credentials.

The spike distinguishes hook output, actual request contents, and an internal raw-event diagnostic.
A successful hook output is insufficient to certify full model input. The installed host exposes
an internal raw-event route, but its generated schema labels that route internal-only; it is not
qualified as a supported ordinary desktop delivery receipt. Controlled transport proof cannot
substitute for that requirement. The production stop/go gate has therefore not passed.

Operational receipts and native-host identifiers remain outside the checkout. Reproduce privately:

```sh
python3 tools/probe_context_delivery.py --output /tmp/context-delivery-probe.json
python3 -m unittest discover -s tests -p test_context_delivery_probe.py -v
```

The probe exits 2 for an unqualified host or probe failure; inspect its status rather than treating
that exit as a runtime regression. It intentionally cannot certify desktop integration. A supported
per-invocation delivery path must be established before restarting production work. Remaining
qualification work includes ordinary hook trust, native desktop access to delivery signals, handler
ordering/combined bounds, and scope/compaction behavior. No JEV adapter, enablement command or skill
has been shipped; the approved developer-readiness contract is included in Batch 2.

Sources: [official hook behavior](https://learn.chatgpt.com/docs/hooks#large-hook-output), plus
protocol schemas generated from the installed executable. Private inspection of synthetic request
captures was used only for this spike, not as a proposed production transcript-scraping mechanism.

## Original Design Delivery Record

Prepared the draft specification and this plan after reviewing current context source and official
JEV API/cookbooks. No runtime code, configuration, dependency, credential, hosted inference, or
adopter state was changed. Documentation validation is recorded in the discussion delivery;
this record is not evidence that the proposed feature works.

## Current Implementation Checkpoint

- Added bounded whole-file scoring, explicit synthetic setup, exact-path/task egress opt-in,
  shared secret scanning, hard batch deadlines, deterministic fallback and separate observations.
- Added complete-text CLI and Codex hook submission, first-prompt routing, caller-declared refresh,
  source-verified compact/resume replay, and cumulative task allowances.
- Root delivery is implemented; native subagent injection and other hosts are not qualified.
- Private evaluation corpus, local comparator and actual end-to-end LLM usage measurement remain
  open. Synthetic transport success is not evidence of relevance quality or net token savings.
- No adopter was changed and no release was published. Cache support remains deferred until useful.

## Validation Boundary

Local regression, focused selection/delivery tests, staged governance packs and development-wheel
installation proof cover this implementation. A dirty stable-tag checkout cannot build a release
wheel, so packaging proof uses an isolated development snapshot with the same source changes.
No source commit, push, release or adopter modification is implied by that test fixture.

The synthetic host probe confirms full-text insertion with the explicit hook setting, including a
near-limit payload and multiple handlers. It continues to report ordinary desktop delivery as
unqualified per invocation; runtime receipts say `submitted`. The explicit account probe uses only
synthetic text and does not persist project activation. Private workload evaluation and promotion
remain the next checkpoint, with actual downstream token usage still unavailable here.
