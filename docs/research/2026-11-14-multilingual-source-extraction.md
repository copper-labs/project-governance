---
id: research.multilingual-source-extraction-2026-11-14
title: Multilingual Source Extraction for Six Required Languages
type: research
status: draft
owner: project-governance
created: 2026-11-14
updated: 2026-11-14
summary: Evaluates syntax extraction for Rust, Kotlin, Swift, Dart, Objective-C and Java within the existing source index, with grammar probes and a bounded delivery proposal.
---

# Multilingual source extraction

## Recommendation and status

Extend the existing source index with one Tree-sitter WebAssembly runtime and small, explicit
extractors for Rust, Kotlin, Swift, Dart, Objective-C and Java. Keep the existing SQLite index,
source capture, ranking and excerpt delivery. This is a parser change, not another search system.

The local feasibility probe recovered substantially better declarations and source ranges for all
six languages. It also found grammar gaps in newer Kotlin syntax, Objective-C annotation macros
and Objective-C++. Choose and qualify grammar revisions before claiming complete language support.
The tested binary set is a candidate, not an approved dependency selection.

This follows the [Graphify evaluation](2026-11-14-graphify-evaluation.md) and records the research
checkpoint before implementation. The [completed implementation plan](../exec-plans/completed/2026-11-14-multilingual-source-extraction.md)
owns the subsequent source changes, eligible dependency pins and qualification. The probe and raw
receipts remain external research artifacts. Current adopter installations remain unchanged.

## What needs to improve

All six languages already pass the
[eligible-path filter](../../components/engine/src/context-path-policy.ts). The
[source extractor](../../components/engine/src/context-source-facts.ts) gives TS/JS parser-owned
declarations and ranges, while these six use heuristic matching. The latter misses common syntax
and estimates a declaration's end from the next recognized declaration or the file's end.

The initial goal is equally useful structural retrieval across these languages:

- Find declarations, members, constructors, types and literal import/module statements.
- Return intact source units with accurate start/end lines, attached documentation and relevant
  annotations, all bound to captured source bytes and their digest.
- Describe partial, unsupported and interrupted extraction without losing the file from inventory.
- Find test declarations and authored labels where supported, without claiming execution or coverage.

For example, a Dart method's source excerpt must include its body. The tested Dart grammar represents
its signature and body as siblings, so selecting a signature node alone is insufficient. An
Objective-C method name must preserve the full selector, such as `loadWithID:completion:`.

This stage does not promise resolved callers, overload selection, macro expansion or generated
bindings. A syntax tree reveals what was written; it does not establish which implementation runs.
Those capabilities need separate evidence and should not delay useful declaration retrieval.

## Options considered

| Approach | Benefit | Cost or limitation | Disposition |
| --- | --- | --- | --- |
| Expand regular expressions | Small initial edit | Six language syntaxes, nested bodies, comments and modern declarations make reliable ranges expensive | Retain as an explicitly heuristic fallback, not the main implementation for these languages |
| Native Node Tree-sitter bindings | Direct parser access, potential throughput advantage | Native artifacts and platform qualification; some grammar packages run install scripts or ship large generated sources | Alternative if measured WASM overhead proves material |
| Web Tree-sitter with pinned WASM grammars | One Node-compatible runtime; local parsing without language SDKs or native installation builds | Grammar provenance, version compatibility, initialization and syntax gaps still require ownership | Preferred baseline |
| Compiler or language-server integrations | Can provide type-aware symbols, references and project-aware resolution | Toolchains, project configuration, indexing and lifecycle differ by language | Later targeted capability when semantic operations justify the cost |

The [Web Tree-sitter documentation][web-runtime] describes local grammar loading and parser
initialization. Parser ABI compatibility alone does not guarantee that an older WASM binary can
load: the runtime also documents dynamic-linking format differences. The exact installed binary
combination must be tested.

Language servers are not an immediate universal substitute. For example, the current
[official Kotlin language server][kotlin-lsp] lists call hierarchy, but Kotlin Multiplatform support
is still under development. Its existence does not establish coverage of every required project.

## Language requirements and observed results

