import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { analyzeNativeSource } from "../src/checkers/native-analysis.ts";
import { metricKey } from "../src/checkers/source-units.ts";
import { SourceSyntaxError } from "../src/checkers/typescript-analysis.ts";

test("native Python AST preserves qualified declarations and control-flow metrics", async () => {
  const result = await analyzeNativeSource("example.py", "class Example:\n def check(self, value):\n  if value and value > 1:\n   while value:\n    value -= 1\n  return value\n");
  assert.ok(result, "Python toolchain is required for this native integration test");
  assert.deepEqual(result.extents.map(e => [e.kind, e.name, e.start, e.end]), [["type", "Example", 1, 6], ["function", "Example.check", 2, 6]]);
  assert.deepEqual(result.metrics.get(metricKey("Example.check", 2)), [4, 4, 2]);
  await assert.rejects(analyzeNativeSource("invalid.py", "def broken(:"), SourceSyntaxError);
});

test("external parsers consume captured temporary bytes and clean up after failure", async () => {
  let captured = "";
  await assert.rejects(analyzeNativeSource("unavailable/source.swift", "captured source", async (_command, args) => {
    captured = args.at(-1)!;
    assert.equal(await readFile(captured, "utf8"), "captured source");
    throw new Error("deadline");
  }), /deadline/u);
  await assert.rejects(access(captured));
  assert.equal(await analyzeNativeSource("source.swift", "", async () => null), null);
});

test("ShellCheck lint is not syntax failure and Kotlin infrastructure failures cannot pass", async () => {
  const lint = await analyzeNativeSource("script.sh", "echo x", async () => ({ code: 1, stdout: '[{"code":2086}]', stderr: "" }));
  assert.equal(lint?.adapter, "shellcheck");
  await assert.rejects(analyzeNativeSource("script.sh", "", async () => ({ code: 1, stdout: '[{"code":1072,"line":3}]', stderr: "" })), SourceSyntaxError);
  await assert.rejects(analyzeNativeSource("source.kt", "", async () => ({ code: 2, stdout: "", stderr: "compiler crashed" })), /failed/u);
  assert.equal((await analyzeNativeSource("source.kt", "", async () => ({ code: 1, stdout: "", stderr: "unresolved reference: Dependency" })))?.adapter, "kotlin-compiler");
});
