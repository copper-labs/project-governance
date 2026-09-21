---
id: plan.decision-first-development-loop
title: Decision-First Development Loop
type: exec-plan
status: active
owner: project-governance
created: 2026-09-19
updated: 2026-09-19
summary: Map recurring development decisions and reduce reading, reasoning and execution cost per accepted change.
---

# Decision-first development loop

> Forward planning now follows the [unified engine transition](2026-09-20-unified-development-engine.md).
> This document retains the recurring-decision map and prior rationale. Language, ownership and
> slice ordering are reopened in the [decision register](../../specs/unified-development-engine.md);
> neither these earlier choices nor the S1–S9 schedule override that review.

## Outcome and design status

Improve development and iteration: fewer tokens, less elapsed time, better accuracy and less
unnecessary build/test work per accepted change. Continuity and a small decision model are means
to that outcome. Installing a classifier or reducing individual call cost is not success.

This direction is accepted for specification and planning; runtime implementation remains pending.
The current module specifications own existing behavior. The [earlier adoption plan](../../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md)
retains S1–S9 acceptance requirements for the new transition. Evaluate the full loop before choosing a model use case.
This document owns the decision map and rationale, not a second implementation sequence. No provider call,
adopter change or release is part of this documentation change.

The current governance wheel contains the Python runtime and TypeScript harness. Its store,
execution owner and host remain in place until the new transition qualifies their replacements.
An internal optional JEV interface remains part of the unified direction, not a separate product.

## Starting evidence

The original [concept](../../../components/harness/docs/research/concept.md) and
[end-to-end flow](../../../components/harness/docs/research/flow.md) propose moving discovery,
selection and recurring interpretation out of frontier-model turns. Divergent copies also exist under `docs/research/decision-first-harness/`; both are historical.
Their savings, latency and front-door claims are hypotheses; their old storage and host descriptions are not current authority.

Current source provides useful building blocks, not the whole proposed loop:

- `components/harness/src/ops/continuity.ts`: explicit task resume, checkpoints, pending-action
  summaries, bounded history and reconciliation. Resume is not semantic relevance ranking.
- `components/harness/src/ops/retrieval.ts`: scope-checked, subject-bound artifacts and cumulative
  byte budgets. No-path discovery returns up to 40 sorted paths; it is not task-relevance retrieval.
- `src/project_governance_runtime/context.py` and `skill_selection.py`: deterministic routing,
  required/optional context groups, skill matching and bounded materialization.
- `components/harness/src/ops/governance.ts`: calls the public governance planner. It does not
  implement another selector or establish proof from a plan.
- `components/harness/src/ops/execution.ts` and governance's provider executor: declared jobs,
  receipts and recovery. These remain the execution owners.
- The [development-loop contract](../../../components/harness/docs/specs/development-loop.md)
  describes next-proof coordination that is not yet fully connected to host and hook behavior.

Historical repeated-subject percentages are unsuitable for prioritization until their event/run
denominators are repaired. Repetition alone does not establish waste. Telemetry without native
usage and agent actions cannot establish model-reading cost or the best semantic use case.
Adopter-specific measurements and experimental receipts stay outside this reusable checkout.

## Decision map

This inventory covers the recurring choices at each development boundary. A pilot should record
unclassified choices so the map can be corrected; it does not claim to enumerate every future task.