| Language | Required structural surface | Local probe | Qualification still needed |
| --- | --- | --- | --- |
| Rust | Public/generic/async functions; structs, enums, traits, impl members, modules and attributes | Public declarations, trait method, impl method, async trait and let-chain syntax parsed | Attribute/doc attachment, macros as authored units, conditional compilation, module/import resolution; no macro expansion claim |
| Kotlin | Classes, interfaces, objects, functions, extensions, generics, properties, annotations, `.kt` and `.kts` | Generic extension and suspend functions, value class, data object and multiline expect/actual parsed | Packaged grammar rejected named context parameters and had a same-line member-boundary issue; qualify a newer revision and representative KMP/script cases |
| Swift | Types, protocols, actors, extensions, methods, properties, initializers, attributes and imports | Actor/protocol/extension examples, typed throws, `nonisolated(nonsending)` and macro declaration parsed | The tested artifact uses a fork; confirm that choice, distinguish actor/struct/extension node kinds, test SwiftUI-style bodies and conditional compilation |
| Dart | Generic functions, classes, constructors, methods/getters, mixins, extensions, extension types, records and imports/parts | Generic function, named constructor, method body, getter, extension type, record pattern and dot shorthand parsed | Pair signatures with bodies, include annotations, test callbacks and generated-file boundaries; do not infer Flutter or platform-channel semantics |
| Objective-C | Interfaces, implementations, protocols, categories, properties, full method selectors, blocks and imports | `.m` and explicit Objective-C `.h` examples parsed; nullability and `NS_SWIFT_NAME` alone parsed | `NS_ASSUME_NONNULL_BEGIN/END` caused errors; ambiguous headers need classification; Objective-C++ requires separate treatment |
| Java | Classes, interfaces, records, enums, constructors, methods, fields, annotations, packages/imports | Record, sealed interface, generic method, constructor and record-pattern switch parsed | Nested/anonymous classes, overload identity, annotations, current language-level fixtures and generated code; no Lombok or annotation-processor expansion |

These are syntax observations, not compiler/type-check results or language-version certifications.
Individual methods and declarations can remain useful even when another region is unsupported.
Such files must report partial coverage; do not convert “some valid nodes” into “complete support.”

### Kotlin package lag

The tested Lumis Kotlin binary identifies `fwcd/tree-sitter-kotlin` revision `e1a2d5a…`, upstream
version `0.3.8`. The current upstream source at
[`d6af96d2…`][kotlin-current] declares version `0.4.0` and contains named context-parameter grammar
rules. That is promising source evidence, not an executed result for that revision. Building and
testing its exact WASM artifact is the next qualification step.

An additional published candidate, `@tree-sitter-grammars/tree-sitter-kotlin@1.1.0`, loaded into the
runtime but also failed the tested Kotlin edge cases. A higher package version from a different
grammar family is not evidence of better language coverage.

### Objective-C and Objective-C++

Treat `.m` as the Objective-C candidate in this scope. Classify `.h` from captured syntax and any
explicit project language information; a shared extension alone cannot distinguish C, C++ and
Objective-C. A plain C header parsed successfully with the Objective-C grammar because it includes
C syntax. That does not make the file Objective-C.

The `.mm` probe produced errors on C++ syntax. Keep it visible with partial/fallback evidence and
do not advertise complete Objective-C++ support. A qualified combined grammar or an explicitly
project-configured Clang path could address this later. Neither was implemented or tested here.

The annotation-macro failure also matters for ordinary Objective-C headers, not just `.mm`.
Resolve or explicitly bound that case before declaring the header support complete. Do not silently
strip arbitrary macros or deliver altered text as original source.

## Reproducible feasibility probe

The probe ran on macOS arm64 with Node `24.16.0`, `web-tree-sitter@0.27.2`, and six exact
`@lumis-sh/wasm-*` packages. Installation used `--ignore-scripts`; only seven packages were added
to an isolated scratch directory. The probe loaded the exported WASM files directly, without the
Lumis highlighter, Python, language SDKs, project builds or model calls.

