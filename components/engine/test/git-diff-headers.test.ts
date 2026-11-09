import { test } from "node:test";
import assert from "node:assert/strict";
import { gitDiffHeaders, DiffHeaderFilter } from "../src/git-diff-headers.ts";

test("header filtering preserves chunk-split headers and ignores large body lines", () => {
  const f = new DiffHeaderFilter();
  const input = "diff --git a/é.ts b/é.ts\n+++ b/é.ts\n@@ -1 +2,3 @@ function\n+" + "x".repeat(100000) + "\n";
  const output: string[] = [];
  for (let i = 0; i < input.length; i += 3) output.push(...f.push(input.slice(i, i + 3)));
  assert.equal(output.join(""), "+++ b/é.ts\n@@ -1 +2,3 @@ function\n");
});

test("oversized metadata fails rather than silently dropping a header", () => {
  const f = new DiffHeaderFilter();
  assert.throws(() => f.push("+++ b/" + "x".repeat(17000)), /capture bound/u);
});


test("aggregate header limit refuses complete metadata rather than truncating", () => {
  const f = new DiffHeaderFilter(), line = "+++ b/" + "x".repeat(8192) + "\n";
  assert.throws(() => { for (let i = 0; i < 5000; i++) f.push(line); }, /capture bound/u);
});

test("worker preserves Git failure without accepting partial output", () => {
  assert.throws(() => gitDiffHeaders(process.cwd(), ["rev-parse", "--verify", "missing-stream-fixture-ref"]), /Git comparison failed/u);
});

test("short lines and final headers preserve only metadata", () => {
  const f = new DiffHeaderFilter();
  assert.deepEqual([...f.push("+\na\n+++ /dev"), ...f.push("/null\n@@ -1 +0,0 @@"), ...f.push("\n")],
    ["+++ /dev/null\n", "@@ -1 +0,0 @@\n"]);
});