| Point and recurring question | Existing code or ordinary-code work | Bounded model opportunity | Host responsibility |
| --- | --- | --- | --- |
| Intake: what is being requested? | Read explicit task binding, scope and known categories | Classify ambiguous intent or suggest related tasks | Confirm ambiguous binding and material scope; understand open requests |
| Resume: what matters now? | Restore constraints, checkpoint, current source and active jobs | Rank optional history against the current question | Resolve contradictory history and missing intent |
| Discovery: where should I look? | Targeted search, changed paths, ownership routes and candidate generation | Rank supplied files/passages by relevance | Investigate when candidates are incomplete |
| Instructions: which guidance applies? | Required instructions and deterministic skill/fact matching | Rank optional guidance where matching is ambiguous | Interpret novel policy questions; follow required guidance |
| Planning: what batch makes sense? | Known prerequisites, runbooks and declared dependencies | Suggest a supplied task category or investigation option | Design the change and its coherent implementation batch |
| Worker choice: who should do this? | Existing model policy, supported capabilities and explicit operator choice | Classify a bounded assignment's needs | Authorize delegation and select through supported controls |
| Editing: what should change? | Mechanical transformations with defined preconditions | Classify a known edit pattern where useful | Generate code, resolve architecture and investigate novel behavior |
| Feedback: which checks apply? | Governance's impacted selection and project test maps | Flag semantic uncertainty in supplied mappings | Resolve missing coverage; models cannot remove required checks |
| Build preparation: what can be reused? | Project build-system input closure, artifacts and resource ownership | No reuse verdict from a model | Resolve unknown prerequisites and missing proof |
| Dispatch/wait: is work already running? | Observe the recorded owner job; completion-aware waiting | None for known job state | Handle unresolved ownership or intervention |
| Result intake: what does this output mean? | Parse native outcomes and known error codes; preserve log references | Classify unresolved excerpts and rank diagnostic evidence | Diagnose open-ended failures |
| Repair: is this the same problem? | Compare exact inputs, attempts, failure IDs and changed scope | Suggest semantic failure grouping or rank permitted diagnostics | Choose and implement a repair; authorize side effects |
| Review: what still needs attention? | Compare required claims with applicable receipts | Flag possible unsupported claims or relevant review areas | Independent reasoning and final acceptance |
| Delivery: what is ready to report? | Assemble verified facts, gate results and destination evidence | Optional categorization of changes | Write substantive narratives and authorize publication |

Avoid asking a model to restate facts already present in receipts. Keep verification and acceptance
separate. A classification is not permission, a root-cause proof, a cache-validity verdict or a new
instruction. Successful execution and satisfied requirements do not alone establish user acceptance.

## Ranked opportunities

Rank by the amount of reading/reasoning plausibly replaced, breadth of use, existing implementation
support and consequences of error. These are engineering priorities, not measured savings rankings.
Token savings and elapsed-time savings need separate rankings; do not invent one blended score.

| Priority | Intervention | Expected benefit mechanism | Main uncertainty |
| --- | --- | --- | --- |
| 1 | A compact working packet for the next task boundary | Avoid repeated discovery, broad file reads and reconstruction; useful across implementation, review and resume | Can retrieval retain decisive evidence with fewer host reads? |
| 2 | Deterministic build/test coordination | Avoid duplicate submissions, repeated setup and manual-then-hook duplication where actually observed | Which unnecessary invocations remain in real use? |
| 3 | Normalized results plus optional diagnostic ranking | Reduce repeated full-log ingestion and unproductive investigations | How often are known parsers insufficient? |
| 4 | Ambiguous intent and optional skill selection | Avoid repeated routing deliberation | Much matching is already cheap and deterministic |
| 5 | Bounded worker/model advice | Reduce expensive reasoning on suitable assignments | Host support, assignment quality and rework may erase savings |
| 6 | Semantic claim/evidence review | Catch unsupported conclusions earlier | Harder ground truth and harmful evidence omissions |

The first semantic experiment is optional-context ranking inside priority 1. Choose it for its
cross-loop reach and direct relationship to reading cost, not because a measured win already exists.
If actual tasks already receive small, sufficient packets, move to the next observed bottleneck.
Failure triage remains a candidate, not the definition of the project.

## First implementation: prepare the next working packet

Use `harness prepare` as specified by the development-loop contract, composing existing resume and
retrieval. It prepares information; it does not start another agent loop.

1. Read the explicitly bound task, revision, workspace and requested purpose: implement, investigate,
   review or resume. Keep purpose explicit initially rather than adding a classifier first.
2. Restore mandatory constraints and current action/job facts. Resolve the exact source being read.
3. Ask existing governance routing for required context and use targeted search/ownership signals
   to assemble optional candidates. Do not treat the current 40-path discovery cap as a complete
   candidate universe. Report candidate coverage limits and the bounded search used.
4. Produce a deterministic ranking first. Where enabled, ask the decision adapter to rank bounded
   optional candidate IDs using attributable excerpts. It cannot read arbitrary files or invent paths.
5. Validate candidate IDs, evidence identity and bounds. Materialize chosen source bytes with the
   existing artifact/budget machinery; include all mandatory material or return a clear blocked result.
