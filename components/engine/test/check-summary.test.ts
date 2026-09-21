import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSummary } from "../src/check-summary.ts";

test("summary preserves failed, blocked and advisory evidence without raw execution data", () => {
  const plan = { status: "blocked", stage: "pre-commit", mode: "impacted", changed_paths: ["secret-source"], selected_packs: ["a"], execution_order: ["a"], blockers: [{ code: "missing", message: "Missing prerequisite", raw: "private" }] };
  const result = { status: "failed", run_id: "run", termination_reason: "cancelled", plan, blocked: { b: ["a"] }, results: [
    { pack_id: "a", status: "failed", commands: [{ status: "failed", termination_reason: "cancelled", stdout: "private-log", argv: ["secret-command"], findings: [{ rule_id: "a.rule", severity: "blocking", message: "Repair input", raw: "private-source" }] }] },
    { pack_id: "c", status: "passed", commands: [{ findings: [{ rule_id: "c.rule", severity: "advisory", message: "Inspect warning" }] }] },
  ] };
  const summary = checkSummary(result);
  assert.equal(summary.status, "failed");
  assert.equal(summary.termination_reason, "cancelled");
  assert.deepEqual(summary.blocked_packs, { b: ["a"] });
  assert.equal((summary.findings as unknown[]).length, 2);
  assert.equal((summary.plan as Record<string, unknown>).changed_path_count, 1);
  assert.equal((summary.nonpassing_packs as unknown[]).length, 1);
  assert.doesNotMatch(JSON.stringify(summary), /private|secret-/);
  assert.match(JSON.stringify(result), /private-log/);
});
