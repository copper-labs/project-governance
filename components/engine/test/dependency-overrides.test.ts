import { test } from "node:test";
import assert from "node:assert/strict";
import { indexDependencyOverrides } from "../src/checkers/dependency-overrides.ts";
import { coordinateKey } from "../src/checkers/dependency-evidence.ts";
import { dependency } from "../src/checkers/dependency-manifests.ts";
import { dependencyMoment } from "../src/checkers/dependency-time.ts";
const coordinate = dependency("pkg", "npm", "1.2.3", "direct"), key = coordinateKey(coordinate);
const record = { ...coordinate, published_at: "2026-09-19", source_url: "https://registry.npmjs.org/pkg/1.2.3", reason: "Required compatibility fix", risk_owner: "team", approved_by: "operator", approver_role: "operator", approved_at: "2026-09-19", expires_at: "2026-09-20", follow_up: "Recheck after release-age threshold", evidence: "Reviewed release changelog" };
const run = (records: unknown[], asOf = "2026-09-20T12:00:00Z") => indexDependencyOverrides({ version: 2, owner: "team", overrides: records }, 1, dependencyMoment(asOf, "now"), new Set([key]));

test("operator overrides require current bounded approval and exact release evidence", () => {
  assert.deepEqual(run([record]).errors, []);
  assert.equal(run([record], "2026-09-20T23:59:59.999999Z").indexed.size, 1);
  for (const patch of [{ approver_role: "agent" }, { expires_at: "2026-09-22" }, { approved_at: "2026-09-21" }, { published_at: "2026-09-20" }, { risk_owner: "" }, { source_url: "https://registry.npmjs.org/pkg/9.0.0" }]) {
    const result = run([{ ...record, ...patch }]); assert.equal(result.indexed.size, 0); assert.ok(result.errors.length);
  }
  assert.equal(run([record], "2026-09-21").indexed.size, 0);
  assert.equal(run([record, record]).indexed.size, 0);
});
