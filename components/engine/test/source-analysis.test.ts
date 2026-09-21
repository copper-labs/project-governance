import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSource, type SourceAnalyzer } from "../src/checkers/source-analysis.ts";
import { analyzeTypeScript, SourceSyntaxError } from "../src/checkers/typescript-analysis.ts";
const selection = { path: "example.ts", isNew: true, explicit: false, renamed: false, ranges: [] };
const config = { version: 2, owner: "team", dispositions: [] };
const run = (source: string, analyzer: SourceAnalyzer, limit = 500) => analyzeSource(selection, Buffer.from(source), analyzer, {}, limit, config, "2026-09-20");

test("captured compiler output feeds direct-unit findings and disposition identity", async () => {
  const result = await run("class Example {\n a = 1;\n b = 2;\n}\n", (path, source) => ({ ...analyzeTypeScript(path, source), adapter: "typescript-compiler" }), 3);
  assert.deepEqual(result.findings.map(f => [f.rule_id, f["symbol"], f["actual"]]), [["quality.large-type", "Example", 4]]);
  assert.deepEqual([...result.symbols], ["<file>", "Example"]);
  assert.deepEqual(result.coverage, { "typescript-compiler": 1 });
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
});

test("optional parser absence retains physical size enforcement", async () => {
  const result = await run("a\r\nb\u2028c\n", () => null, 2);
  assert.equal(result.findings[0]?.["actual"], 3);
  assert.deepEqual(result.coverage, { unenriched: 1 });
  assert.equal((await run("", () => null)).findings.length, 0);
});

test("syntax rejection and infrastructure failure never become successful fallback", async () => {
  for (const syntax of [true, false]) {
    const result = await run("sensitive", () => { throw syntax ? new SourceSyntaxError("sensitive diagnostic", 7) : new Error("sensitive diagnostic"); });
    assert.equal(result.findings[0]?.rule_id, syntax ? "quality.parse-failed" : "quality.engine-failed");
    assert.equal(result.findings[0]?.line, syntax ? 7 : 1);
    assert.equal(result.symbols.size, 0);
    assert.equal(JSON.stringify(result.findings).includes("sensitive"), false);
    assert.deepEqual(result.coverage, syntax ? {} : { "engine-failed": 1 });
  }
});
