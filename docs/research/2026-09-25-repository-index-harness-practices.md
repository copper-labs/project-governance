---
id: research.repository-index-harness-practices-2026-09-25
title: Repository Index Practices for Development Harnesses
type: research
status: current
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Primary-source research on repository maps, semantic and structural retrieval, index freshness and measurable JEV experiments.
---

# Repository index practices — September 25, 2026

## Recommendation and scope

Develop a reusable, current repository index that combines source structure, documentation and
explicit project relationships. Search the permitted repository through complementary methods;
use optional JEV judgments to improve discovery and ordering. Deliver small, source-verifiable
excerpts to the fixed coding model, with a way to expand the search.

The operator accepted a bounded first iteration for RC6 on September 25. The
[RC6 specification](../specs/engine-rc6-linked-retrieval.md) and
[implementation plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md) now own that scope:
automatic entry, a maintained local index, basic relationships, bounded JEV selection with expansion
and real-task evidence. Embeddings, full graphs and the other research alternatives below are not
all adopted. This note records public evidence available by September 25, 2026 and distinguishes implementation descriptions,
vendor evaluations, research benchmarks and small author-run experiments. No external benchmark
was reproduced during this review. There is no established universal winner.

The important separation is between **what the index covers**, **what search retrieves**,
**what JEV actually assesses**, and **what the coding model receives**. A complete inventory does
not prove complete semantic assessment, and neither proves that useful evidence was delivered.

## What other systems do and what their evidence establishes

