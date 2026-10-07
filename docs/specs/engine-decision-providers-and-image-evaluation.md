---
id: spec.engine-decision-providers-and-image-evaluation
title: Interchangeable Decision Providers and Image Evaluation
type: spec
status: approved
owner: project-governance
created: 2026-10-06
updated: 2026-10-06
summary: Extends the existing decision runtime with explicit JEV and OpenAI adapters and reusable evaluation of supplied text and images.
---

# Interchangeable decision providers and image evaluation

## Problem and intended behavior

Before 4.2, the shared decision runtime constructed `JevDecisionClient`, and its preparation,
configuration, model validation and answer decoding assumed TypeSafe. The older `DecisionProvider`
interface did not make that runtime interchangeable. It also accepted text evidence only.

Make the provider an explicit adapter beneath the existing runtime. Retain JEV and add OpenAI
Decisions. Existing registered consumers keep their meaning and behavior; deliberate configuration
can select another compatible provider. A reusable `evaluate_evidence` operation evaluates supplied
text, images or both against bounded Boolean, choice and score questions. Agents and test scripts
use the same operation through a command or a narrow library entry.

The operator approved implementation and focused local verification for release 4.2 after the
qualified 4.1 release. The Opus 5.5 medium design review and subsequent simplification pass are
complete. This document owns the intended behavior; batch evidence records what is implemented.
Paid live qualification, 4.2 publication and changes to an adopter remain separate actions.

## Ownership and boundaries

| Owner | Responsibility |
| --- | --- |
| Existing decision runtime | Entry admission, approved evidence, operation accounting, budgets, cancellation, reuse, validated answers and receipts |
| JEV or OpenAI adapter | Provider/model validation, fixed endpoint and credential lookup, supported modalities, payload encoding, native answer decoding and usage |
| Trusted entry/caller | Host-derived accounting, caller operation identity and verified task/run provenance; requests cannot invent a current task |
| Adopting project | Test steps, capture, reference images, written criteria, interpretation thresholds, required-check policy and baseline updates |
| Native test/check runner | Execution, process ownership, actual result, cleanup and retained test evidence |

Markdown and code retain governance authority. A semantic answer cannot grant permission, change a
native checker result, suppress another required check, execute a repair or accept a task. The
new operation does not acquire the effects of a registered decision consumer.

### One provider seam

Extend `DecisionRuntime` rather than build a parallel evaluator. Define one small typed adapter
interface for capabilities, model validation, request encoding and answer decoding. Reuse the
existing transport, bounded response reads, cancellation, provider admission and failure handling
where their contracts are shared. Keep provider details out of consumer code.

Use typed `registered` and `supplied` admission branches feeding one private execution lifecycle.
`DecisionRuntime.evaluate(...)` accepts validated request-local question definitions; it does not
add a fake DL consumer or insert definitions into the static governed-question registry. The
supplied branch has explicit disabled/enabled-advisory configuration and fixed `advise` effect.
It cannot join a registered batch and has no shadow/baseline interpretation. The existing global
off switch disables both branches; registered shadow/auto behavior stays unchanged.

The common question types are Boolean probability, unordered choice and ordered score. Existing
internal `noul` definitions retain their identities; the OpenAI adapter maps them to `predicate`.
Both Score contracts use the probability-weighted ordinal index. Preserve native fields and
validate the supplied distribution rather than inventing an explanatory answer.

Capabilities declare modalities, question types and evidence layouts. JEV retains its existing
layouts; OpenAI supports shared evidence only. Unsupported layouts return unsupported with zero
dispatch; do not flatten isolated evidence into a shared request. The first adapters are JEV text
and OpenAI text/images. Health and pacing are separated by provider and host-resolved account
scope without recording credential contents.

JEV keeps its preparation and token pacing. OpenAI uses finite serialized-byte/image-count bounds
(at most 128 images), the adapter's finite concurrency/call-rate policy, provider rate-limit responses
and the operation deadline. Record its token estimate as null until a supported estimator exists;
never count base64 bytes as image tokens. Native usage establishes cost after the call. Byte/call
allowances bound dispatch volume, not a guaranteed pre-dispatch dollar amount.

