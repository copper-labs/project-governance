---
id: plan.multilingual-source-extraction-2026-11-14
title: Multilingual Source Extraction Implementation
status: completed
type: exec-plan
owner: project-governance
created: 2026-11-14
updated: 2026-11-14
summary: Implements six-language syntax retrieval and KMP source clues in the existing projection, followed by focused proof and independent Fable review.
---

# Multilingual source extraction

Operator authorized implementation of the [research proposal](../../research/2026-11-14-multilingual-source-extraction.md)
and a Fable 5.2 high-effort implementation review. KMP adds authored expect/actual modifiers,
source-set path clues and Kotlin script structure; it does not add inferred platform bindings.

## Batch and checkpoints

One batch owns the six extractors, pinned parser dependencies, existing projection/excerpt seams,
regressions, package proof and documentation. Existing unrelated worktree changes are outside scope.

- [x] Implement captured-byte extraction, complete ranges, bounded walks, cancellation and visible partial coverage.
- [x] Preserve KMP modifiers and source-set hints without claiming resolved expect/actual relationships.
- [x] Run `npm run typecheck` and affected `context-*.test.ts` tests at the completed source boundary.
- [x] Run `npm run build`, package with `components/engine/scripts/pack-engine.mjs`, and exercise all six parsers from a clean offline installation with scripts disabled.
- [x] Obtain Fable 5.2 high-effort review, resolve findings, and rerun affected proof.
- [x] Reconcile documentation and run the impacted source governance check for owned paths.

The research found unsupported newer Kotlin syntax and Objective-C annotation/mixed-C++ cases.
Preserve these files with explicit partial coverage rather than publish invented complete spans.
No new runtime service, index, source rewriting or compiler execution is introduced.

Build scope now includes conventional Gradle/Cargo/SwiftPM/Xcode/Dart/Maven/CMake/Make/Node inputs,
text locks, wrappers and interop definitions. Non-language formats retain literal clues; no build
is executed to infer a graph.

Implementation uses one asynchronous core initialization and lazy synchronous grammar loading,
preserving the existing synchronous fact/projection boundary. This replaces the exploratory
proposal to propagate asynchronous APIs through all callers.

The completed source checkpoint passed 262 context tests. The path-selection boundary change also
triggered the remaining engine suite (887 passes, 16 skips), continuity (82 passes) and script tests
(118 passes), with no failures. Typecheck and build passed. A clean offline installation with an
empty npm cache and install scripts disabled exercised the packaged six-language extractors and CLI.
This is local source/package proof, not cross-platform qualification or measured cost savings.

The first source-governance check required dependency freshness evidence and corrected plan metadata.
Newest research candidates were younger than the repository's 14-day minimum, so implementation
pins the preceding eligible releases: `web-tree-sitter` 0.27.1; Rust/Kotlin 0.26.5;
Swift/Java 0.26.3; Dart 0.26.6; Objective-C 0.26.2. Exact registry publication dates live in the
existing dependency evidence registry. Five grammar source revisions match the research candidates;
Swift uses `leandrocp/tree-sitter-swift` revision `b8b22bffbb3441780e6471665bacfb263741c86a`.
The fixture probe, dependency-sensitive retrieval checks and installed-package proof passed on these pins.
The additional source-set/build-role rename regression passed.

Fable 5.2 high-effort review completed and requested changes. Repairs preserve declarations after
the import limit, retry transient parse failures, reject silently detached Kotlin constructs,
retain labelled heuristic search clues on partial parses, tighten header detection, extend Dart
members/ranges, remove two literal-value leaks, avoid discarded Objective-C++ parsing, bound broad
node fan-out, separate extension-specific cache identities and exclude local Apple workspace state.
Focused regressions cover these findings, including exact annotated/member ranges for all six
languages. The unchanged source-consent/path boundary owns original-file disclosure.

## Source closeout

Fable's focused closure check closed the substantive findings with no blocker. Two low residuals
were then repaired directly: trailing comments no longer hide preceding attributes, and retry
ordering survives budget deferral so alternating failed-parser groups cannot starve other files.
Exact-range and multi-refresh regressions passed. Extractor identity advanced to `wasm-5` so prior
development candidates cannot reuse stale facts.

The integrated context suite passed 279 tests; the final low-priority corrections passed all 45
affected parser/projection tests. Typecheck, build and impacted source governance passed, with only
the existing comment-adapter advisories. Earlier directly affected engine, continuity and script
proof remains as recorded above. The final archive installed offline with an empty cache and
scripts disabled; all six languages and the repaired cases worked from installed compiled source.

Remaining qualification: real-repository recall and cost measurement, other operating systems,
grammar-version gaps, Kotlin KDoc after a package-less file annotation, and unusual Dart URI string
forms. These do not establish compiler relationships or resolved build graphs. Detailed review,
command exits, package identity and installation receipts remain outside this checkout.

Complete locally. No commit, publication, runtime release or adopter cutover belongs to this batch.
