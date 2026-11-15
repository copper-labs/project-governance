import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Parser } from "web-tree-sitter";
import { capturedSourceSpans, extractSourceFacts } from "../src/context-source-facts.ts";
import { SYNTAX_VERSION } from "../src/context-syntax.ts";
import { localContextPath } from "../src/context-path-policy.ts";
import { buildFileRole } from "../src/context-build-files.ts";

const facts = (path: string, source: string) => extractSourceFacts(path, Buffer.from(source));

test("import limits preserve Kotlin and Java declarations", () => {
  for (const [path, suffix] of [["Screen.kt", "\nclass Screen {\n fun render() {}\n}\n"], ["Screen.java", ";\nclass Screen { void render() {} }\n"]]) {
    const imports = Array.from({ length: 129 }, (_, i) => `import library.Type${i}`).join(path!.endsWith(".java") ? ";\n" : "\n");
    const result = facts(path!, imports + suffix);
    assert.equal(result.links.length, 128); assert.equal(result.coverage, "syntax-partial");
    assert.ok(result.spans.some(span => span.name === "Screen")); assert.ok(result.spans.some(span => span.name === "render"));
  }
});

test("silent Kotlin grammar gaps retain labelled name clues without claiming complete source units", () => {
  for (const source of [
    'package a\n\n@Suppress("UNCHECKED_CAST")\nfun <T> cast(value: Any): T = value as T\ncontext(Logger)\nfun record() {}\n',
    'context(Logger)\nfun record() {}\n',
    'fun interface Handler { fun handle() }\nclass Screen {\n fun render() {}\n}\n',
  ]) {
    const result = facts("Feature.kt", source), descriptor = JSON.parse(result.descriptor!);
    assert.equal(result.coverage, "syntax-partial"); assert.deepEqual(result.spans, []);
    assert.ok(descriptor.heuristicSymbols.length > 0);
  }
  const annotated = facts("Feature.kt", 'package a\n\n@Suppress("UNCHECKED_CAST")\nfun <T> cast(value: Any): T = value as T\n');
  assert.deepEqual(annotated.spans.map(span => [span.start, span.end]), [[3, 4]]);
});

test("Doxygen and Objective-C forward declarations cannot erase C header clues", () => {
  for (const source of ["/** @class Engine */\nclass Engine {\n};\nstruct Config {};\n", "@class NSString;\nstruct Config {};\n"]) {
    const result = facts("Engine.h", source);
    assert.equal(result.coverage, "heuristic"); assert.ok(result.spans.some(span => span.name === "Config"));
  }
});

test("Dart includes documented members, constructor variants, operators, enums and mixins", () => {
  const result = facts("Widget.dart", 'class Widget {\n  const Widget();\n  factory Widget.empty() => Widget();\n  /// Builds a widget.\n  @override\n  String build() {\n    return "ok";\n  }\n  Widget operator +(Widget other) => this;\n}\nenum Color { red, green }\nmixin Walker { void walk() {} }\n');
  assert.equal(result.coverage, "syntax");
  const ranges = Object.fromEntries(result.spans.map(span => [span.name, [span.start, span.end]]));
  assert.deepEqual(ranges.build, [4, 8]); assert.deepEqual(ranges["Widget.empty"], [3, 3]);
  assert.deepEqual(ranges.Widget, [2, 2]); assert.deepEqual(ranges["operator +"], [9, 9]);
  assert.deepEqual(ranges.Color, [11, 11]); assert.deepEqual(ranges.Walker, [12, 12]);
});