### Explicit configuration and compatibility

Resolve settings once through the existing `decision-settings.ts` owner. Configuration selects
one provider/model for registered text decisions and one for generic evaluation. Generic OpenAI
supports text/images; generic JEV accepts text and rejects images without dispatch. Selection is
explicit configuration, with no content-based routing or provider fallback.

Existing profiles retain their current JEV settings, exact consumer/question enablement, modes,
budgets and provider-free fallback. Missing new settings leave generic evaluation disabled. New
providers or questions are not enabled by installation or upgrade. Legacy projections read the
canonical settings rather than become another configuration authority.

Initial OpenAI swaps for registered consumers are shadow-only; generic evaluation can deliver
advice. Registered advice or `choose-read`/`route-model` effects are outside this first delivery.
A later accepted change needs workload qualification bound to provider/model, preparation/layout
and question versions. Configuration cannot lift this fixed ceiling; retain the native baseline.

The caller cannot supply an endpoint, credential, provider override or executable in the evidence
request. Adapter endpoints are fixed. Credentials remain host-owned. A local-only request cannot
use either hosted adapter. Add an explicitly allowed `supplied-evidence` disclosure class for
generic inline text, questions, labels and images; existing source/diagnostic/metadata permissions
do not imply this grant. Generic inputs all use that class, with approved roots additionally
constraining image paths. This explicitly approves supplied content, including source when
deliberately supplied; it does not inherit a narrower source-path grant or classify content
automatically. Check every transmitted field and destination before dispatch.

Image-enabled evaluation requires approved artifact roots, supplied-evidence permission and a
finite daily call/byte allowance. Adapters declare finite per-request image-count, image-byte,
serialized-byte and question limits; reuse the existing operation deadline and provider-pool pacing
policy. Each operation permits one dispatch, so no per-request call-limit setting is needed.
Document fixed adapter limits before implementation verification. Count base64/JSON expansion,
preserve current JEV text bounds and never truncate images silently. Missing enablement/permission
or daily allowance is unavailable; an oversized request is rejected before dispatch.

The initial OpenAI admission bounds are 128 static images, 10 MiB per image and aggregate original
image bytes, 16 MiB for the complete serialized request, 64 questions, 254 supplied choice values
plus the reserved unknown choice, and 10 score levels. One request admits at most 256 evidence
items. Static image containers have a 16,384-pixel side and 64-megapixel guardrail; container
validation does not decode or transform pixel data. The existing operation deadline owns the
whole request; no short per-call deadline is added. The shared provider pool retains four concurrent
calls and 960 calls per minute, with a 32 MiB/second serialized-byte pacing policy for OpenAI.
These are local admission policies, not claims about the account's service limits. Image-token
estimates remain null. JEV retains its 64 KiB serialized and existing text-estimate bounds.

Daily generic allowances are explicitly declared finite safe integers. They do not inherit the
registered task/context configuration ceiling; a day of calls is a different scope from one
context operation. Provider admission and immutable dispatch claims still constrain each request.

Record requested model, returned model and adapter/configuration identity. JEV keeps its existing
exact version validation. Initially OpenAI requests `gpt-6-luna` and accepts that exact returned
alias. Any additional returned snapshot identity requires an exact documented mapping in the
adapter; no prefix matching or invented snapshot pattern. An alias is not proof of immutable
weights. Receipts and qualification state state that limitation; an unobserved backend change
cannot be represented as verified model identity.

## Evidence and request contract

Use one versioned plain JSON request. It contains an evaluation identity, evidence, questions and an
optional verified task/run association. Existing schema owners validate it; no rubric language or
dynamic question-code loader is introduced.

| Field | Meaning |
| --- | --- |
| `version` | Public evaluation contract version, initially 1 |
| `evaluationId` | Stable operation identity for retry/replay, bound to the admitted request |
| `evidence` | Ordered items with unique IDs: supplied text or an allowed local image reference; optional descriptive role |
| `questions` | Unique named Boolean/choice/score questions, instructions and supplied options or ordered levels |
| Optional association | A separately verified existing task, attempt or test run; absent association remains absent |

