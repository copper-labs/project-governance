import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kotlinDeclarations } from "../src/checkers/kotlin-parser.ts";

test("Kotlin token parser preserves all shipped fixture declaration identities and extents", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/kotlin-parser-parity.json", import.meta.url), "utf8"));
  for (const fixture of fixtures) {
    const source = readFileSync(new URL(`../../../src/project_governance_runtime/defaults/fixtures/comment-quality/${fixture.file}`, import.meta.url), "utf8");
    assert.deepEqual(kotlinDeclarations(source), fixture.declarations, fixture.file);
  }
});
