import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "yaml";
import { pythonCommentFindings } from "../src/checkers/python-comments.ts";
import { runParser } from "../src/checkers/native-parser-process.ts";
const defaults = new URL("../../../src/project_governance_runtime/defaults/", import.meta.url);

test("Python comment adapter passes all shipped active fixture expectations", async () => {
  const policy = parse(readFileSync(new URL("policies/source-comments.yaml", defaults), "utf8"));
  const registry = parse(readFileSync(new URL("policies/source-comment-adapters.yaml", defaults), "utf8"));
  for (const fixture of registry.adapters.find((entry: { language: string }) => entry.language === "python").fixture_cases) {
    const source = readFileSync(new URL(`fixtures/comment-quality/${basename(fixture.path)}`, defaults), "utf8");
    const findings = await pythonCommentFindings(fixture.path, source, null, fixture.boundary_required ? { ...policy, boundary_globs: [fixture.path] } : policy,
      { enforceAll: true, overviewBlocking: true, ranges: [] });
    assert.deepEqual(findings.filter(f => f.severity === "blocking").map(f => f.rule_id).sort(), fixture.expected_blocking_rule_ids.slice().sort(), fixture.id);
  }
});

test("body changes preserve advisory debt while new declarations and touched decorators block", async () => {
  const before = "def existing():\n return 1\n";
  const source = "def existing():\n return 2\n\ndef added():\n return 3\n";
  const findings = await pythonCommentFindings("source.py", source, before, {}, { enforceAll: false, overviewBlocking: false, ranges: [[2, 2], [5, 5]] });
  assert.equal(findings.find(f => f["declaration"] === "existing")?.severity, "advisory");
  assert.equal(findings.find(f => f["declaration"] === "added")?.severity, "blocking");
  const decorated = "@wrapper\ndef existing():\n return 1\n";
  const changed = await pythonCommentFindings("source.py", decorated, decorated, {}, { enforceAll: false, overviewBlocking: false, ranges: [[1, 1]] });
  assert.equal(changed.find(f => f["declaration"] === "existing")?.severity, "blocking");
});

test("valid conditional and lambda bodies preserve current and historical comment enforcement", async () => {
  const before = "def existing(flag):\n return 1 if flag else 2\n\nselect = lambda values: values[0]\n\ntry:\n inspect()\nexcept Exception:\n recover()\n";
  const source = before.replace("1 if flag else 2", "2 if flag else 1") + "\ndef added(flag):\n return 3 if flag else 4\n";
  const findings = await pythonCommentFindings("source.py", source, before, {}, { enforceAll: false, overviewBlocking: false, ranges: [[2, 2]] });
  assert.ok(!findings.some(finding => finding.rule_id === "SC010"), "Both valid source images must reach comment policy");
  assert.equal(findings.find(finding => finding["declaration"] === "existing")?.severity, "advisory");
  assert.equal(findings.find(finding => finding["declaration"] === "added")?.severity, "blocking");
});

test("Python syntax and parser infrastructure failures still block comment checks", async () => {
  const selection = { enforceAll: false, overviewBlocking: false, ranges: [] };
  const invalid = await pythonCommentFindings("source.py", "def broken(:\n", null, {}, selection);
  assert.deepEqual(invalid.map(finding => [finding.rule_id, finding.severity]), [["SC010", "blocking"]]);
  const unavailable = await pythonCommentFindings("source.py", "pass\n", null, {}, selection, async () => null);
  assert.deepEqual(unavailable.map(finding => [finding.rule_id, finding.severity]), [["SC010", "blocking"]]);
  const priorFailure = await pythonCommentFindings("source.py", "pass\n", "pass\n", {}, selection, async (_command, args) => {
    if (args.at(-1)?.endsWith("before.py")) throw new Error("parser failed");
    return runParser("python3", args);
  });
  assert.deepEqual(priorFailure.map(finding => [finding.rule_id, finding.severity]), [["SC010", "blocking"]]);
  assert.match(String(priorFailure[0]!.message), /before-image/u);
});
