import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "yaml";
import { kotlinCommentFindings } from "../src/checkers/kotlin-comments.ts";
const defaults = new URL("../../../src/project_governance_runtime/defaults/", import.meta.url);

test("Kotlin comment adapter satisfies every shipped active fixture", () => {
  const policy = parse(readFileSync(new URL("policies/source-comments.yaml", defaults), "utf8"));
  const registry = parse(readFileSync(new URL("policies/source-comment-adapters.yaml", defaults), "utf8"));
  for (const fixture of registry.adapters.find((entry: { language: string }) => entry.language === "kotlin").fixture_cases) {
    const source = readFileSync(new URL(`fixtures/comment-quality/${basename(fixture.path)}`, defaults), "utf8");
    const findings = kotlinCommentFindings(fixture.path, source, null, fixture.boundary_required ? { ...policy, boundary_globs: [fixture.path] } : policy,
      { enforceAll: true, overviewBlocking: true, ranges: [] });
    assert.deepEqual(findings.filter(f => f.severity === "blocking").map(f => f.rule_id).sort(), fixture.expected_blocking_rule_ids.slice().sort(), fixture.id);
  }
});

test("Kotlin body-only edits retain advisory debt and new signatures require documentation", () => {
  const before = "fun read(value: Int): Int {\n return value\n}\n";
  const body = kotlinCommentFindings("source.kt", before.replace("return value", "return value + 1"), before, {}, { enforceAll: false, overviewBlocking: false, ranges: [[2, 2]] });
  assert.equal(body.find(f => f.rule_id === "SC005")?.severity, "advisory");
  const changed = kotlinCommentFindings("source.kt", before.replace("value: Int", "value: Long"), before, {}, { enforceAll: false, overviewBlocking: false, ranges: [] });
  assert.equal(changed.find(f => f.rule_id === "SC005")?.severity, "blocking");
});
