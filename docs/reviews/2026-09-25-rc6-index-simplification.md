---
id: review.rc6-index-simplification
title: RC6 Repository Context Simplification Candidates
type: review
status: approved
owner: project-governance
created: 2026-09-25
updated: 2026-09-25
summary: Records the accepted simpler implementation choices while retaining the useful RC6 retrieval and fallback features.
---

# RC6 repository context simplification candidates

## Decision boundary

The [specification](../specs/engine-rc6-linked-retrieval.md) and
[implementation plan](../exec-plans/active/2026-09-23-rc6-linked-retrieval.md) remain the accepted
scope: automatic prompt entry, a maintained source index, basic relationships, bounded JEV selection
with expansion, and evidence from ordinary accepted work. The architecture review corrected identity,
budget and freshness contracts. Those corrections are necessary for the stated behavior; the optional
choices below were accepted by the operator on September 25 and incorporated into the specification
and plan. Runtime implementation is now authorized and tracked separately in that plan.

The core features earn their cost. The clearest savings are in how we build and maintain them, rather
than removing useful discovery or fallback behavior. Do not add a graph service, embeddings, a daemon,
new model passes or generated file summaries; those were already deferred, not new simplifications.

## Recommended implementation choices

| Candidate | Why it is smaller | What we lose or must preserve | Recommendation |
| --- | --- | --- | --- |
| Run the old transient baseline from its frozen artifact, outside the RC6 runtime | The three-way comparison does not require a permanent switch and two production index backends | Lose convenient in-process switching to the old implementation. Keep the frozen corpus, matching delivery limits, source identity and end-to-end cost measurements | Prefer this. It preserves the comparison and avoids a permanent compatibility surface |
| Retain only index generations referenced by the current working-tree/staged views or active readers | Avoid turning a disposable cache into a second source-history archive; simplify size limits and reclamation | Branch switches may need more extraction. Never delete active-reader facts or use cache reclamation to delete task history, immutable receipts or original evidence | Prefer this if the cold/warm measurements remain acceptable; Git and existing evidence retain history |
| One explicit refresh operation with a rebuild option, alongside passive status | One parser and one maintenance path can cover incremental refresh and cache recovery; avoid separate repair, garbage-collection and migration command families | Lose specialized maintenance knobs. Preserve clear busy/corrupt/partial states and a reliable way to rebuild only the cache | Prefer this as the eventual command design. The spec currently leaves exact syntax open |

These are implementation choices, not removal of accepted product capabilities. The three
recommendations above are accepted. In particular, the old baseline is a frozen evaluation artifact
run separately on the same inputs; RC6 ships only its maintained-index path. This does not remove
JEV-off mode, missing-token fallback or recovery when the new cache is unavailable.

## Optional cuts and why most should stay

| Candidate | Possible saving | Capability or evidence lost | Recommendation |
| --- | --- | --- | --- |
| Persist only the working-tree index initially; use existing exact staged capture and temporary metadata for staged checks | Less persistent source-view state and fewer cache invalidation paths | Repeated staged checks cannot reuse the same warm metadata. Staged correctness and source isolation still need proof | Conditional, not the default recommendation. Frequent check workflows may benefit from retaining the staged projection |
| Remove descriptor full-text search and keep only exact path/symbol lookup plus JEV | One derived search table and fewer local query tests | Weaker no-token/off-mode retrieval and less help when names are misleading; model calls cannot be the only useful retrieval route | Keep FTS5. It uses the selected SQLite engine; qualify the shipped runtime and retain exact fallback |
| Keep only forward imports, or omit declared catalog relationships | Fewer relationship queries and extraction rules | Lose useful callers, affected dependents, and explicit links to tests or instructions | Keep bounded reverse and declared links. State incomplete extraction coverage instead of claiming a complete dependency graph |
| Allow only unchanged-purpose continuation | Fewer invalidation cases for semantic answers | A developer who clarifies the request cannot refine the same bounded search; more manual reads or a new root turn may follow | Keep explicit clarification with the same family budget. This flexibility directly supports the goal of reducing repeated reading |

## What remains necessary

Retain the staged projection, FTS5, reverse/declared links and clarified-purpose expansion. No optional
feature cut in the second table was selected merely to simplify the first implementation.

Separate worktree source maps, shared-history compatibility proof, exact original references,
source revalidation, permission checks, task/session binding, durable budget accounting and fallback
are required by the accepted behavior. They are not optional complexity to remove for a smaller diff.

Keep the small controlled comparison and two real accepted tasks. They answer whether the normal
host delivers useful context before the model reads, which installation checks and API-call counts
cannot establish. Broader benchmarks and additional languages can follow observed misses.
