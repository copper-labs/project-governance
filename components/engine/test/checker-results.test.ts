import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCheck } from "../src/checker-results.ts";

const result = (status: string, findings: unknown[], exit_code = 0, termination_reason = "completed") => normalizeCheck({ stdout: JSON.stringify({ status, findings }), stderr: "", exit_code, termination_reason }, ["checker"]);

test("inactive findings remain visible without blocking; stale warning envelopes do not create advisory findings", () => {
  const normalized = result("warning", ["accepted", "waived", "suppressed"].map(severity => ({ severity, rule_id: "example" })));
  assert.equal(normalized.status, "passed"); assert.equal(normalized.finding_count, 3);
  assert.equal(normalized.finding_counts["waived"], 1);
  assert.equal(result("passed", [{ severity: "advisory" }]).status, "warning");
  assert.equal(result("passed", [{ severity: "blocking" }]).status, "failed");
});

test("native failure and cancelled execution override passing envelopes", () => {
  assert.equal(result("passed", [], 7).failure_kind, "execution");
  assert.equal(result("passed", [], 0, "timeout").failure_kind, "timeout");
  assert.equal(result("passed", [], 0, "cancelled").status, "failed");
  assert.equal(result("failed", [{ severity: "blocking" }], 1).failure_kind, "check");
});

test("malformed output and unknown severity are blocking integrity failures", () => {
  const invalid = normalizeCheck({ stdout: "log followed by no JSON", stderr: "", exit_code: 0, termination_reason: "completed" }, []);
  assert.equal(invalid.integrity_failure, true); assert.equal(invalid.status, "failed");
  const severity = result("passed", [{ severity: "invented" }]);
  assert.equal(severity.integrity_failure, true); assert.equal(severity.failure_kind, "invalid-output");
  assert.equal(result("invented", []).status, "failed");
  assert.equal(result("failed", []).integrity_failure, true);
});