| System and source | Practice worth examining | Evidence and limits |
| --- | --- | --- |
| [Cursor semantic search](https://cursor.com/blog/semsearch), November 2025 | Combine meaning-based code search with exact text search. Learn from later searches and reads that reveal earlier retrieval misses. | Vendor reports an average 12.5% accuracy improvement on its internal context benchmark. An online A/B test reports a 2.6% code-retention increase for repositories with at least 1,000 files. These are different measures, not a general productivity percentage or independent replication. |
| [Cursor indexing](https://cursor.com/blog/secure-codebase-indexing), January 2026 | Detect changed files through content hashes, split source into syntactic chunks and reuse unchanged chunk embeddings. | Vendor describes incremental indexing and measured onboarding speedups. This supports avoiding repeated extraction; it does not establish which retrieval method suits this runtime. Its hosted team-index reuse is not required for a local implementation. |
| [Aider repository map](https://aider.chat/docs/repomap.html), current documentation, and its [parser design](https://aider.chat/2023/10/22/repomap.html), October 2023 | Extract definitions, signatures and references with Tree-sitter; rank a dependency map into a bounded prompt representation. | Inspectable implementation pattern. The default map budget is approximately 1,000 tokens and can expand. A map of the repository does not mean every symbol reaches each prompt. These pages do not isolate the map's effect on accepted changes. |
| [Augment Context Engine MCP](https://www.augmentcode.com/blog/context-engine-mcp-now-live), February 2026, updated June | Make semantic retrieval available to the agent through its normal tool interface; distinguish current working-directory context from cross-repository retrieval. | Vendor evaluated 300 Elasticsearch PRs with three prompts each and reports 30–80% improvement in its quality measures. The rubric includes correctness, completeness and other dimensions. This is not a 30–80 percentage-point increase in verified task success. |
| [Cognition SWE-grep](https://cognition.com/blog/swe-grep), October 2025 | Isolate retrieval work and return files with line ranges instead of a second model's prose conclusions. Bound serial exploration and measure useful spans and latency. | Vendor reports roughly an order-of-magnitude retrieval speedup on an internal evaluation using a specialized model and serving system. Borrow the source-range interface and evaluation idea; this is not evidence for adding general subagents or substituting JEV for SWE-grep. |
| [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), September 2025 | Keep compact initial guidance and fetch current source as needed. Its documented Claude Code design uses glob/grep exploration rather than requiring a persistent semantic index. | A credible contrasting design and an important fallback baseline. This is engineering guidance, not a controlled proof that indexes help or hurt every coding task. |
| [Sourcegraph precise navigation](https://sourcegraph.com/docs/code-navigation/precise-code-navigation), current documentation | Use language-specific SCIP indexes for exact definitions and references, with ordinary search as fallback. Complex builds can create indexes in their existing CI environment. | Mature structural navigation pattern. Coverage depends on the language, indexer and build configuration. Precise navigation is not proof of a complete runtime call graph or a safe test-skipping decision. |

These systems do not agree that a persistent vector index is always necessary. They do demonstrate
useful alternatives to repeatedly asking the main model to reconstruct repository structure.
The recurring patterns are precise source locations, bounded delivery, freshness and recovery
when initial retrieval is insufficient.

## What newer benchmarks change

[Agent Retrieval Bench](https://arxiv.org/html/2607.24882v1), July 2026, evaluates 427 cases across
25 repositories. Semantic, lexical and structural methods win on different tasks and budgets.
Its candidate-filter experiment is especially relevant: restricting retrieval to tests helps test
discovery but removes the correct source answers for failure diagnosis. Its initial-context pilot
measures retrieval, not repaired software, and uses one trajectory per case and method. Repository
representation is uneven. Use this as evidence for preserving several routes to useful context,
not as a universal ranking of tools.

[ContextBench](https://arxiv.org/abs/2602.05892), February 2026, covers 1,136 issue-resolution tasks,
66 repositories and eight languages. It measures the difference between context explored and
context actually used. More elaborate agent scaffolding gave only marginal retrieval gains in its
comparison. This supports instrumenting useful delivery and later reads rather than counting
index entries, tool calls or enabled features.

Two other studies caution against a single-method conclusion. [SWE-Explore](https://arxiv.org/abs/2606.07297),
June 2026, finds agentic explorers stronger than classical retrieval on its issue-exploration tasks;
useful line-level coverage remains difficult. Its labels come from successful solution trajectories,
which do not exhaust every valid way to solve an issue. An [August code-question study](https://arxiv.org/abs/2608.01507)
instead reports 65.2% correct answers from semantic retrieval versus 46.2% from delegated search,
with lower cost per correct answer. That is a preprint about read-only questions, not a universal
comparison of development harnesses. Task type, tools, budgets and the handoff design matter.

A [September source-checked graph experiment](https://github.com/artemrudenko/code-graph-benchmark-v2)
records useful navigation results alongside omissions, setup failures and a stale index missing
a newly introduced caller. It explicitly leaves lifecycle token savings unproven. Its useful lesson
is to validate current source and index identity; installing a graph tool is not an outcome metric.

## What is supported specifically for JEV

[TypeSafe's reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) demonstrates a
two-stage design: keyword retrieval over a corpus followed by JEV assessment of query/passage pairs.
In its 40-query legal example, top-10 retrieval improves from 38% to 62%. It explicitly notes that
reranking can only assess candidates supplied by retrieval. This supports experimenting with JEV
as a relevance judge; it does not prove repository-wide discovery, code understanding or patch quality.

A [September Jev retrieval experiment](https://github.com/harshwasan/jev-retrieval-eval) provides a
useful tradeoff rather than an unqualified win. On eight author-created technical-document questions,
the JEV-assisted workflow used about 69% fewer main-model input tokens but took longer: 9.57 seconds
versus 6.61 seconds per question. The tools and budgets differed, there was one repetition, and labels
were revised after results were inspected. Its fixed-candidate comparison is separate. These are
small retrieval experiments, not proof of faster accepted coding work.

The sources reviewed do not establish that passing every file descriptor through JEV on every
prompt is the best repository-index architecture. Retain that approach as a measured comparison,
especially where other methods miss semantically relevant material. JEV cannot judge content that
neither a descriptor nor a retrieved excerpt exposes.

## Comparison with the current RC6 implementation

The [RC6 contract](../specs/engine-rc6-linked-retrieval.md) and
[source index](../../components/engine/src/context-source-index.ts) already provide useful foundations:
source identity, a complete eligible path catalog, literal documentation clues, bounded delivery,
explicit partial coverage and optional JEV selection. The
[metadata selector](../../components/engine/src/context-metadata.ts) visits permitted candidates in
batches under a deadline. A large catalog can remain partly unassessed in a given prompt.

This is a transient file-metadata projection. It is not yet a maintained symbol/reference index,
semantic search index or repository relationship graph. Regex extraction and leading documentation
can miss useful detail. Repeated catalog assessment also spends work again when most source has
not changed. The public research motivates testing a richer reusable projection; it does not
retroactively validate RC6's end-to-end benefit.

## Proposed direction

### 1. Maintain one rebuildable local projection

Use the existing SQLite approach for derived retrieval data. Start with files, source hashes,
language, symbols, signatures, line ranges, literal documentation and explicit links. Reuse mature
parsers rather than expanding a home-grown language parser. Add compiler-backed references only
where supported and worth their setup cost.

Key cached facts to repository/worktree identity, source bytes and extractor version. Include
configuration or dependency identity when it affects symbol resolution. Handle changed, deleted,
renamed, untracked and staged files according to the selected source view. Share immutable
content-derived records where safe, while keeping each worktree's current path map separate.
Revalidate selected excerpts against the current subject before delivery. Missing or stale index
coverage remains visible and permits direct source search.

This is a cache, not another policy or task authority. Relationships can live in ordinary tables;
no separate graph server is needed initially. A later Mnemos adapter can consume source-bound
records without turning inferred relationships or historical notes into current source facts.

### 2. Search globally through complementary routes

Use exact names and text, meaning-based retrieval, and source relationships as independent ways
to find candidates. Semantic search must query the complete permitted indexed corpus, not a
keyword shortlist. Merge candidates before any optional JEV reranking. Compare a compact whole-map
JEV discovery route as another way to recover candidates that other routes miss.

This still involves bounded candidate selection; it cannot promise perfect recall. The difference
from an arbitrary path cutoff is that several methods search the global index and there is an
explicit widening path. A module hierarchy is a navigation aid, not a rule that permanently hides
all other modules after one decision. For oversized maps, disclose unvisited regions and measure
what is missed. Preserve required guidance and task-named sources regardless of a relevance score.

### 3. Give JEV bounded semantic questions

Useful questions include whether a source region helps the specific task, whether it contributes
new evidence beyond already selected regions, and whether it appears to be a relevant test or
design constraint. Test these as separate contributions rather than adding every question at once.
Keep code responsible for source identity, permissions, deduplication, size limits and mandatory
evidence. Unknown coverage and model uncertainty must permit expansion or deterministic fallback.

Return current excerpts, source locations and selection/coverage facts to the coding model. Keep
the fixed-model default. The main model diagnoses and changes code; it can request further source
when the initial packet is insufficient. A JEV no-match is advice, not proof that no relevant file exists.

### 4. Document intent and reuse existing relationships

Code parsers can extract what is declared and where it is referenced. They cannot reliably recover
why a design exists, a hidden compatibility constraint or which guide owns a decision. Improve those
human-authored explanations in the normal change workflow. Prefer useful module/capability guides
and declaration contracts over a generated paragraph for every trivial file.

The existing [developer catalog](../developer/catalog.yaml) already links capabilities, guides and
source owners. Reuse it. Extend relationships to tests and workflow definitions where actual
declarations, coverage or source evidence support them. Mark inferred associations separately.
Poor documentation stays searchable; backfill it when ordinary work exposes a concrete gap.

For example, a launch-failure request may need the launcher, readiness checks, process ownership
rules and regression tests. Similar wording alone may surface only a UI file. Structural links and
the module's documented responsibilities offer additional routes to the actual failure boundary.
These are investigation aids; existing checks still determine required build/test execution.

### 5. Settle the benefit with a small paired comparison

Use 12–20 frozen, representative requests covering semantic discovery, misleading names,
failure-to-code, source-to-test, cross-module changes, design constraints and no-match cases.
Include edited/untracked files and two worktrees with different source. Start with reviewed useful
files and useful spans; later-opened files are additional feedback, not the only relevance labels.

Compare the current RC6 catalog, a structural/exact index, global hybrid retrieval, and the same
hybrid retrieval plus JEV. Keep the whole-map JEV route as a discovery comparison where candidates
are missed. Hold the main model, instructions, delivery budget and task acceptance checks fixed.
Repeat the most informative ambiguous cases before trusting a small difference.

Measure index preparation and refresh cost, candidate coverage, useful excerpts delivered,
subsequent reads, host-visible use, all provider/cache tokens, latency and failed attempts. For a
smaller executable subset, also measure accepted fixes, rework and total completion time. A smaller
packet that misses necessary evidence is a regression. A benefit that disappears after indexing
or refresh cost is included is not a lifecycle saving.

The accepted first implementation uses a maintained SQLite projection, existing TS/JS syntax
parsing, literal document/catalog links and complete-inventory JEV discovery. The comparison governs
later expansion and promotion; it does not silently add every research arm to RC6. Keep the existing fallback and
documentation improvements while testing retrieval changes through the same governed entry path.
Do not add a new index service, automatic delegation or a mass documentation-generation pass merely
because another harness has one.
