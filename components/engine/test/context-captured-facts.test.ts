import { test } from "node:test";
import assert from "node:assert/strict";
import { capturedSourceSpans, extractSourceFacts } from "../src/context-source-facts.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { SOURCE_CAPTURE_MAX_BYTES, SOURCE_CAPTURE_BATCH_MAX_BYTES } from "../src/source-capture-limits.ts";

test("a cold index still supplies the complete assertion from already captured source", () => {
  const path = "tests/launch.test.js", source = "// setup\n".repeat(200) +
    "test('launch proves readiness', () => { assert.equal(result.status, 'running'); });\n" + "// tail\n".repeat(200);
  const facts = extractSourceFacts(path, Buffer.from(source));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: source };
  const captured = capturedSourceSpans([candidate], new Map(), performance.now() + 1000);
  assert.equal(captured.coverage.extractedCount, 1); assert.equal(captured.coverage.spanFileCount, 1);
  const excerpt = contextExcerpt(candidate, "launch proves readiness", 1024, captured.spans[path]);
  assert.match(excerpt.excerpt, /assert\.equal\(result\.status, 'running'\)/);
  assert.ok(excerpt.sourceUnits?.every(item => item.complete));
});

test("current facts are reused and changed captured bytes cannot reuse an older span", () => {
  const path = "src/contract.ts", old = extractSourceFacts(path, Buffer.from("export function oldContract() {}\n"));
  const current = "export function currentContract() { return true; }\n", facts = extractSourceFacts(path, Buffer.from(current));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: current };
  const reused = capturedSourceSpans([candidate], new Map([[path, facts]]), performance.now() - 1);
  assert.equal(reused.coverage.reusedCount, 1); assert.equal(reused.coverage.extractedCount, 0);
  const refreshed = capturedSourceSpans([candidate], new Map([[path, old]]), performance.now() + 1000);
  assert.equal(refreshed.coverage.reusedCount, 0); assert.equal(refreshed.coverage.extractedCount, 1);
  assert.equal(refreshed.spans[path]?.[0]?.name, "currentContract");
});

test("captured extraction respects size and deadline limits and rejects mismatched source identity", () => {
  const source = "export const current = true;\n", facts = extractSourceFacts("src/current.ts", Buffer.from(source));
  const candidate = { id: "src/current.ts", sourceDigest: facts.digest, excerpt: source };
  const late = capturedSourceSpans([candidate], new Map(), performance.now() - 1);
  assert.equal(late.coverage.limitations[0]?.reason, "facts-deadline");
  const large = capturedSourceSpans([{ ...candidate, excerpt: "x".repeat(SOURCE_CAPTURE_MAX_BYTES + 1) }], new Map(), performance.now() + 1000);
  assert.equal(large.coverage.limitations[0]?.reason, "facts-size-limit");
  const mismatched = capturedSourceSpans([{ ...candidate, sourceDigest: "sha256:wrong" }], new Map(), performance.now() + 1000);
  assert.equal(mismatched.coverage.limitations[0]?.reason, "facts-source-mismatch");
  assert.deepEqual(mismatched.spans, {});
});

test("captured large native sources yield bounded spans without the former 256 KiB rejection", () => {
  const source = "/** Native lifecycle contract. */\n/*" + " ".repeat(700000) + "*/\nclass SessionController {}\n";
  const path = "src/session.dart", facts = extractSourceFacts(path, Buffer.from(source));
  const result = capturedSourceSpans([{ id: path, sourceDigest: facts.digest, excerpt: source }], new Map(), performance.now() + 1000);
  assert.equal(result.coverage.extractedCount, 1); assert.deepEqual(result.coverage.limitations, []);
  assert.equal(result.spans[path]?.[0]?.name, "SessionController");
  assert.ok(Buffer.byteLength(JSON.stringify(result.spans)) < 2048);
});

test("uncached span extraction keeps one aggregate original-byte allowance", () => {
  const source = " ".repeat(SOURCE_CAPTURE_BATCH_MAX_BYTES / 2);
  const facts = extractSourceFacts("plain.txt", Buffer.from(source));
  const candidates = ["one.txt", "two.txt", "three.txt"].map(id => ({ id, excerpt: source, sourceDigest: facts.digest }));
  const result = capturedSourceSpans(candidates, new Map(), performance.now() + 10000);
  assert.equal(result.coverage.extractedCount, 2);
  assert.deepEqual(result.coverage.limitations, [{ path: "three.txt", reason: "facts-byte-limit" }]);
});
