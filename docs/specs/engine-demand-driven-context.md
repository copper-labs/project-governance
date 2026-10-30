---
id: spec.engine-demand-driven-context
title: Demand-driven context and effectiveness evidence
type: spec
status: approved
owner: project-governance
created: 2026-10-30
updated: 2026-10-30
summary: Separates required prompt guidance from requested retrieval and makes optional paid selection explicit and measurable.
---

# Demand-driven context

## Problem and decision

A workspace attachment is not a request to search its repository. Automatic entry currently
indexes and selects optional source on every prompt, including unrelated requests. A bounded
shortlist reduces this expense but does not establish a need for the operation. Provider success
does not establish useful context, accepted work, or savings.

Deliver required instructions at entry. Let the main agent decide whether it needs repository
evidence during its ordinary reasoning. Local retrieval is the default for an explicit context
request. Paid semantic assistance requires an explicit per-request choice and existing provider
and disclosure eligibility. Do not add a classifier, approval prompt, daemon, or new runtime owner.

This approved implementation direction supersedes automatic optional retrieval and automatic DL03
dispatch in the RC6–RC10 entry contracts. The 4.4.3 candidate, byte, call, replay and family limits
remain in force. Fixed model choices, checks, permissions, source freshness and required guidance
retain their existing owners.

## Request modes

The context-route command accepts `--retrieval none|local|semantic`.

- Native prompt preparation always uses `none`: deliver required routed guidance and current
  task facts, without optional source discovery, descriptor indexing, history search, or paid advice.
  A bound task's source paths may still select required guidance; they do not request optional bodies.
- Explicit context-route defaults to `local`: use the existing local inventory/index, exact paths,
  declared links and lexical matches. Do not dispatch DL03 or the legacy rank-optional-context path.
- `semantic` explicitly requests the existing bounded provider selection over local candidates.
  All configuration enablement, sharing consent, provider eligibility, accounting and fallback
  remain necessary. The flag is a selection preference, not new disclosure permission.
- `none` with explicit optional/discovery/link inputs is rejected as contradictory. Unrecognized
  values fail before optional work. Packet replay preserves the original mode; mode is included in
  family request identity so local replay cannot masquerade as semantic work.
- Unrelated requests need no optional context. Research may be external, repository-specific or
  mixed. Do not classify based on keywords. A request can acquire context later without approval.
- Local automatic candidates must have an actual local match or explicit relationship; zero matches
  can return zero optional files. Required guidance and exact requested originals remain independent.
  Provider uncertainty or failure may fall back to those local candidates, never fabricate relevance.

Keep the full local index searchable when explicitly requested. Do not narrow required route
applicability. Skipped indexing must not publish an empty replacement index or invalidate warm facts.
Native duplicate, fallback, steering and task-refresh paths must also remain provider-free until
an explicit semantic operation. Host integrations receive concise instructions for these choices.

## Reconciled boundaries

The [review reconciliation](../reviews/2026-10-30-demand-driven-context.md) records independent
Opus 5.5 high and Gemini Argon high findings and their source-verified disposition.

Required routing may inspect the captured path inventory in every mode. `none` bypasses optional
catalog construction, index maintenance, body capture and history search; it never publishes an
empty index. Index timing is null with workload `skipped`, not a measured zero-time extraction.

All route provider paths, including supplied adapters, legacy relevance and workflow advice, require
semantic mode. Provider jobs inherit local retrieval; adding a job-level semantic flag is deferred.
Direct low-level evaluation commands remain explicit operations under their existing contract.

Explicit semantic requests in a native session bind to its current verified entry automatically, or
use the supplied entry. The first semantic request opens the original family on demand and uses
semantic step zero. Local requests consume no semantic step. Later semantic continuations use the
existing consecutive steps, exact replay and total limits. Expiry stays measured from the original
native turn; no late request renews it. Standalone semantic requests require an existing task scope;
absent native session/task scope falls back locally with a named reason and no provider call.

Semantic selection may explore the existing bounded permitted catalog window even when local
matches are scarce. Only positive applied metadata advice may admit a nonlocal candidate. Uncertain,
negative, failed or shadow advice falls back to actual local matches, not arbitrary catalog filler.
Local matches are exact/task-declared paths, literal path/descriptor/symbol matches and one-hop links
from matched seeds. Incidental Git changes and history only rank candidates already supported.

Explicit routes retain verified entry linkage where available, and otherwise label any latest-session
observation as non-authoritative. Neither linkage nor a returned packet establishes model consumption.
Passive reports reserve a separate bounded entry population so child records cannot evict its entire
denominator, expose missing/null token counts including cached subsets, and label unobserved hosts.
Dollar estimates belong to an external price snapshot; counters alone are not monetary cost.

Use same-runtime local versus semantic comparisons first. Cross-generation ambient versus requested
behavior and a passage-only arm need separately declared study conditions; the current v1 comparator
must refuse unmatched conditions. This release adds skipped-index interpretation, not a new comparison
schema or passage-only executor. The proposed three-arm study is future work, not release readiness.

## Telemetry and evaluation

Extend existing route/observation receipts and their passive reader; do not build an analytics service.

Each route records requested/effective retrieval mode, trigger, skip/fallback reason, runtime and
source/config identities, entry/family/task linkage, local candidate counts, selected context and
decision receipt references. Existing decisions own HTTP attempts, reservation identities, input/
output tokens, provider/model identity, cache reuse, status and fallback reasons. Never sum a
presentation wrapper's aggregate usage on top of its underlying decisions.

Retain separate preparation, indexing, provider/admission work, selection and packet assembly
timings. Skipped indexing is reported as skipped, not as a successful empty index. Provider work
summed across concurrent calls is not task wall time.