test("all six parsers retain exact documented or annotated member ranges", () => {
  const cases = [
    ["a.rs", "/// Docs.\n#[inline]\npub fn ready() {}\n", 1, 3],
    ["A.kt", "class A {\n/** Docs. */\n@Deprecated(\"old\")\nfun ready() {}\n}\n", 2, 4],
    ["a.swift", "/// Docs.\n@available(macOS 12.0, *)\nfunc ready() {}\n", 1, 3],
    ["a.dart", "class A {\n/// Docs.\n@override\nvoid ready() {}\n}\n", 2, 4],
    ["A.m", "@implementation A\n/// Docs.\n- (void)ready {}\n@end\n", 2, 3],
    ["A.java", "class A {\n/** Docs. */\n@Deprecated\nvoid ready() {}\n}\n", 2, 4],
  ] as const;
  for (const [path, source, start, end] of cases) {
    const result = facts(path, source), span = result.spans.find(item => item.name === "ready");
    assert.equal(result.coverage, "syntax", path); assert.deepEqual([span?.start, span?.end], [start, end], path);
  }
});

test("metadata excludes property continuations and declaration annotation/default values", () => {
  const property = facts("gradle.properties", "signing.key=prefix\\\n    c2VjcmV0LWtleS1ieXRlcw==\norg.gradle.parallel=true\n");
  assert.ok(!property.descriptor!.includes("c2VjcmV0")); assert.ok(property.descriptor!.includes("org.gradle.parallel"));
  for (const [path, source] of [
    ["package-info.java", '@XmlSchema(namespace = "PRIVATE_CANARY")\npackage a.b;\n'],
    ["a.kt", '@Named("PRIVATE_CANARY")\nfun ready(value: String = "PRIVATE_CANARY") {}\n'],
    ["build.gradle.kts", 'plugins { id("PRIVATE_CANARY") }\n'],
    ["a.dart", '@Deprecated("PRIVATE_CANARY")\nimport "a.dart";\n'],
    ["a.dart", '@Tag("PRIVATE_CANARY")\nexport "lib.dart";\n'],
    ["a.dart", '@Tag("PRIVATE_CANARY")\npart of "lib.dart";\n'],
  ]) {
    const result = facts(path!, source!);
    assert.ok(!JSON.stringify({ descriptor: result.descriptor, spans: result.spans, links: result.links }).includes("PRIVATE_CANARY"), path);
    if (path!.endsWith(".java")) assert.equal(result.links[0]?.target, "a.b");
    if (path!.endsWith(".dart")) assert.match(result.links[0]!.target, /^(?:a|lib)\.dart$/u);
  }
});

test("wide initializers stay bounded and Objective-C++ does not pay for a discarded parse", t => {
  const result = facts("Wide.java", `class Wide { int[] values = {${"0,".repeat(126000)}0}; void after() {} }`);
  assert.equal(result.coverage, "syntax"); assert.ok(result.spans.some(span => span.name === "after"));
  const mocked = t.mock.method(Parser.prototype, "parse", () => { throw new Error("Must not parse Objective-C++"); });
  assert.equal(facts("Bridge.mm", "@interface Bridge : NSObject\n@end\n").coverage, "syntax-partial");
  assert.equal(mocked.mock.callCount(), 0);
});

test("captured-source retry and cancellation remain visible", t => {
  const source = "pub fn ready() {}\n", result = facts("a.rs", source);
  const candidate = { id: "a.rs", sourceDigest: result.digest, excerpt: source };
  const cached = new Map([[candidate.id, { ...result, spans: [], retryable: true }]]);
  const retried = capturedSourceSpans([candidate], cached, performance.now() + 1000);
  assert.equal(retried.coverage.reusedCount, 0); assert.ok(retried.spans["a.rs"]?.length);
  t.mock.method(Parser.prototype, "parse", () => null);
  const cancelled = capturedSourceSpans([candidate], new Map(), performance.now() + 1000);
  assert.deepEqual(cancelled.coverage.limitations, [{ path: "a.rs", reason: "facts-deadline" }]);
});

test("trailing comments, Rust inner attributes and inline modules do not become attached clues", () => {
  const kotlin = facts("a.kt", "val a = 1 // note\nval b = 2\n");
  assert.equal(kotlin.spans.find(span => span.name === "b")?.start, 2);
  const rust = facts("a.rs", "#![allow(dead_code)]\npub fn ready() {}\npub(crate) use crate::Thing;\nmod inline { fn here() {} }\nmod other;\n");
  assert.equal(rust.spans.find(span => span.name === "ready")?.start, 2);
  assert.deepEqual(rust.links.map(link => link.target), ["crate::Thing", "other"]);
  assert.equal(facts("a.swift", "@testable import Framework\n").links[0]?.target, "Framework");
});

