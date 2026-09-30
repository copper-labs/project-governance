import { test } from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeNativeSource } from "../src/checkers/native-analysis.ts";
import { parsePythonAst, type AstNode } from "../src/checkers/python-analysis.ts";
import { metricKey } from "../src/checkers/source-units.ts";
import { SourceSyntaxError } from "../src/checkers/typescript-analysis.ts";

test("native Python AST preserves qualified declarations and control-flow metrics", async () => {
  const result = await analyzeNativeSource("example.py", "class Example:\n def check(self, value):\n  if value and value > 1:\n   while value:\n    value -= 1\n  return value\n");
  assert.ok(result, "Python toolchain is required for this native integration test");
  assert.deepEqual(result.extents.map(e => [e.kind, e.name, e.start, e.end]), [["type", "Example", 1, 6], ["function", "Example.check", 2, 6]]);
  assert.deepEqual(result.metrics.get(metricKey("Example.check", 2)), [4, 4, 2]);
  await assert.rejects(analyzeNativeSource("invalid.py", "def broken(:"), SourceSyntaxError);
});

test("Python expression bodies and unnamed exception handlers retain valid AST identity", async t => {
  const directory = await mkdtemp(join(tmpdir(), "governance-python-shapes-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "source.py");
  await writeFile(input, '"""Module overview."""\n@decorate\ndef choose(flag):\n """Select an option."""\n return left() if flag else None\n\nselect = lambda values: values[0]\ntry:\n choose(True)\nexcept Exception:\n recover()\n');
  const tree = await parsePythonAst(input);
  assert.ok(tree);
  const descendants = (node: AstNode): AstNode[] => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(tree);
  assert.equal(tree.doc, "Module overview.");
  const choose = nodes.find(node => node.kind === "FunctionDef");
  assert.equal(choose?.doc, "Select an option.");
  assert.deepEqual(choose?.decorators, [2]);
  for (const [kind, bodyKind] of [["IfExp", "Call"], ["Lambda", "Subscript"]]) {
    const node = nodes.find(item => item.kind === kind);
    assert.ok(node, kind);
    assert.equal(node.body.length, 1, kind);
    assert.equal(node.children[node.body[0]!]!.kind, bodyKind, kind);
  }
  assert.equal(nodes.find(node => node.kind === "ExceptHandler")?.name, "");
  for (const node of nodes) {
    assert.ok(Number.isInteger(node.start) && node.start >= 1, node.kind);
    assert.ok(Number.isInteger(node.end) && node.end >= node.start, node.kind);
  }
  await assert.rejects(parsePythonAst("unused.py", async () => ({ code: 0, stdout: JSON.stringify({ ...tree, end: 0 }), stderr: "" })), /Invalid Python AST/u);
});

test("Python decorated declaration extents and metrics remain unchanged", async () => {
  const source = '"""Module overview."""\nclass Owner:\n """Owner responsibility."""\n @decorate\n def choose(self, left, right):\n  """Select a result."""\n  if left and right:\n   return left\n  return right\n';
  const result = await analyzeNativeSource("documented.py", source);
  assert.ok(result);
  assert.deepEqual(result.extents.map(e => [e.kind, e.name, e.start, e.end]), [["type", "Owner", 2, 9], ["function", "Owner.choose", 5, 9]]);
  assert.deepEqual(result.metrics.get(metricKey("Owner.choose", 5)), [3, 2, 1]);
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