An image reference is a local workspace/artifact path. Resolve it under approved roots, verify its
actual media type and dimensions, and capture bounded immutable bytes before dispatch. The
internal descriptor retains the original reference, digest, media type, dimensions, byte count,
ID and role. First delivery supports static PNG, JPEG and WebP; reject animation, remote URLs,
unreadable/unsupported images and path/symlink escapes explicitly. Do not fetch remote media,
follow image-embedded instructions or automatically transform an image.
Use workspace-relative paths or canonical absolute paths. A system alias such as `/tmp` may
resolve through a symlink; it does not bypass the image segment checks or approved-root boundary.

Roles such as `actual` and `reference` describe the evidence. They do not grant trust. All questions
in one request evaluate the same admitted evidence set. Per-question names or evidence references
do not imply provider-enforced input isolation. Separate calls are needed for different evidence
disclosure or a question dependent on an earlier answer.

One image can be checked against written requirements. Two or more labeled images can be compared
against stated criteria. Comparison is semantic, not a promise of exact pixel identity. Existing
pixel, DOM and accessibility checks remain useful independent evidence.

No preprocessing is included initially. A test runner may deliberately mask/crop its own artifact;
retain its original and evaluated references and transformation identity in the caller evidence.
The evaluator reports only the scope of the bytes it received. Renaming an identical file does not
change semantic input identity; changing bytes under an unchanged filename does.

### Accounting and exact reuse

Keep one decision budget/receipt owner. Use typed task/evaluation scopes and encode a reserved
evaluation namespace only at the existing version-2 budget-store boundary, following the current
context-family precedent. The encoding is never exposed as a task ID or accepted by task APIs.
Task keys remain unchanged; no schema-version bump or second store is needed. Preserve coexistence
and rollback reads by older installed generations.

Every generic dispatch reserves against one configured workspace evaluation allowance per UTC day:
calls and serialized bytes. The host derives workspace, state root and window identity;
caller IDs, new processes, configuration changes and disable/re-enable cannot reset that window's
spending. Closed/expired windows do not reopen. No caller-created session/run spending scope is
needed initially. Admission closes earlier windows without deleting operation claims; this avoids
filling the active-scope pool. Per-request capture/count/duration bounds still apply.

Standalone evaluation does not create, select, resume or accept a task. Optional task/run association
is verified provenance only, not a spending namespace or new authority. An environment run ID alone
is insufficient verification. Existing counters, closed scopes and historical receipts remain
readable; adding the namespace does not reset spending or delete stores.

Each reserved evaluation ID permits at most one provider dispatch. A deliberate new provider
attempt uses a new evaluation ID and consumes the current workspace allowance; SDK/transport
automatic retries are disabled. Replay is not another paid attempt.
Its durable reservation identity is `(workspace, evaluationId)`, independent of the charged UTC
day. Persist the admitted request identity with that claim and charge the current window in one
transaction, before dispatch. Check the claim across windows even when no answer receipt exists:
matching input remains unavailable/outcome-unknown; changed input is a conflict. Use reserved
event encoding/lookup in the existing store, not another ledger. Store capacity failure denies
dispatch; closing a spending window never deletes the dispatch guard.
V1 retains these claims within the existing store capacity; future pruning needs a separately
defined replay/retention contract and cannot silently make an old ID dispatchable again.
Bind evaluation ID to evidence digests and ordered roles, exact questions/options/levels, resolved
provider/model, adapter/preparation versions and relevant configuration. Identical replay reuses
the retained receipt without another call. Changed identity under the same evaluation ID is a
conflict, not permission to send again. Interrupted dispatch with no usable answer remains
unavailable/outcome-unknown; do not promise exactly-once remote inference or automatic replay.

