import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDependencyPolicy } from "../src/checkers/dependency-policy.ts";
const policy = { version: 1, owner: "team", minimum_age_days: 14, override_max_days: 7, fail_closed_when_unknown: true, evidence_path: "config/evidence.yaml", npm_registries: { "@example": "https://packages.example.invalid" } };
const run = (value: Record<string, unknown>) => validateDependencyPolicy(value, "policy.yaml", "config/evidence.yaml");

test("dependency policy cannot weaken release age or unknown-evidence enforcement", () => {
  assert.deepEqual(run(policy).findings, []);
  const result = run({ ...policy, minimum_age_days: 1, override_max_days: false, fail_closed_when_unknown: false, evidence_path: "other.yaml", npm_registries: { "@example": "http://packages.example.invalid" } });
  assert.equal(result.findings.length, 5);
  assert.equal(result.minimumAgeDays, 14); assert.equal(result.maximumOverrideDays, 1); assert.deepEqual(result.registries, {});
  assert.ok(run({ ...policy, extra: true }).findings.length);
});
