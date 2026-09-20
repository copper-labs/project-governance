---
id: spec.harness.repository-discovery
title: Repository Discovery
type: spec
status: accepted-design
owner: project-harness
updated: 2026-09-19
---

# Repository discovery

Targeted Git/`rg` discovery is the initial baseline. No semantic index or watcher is required for
first adoption. A shallow map is admitted only after repeated navigation costs appear in real tasks.
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

Mnemos may later receive a rebuildable context/index projection. It remains deferred, with SQLite
owning critical history until a separate durability/migration evaluation proves otherwise.