For generic evaluation, relevant configuration means settings that change the semantic provider
request. Registered-consumer modes, task/context budgets and daily spending allowances do not
change that input identity. Changing an allowance cannot charge or dispatch an unchanged retained
ID again. Current enablement, disclosure, roots and local-only checks still govern every invocation;
revoking admission denies reuse rather than changing the original request's meaning.
Recognized version-1 budget stores have no evaluation claims. Read-only claim lookup returns no
claim; the existing dispatch reservation owns migration and preserves the old counters. Unknown
store versions fail closed.

Reuse requires the same admission and current permission checks. A previously stored answer does
not broaden disclosure or effects. Retain both semantic input identity and the distinct local
artifact provenance; do not hash a larger unseen input as proof it was evaluated.

## Answers, failure cases and interpretation

The envelope includes evaluation and receipt identities, provider/requested/returned model,
per-question outcomes, native usage and timing, input coverage and failure reasons. Retain raw
valid probabilities and the interpretation identity even when the caller abstains. Do not record
image bytes, base64, credentials or unrestricted question/evidence bodies in ordinary telemetry.

The request and narrow `evaluation/v1` library surface are version 1. The public result uses the
shared version-3 supplied-evaluation envelope; its version is not the request's schema version.

New version-3 outcomes/receipts use `method: baseline|provider` plus explicit provider/adapter
identity. Method describes delivery; `providerCalled` separately records shadow/failed dispatch.
The owning reader projects version-2 JEV receipts without rewriting them; unknown historical usage
stays unknown. Provider reporting and cost use explicit identity. Exact reuse cannot cross a
provider/model/preparation change. Older readers may reject new receipt shapes; retained budget
reservations still prevent duplicate dispatch. Budget schema compatibility does not promise
cross-generation answer reuse.
Current outward JSON that embeds a new outcome uses version 3 and baseline/provider plus provider
identity; update every owning presentation/filter rather than continue testing method against `jev`.
Historical version-2 JSON retains its original labels and interpretation.

| Shape | JEV native fields | OpenAI native fields | Shared validated result |
| --- | --- | --- | --- |
| Boolean | Noul probability | Predicate probability | Probability in [0,1]; no invented confidence |
| Choice | Choice, confidence, distribution | Choice, confidence, probabilities | Supplied typed choice, confidence and full probability distribution |
| Score | Score, confidence, probabilities, legend | Score, confidence, labeled indexed probabilities | One computed weighted zero-based score, confidence, full distribution and supplied ordered legend |

Validate complete option/level coverage, typed identities, probability range/sum and native score
agreement with the computed expectation within a documented numeric tolerance. The shared v3
result has one `score` field equal to that computed expectation; keep the provider score in native
fields rather than duplicate `score` and `expectation`. Old v2 receipts remain unchanged.
The OpenAI adapter derives the
shared legend from admitted levels and verifies returned labels/indices; it does not require a
native JEV `legend` field or invent confidence. Preserve native fields alongside the common result.
Initial public choice values are strings, matching current JEV definitions. Reject incompatible
typed values rather than coercing an OpenAI Boolean choice into a string.

| Outcome | Observable handling |
| --- | --- |
| Answered | Valid supplied option/distribution or Boolean probability; score is the weighted level index |
| Unknown | Explicit unknown option, insufficient evidence or unresolved interpretation region |
| Refused | Provider declined this question; retain independently answered questions |
| Unsupported | Selected provider cannot evaluate the modality/question contract; zero dispatch |
| Unavailable | Disabled, denied disclosure, absent prerequisites, exhausted budget, cancellation, timeout, provider failure or interrupted dispatch |
| Invalid | Invalid request, identity conflict, wrong model relationship, invented option or malformed answer/distribution |

Validate each answer against its supplied definition and IDs. A malformed question answer does not
erase valid independent answers; an invalid envelope/model identity invalidates the whole batch.
This preserves the current parser's per-question invalidity behavior and regression coverage.
Refusal, unknown and infrastructure failure are neither a negative predicate nor a test pass.

Provider confidence remains a native statistic with documented provenance. Do not normalize it
into an invented probability of correctness or apply one universal threshold. Thresholds belong
to the question, preparation, provider/model and workload. Switching any of these invalidates the
affected qualification; provisional/ad hoc interpretations remain labeled unqualified.

