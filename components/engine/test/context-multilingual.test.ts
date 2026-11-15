import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtures } from "./fixtures/multilingual/sources.ts";
import { extractSourceFacts, resolveSourceLink } from "../src/context-source-facts.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { localContextPath } from "../src/context-path-policy.ts";
import { buildPathClues } from "../src/context-build-files.ts";

for (const fixture of fixtures) test(`captured ${fixture.path} yields honest syntax and declaration identities`, () => {
  const facts = extractSourceFacts(fixture.path, Buffer.from(fixture.source));
  if (fixture.mixed) {
    assert.equal(facts.coverage, "syntax-partial"); assert.deepEqual(facts.spans, []); return;
  }
  assert.equal(facts.coverage, "syntax");
  const names = facts.spans.map(span => span.name);
  for (const expected of fixture.expected) { const index = names.indexOf(expected); assert.ok(index >= 0, expected); names.splice(index, 1); }
  assert.ok(facts.spans.every(span => !/fake.*comment/i.test(span.name)));
  assert.ok(facts.spans.every(span => span.start > 0 && span.end >= span.start && span.end <= fixture.source.split("\n").length));
  for (const link of facts.links) assert.equal(resolveSourceLink(fixture.path, link, new Set()).reason, "language-module-unresolved");
});

test("Dart signatures include their bodies in bounded original evidence", () => {
  const text = "// preamble\n".repeat(100) + "class Session {\n  String refresh() {\n    return 'still alive';\n  }\n}\n" + "// tail\n".repeat(100);
  const facts = extractSourceFacts("session.dart", Buffer.from(text));
  const span = facts.spans.find(span => span.name === "refresh")!;
  assert.deepEqual([span.start, span.end], [102, 104]);
  const excerpt = contextExcerpt({ id: "session.dart", sourceDigest: facts.digest, excerpt: text }, "refresh", 256, facts.spans, [span]);
  assert.match(excerpt.excerpt, /return 'still alive';/); assert.ok(excerpt.sourceUnits?.every(unit => unit.complete));
});

test("KMP retains authored modifiers and Gradle source-set blocks, without inferred bindings", () => {
  const source = "expect fun clock(): Long\nactual fun clock(): Long = 0\n";
  const facts = extractSourceFacts("shared/src/commonMain/kotlin/Clock.kt", Buffer.from(source));
  assert.deepEqual(facts.spans.map(span => span.modifiers), [["expect"], ["actual"]]);
  const annotated = extractSourceFacts("Label.kt", Buffer.from('@Named("expect actual")\nfun ready() {}\n'));
  assert.equal(annotated.spans[0]?.modifiers, undefined, "Annotation strings cannot invent KMP modifiers");
  assert.equal(annotated.spans[0]?.signature, "ready");
  assert.deepEqual(buildPathClues("shared/src/commonMain/kotlin/Clock.kt"), { sourceSetHint: "commonMain" });
  assert.deepEqual(buildPathClues("shared/src/iosMain/kotlin/Clock.kt"), { sourceSetHint: "iosMain" });
  const gradle = extractSourceFacts("build.gradle.kts", Buffer.from("kotlin {\n    iosArm64()\n    sourceSets {\n        val commonMain by getting\n    }\n}\n"));
  assert.equal(gradle.coverage, "syntax"); assert.ok(gradle.spans.some(span => span.name === "sourceSets"));
  assert.equal(gradle.links.some(link => link.kind !== "module"), false);
});

test("unsupported syntax, annotation macros and exhausted time never invent complete spans", () => {
  for (const [path, source] of [["a.rs", "pub fn broken( {"], ["a.kt", "context(log: Logger)\nfun record() {}"],
    ["a.h", "NS_ASSUME_NONNULL_BEGIN\n@interface Store : NSObject\n@end\nNS_ASSUME_NONNULL_END\n"]]) {
    const facts = extractSourceFacts(path!, Buffer.from(source!)); assert.equal(facts.coverage, "syntax-partial"); assert.deepEqual(facts.spans, []);
  }
  assert.equal(extractSourceFacts("a.h", Buffer.from("struct C { int value; };\n")).coverage, "heuristic");
  const late = extractSourceFacts("a.rs", Buffer.from("pub fn ready() {}"), performance.now() - 1);
  assert.equal(late.coverage, "syntax-partial"); assert.deepEqual(late.spans, []);
});

test("build support admits declared text inputs while preserving generated and private boundaries", () => {
  for (const path of ["build.gradle", "build.gradle.kts", "settings.gradle", "gradle/libs.versions.toml", "gradle/wrapper/gradle-wrapper.properties", "gradlew", "Cargo.lock", ".cargo/config", "Package.resolved", "App.xcodeproj/project.pbxproj", "App.xcconfig", "Podfile.lock", "App.podspec", "pubspec.lock", "pom.xml", "CMakeLists.txt", "src/nativeInterop/cinterop/api.def"]) {
    assert.ok(localContextPath(path), path);
    const facts = extractSourceFacts(path, Buffer.from("version = 1\n")); assert.ok(facts.descriptor, path);
  }
  for (const path of [".mvn/wrapper/maven-wrapper.jar", "local.properties", "CMakeUserPresets.json", ".build/config.json", ".dart_tool/package_config.json", "secrets/build.gradle", "private.lock"]) assert.equal(localContextPath(path), false, path);
  const facts = extractSourceFacts("gradle.properties", Buffer.from("repositoryPassword=PRIVATE_CANARY\norg.gradle.parallel=true\n"));
  assert.ok(!facts.descriptor!.includes("PRIVATE_CANARY"));
  assert.ok(facts.descriptor!.includes("org.gradle.parallel"));
});
