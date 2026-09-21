import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTypeScript, SourceSyntaxError } from "../src/checkers/typescript-analysis.ts";

test("compiler analyzes captured declarations and advertises only supported metrics", () => {
  const result = analyzeTypeScript("missing/on/disk.ts", "namespace N {\n export class C {\n  method() { return 1; }\n }\n}\n");
  assert.deepEqual(result.extents, [
    { kind: "type", name: "N", start: 1, end: 5 },
    { kind: "type", name: "N.C", start: 2, end: 4 },
    { kind: "function", name: "N.C.method", start: 3, end: 3 },
  ]);
  assert.deepEqual([...result.capabilities], ["type-extents", "function-extents"]);
  assert.equal(result.metrics.size, 0);
});

test("JavaScript JSX and TypeScript TSX use their native syntax modes", () => {
  for (const suffix of ["jsx", "tsx"]) {
    assert.equal(analyzeTypeScript(`component.${suffix}`, "function View() { return <div title='hello'/>; }").extents[0]?.name, "View");
  }
  assert.throws(() => analyzeTypeScript("invalid.ts", "const a = 1;\nfunction broken( {"), (error: unknown) => error instanceof SourceSyntaxError && error.line === 2);
});