The CLI always emits one structured result envelope. Exit 0 requires a well-formed evaluation
whose question outcomes are all answered, unknown or refused. Otherwise exit 1, retaining usable
independent answers and reasons. Unreadable/unparseable/invalid requests use the same envelope
with an invalid-request reason, null unresolved identities and no invented question answers.
Exit 0 never means an assertion passed; test scripts interpret the outcomes and their criteria.

## Reusable entry and test integration

Expose one `evaluate_evidence` operation as `project-governance evaluate --request-file <path>` and
a narrow versioned library export for trusted scripts. Both enter the same runtime. The public
evaluation export contains no task authorization or execution API.

Agents use the existing native command tool with a small packaged evaluation skill that documents
the JSON request, result and scope/permission requirements. This is a complete initial agent path.
No new MCP server, host plugin registration, browser executor or background process is required.
A later host-specific tool wrapper must delegate to this operation rather than own another runtime.

Generic admission validates the complete request, including its bounded request-local questions,
before reservation or dispatch. These questions are advisory and cannot register or enable a
governed consumer. Repeated tests keep their
question/rubric content versioned in the adopting project; loading such a JSON request is ordinary
input preparation, not a new runtime policy language.

The adopting project's native test script owns navigation and stable screenshot capture, then
calls the evaluator and applies its declared visual assertion policy. Retain build/source identity,
test/run identity, viewport/device, theme, locale, captured scope and baseline identity. Missing or
incomparable conditions produce unresolved coverage rather than an invented comparison pass.

Use the existing project custom-check seam and evidence directory. Link the evaluator receipt from
the original test/check result. The wrapper maps unresolved outcomes deliberately to its owning
checker/test envelope; do not emit an unsupported status. Preserve the existing distinction between
checker `passed|warning|failed|not-applicable` and test-case `passed|failed|blocked`.

Governed checks require explicit credential forwarding. A selected project pack declares only the
fixed adapter credential environment names it needs, never values. Forward those names through
both detached check-worker startup and the existing native command `credentialEnv` owner. Support
the exact adapter-declared standard key names (including `OPENAI_API_KEY`) in credential-name
validation; do not widen the matcher to arbitrary key names. Unrelated checks retain filtered
environments; credentials never enter argv, requests, receipts or logs. Missing declaration/value
marks only the declaring command unavailable/failed execution and leaves other checks runnable.
Installed proof exercises both filtering boundaries
with a canary secret and verifies its absence from retained artifacts.

The first integration is advisory. A separately declared project visual assertion can later become
required after workload qualification. If that required assertion cannot obtain a usable answer,
its owner reports failed execution or blocked proof; it never maps uncertainty to pass or
not-applicable. The evaluator cannot overwrite another native test result or update a baseline.

The same operation can evaluate rendered documents, diagrams or product photos. These are uses of
supplied artifacts and questions, not new capture backends promised by this specification.

## Non-goals

Automatic provider routing/failover, replacing JEV by default, a provider marketplace, another
receipt/cache service, image preprocessing, arbitrary extraction/explanations, autonomous UI control,
baseline approval, predictive test omission, learned threshold tuning, universal visual accuracy,
live model benchmarks, runtime publication and adopter installation are outside this delivery.

## Acceptance criteria