test("local Apple workspace state stays excluded and parser identity tracks pinned dependencies", () => {
  for (const path of ["App.xcodeproj/xcuserdata/me/settings.plist", ".swiftpm/xcode/contents.xcworkspacedata"]) assert.equal(localContextPath(path), false);
  const dependencies = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).dependencies;
  const versions = Object.fromEntries(SYNTAX_VERSION.split(":").flatMap(part => { const match = part.match(/^(.+)-(\d+\.\d+\.\d+)$/u); return match ? [[match[1], match[2]]] : []; }));
  for (const [name, label] of Object.entries({ "web-tree-sitter": "web", "@lumis-sh/wasm-rust": "rust-kotlin", "@lumis-sh/wasm-kotlin": "rust-kotlin", "@lumis-sh/wasm-swift": "swift-java", "@lumis-sh/wasm-java": "swift-java", "@lumis-sh/wasm-dart": "dart", "@lumis-sh/wasm-objc": "objc" }))
    assert.equal(versions[label], dependencies[name], name);
  assert.equal(buildFileRole("build-logic/src/main/kotlin/library.gradle.kts"), "gradle-script");
  assert.equal(localContextPath(".mvn/mavenXconfig"), false);
});

test("multiline Rust and preprocessor-adjacent Objective-C documentation stays attached", () => {
  for (const [path, source, name, range] of [
    ["a.rs", "/// One.\n/// Two.\n/// Three.\npub fn ready() {}\n", "ready", [1, 4]],
    ["a.rs", "impl S {\n /// One.\n /// Two.\n pub fn ready(&self) {}\n}\n", "ready", [2, 4]],
    ["A.h", "#import <Foundation/Foundation.h>\n/// A store.\n@interface Store : NSObject\n@end\n", "Store", [2, 4]],
    ["A.m", "@implementation A\n#pragma mark - Life\n/// Docs.\n- (void)ready {}\n@end\n", "ready", [3, 4]],
    ["a.rs", "/// Docs.\n#[derive(Debug)] // needed by tests\npub struct B;\n", "B", [1, 3]],
    ["a.dart", "class A {\n /// Docs.\n @override // note\n void ready() {}\n}\n", "ready", [2, 4]],
  ] as const) {
    const span = facts(path, source).spans.find(item => item.name === name);
    assert.deepEqual([span?.start, span?.end], range, path);
  }
  for (const [path, source] of [["A.kt", "class A { // note\n fun b() {}\n}\n"], ["A.java", "class A { // note\n void b() {}\n}\n"]])
    assert.equal(facts(path!, source!).spans.find(item => item.name === "b")?.start, 2);
});

test("Kotlin property accessors and KDoc after imports retain complete source ranges", () => {
  const result = facts("Box.kt", 'class Box {\n val isEmpty: Boolean\n get() = size == 0\n var name: String = ""\n set(value) { field = value.trim() }\n fun b() {}\n}\n');
  for (const [name, range] of [["isEmpty", [2, 3]], ["name", [4, 5]]] as const) {
    const span = result.spans.find(item => item.name === name); assert.deepEqual([span?.start, span?.end], range);
  }
  assert.equal(facts("Box.kt", "val isEmpty: Boolean\n get() = size == 0\nfun b() {}\n").spans[0]?.end, 2);
  for (const source of ["package a\n\n/** Docs. */\nclass Ready\n", "package a\nimport a.b\n/** Docs. */\nclass Ready\n"]) {
    const span = facts("Ready.kt", source).spans.find(item => item.name === "Ready"); assert.deepEqual([span?.start, span?.end], [3, 4]);
  }
});