6. Return the objective, constraints, selected context, source references, pending jobs, known proof
   and unresolved questions. Include omitted candidates and a bounded expansion path. Describe a next
   operation only when an existing plan or owner contract establishes it; otherwise ask for reasoning.
7. Record packet identity, selection method and measurable delivery cost in existing task evidence.
   Refresh at meaningful boundaries, not after every tool call.

Candidate excerpts and final artifacts must refer to the same bytes. On changed input, re-evaluate
selection or return stale/unknown. Matching bytes alone do not prove complete dependency coverage.
Required instructions bypass semantic filtering. Conflicting evidence must remain visible.

The host can request more context and use native tools. An expansion is diagnostic evidence, not
automatically a failure. Track repeated expansions and missed decisive evidence; never keep packets
artificially small just to improve a byte metric. Ranking is selection, not generated summarization.

## Optional decisions and fallback

The [decision interface](../../../components/harness/docs/specs/decision-interface.md) owns question
schemas, off/auto/shadow modes, data-sharing gates, deadlines and immediate no-token fallback.
JEV is an optional adapter in the same wheel. Mandatory context and execution authority stay outside
semantic ranking. Keep live-workload shadow comparison available; S7 chooses its owned execution
placement and bounded provider-health storage from actual requirements.

### Source discovery and indexing

Use a source-discovery interface now, backed first by Git, targeted lexical search and existing
governance routes. Rank candidates before delivering full files. This supports the packet without
requiring a new index service. The index and JEV are independent: either may be disabled.

If repeated discovery dominates preparation cost or relevant candidates are missed, add a disposable
local repository map: paths, package roots, documentation/test locations and declared relationships.
Add language-aware symbols/imports only for demonstrated misses. Do not treat imported-symbol or
path relationships as a complete build dependency graph. Embeddings remain a later comparison if
lexical/symbol retrieval misses materially useful context; do not add them by default.

Follow the existing [discovery contract](../../../components/harness/docs/specs/repository-discovery.md):
key cached entries by repository/tree/extractor identity, maintain content-hashed dirty overlays per
workspace, refresh on demand and validate selected source before use. A missing/stale index falls
back to direct search. Exclude sensitive, generated and vendor material as appropriate; never dump
the entire index into model context. Measure recall, stale hits, query/refresh cost and host reads
avoided before expanding the map. Correct retrieval, not index size, is the objective.

## Build/test improvements alongside the decision layer

Keep this as a distinct implementation batch after the packet slice, using the same facts and report:

- Attach to an existing job instead of submitting it again. Preserve original result and cleanup.
- Let the declared Git hook own its gate; eliminate a duplicate manual request at the caller.
- Use the existing affected-check selector and project-owned build cache/resource owner.
- Present normalized results once, with full-log references and changed-input information.
- Consider ordering optional early diagnostics only where the runner supports it and it reduces
  time to useful feedback. A sequential canary may increase total latency; measure both effects.

No new verdict cache, compiler scheduler or model authority to skip CI, device proof or release gates.
Measure queue, build, install, test and cleanup separately where the existing runner exposes them.
The objective is fewer unnecessary invocations and faster feedback, not fewer required assertions.

### Full validation workflow, including phones

A task remains open through the applicable validation workflow; editing is not its completion
boundary. Represent the required stages and dependencies using the existing governed batch cases
and project runner contracts. The harness tracks the workflow; the executor and project runners
perform and supervise it. It does not add another scheduler.

Example dependency sequence: focused regression check, application build, acquire target resource,
install exact binary, launch with declared scenario state, run automated scenario, collect native
assertions and artifacts, confirm cleanup, then review the complete evidence. Some projects combine
these stages in a canonical runner; consume that runner instead of splitting its ownership. Required
parallel lanes can use existing owners where resource isolation is established.

Carry source/toolchain/input identity, binary digest, device identity/OS, scenario and app-state
requirements through the receipts. Build, install and scenario outcomes are distinct. A successful
launch is not a passing scenario; a simulator result is not physical-device proof. Reuse a build or
installation only when the project owner establishes applicability, never because JEV predicts it.

Native assertions and deterministic validators establish test results. JEV may classify unfamiliar
logs or rank diagnostics. Visual or behavioral judgments without an authoritative assertion remain
separate observations requiring their declared reviewer; they cannot convert an unknown into pass.

