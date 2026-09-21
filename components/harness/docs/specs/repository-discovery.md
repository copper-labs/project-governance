---
id: spec.harness.repository-discovery
title: Repository Discovery
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Repository discovery

Target evolution: [unified engine](../../../../docs/specs/unified-development-engine.md) and
[migration categories C11/C17](../../../../docs/reference/2026-09-20-engine-migration-inventory.md) own
a shared structural map and later optional memory retrieval. Current behavior below remains effective until qualified cutover;
prior S1–S9 references are acceptance inventory, mapped by the new transition plan.

Current discovery is not a shipped relevance search engine. The unified E1/E2 design adds a modest
structural map from existing metadata for both context and proof planning, with bounded Git/lexical
search as fallback. No semantic index, watcher or Mnemos dependency is required for first adoption.
Compare correct-file retrieval, stale hits, latency, output volume and refresh cost with direct search.

A map contains paths, package roots, manifests, explicitly declared relationships, test/config
locations and documentation entry points. Reuse suitable governance public facts; do not introduce
another policy owner. Return bounded candidate paths/reasons, then read exact current or pinned bytes.
Do not inject the whole map into every prompt.

Keep a disposable local cache outside tracked source, keyed by repository identity, Git tree and
extractor version. Dirty/untracked overlays are workspace-specific and content-hashed. Rebuild or
select the correct tree after merge/rebase; never merge index files or share dirty overlays as truth.
Update on demand with bounded inventories. Exclude generated/vendor/binary and secret-bearing files;
ignore rules alone are not a secrets policy. Never follow symlinks outside permitted scope.

The map cannot waive checks, grant access, establish dependency completeness or certify current
source without validation. Add symbols only when paths/manifests are insufficient. Add embeddings
only after demonstrated lexical/symbol misses outweigh construction and invalidation cost.

The [memory boundary](../../../../docs/specs/engine-memory-boundary.md) specifies Mnemos projection,
scope, provenance, freshness, withdrawal and cancellation needs now. Dependency adoption remains later;
SQLite owns critical history until a separate durability/migration evaluation proves otherwise.

## Working-packet interface

The first packet slice supplies a bounded discovery interface over Git, targeted lexical search and
existing routes. Record candidate reasons, search bounds and omitted/unavailable sources. Candidate
excerpts carry source digests; selected artifacts must match them. Measure candidate-generation misses
separately from ranking errors. Optional JEV ranking and a local index are independent capabilities.
A missing or stale map falls back to direct search; selected source is revalidated before delivery.

Build the minimal shared map with the first workflow; expand its scope only for measured navigation
cost or useful-file misses. Symbols/imports and embeddings each need a subsequent comparison. No
model-generated repository summary, daemon or full-map prompt injection is required for the first slice.

## Concrete E1/E2 baseline and prerequisites

Current `discoverPaths` is an alphabetical, scope-filtered inventory capped at 40 entries. It is not
relevance retrieval. E1/E2 implement basic candidate search/ranking, keeping known required paths separate. E3/E4
compare optional semantic ranking and measured retrieval extensions.
Use bounded Git inventory and in-process lexical matching as the dependency-free baseline. Ripgrep
may accelerate the same semantics if detected; it is optional. Doctor reports availability, and its
absence uses bounded in-process search without failing installation. Exclude unsupported/binary or
out-of-scope files and expose search caps and incomplete coverage. Test with relevant paths beyond
the first 40 alphabetic entries and with dirty/untracked changes.