| Grammar asset | Package version | Recorded source revision |
| --- | --- | --- |
| Rust | `@lumis-sh/wasm-rust@0.26.7` | [tree-sitter/tree-sitter-rust, `77a37472…`][rust-grammar] |
| Kotlin | `@lumis-sh/wasm-kotlin@0.26.7` | [fwcd/tree-sitter-kotlin, `e1a2d5ad…`][kotlin-grammar] |
| Swift | `@lumis-sh/wasm-swift@0.26.7` | [leandrocp/tree-sitter-swift, `b241aa01…`][swift-grammar] |
| Dart | `@lumis-sh/wasm-dart@0.26.8` | [UserNobody14/tree-sitter-dart, `0038280b…`][dart-grammar] |
| Objective-C | `@lumis-sh/wasm-objc@0.26.4` | [tree-sitter-grammars/tree-sitter-objc, `18802acf…`][objc-grammar] |
| Java | `@lumis-sh/wasm-java@0.26.5` | [tree-sitter/tree-sitter-java, `94703d5a…`][java-grammar] |

The six binaries total 16,513,623 bytes, approximately 15.75 MiB, excluding the runtime, package
metadata and queries. Each binary's SHA-256 matched its package metadata, and all six loaded with
parser ABI 15. Source license files at the recorded revisions contain MIT terms. This does not
replace package provenance, notice preservation or clean installed-framework qualification.

The [Lumis language definitions][lumis-definitions] provide the package-source context. Its Swift
artifact comes from `leandrocp/tree-sitter-swift`, not directly from `alex-pinkus/tree-sitter-swift`.
Do not hide that fork behind a generic parser name. The all-in-one Repomix WASM package was also
inspected; its declared grammar set omitted Kotlin and Objective-C, so it cannot alone satisfy this list.

Observed results:

- Seven ordinary fixture files covered all six languages, with separate Objective-C header and
  implementation files. Of 41 predeclared declaration identities, the existing structured spans
  found 16 and the small prototype found 41. Duplicate names were counted separately when required.
- Six hand-declared multiline source ranges matched the prototype output, including the Dart method
  body and a Java file containing CRLF and non-ASCII text. These are range smoke checks, not exhaustive
  annotation, nesting or excerpt-delivery proof.
- Comment examples did not produce prototype declarations. Six deliberately malformed snippets
  reported parser errors and yielded no prototype declaration spans.
- Eighteen additional construct/header probes exposed the Kotlin and Objective-C gaps above. The
  separate mixed Objective-C++ fixture remained partial. These failures are not excluded from the
  language-support decision by the ordinary-fixture declaration score.
- Parsing and walking the small ordinary files took roughly 0.05–0.14 ms at the median of 40 warm
  iterations per file. A cooperative cancellation probe stopped a 222,780-byte Rust input and the
  parser recovered after reset. Neither result measures whole-task speed, large-repository memory
  or installed CLI startup cost.

The fixtures were chosen to diagnose known gaps, and the prototype was written against them.
The 41/41 result is feasibility evidence, not held-out retrieval accuracy or a production-ready
extractor. Actual cost savings, representative project recall and accepted development outcomes
remain unmeasured.

## Integration within the existing owner

The [current retrieval contract](../specs/engine-rc6-linked-retrieval.md) still owns captured views,
freshness, permitted sources and coverage. Extend the parser boundary within that owner:

1. Feed already captured bytes into the language extractor. Never reread the live pathname from a
   parser or language server when the caller supplied a staged or captured view.
2. Return the existing `SourceFacts` structure with accurate kinds, qualified/containing names where
   useful, ranges, bounded signatures and raw literal links. Preserve complete source for later
   excerpts; do not put function bodies or arbitrary literal values into compact descriptors.
3. Make initialization lazy. Web Tree-sitter initializes asynchronously, while current extraction
   and maintenance are synchronous. Adapt these boundaries and their direct callers to await
   initialization; do not add blocking child processes or load six grammars for TS-only/warm-cache work.
4. Include the chosen runtime/grammar/query identity in the existing extractor version and cache
   invalidation. Keep the existing disposable projection; add no second database or parser daemon.
5. Preserve source limits and deadlines. Current source allows 16 MiB per captured file and 32 MiB
   per capture batch, so tiny fixtures cannot establish adequate bounds. Use parser cancellation,
   bounded walks, visible truncation and explicit cleanup. A captured file need not be fully parsed
   before its path can remain discoverable.