The existing passive context status must expose the denominator of inspected native entries and
how many have linked routes, native usage, additional-read observations and explicit outcome
evidence. Report unlinked observations, collection failures, partial scans, unknown host consumption
and bypass coverage. A command returning a packet does not prove the model used it. A lack of
observed later reads is not zero reads. Preserve null usage and cache-aware accounting; do not claim
complete billing from a bounded scan. No raw prompts or new source-body retention is needed.

Native response usage and outcome recording already exist. Verify those collectors and joins with
fixtures before adding new collectors. Acceptance remains an explicit original evidence reference,
never inferred from Stop, commit, green tests, or an agent's savings claim. Existing hash-bound
release-evaluation manifests remain the comparison owner. Extend only gaps needed for this mode
distinction and visible coverage; no synthetic production acceptance.

## Qualification and effectiveness experiment

Release proof uses offline controlled fixtures: unrelated requests, external research, repository
research, mixed requests, exact-file fixes, cross-module searches, zero local matches, steering,
fallback, exhausted budgets, disabled/denied providers and concurrent family reuse. Assert no
provider attempt and no optional indexing at native entry, useful explicit retrieval afterward,
unchanged required guidance and limits, and complete/partial telemetry denominators.

These tests establish behavior, not economic benefit. A separate small study compares local-only,
local shortlist plus passage judgment, and bounded metadata plus passage judgment on frozen inputs.
Label needed evidence independently. Follow with matched accepted tasks under fixed coding model,
source, tools, permissions and declared cache conditions. Count failures, rework, additional reads,
human interventions and all model costs. Report both variable spend and fixed-subscription capacity.
No benefit or insufficient evidence are valid results. No paid evaluation is part of release proof.

A daily monetary cap across unrelated workspaces is not supplied by per-family bounds. This release
removes ambient paid dispatch; it does not promise an account-level dollar ceiling. A shared cap
would need a separate account-scope and price/reservation contract. Do not hide that larger feature
inside this change or substitute rate limits for spending limits.

## Compatibility and release

Publish a stable minor release based on verified 4.4.3, excluding unrelated preview work. Existing
profiles remain valid; deliberate adoption changes default retrieval behavior. Document the explicit
semantic invocation for existing consumers. Source APIs used by tests follow the same defaults;
injected providers do not silently opt callers in. No adopter runtime is upgraded by publication.

## Research basis

- [TypeSafe model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), reviewed by the
  author 2026-10-02: filter irrelevant state in code first. This supports bounded supplied evidence,
  not an additional paid intent classifier.
- [TypeSafe passage classification](https://docs.typesafe.ai/cookbooks/classifying_rag_passages),
  example dated 2026-08-27: retrieve candidates before semantic filtering. Existing local ranking
  and 4.4.3 bounds already overlap; the missing step is deciding whether retrieval is needed.
- [Contextual Retrieval](https://www.anthropic.com/research/contextual-retrieval), 2024-09-19:
  retrieve before reranking. Reported vendor results do not prove benefit for coding tasks here.

These primary sources were read during the 2026-10-30 audit. Adopter identities, original runtime
evidence and billing estimates remain in the external audit record, outside this source checkout.

## Implementation review clarifications

An entry-linked initial semantic request uses `--entry <id> --task <purpose> --retrieval semantic`.
Its returned continuation command retains semantic mode and uses `--expansion 1`, then `2`.
Exact initial requests through the implicit current entry and explicit entry share an identity.
Concurrent requests still use the existing atomic family reservation. Closed, expired, exhausted,
conflicting and alignment-paused requests retain distinct fallback reasons. Native-session explicit
`--decision-task` or `--decision-context` cannot create a second spending pool; use the current entry.
Every semantic request rechecks workspace alignment. Native steering rechecks task identity before
publishing. Local entry-linked reads do not require a paid-family marker.

Declared procedures on the selected route are an explicit local relationship, not an incidental
change. Local FTS, symbol and descriptor queries use the existing connective-word filter.
Unrelated natural-language requests may therefore return no optional evidence. Optional historical
tasks are not automatically searched; `harness task show` remains the explicit history owner.

Explicit workflow advice requires semantic mode. Within a native family its DL04 match uses that
same family allowance; it cannot execute the recommended workflow or obtain a second budget.

Passive status reserves separate bounded populations for entries (300), route originals (300) and
other observations (700), each within 4 MiB and the existing bounded directory inspection. Projection
hints prioritize candidates, but immutable originals remain authority. Truncation stays explicit.
Linked native, explicit local and explicit semantic routes are separate counts. Provider attempts
are separate from applied advice. Entry references alone do not prove a route was inspected.
Usage outside the inspected entry population is reported separately from linked response totals.
Conflicting response counters remain unknown. Outcomes count distinct linked entries; entries with
both accepted and reopened reports remain multiple-disposition observations, not accepted outcomes.
Deferred ranges, unlinked turns and conflicting usage appear as collection gaps. None prove complete
host coverage or verified acceptance. Release-evaluation workload totals explicitly include skipped
indexing rather than treating it as extraction or reuse.

Staged semantic retrieval is also refused inside an observed native session because it cannot attach
to that entry's worktree family. Standalone staged qualification retains its existing task scope.
Native-family workflow advice requires eligible metadata selection; its absence is shown by the
route's explicit policy fallback reason. It does not silently open a separate workflow budget.
Literal identifier terms (including camelCase and snake_case) remain searchable alongside filtered
split words. The legacy usage summary retains all inspected responses; `effectiveness.nativeUsage`
is the population-linked subtotal and `orphanUsage` is the separate outside-population subtotal.
