---
id: research.jev-agentic-development-september
title: September 2026 JEV Research and RC4 Reconciliation
type: research
status: completed
owner: project-governance
created: 2026-09-21
updated: 2026-09-21
summary: Primary-source research on JEV in agent harnesses, evidence selection, evaluation, task routing and CI, reconciled into bounded RC4 work.
---

# September 2026 JEV research and RC4 reconciliation

## Decision

Prioritize selecting useful evidence before the main LLM reads it. Keep requirement-linked quality
advice and useful local-CI recommendations. For models, the operator defines categories and their
model/effort pairs; JEV only classifies the task. Fixed-model operation is the default. These are
our design judgments from the evidence below, not measured productivity results for this project.

The [RC4 specification](../specs/engine-decision-rc4.md) owns behavior and the
[R0–R6 plan](../exec-plans/active/2026-09-21-major-adoption-and-measurement.md#rc4-quality-routing-and-ci-batch)
owns delivery. The [simplification pass](../reviews/2026-09-21-rc4-simplification.md) distinguishes
accepted smaller implementations from optional scope reductions. Alternate decision backends,
including SemIf, are excluded from this investigation and RC4 proposal at the operator's request.

## Research scope and evidence quality

This pass covers material available through September 21, 2026. It includes official TypeSafe
documentation, authors' experiments, and public implementation source. Rolling documentation is
identified by its inspected model/run dates where supplied. An older run accessible in September
is not a new September benchmark. Discovery directories and reposted marketing claims are not proof.

No third-party package was installed or executed, and no paid benchmark was run. Reported results
below are the authors' results, not independently reproduced here. In the sources reviewed, there
is no convincing production demonstration of lower total accepted-development cost for a comparable
local/mobile CI workflow. That leaves room for useful experiments; it does not establish savings.

## Primary findings

| Source and maturity | What it shows | Implication and limitation |
| --- | --- | --- |
| [TypeSafe skill suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion), published run uses JEV 1.12, rendered July 31 | A 182-skill shortlist/refinement example over 488 mostly synthetic requests reduced wrong loads from 16.8% to 7.3%. Even supplying the right skill did not eliminate agent mistakes. | Test progressive evidence/procedure selection and allow no suitable candidate. A suggestion is not enforcement. Keep stable required context rather than rebuilding a system prompt every turn. This is one skill workload, not coding productivity proof. |
| [TypeSafe passage classification](https://docs.typesafe.ai/cookbooks/classifying_rag_passages), cookbook using a small constructed corpus | Separates relevance, usefulness, contradiction and instruction-like text instead of treating retrieval similarity as sufficient. | A relevant passage can contradict the current hypothesis. Preserve that evidence. A semantic injection label cannot replace permission controls or prove security. |
| [TypeSafe reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe), retrieval demonstration | Ranks a lexical shortlist against a supplied question. | Improve an existing shortlist first. Selection cannot recover evidence absent from that shortlist; measure retrieval coverage separately from ranking accuracy. No new source index follows from this example. |
| [File-backed JEV MCP tools](https://github.com/rashedInt32/jev-mcp), community implementation | Reads bounded permitted files outside the coding model's context and returns typed judgments/selected references; documents root, symlink, sensitive-path and size controls. | The transferable pattern is selection before expensive reading. Reuse our capture and DL03/DL13 callers; adopting another MCP server would duplicate owners. Safe file access and safe disclosure to a hosted classifier are separate checks. |
| [Harness.io experiment](https://www.harness.io/blog/jev-decision-primitive-agent-governance), September 21, small firsthand routing/evaluation study | In 12 curated routing tasks, a more aggressive cheap-model route did not lower overall cost. In ten read-only QA tasks, auto routing cost less than fixed Opus but more than fixed Sonnet, with different success rates. | Measure the entire assignment, including extra turns. These small sets do not settle coding-model selection. The result supports our fixed default and operator-defined category mapping, not a global model-ability predictor. |
| [JEV harness lab report](https://github.com/Aitejiu/jev-harness-lab/blob/main/docs/REPORT.md), community benchmark, JEV 1.13 | Reports only 51.3% accuracy on its 825-item RouterBench framing and AUROC 0.56 for failed-agent causal attribution. Retrieval experiments also expose shortlist ceilings. | Negative evidence matters. Task descriptions and local evidence are a better initial target than asking JEV to predict an unknown model's ability or explain a whole failed trajectory. Labels/prompts/workloads are author-selected and unreplicated here. |
| [Leanest](https://github.com/baronunread/leanest), early CI implementation; inspected [selection policy](https://github.com/baronunread/leanest/blob/438d4a41772b0c27c25841c25624b564ae31ff03/src/selection-policy.ts) and [caller](https://github.com/baronunread/leanest/blob/438d4a41772b0c27c25841c25624b564ae31ff03/src/leanest.ts) | Uses semantic test relevance alongside changed-test/import/route overrides. Missing or uncertain answers retain tests. Source includes policy tests and supports a JEV backend. | A concrete expensive-test-selection pattern exists. Its numeric thresholds and skip counts are not evidence that omitted tests are safe. Our first step remains advice plus comparisons with already-required results, not predictive omission. |
| [JEV review pipeline](https://github.com/devagrawal09/jev-review), community prototype | Separates supplied risk, evidence and review judgments into code-orchestrated stages. | Reuse source-linked concerns and exact claim scope. Do not copy a multi-stage review pipeline merely because each classifier call is inexpensive. Our existing review projection can host the useful portion. |
| [Foreman](https://github.com/thruwire/foreman), bounded supervisor prototype | Demonstrates observing a worker and applying code-owned intervention rules, with explicit limits on its accuracy claims. | Existing DL06/DL12 already provide a place to study repeated work and useful attention. Do not add another supervisor or interrupt a healthy worker on an unqualified semantic guess. |
| [Harness MCP action-risk prototype](https://github.com/harness/mcp-server/pull/984), draft integration | Its discussion/source exposes narrow action coverage and the difference between classifier tests and actual tool wiring. | Test the real entry, not only a helper. Keep deterministic action authority. This prototype does not justify relaxing our permissions or adding a JEV request to every hook. |
| [LangChain harness example](https://www.langchain.com/blog/building-a-harness-with-jev), September 17; [judge example](https://www.langchain.com/blog/jev-agent-evals-langsmith), September 20 | Demonstrates routing, action screening and repeated evaluation of a few fixed agent examples. | Supports inexpensive bounded judgments as an integration pattern. Repeated agreement on a tiny set is not correctness, broad coding coverage or accepted-task savings. No framework dependency is required. |

Two official contracts materially constrain these examples:

- [JEV 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), reviewed September 17,
  include arithmetic/counting, indirect evidence, distracting long state and adversarial text.
  Put counts, identities and rules in code. Use local, explicit evidence and small counterexample sets.
- [Confidence semantics](https://docs.typesafe.ai/confidence) distinguish Choice/Score confidence
  from a Noul probability. A confidence field is not a promise that a task will succeed. Qualify
  thresholds for each question/effect; do not copy one cutoff across primitives or model versions.

The [state contract](https://docs.typesafe.ai/concepts/state) is text-based. Device opportunities
therefore start with logs, runner facts and available accessibility text. Screenshots require a
separate existing vision owner. The [coding-agent guidance](https://docs.typesafe.ai/introduction/coding-agents)
also distinguishes typed decisions from generating/editing code; JEV is not a replacement coding model.

The [shared-state fan-out pattern](https://docs.typesafe.ai/patterns/fan-out) and
[batching cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions) support independent
questions over compatible evidence. The latter compares batched with serial calls, not an optimized
concurrent agent or accepted development tasks. Share one captured state when useful; do not ask
every registered question on every event or combine questions that depend on future answers.

## Opportunities reconciled against our system

These are our recommendations. Their priority reflects likely frequency, avoided LLM work,
integration cost and consequences of a wrong answer, not vendor latency multipliers.

| Area | Useful decision and LLM work displaced | Existing owner and RC4 disposition |
| --- | --- | --- |
| Code/context | Which supplied files or excerpts deserve reading first? Avoid broad file reading and repeated orientation. | DL03; connect an existing selector before one real provider prompt is assembled. Keep mandatory/conflicting evidence and an expansion route. R0a/R2 first. |
| Tool/build output | Which optional output blocks matter to this task? Avoid rereading verbose successful logs. | DL13; prove delivery through the ordinary caller and count subsequent retrieval. Preserve native failures/warnings and the original. R2. |
| Workflow/procedures | Does an existing approved recipe fit, or does none fit? Avoid rediscovering a process or loading irrelevant instructions. | DL04; reuse existing optional advice. A new generic skill router or every-turn hook is not required for RC4. |
| Code/test quality | Does the supplied change/test support this requirement? Focus an existing review and detect an unsupported completion claim. | DL01/DL02/DL09; shared capture and independent questions. R2. Added evaluation is overhead until it displaces work or prevents measured rework. |
| Model policy | Which operator-defined work category fits? Remove repeated model-choice reasoning and apply a reviewed mapping. | DL08; fixed default, optional category classification, one exact pair per category. No model search/ranking, cross-provider moves or automatic retry. R1/R3. |
| Local/remote CI | Which eligible optional integration/device scenario is relevant; what supplied coverage is missing? Avoid repeated test-plan interpretation. | DL07; useful descriptions, advice and source-bound comparison with existing run results. R4. Code retains mandatory checks, dependencies, capacity and reuse authority. |
| Device investigation | Which known diagnostic explanation or already-granted probe fits the logs? Reduce repetitive investigation and unnecessary rebuild suggestions. | Existing DL05 with target-bound evidence. Keep the qualified RC3 mechanism; no new recovery grants or screenshot controller in RC4. |
| Hooks/action intent | Does an unfamiliar proposed action deserve closer review? Potentially reduce repetitive semantic scrutiny. | Future residual-only advice. RC4's admission hook is deterministic. An additional paid classifier on every tool call is not justified. |
| Release/review | Which change or claim deserves release-review attention, and what evidence supports it? Reduce manual sorting and claim checking. | DL10/DL11 later, existing DL09 now. Semantic advice cannot set versions, publish, waive checks or authorize a release. |
| Process improvement | Which completed attempts repeat a known pattern without adding evidence? Reduce manual trace triage. | Existing DL12 plus native outcome aggregates. Analyze selected episodes; no live supervisor or automatic policy tuning. |

Selecting evidence early is the clearest immediate way to reduce premium-model reading. It is not
yet proven to reduce total cost here: the classifier itself consumes evidence, retrieval can miss
important files, and the worker can read omitted content later. Those observations belong in the
existing receipts/outcomes rather than a second analytics system.

## Small evaluation that can change our decisions

1. Confirm ordinary callers actually reach the feature. Record off, no-token, unknown, budget and
   invalid-input cases as well as successful calls. Do not declare coverage of an unrestricted parent.
2. Use a small independently labeled set of real episodes: suitable and unsuitable categories,
   near-matching files, contradictory evidence, vacuous tests, partial proof and noisy failures.
   Keep a held-out set when revising questions; the classifier does not grade its own benefit.
3. For routing, separately measure correct task categorization and whether the operator's assigned
   model delivers the required result efficiently. An accurate category can still have a poor mapping.
4. Compare total tokens, charges, retries, review/repair and accepted completion time against the
   fixed baseline. Preserve missing usage as unknown. Keep cache/session continuity and record
   whether selected material was already read upstream.
5. For CI, compare optional recommendations with already-required results for the same source and
   pack inputs. A failed low-priority pack is useful contrary evidence. Missing matches remain
   unknown. Do not run extra broad CI or omit required checks just to manufacture an experiment.

The basic RC4 test matrix proves wiring, fallback, policy boundaries, replay and useful outputs.
Telemetry then determines whether questions deserve tuning, broader activation or removal. It is
not necessary to create a general benchmark service before collecting these first observations.

## What changed and what did not

Added priority for real DL03/DL13 delivery, explicit category-to-model mapping, question-specific
evaluation, and CI comparisons that reuse existing proof. Reconciled the architecture recheck's
identity, replay and host-coverage corrections. Retained SQLite, explicit operator choices, rapid
provider-free fallback, independent outcomes and deterministic authority.

No runtime or adopter settings changed in this research pass. No new supervisor, plugin framework,
source index, provider gateway, autonomous model optimizer, local classifier or release agent was
added. Wider ideas remain documented opportunities, not hidden RC4 implementation obligations.