6. Report `syntax-partial` for parse errors, missing tokens, interrupted work and deliberately
   unsupported syntax. A missing anonymous token may make `hasError` true even when a walk of named
   nodes finds no `ERROR`; the Kotlin probe demonstrated this distinction. Never label an affected
   declaration complete merely because its name was recovered.
7. Retain exact-text search and the current fallback for other languages. Keep comment enforcement,
   compiler checks, test execution and source eligibility with their existing owners.

The main seams are `context-source-facts.ts`, `context-projection.ts`, `context-index-command.ts`,
`context-metadata.ts`, `context-route-command.ts`, and the existing excerpt/projection tests. Use a
fixed six-language mapping and small language-specific extraction functions; this need does not
justify a general plugin platform.

Import capture and import resolution are different tasks. Dart relative URIs need not begin with
`./`; Objective-C quoted includes have search-path rules; Rust modules and Java/Kotlin package names
need language-aware scope. Record literal declarations first. Resolve only when the captured
inventory and an explicit rule identify one target. Keep aliases, conditional targets, external
packages and ambiguous matches visibly unresolved. Do not reuse the TS extension policy blindly.

## Delivery proposal

Use the existing [validation strategy](../governance/validation-strategy.md) and
[release-evaluation measures](../specs/engine-release-evaluation.md). This proposal introduces no new
approval layer or evidence store.

| Batch | Work | Evidence needed at its boundary |
| --- | --- | --- |
| Grammar selection | Pin the runtime and six grammar sources/artifacts; resolve Kotlin revision lag, choose the Swift source, and define the Objective-C macro/header behavior | All required construct fixtures, malformed input, missing-token handling, binary/source identity, notices and Node compatibility; unsupported `.mm` remains explicit |
| Extraction and retrieval | Implement the common loading boundary and six extractors; integrate facts, cache invalidation, bounded descriptors and complete excerpts | Per-language names and ranges, comments/literals, annotations, overload identity, limits/cancellation, staged versus working input, cache refresh and unchanged TS/Markdown behavior |
| Package and usefulness | Qualify the compiled artifact and compare realistic retrieval/development tasks | Clean installation with scripts disabled, local asset loading, platform qualification, warm/cold and changed-file costs, decisive-file/span recall, accepted outcomes and total tokens/time |

Give every required language its own reported results. Do not average away a weak Kotlin or
Objective-C result. Include mixed Swift/Objective-C headers, Kotlin/Java source sets, Rust foreign
interfaces and Dart platform boundaries as retrieval tasks, while keeping unresolved cross-language
relationships explicit.

The next implementation should deliver stronger source units for all six languages before adding
call-graph promises. Semantic navigation can follow where real tasks demonstrate that syntax and
ordinary search are insufficient.

[web-runtime]: https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md
[kotlin-lsp]: https://kotlinlang.org/docs/kotlin-lsp.html
[kotlin-current]: https://github.com/fwcd/tree-sitter-kotlin/tree/d6af96d2e23ef0a8ff5ab512864378cf08fba311
[rust-grammar]: https://github.com/tree-sitter/tree-sitter-rust/tree/77a3747266f4d621d0757825e6b11edcbf991ca5
[kotlin-grammar]: https://github.com/fwcd/tree-sitter-kotlin/tree/e1a2d5ad1f61f5740677183cd4125bb071cd2f30
[swift-grammar]: https://github.com/leandrocp/tree-sitter-swift/tree/b241aa0192f5b2f9865c926914989864e782628c
[dart-grammar]: https://github.com/UserNobody14/tree-sitter-dart/tree/0038280b774b65c1b89ba7fec50624d8baed9fe1
[objc-grammar]: https://github.com/tree-sitter-grammars/tree-sitter-objc/tree/18802acf31d0b5c1c1d50bdbc9eb0e1636cab9ed
[java-grammar]: https://github.com/tree-sitter/tree-sitter-java/tree/94703d5a6bed02b98e438d7cad1136c01a60ba2c
[lumis-definitions]: https://github.com/leandrocp/lumis/blob/55ea28811529ce47f527347ca18794cebdc31e05/languages.toml
