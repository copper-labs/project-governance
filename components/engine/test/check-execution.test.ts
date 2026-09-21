import { test } from "node:test";
import assert from "node:assert/strict";
import { executeChecks } from "../src/check-execution.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import type { BuiltinCheckRequest } from "../src/builtin-checks.ts";

test("failed prerequisites block dependents while independent checks still run", async () => {
  const packs = mergePacks(["first", "dependent", "independent"].map(id => ({ source: id, origin: "target" as const, value: {
    id, stages: ["pre-commit"], enforcement: "blocking", path_globs: [], commands: [{ builtin: "format" }], depends_on: id === "dependent" ? ["first"] : [],
  } })));
  const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] });
  let calls = 0;
  const result = await executeChecks(packs, plan, {} as Omit<BuiltinCheckRequest, "id">, async () => {
    calls++; return calls === 1 ? { status: "failed", findings: [{ rule_id: "format.trailing-space", severity: "blocking" }] } : { status: "passed", findings: [] };
  });
  assert.equal(result.status, "failed"); assert.equal(calls, 2); assert.deepEqual(result.blocked, { dependent: ["first"] });
});
test("unsupported commands and checker infrastructure errors cannot become advisory passes", async () => {
  const packs = mergePacks([{ source: "example", origin: "target", value: { id: "example", stages: ["pre-commit"], enforcement: "advisory", commands: [{ argv: ["example"] }] } }]);
  const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] });
  const result = await executeChecks(packs, plan, {} as Omit<BuiltinCheckRequest, "id">);
  assert.equal(result.status, "failed");
  assert.equal(result.results[0]?.commands[0]?.findings[0]?.rule_id, "checker.command-unsupported");
});