```governance-spec
{
  "version": 1,
  "criteria": [
    { "id": "R1", "claim": "One existing decision runtime executes explicit JEV and OpenAI adapters while preserving legacy text consumer behavior, defaults, budgets, cancellation and native authority.", "verification": "mechanical" },
    { "id": "R2", "claim": "Canonical configuration admits only explicitly enabled provider capabilities and approved evidence/destinations, with no silent rerouting, disclosure widening or credential-bearing requests.", "verification": "mechanical" },
    { "id": "R3", "claim": "Text/image evaluations bind bounded immutable evidence, question definitions, provider/model and configuration to explicit accounting and exact replay without fake task binding or reset spending.", "verification": "mechanical" },
    { "id": "R4", "claim": "Typed answers retain distributions, weighted scores, refusal and uncertainty; malformed, unsupported and unavailable outcomes remain distinct and cannot become a negative answer or passing assertion.", "verification": "mechanical" },
    { "id": "R5", "claim": "CLI, narrow library and packaged agent guidance invoke the same advisory evaluate_evidence operation without acquiring registered consumer effects, task authority or another executor.", "verification": "mechanical" },
    { "id": "R6", "claim": "A project-owned visual test integration retains original run/artifact conditions and evaluator receipts, preserves native outcomes and deliberately maps unusable required assertions to unresolved proof.", "verification": "mechanical" },
    { "id": "R7", "claim": "Qualification and efficiency claims distinguish fixture correctness, live provider behavior, visual accuracy, accepted-task benefit and installed proof, preserving workload-specific uncertainty and model-alias limits.", "verification": "semantic" }
  ]
}
```

## Verification strategy

- R1/R2: fixture transports exercise both codecs, unchanged profiles, explicit swaps, unsupported
  images on JEV, permission denial, local-only requests, missing credentials, cancellation and
  separate provider admission. Existing context/review consumers retain deterministic fallbacks.
- R3: synthetic image content/format fixtures cover byte limits before allocation, actual media
  detection, symlink escape, changed bytes, reordered roles, replay/conflict, interrupted dispatch,
  old accounting history and standalone evaluation without a task. Assert zero calls on rejection.
- R4: Boolean/choice/score and mixed refusal fixtures exercise valid distributions and expectations,
  wrong IDs/model, per-question invalidity, envelope invalidity and CLI exit/result distinctions.
- R5/R6: a disposable generic project script invokes the installed command on synthetic artifacts
  with a fixture provider, produces native checker output and retained evidence, and proves a
  refusal/error never becomes a pass. Exercise the narrow library import and agent instructions.
- R7: independent review consumes these contracts and later existing proof. A separately authorized
  live comparison uses frozen human labels, known-good and defective screenshots, false passes,
  false alarms, abstention, p50/p95 wall time and observed native cost. No model labels its own
  correctness. Required use and empirical savings stay unqualified without that evidence.

The [implementation plan](../exec-plans/active/2026-10-06-decision-providers-and-image-evaluation.md)
sets coherent batch checkpoints and installed proof. This design review launches no runtime tests,
model experiments or package build. Future source proof uses the root Node version and current
compiled package; retained installed generations keep their owners until deliberate cutover.

## Related artifacts and source basis

- [Decision layer](engine-decision-layer.md): existing semantic authority, accounting and interpretation.
- [Design reconciliation](../reviews/2026-10-06-decision-providers-design-reconciliation.md):
  Opus 5.5 medium review and focused closure of the corrected contracts.
- [Simplification pass](../reviews/2026-10-06-decision-providers-simplification.md):
  fewer settings, one score/exit contract and focused installed proof.
- [Verification and semantic review](engine-4-verification-feedback.md): native outcomes and evidence.
- [Validation strategy](../governance/validation-strategy.md): batch cadence and boundary proof.
- [OpenAI Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and
  [endpoint reference](https://developers.openai.com/api/reference/resources/decisions/methods/create):
  verified 2026-10-06, public beta, `gpt-6-luna`, text/images, independent questions, per-question
  refusal and probability-weighted zero-based Score. Input is $0.10/M tokens; image token sizing
  and absolute/percentile latency are not established by the reviewed Decisions documentation.
- [TypeSafe models](https://docs.typesafe.ai/models), [API](https://docs.typesafe.ai/api) and
  [confidence](https://docs.typesafe.ai/confidence): JEV 1.13 text-only, Choice/Score/Noul and
  $0.042/M input tokens. Provider prices and aliases require readback before live comparison.

OpenAI supports inline images; it supplies neither screenshot capture nor evidence that a screenshot
judge is reliable on an adopting project's UI. One provider's confidence/latency claim is not a
comparison with the other. The reviewed design does not claim a qualified replacement.
