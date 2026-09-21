import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableJson } from "../src/core.ts";
import { checkTelemetry, reviewCheckRun } from "../src/check-telemetry.ts";

test("telemetry separates failures and missing projections, filters scope and never invents token savings", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "check-telemetry-")));
  try {
    const add = (status: string, duration: number, stage = "pre-commit", workspace = root) => {
      const id = randomUUID(); durableJson(join(root, id, "metrics.json"), { version: 1, run_id: id, workspace, stage, runtime_version: "3.0.0-preview.1", status, duration_ms: duration,
        started_at: "2026-09-20T12:00:00Z", ended_at: "2026-09-20T12:00:01Z", termination_reason: status === "failed" ? "cancelled" : "completed", pack_count: 1, command_count: 1, blocked_pack_count: 0, result_digest: "sha256:" + "a".repeat(64) });
      return id;
    };
    const reviewed = add("passed", 100); add("failed", 300); add("passed", 500, "pre-push"); add("passed", 900, "pre-commit", "/other-workspace");
    const missing = randomUUID(); durableJson(join(root, missing, "run.json"), { version: 1, id: missing, root, started_at: "2026-09-20T12:00:00Z", plan: { stage: "pre-commit" } });
    assert.equal(checkTelemetry(root, root, { runtimeVersion: "2.8.2" }).matched_runs, 0);
    assert.equal(checkTelemetry(root, root, { runtimeVersion: "3.0.0-preview.1" }).matched_runs, 3);
    assert.throws(() => reviewCheckRun(root, root, "../escape", "mixed"));
    assert.throws(() => reviewCheckRun(root, root, reviewed, "arbitrary"));
    const otherWorkspace = realpathSync(mkdtempSync(join(tmpdir(), "other-review-")));
    try { assert.throws(() => reviewCheckRun(root, otherWorkspace, reviewed, "mixed")); }
    finally { rmSync(otherWorkspace, { recursive: true, force: true }); }
    reviewCheckRun(root, root, reviewed, "false-positive");
    assert.equal(checkTelemetry(root, root).review_disposition_counts["false-positive"], 1);
    reviewCheckRun(root, root, reviewed, "confirmed-issue");
    assert.equal(checkTelemetry(root, root).review_disposition_counts["confirmed-issue"], 1);
    durableJson(join(root, reviewed, "review.json"), { version: 1, run_id: reviewed, result_digest: "sha256:" + "b".repeat(64), disposition: "mixed" });
    assert.equal(checkTelemetry(root, root).review_disposition_counts["invalid-review"], 1);
    assert.equal(checkTelemetry(root, root, { trigger: "manual" }).matched_runs, 0);
    const result = checkTelemetry(root, root, { stage: "pre-commit" });
    assert.equal(result.expectation_counts.unspecified, 2);
    assert.deepEqual(result.counts, { passed: 1, warning: 0, failed: 1, cancelled: 1, unfinished_or_unprojected: 1, invalid: 0 });
    assert.deepEqual(result.elapsed_ms, { samples: 2, median: 100, p95: 300, total: 400 });
    assert.equal(result.model_tokens, null); assert.equal(result.benefit_claim, "not-evaluated");
    assert.equal(checkTelemetry(root, root, { since: "2026-09-21" }).matched_runs, 0);
    assert.equal(checkTelemetry(root, root, { limit: 1 }).truncated, true);
    assert.throws(() => checkTelemetry(root, root, { since: "invalid" }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