Resume observes the same active stage/job and pending cleanup. On failure, preserve all receipts,
identify changed inputs and let the owner determine which stages must repeat. Missing devices,
permissions or attended steps become explicit blocked stages with a clear next action. Device locks,
ports and build outputs retain their existing resource owners across worktrees.

Qualify one complete project-owned build/install/launch/test/cleanup workflow as a product milestone.
It does not depend on JEV qualification. Measure time to accepted proof and operator intervention,
not merely command dispatch or successful app launch.

## Implementation sequence and evaluation ownership

The [adoption plan](../../../components/harness/docs/exec-plans/active/2026-09-19-governance-codex-adoption.md)
records the former S1–S9 sequence, now mapped into the unified transition. In that inventory,
S2 establishes measurement; S3 compares deterministic packets with current
host discovery; S4–S6 qualify execution and device workflows; S7 compares optional JEV ranking; S8
adds indexing when evidence supports it. Execution improvements do not wait for JEV qualification.
Unique evaluation requirements from the former batch sketches now live in that plan and the
[decision](../../../components/harness/docs/specs/decision-interface.md) and
[measurement](../../../components/harness/docs/specs/measurement-and-qualification.md) contracts.

At each coherent boundary apply the [validation strategy](../../governance/validation-strategy.md),
then rerank remaining opportunities against measured cost. Historical reviews preserve the previous
proposal. This sequence does not itself authorize paid calls, publication or edits in other repos.

## Measures and adoption decision

Primary outcomes are tokens and elapsed time per independently accepted change, alongside acceptance
rate, reopened defects and required-proof coverage. Count failed attempts and later rework. Keep
model-native token categories separate; bytes and sum-of-job durations are useful proxies, not total
tokens or elapsed delivery time. Unknown usage remains unknown.

Supporting measures: decisive-evidence retention, delivered context bytes, exploratory reads, context
expansions, model fallback, unnecessary dispatches, build/test count and time to actionable feedback.
Observe native usage only through supported sources. Keep bounded allowlisted analytics separate from
durable evidence under the existing [measurement contract](../../../components/harness/docs/specs/measurement-and-qualification.md).

### Telemetry for repeated tuning

The [measurement contract](../../../components/harness/docs/specs/measurement-and-qualification.md)
owns observations, privacy, retention, coverage and frozen evaluation records. S2 compares extending
existing telemetry with separate storage against those requirements. Storage reuse is useful only
if it preserves meaningful comparisons and failure isolation. Routine analytics and explicit private
evaluation capture remain distinct; neither implies automatic export or model training.

Promote an intervention only when fresh matched tasks show a net benefit in the targeted outcome
without material correctness or proof loss. Report sample sizes and spread; small pilots do not prove
rare-error safety. Define workload-specific tolerances and a meaningful benefit threshold before
candidate evaluation, after baseline variability is known. Do not retrofit thresholds to a winner.

If deterministic packets capture the benefit, retain them and leave JEV off for that question. If JEV
adds useful reduction at acceptable quality, enable it for that bounded question. Significant total
savings require a large addressable share; no reduction percentage is promised by this design.

## Reconciliation and authority

The existing adoption plan, handoff, development-loop and decision-interface contracts now carry
the accepted direction. They distinguish planned features from delivered behavior. Consolidate duplicate historical proposals without deleting unique uncommitted research.
Retire the separate JEV initiative while retaining the internal model-neutral interface. Preserve
existing provider-agent capabilities and one shared install/update/repair path. Do not repeat the
completed source migration or bundle analytics, device pilots and every semantic experiment into
the first implementation batch.

## Accepted tradeoff rule

Assess each change by development benefit (accuracy, tokens and time), concrete flexibility,
reliability, and implementation/operating cost. Preserve flexibility when its upside is credible;
reduce duplication and unearned machinery. Do not optimize for fewer components alone.

The [accepted dispositions](../../reviews/2026-09-19-decision-first-simplification-candidates.md)
record which cleanup is immediate and which implementation choices require evidence. In particular,
one runner entry point retains stage visibility and useful owner controls; platform expansion is a
progressive requirement; shadow evaluation and progressive indexing remain supported design paths.
