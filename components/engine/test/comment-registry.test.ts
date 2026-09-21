import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { applyCommentWaivers, validateCommentRegistry } from "../src/checkers/comment-registry.ts";
import type { Finding } from "../src/checker-results.ts";
const load = (name: string) => ({ path: `config/policies/${name}.yaml`,
  value: parse(readFileSync(new URL(`../../../src/project_governance_runtime/defaults/policies/${name}.yaml`, import.meta.url), "utf8")),
  schema: JSON.parse(readFileSync(new URL(`../../../src/project_governance_runtime/defaults/schemas/${name}.schema.json`, import.meta.url), "utf8")) });

test("shipped comment registry validates and missing proof blocks active claims", () => {
  const policy = load("source-comments"), registry = load("source-comment-adapters"), waivers = load("source-comment-waivers");
  const declaredProof = { versionSupported: () => true, fixtureExists: () => true };
  assert.deepEqual(validateCommentRegistry(policy, registry, waivers, declaredProof, "2026-09-20").findings, []);
  const unsupported = validateCommentRegistry(policy, registry, waivers, { ...declaredProof, versionSupported: () => false }, "2026-09-20");
  assert.equal(unsupported.findings.length, 2);
  assert.ok(unsupported.findings.every(f => f.rule_id === "SC010" && f.severity === "blocking"));
  registry.value.adapters.push(registry.value.adapters[0]);
  assert.ok(validateCommentRegistry(policy, registry, waivers, declaredProof, "2026-09-20").findings.some(f => String(f["message"]).includes("duplicate")));
});

test("comment waivers cannot escape exact declaration scope or waive integrity failures", () => {
  const finding: Finding = { rule_id: "SC005", path: "src/a.py", declaration: "A.read", adapter_id: "python", severity: "blocking" };
  const waiver = { rule_id: "SC005", path: "src/a.py", declaration: "A.read", adapter_id: "python", expires: "2026-10-01", owner: "team", rationale: "Tracked migration" };
  assert.equal(applyCommentWaivers([finding], { waivers: [waiver] }, "2026-09-20")[0]?.severity, "waived");
  for (const change of [{ declaration: "A.write" }, { expires: "2026-09-19" }, { expires: "2026-02-30" }, { owner: "" }, { path: "src/../src/a.py" }])
    assert.equal(applyCommentWaivers([finding], { waivers: [{ ...waiver, ...change }] }, "2026-09-20")[0]?.severity, "blocking");
  assert.equal(applyCommentWaivers([{ ...finding, rule_id: "SC010" }], { waivers: [{ ...waiver, rule_id: "SC010" }] }, "2026-09-20")[0]?.severity, "blocking");
  assert.equal(finding.severity, "blocking");
});
