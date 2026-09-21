import { test } from "node:test";
import assert from "node:assert/strict";
import { coordinateKey, indexDependencyEvidence } from "../src/checkers/dependency-evidence.ts";
import { dependency } from "../src/checkers/dependency-manifests.ts";
import { dependencyMoment } from "../src/checkers/dependency-time.ts";
const coordinate = dependency("pkg", "npm", "1.2.3", "direct"), key = coordinateKey(coordinate);
const record = { ...coordinate, published_at: "2026-09-01", evaluated_at: "2026-09-15", source_url: "https://registry.npmjs.org/pkg/1.2.3" };
const run = (records: unknown[]) => indexDependencyEvidence({ version: 2, owner: "team", records }, 14, dependencyMoment("2026-09-20", "as_of"), new Set([key]));

test("exact coordinate evidence meets the full-day age gate and ignores unrelated records", () => {
  const result = run([record, { ...record, name: "other", evaluated_at: "invalid" }]);
  assert.deepEqual(result.errors, []); assert.equal(result.indexed.size, 1); assert.equal(result.matched.size, 1);
  for (const changes of [{ evaluated_at: "2026-09-14T23:59:59.999999Z" }, { evaluated_at: "2026-09-21" }, { source_url: "https://registry.npmjs.org/other/1.2.3" }, { invented: true }]) {
    const invalid = run([{ ...record, ...changes }]); assert.ok(invalid.errors.length); assert.equal(invalid.indexed.size, 0); assert.ok(invalid.matched.has(key));
  }
});

test("duplicates and incompatible registries cannot leave accepted evidence behind", () => {
  const result = run([record, record]); assert.equal(result.indexed.size, 0); assert.match(result.errors.join(" "), /duplicate/u);
  const legacy = indexDependencyEvidence({ version: 1, owner: "team", records: [record] }, 14, dependencyMoment("2026-09-20", "as_of"), new Set([key]));
  assert.equal(legacy.indexed.size, 0); assert.ok(legacy.matched.has(key)); assert.match(legacy.errors[0]!, /migrate/u);
});
