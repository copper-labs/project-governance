import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overviewFindings, declarationFindings, commentBefore, normalizedComment } from "../src/checkers/comment-rules.ts";

test("comment structure and advisory prose preserve Python checker results", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/comment-rules-parity.json", import.meta.url), "utf8"));
  for (const item of cases) {
    const actual = item.kind === "overview" ? overviewFindings(item.comment, "src/example.py", item.policy, "python", item.blocking) :
      declarationFindings(item.comment, { path: "src/example.py", line: 7, adapter: "python", declaration: item.name }, item.detail ? "type" : "function", item.name, item.detail, item.blocking, true);
    assert.deepEqual(actual, item.findings);
  }
});

test("contiguous comments retain paragraphs and do not absorb earlier code", () => {
  assert.equal(commentBefore(["const old = 1;", "// Responsibility: Read source.", "//", "// Context: Used by validation.", "", "function read() {}"], 6), "Responsibility: Read source.\n\nContext: Used by validation.");
  assert.equal(commentBefore(["const old = 1;", "function read() {}"], 2), "");
  assert.equal(normalizedComment("/**\n * Read source.\n */"), "Read source.");
});
