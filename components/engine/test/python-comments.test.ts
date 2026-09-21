import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "yaml";
import { pythonCommentFindings } from "../src/checkers/python-comments.ts";
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
