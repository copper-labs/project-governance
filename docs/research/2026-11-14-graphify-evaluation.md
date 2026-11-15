---
id: research.graphify-evaluation-2026-11-14
title: Graphify Evaluation for Multilingual Source Retrieval
type: research
status: draft
owner: project-governance
created: 2026-11-14
updated: 2026-11-14
summary: Evaluates Graphify against the existing source index, including a possible replacement, language coverage, cost, integrity and maintenance.
---

# Graphify evaluation

## Decision under investigation

Do not replace the current index or begin a framework integration of Graphify on this evidence.
Graphify improves declaration discovery across languages and provides useful call relationships,
but the independent cross-file probes found important gaps in those relationships. Whole-task
savings remain unproved. Preserving captured source, complete excerpts and document coverage
would also require integration work.

The current implementation's TypeScript bias is real and merits improvement. The next investment
should compare narrower multilingual extraction options before committing to Graphify's additional
runtime. A bounded task benchmark can reopen the Graphify decision without first building an
integration. The comparison below specifies what would change this recommendation.

Evaluate replacement as a real option. Do not assume the existing implementation must survive,
or make two permanent indexes the default. If a replacement wins, retire the superseded owner
through an explicit cutover. The [charter](../../CHARTER.md#design-principle) supplies the decision
principle; this research does not authorize runtime changes or adoption.

The evaluated upstream is Graphify's active `v8` branch at
[`d4a5b323ef8501518b82c58a05fe21b35ce24992`][upstream], declaring package `graphifyy` version
`0.9.109`. The older `main` branch is not this candidate. The scope is the open-source local
tool. Cloud claims and features are separate. Our baseline is current framework source, not a
claim about which release any adopting repository has installed.

## What the framework uses now

The current [projection owner](../../components/engine/src/context-projection.ts) maintains a
disposable per-worktree index. Its [SQLite store](../../components/engine/src/context-projection-store.ts)
uses FTS5 to search descriptions. The [extractor](../../components/engine/src/context-source-facts.ts)
uses the TypeScript compiler for TS/JS syntax, extracts Markdown structure, and uses heuristic
declaration matching for other languages. It does not build a general call graph.

[Candidate discovery](../../components/engine/src/context-candidates.ts),
[bounded excerpts](../../components/engine/src/context-excerpts.ts) and the
[context route](../../components/engine/src/context-route-command.ts) then produce source-backed
context. Configured model advice is optional. Agents also use ordinary exact-text search and
direct source reads. A replacement must be compared with this combination, not with reading every
file into a prompt.

## Dimension assessment

| Dimension | Finding | Implication for replacement |
| --- | --- | --- |
| Exact names and literal text | The local exact-name trial favored `rg` in both latency and output size. Graph queries principally search labels/paths and expand relationships. | Keep an exact-text operation even if Graphify becomes the sole persistent index. |
| Callers, dependency paths and impact discovery | Graphify recovered two real callers in a compact answer and resolved a renamed TS re-export. Independent probes missed Dart calls, Kotlin receiver calls, some Rust methods and TS test callbacks. | Useful additional relationships, with uneven recall. Do not treat the graph as a complete impact inventory. |
| Natural-language relevance | The local behavior question found the relevant source but also expanded to hundreds of nodes. The query implementation uses lexical scoring and traversal; the skill adds model-driven vocabulary expansion. | Semantic quality and the cost of query reformulation remain open. A graph alone does not solve meaning-based retrieval. [Query owner][query] |
| Language coverage | Our structured code extraction favors TS/JS. Graphify found 18 of 19 targeted declaration names versus 10 in our spans. Cross-file call resolution was weaker than declaration extraction; Dart remains regex-based. | Evaluate each language and its important constructs independently. A broad support list is not parity. [Extractors][extractors], [Dart][dart] |
| Documentation and rationale | Deterministic Markdown, rationale comments and code links worked. With model work disabled, the tested `extract` skipped Markdown while `update` added it. A table-cell literal was not retrieved. | Command choice matters. Preserve complete sections and authored authority links; structural nodes do not provide full-text coverage. [Markdown][markdown] |
| Source locations and complete evidence | Of 55 independent probe nodes, none carried end-lines or source digests; 52 carried starting locations. Current context extraction expects complete ranges and digests. | A replacement needs a source-capture contract, not merely filenames and node labels. Confirm which existing span logic can actually be deleted. |
| Freshness | Explicit refresh handled a changed and then deleted synthetic symbol. A plain query returned the old symbol between the edit and refresh. | Refresh must be tied to the exact source view being queried. This observation does not claim the optional watcher is broken. [CLI][cli] |
| Worktrees, staged changes and concurrency | Our index distinguishes captured staged and working source and worktree identity. Graphify indexed the working copy in the staged/working divergence probe. It has configurable output roots, hashes, atomic writes and update coordination. | Materialize or otherwise supply the correct captured source view. Native staged-view equivalence was not demonstrated; concurrency still needs qualification. [Cache][cache], [Paths][paths] |
| Output and resource bounds | Graphify supports bounded query output with visible truncation, using approximate token counts. A graph still requires source reads for implementation details. | Count the whole answer path, including rereads, and retain deterministic byte/resource limits. [Query owner][query] |
| Cost and latency | Code extraction can run without a model. Local graph build and query costs are modest but do not uniformly beat the current implementation. | Measure total cost per accepted task, with build and refresh costs amortized over actual reuse. |
| Test selection and correctness | A TS test file remained reachable by imports, but its callback calls were absent from direct callers. One conventional Swift test path was not recognized by the test-path helper. | Improve discovery only where supported. Static links do not establish executed coverage or justify omitting required checks. |
| Privacy and trust | Local code mode is useful. Upstream includes sensitive-path filtering and sanitization. Other modes can select configured model backends. | Explicitly disable model extraction for a local trial and preserve our permitted-source boundary. Filter policies differ. [CLI][cli], [Security][security] |
| Host integration and side effects | Stock instructions mandate graph-first searches and rebuilds. CLI startup can refresh previously installed user skills unless disabled. | Use explicit backend invocation for evaluation; do not import the stock instruction/hook policy wholesale. [Host instructions][instructions], [CLI startup][startup] |
| Packaging and portability | The candidate adds Python and native parser dependencies to the Node runtime. The isolated base installation resolved 31 distributions, including Graphify. | Price installation, upgrades, offline availability and cross-platform qualification into the decision. MCP could reduce repeated startup costs but adds a service lifecycle. [Package][package] |
| Maturity and maintenance | There is substantial source, a lockfile, many regression tests and multi-version Python CI. Default and `--no-cluster` graph exports differed in metadata and edge keys. The full upstream suite was not run. | Pin an artifact, invocation and public interface. Test format assumptions rather than depending on one raw export shape. [CI][ci] |
| License | Current package metadata declares Apache-2.0; the notice retains earlier MIT contributions. | Preserve applicable notices in any distribution. This is a metadata finding, not a legal clearance. [Notice][notice] |
| Replacement and code deletion | Parser/index/ranking work overlaps. Capture, scope, instructions, evidence and task state have different responsibilities. | Judge the amount of old code actually retired against new adapter and dependency costs. A wrapper that retains nearly all old retrieval machinery has not earned a wholesale replacement. |

All dimensions were reviewed, but not all were experimentally qualified. Large-repository peak
memory, other host platforms, dependency security, concurrent MCP use and actual coding-model
token bills remain unmeasured. Upstream fixes and tests are source evidence, not proof of those
properties in our framework.

## Language-specific qualification

| Language or input | Existing index | Graphify finding | Remaining evidence |
| --- | --- | --- | --- |
| TypeScript / JavaScript | Syntax declarations, signatures, ranges and static imports/exports | Alias/re-export, duplicate-name and JSONC path-alias cases worked; calls inside test callbacks were missing | Dynamic imports, workspaces, generated sources and broader callback coverage |
| Rust | Heuristic declaration spans; missed public declarations in the focused probe | Public declarations and imported free-function calls recovered; constructor and inferred-instance method calls were missing | Traits, macros, receiver inference and cross-crate resolution |
| Swift | Heuristic declaration spans; missed the probed actor | Actor, method and tested protocol-dispatch calls recovered | Extensions, class conformance, overloads, concurrency and package boundaries |
| Kotlin | Heuristic declaration spans; missed the probed generic function | Generic/suspend declarations and same-file calls recovered; cross-file injected receiver calls were missing | Receiver resolution, extensions, coroutines, expect/actual and multiple source sets |
| Dart / Flutter | Heuristic extraction; only the class recovered in the probe | Regex extractor found the class and method, missed the generic function, and emitted no ordinary call edges in the independent fixture | Widgets, mixins, extensions, generated code and package imports; no production-quality finding yet |
| Python | Heuristic spans found the probed async function, class and method | Parser found the same three declarations | Imports, decorators, dynamic dispatch and real task retrieval |
| C++ and Java | C++ function and Java method absent from the probe's spans | Probed C++ function and Java class/method recovered | Build flags, namespaces, generics, overloaded resolution and real tasks |
| Other languages | Primarily heuristic clues | Broader upstream parser/resolver surface | Stack-specific fixtures and real tasks; not qualified here |
| Markdown, configuration and SQL | Markdown structure plus other literal clues | Structural and optional semantic capabilities vary by input and installed extras | Required documents, exact links, schema references, unsupported/skipped-file visibility |

Do not infer cross-language FFI or generated binding relationships from successful parsing of
each language separately. These are important mixed-language cases for a replacement trial.

A second eight-file probe deliberately tested common constructs that challenge heuristic
declaration matching. Of 19 predeclared names, current structured spans contained 10 and Graphify
nodes contained 18. This compares declaration visibility, not complete ranges, edge correctness
or final retrieval recall. Both missed the generic Dart free function. Ordinary text search and
fallback excerpts can still find declarations absent from structured spans. The fixture is a
targeted diagnostic, not a representative benchmark or a percentage claim about all code.

## Exploratory local observations

Raw command receipts, frozen input manifests and synthetic inputs were retained outside this
checkout. No target installation, hook, agent instruction or runtime source was changed.
These are smoke observations, not accepted-task or installed-package qualification.

The source snapshot held 346 files and 2,208,214 bytes. Graphify ran the pinned checkout using
Python 3.12.13 and its isolated base dependencies, with `--code-only --no-cluster`. Model work,
automatic skill refresh and query logging were disabled. The graph contained 2,022 nodes and
10,409 edges; its JSON was 3,616,156 bytes. No clustering or media processing is included in these costs.

| Observation | Result | Limit |
| --- | --- | --- |
| Graphify first build | 3.673 seconds | One observed build; parser/library caches and OS state were not controlled |
| Graphify unchanged refresh | 0.321 seconds | One observed refresh |
| Current index first maintenance | 0.732 seconds for the process; 423 ms inside maintenance | Fresh scratch Git checkout; actual current source owner invoked |
| Current index warm maintenance | 0.396–0.400 seconds for the process; 97–101 ms inside maintenance | Two observations; includes freshness work and descriptor retrieval |
| Current index storage | 1,286,144 bytes | SQLite file only; Graphify JSON comparison excludes its cache |
| `rg` exact-name lookup | 9 ms; 567 output bytes | Median of three subprocess runs |
| Graphify exact-name query | 152 ms; 3,449 output bytes | Median of three runs; 1,000-token requested budget; returns a neighborhood |
| Graphify direct callers | 133 ms; 235 output bytes | Median of three runs; two expected callers recovered |
| Graphify behavior query | 161 ms; 3,606 output bytes | Correct source present, 365-node neighborhood truncated to 31 nodes |

The two index paths are not interchangeable benchmarks. Current policy admitted 345 files and
excluded one source filename under its sensitive-path rule; Graphify admitted all 346. The current
maintenance path verifies source state; a graph query loads an existing graph. Their output shapes
and information content also differ. Output bytes are not billed tokens. No whole-task saving or
stable speedup ratio follows from this table.

The synthetic trial recovered the TS call through a renamed re-export, avoided the unrelated
same-name function, and reported an ambiguous bare name with exit code 3. Simple same-file Rust,
Swift and Kotlin calls were present. An absent query returned exit code 4. Changing and deleting a
symbol required explicit refresh before queries reflected the new state. These observations cover
a few deliberate cases, not general edge precision or recall.

The independent review added cross-file language constructs, test callbacks, Markdown and staged
source divergence. It recovered Swift protocol calls and a Rust imported free-function call, but
missed the Dart, Kotlin, Rust receiver and TS callback cases described above. These misses are
material when a caller query would guide change impact or test discovery.

Two positive corrections also matter. Markdown ingestion through `update` added three document
nodes and code links without a model. Default graph export included schema/version metadata;
the fast `--no-cluster` path used in the initial timing did not. The earlier absence of these
features in one mode is not evidence that Graphify lacks them altogether.

## What the published benchmarks establish

The built-in [token benchmark][benchmark-code] compares estimated full-corpus size with scoped graph
output. It estimates tokens and omits questions with no matching nodes. It measures a compression
proxy, not correctness, task completion, latency or savings against focused existing search.

The separate [benchmark report][benchmarks] describes six ERPNext coding questions: 82.0% key-fact
coverage versus 70.8% for grep/read, at approximately 140,000 tokens per graph-assisted query. That
is useful vendor evidence for answer coverage, with a small sample. It does not establish an 80%
saving in this framework. Conversational-memory results concern a different workload. The report's
reproduction commands name `memory/runner.py` and `crosstool/run.py`; neither path exists in the
inspected checkout, so that report was not reproduced here. The Cloud savings claim is separate.

## What wholesale replacement would mean

A successful replacement would make one component own reusable source indexing and retrieval.
It could retire the current SQLite projection, overlapping parser/descriptor extraction, lexical
ranking and relationship discovery where the candidate actually supplies better equivalents.
Keep exact-text search available as an operation; it need not be a second persistent index.

Source capture and validation, permitted-source rules, required guidance, task/evidence ownership
and accepted check execution remain framework responsibilities. These are not competing search
engines. Their boundaries come from the
[retrieval contract](../specs/engine-rc6-linked-retrieval.md), not from an assumption that current
index internals must survive.

The replacement experiment must make complete spans, source identity, skipped coverage and
document retrieval concrete. If delivering those requires retaining the old index and parser
alongside Graphify, record the result as a partial replacement and price both systems. An alternate
result is to adopt better language extraction in the existing owner when that achieves the benefit
with less machinery. Do not copy upstream package internals into this repository.

## Small comparison that can decide the next step

Use the existing [release-evaluation measures](../specs/engine-release-evaluation.md). This proposal
adds no new reporting store, mandatory gate or authority. It is an experiment to choose an implementation.

1. Freeze a representative multilingual corpus and predeclare essential evidence for roughly 24
   retrieval cases. Include exact symbols/literals, natural-language behavior, callers, paths,
   docs-to-code, likely tests, no-match/ambiguous cases and cross-language boundaries. Give each
   important language a reported slice; aggregate results must not conceal a weak language.
2. First compare the current pipeline with Graphify queries over the same frozen source, preserving
   ordinary search/read tools. Keep model, effort, prompt and answer budget constant. Count query
   expansion too. Only if this screening wins should a replacement adapter be built and tested
   against the required capture contract. A narrower parser improvement is an alternative, not an
   assumed working baseline or a requirement to build three systems before learning anything.
3. Exercise edits, add/delete/rename, staged/working divergence, branch/worktree changes, interrupted
   refresh and concurrent access. Count stale answers and hidden omissions as failures, not savings.
4. Run several matched development tasks after retrieval screening. Judge correctness and accepted
   outcomes before cost. Include failed attempts, source readbacks, repair, installation, initial
   indexing and amortized refresh. Compare cold and warm behavior separately.
5. Prefer replacement if essential evidence and task outcomes are at least as good in every critical
   language slice, integrity cases pass, total cost/time improves enough to matter, and the removed
   maintenance burden exceeds the new adapter/dependency burden. Set the practical saving target
   before the trial; a 20% target is a possible screening choice, not a measured result or policy.

For a given workload, break-even task count is setup/index cost divided by the positive per-task
saving after refresh. If there is no positive saving, repeated use does not make the replacement
cheaper. Avoid a final decision based on fewer tool calls or shorter graph output alone.

## Independent review

Gemini 4 Carbon High (`gemini-4-carbon-high`, high effort) independently inspected the source and
ran additional probes. The research job reached its 900-second deadline before returning a written
assessment. A successful follow-up in the same conversation collected conclusions from that work,
with no additional research or tool calls. The original timeout receipt, probe inputs/results and
verbatim recovered assessment are retained with the external research evidence.

The reviewer recommends retaining the current engine, rejecting wholesale replacement and not
starting an integration pilot. It identifies missing cross-file relationships, incomplete source
provenance, staged-view differences, document retrieval gaps and additional packaging burden.
It also recognizes local extraction, Markdown support, atomic writes and useful TS resolution.

The author's reconciliation is:

- Accept the demonstrated relationship gaps. They change the initial recommendation from starting
  a replacement experiment to deferring framework integration. Better declaration coverage alone
  does not establish dependable change-impact retrieval.
- Accept that our source/evidence contracts need to survive a cutover. They do not require the
  exact current implementation to survive. The review's estimate of only 350–500 removable lines
  is unvalidated; comparing entire upstream package size with selected current modules does not
  measure integration maintenance or establish the amount of code that could be retired.
- Correct the review's dependency wording: the base environment contains 31 distributions,
  including Graphify; they are not all native wheels. MCP requires an optional extra, so its
  absence from the base environment is expected. Neither point is a demonstrated product defect.
- Treat staged-view behavior as an integration gap, not a broken advertised staged mode. Treat
  query staleness as a refresh-contract requirement, not proof that the optional watcher fails.
- Preserve the possibility of a bounded task benchmark if further cost research is prioritized.
  Do not adopt the review's suggested 75% caller-recall threshold as permission to miss critical
  evidence. Its proposed WASM parser alternative is also unimplemented and unmeasured here.

The resulting recommendation is to retain the current runtime now, address its multilingual
extraction weakness, and require measured task benefits before investing in Graphify integration.
Wholesale replacement remains an eligible outcome if later evidence justifies it.

[upstream]: https://github.com/Graphify-Labs/graphify/tree/d4a5b323ef8501518b82c58a05fe21b35ce24992
[query]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/serve.py
[extractors]: https://github.com/Graphify-Labs/graphify/tree/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/extractors
[dart]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/extractors/dart.py
[markdown]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/extractors/markdown.py
[cli]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/cli.py
[cache]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/cache.py
[paths]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/paths.py
[security]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/security.py
[instructions]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/always_on/agents-md.md
[startup]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/__main__.py
[package]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/pyproject.toml
[ci]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/.github/workflows/ci.yml
[notice]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/NOTICE
[benchmark-code]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/graphify/benchmark.py
[benchmarks]: https://github.com/Graphify-Labs/graphify/blob/d4a5b323ef8501518b82c58a05fe21b35ce24992/BENCHMARKS.md
