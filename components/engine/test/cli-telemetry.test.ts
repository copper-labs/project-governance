import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { durableJson } from "../src/core.ts";

test("public telemetry review preserves results and filters versioned status", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "cli-telemetry-")));
  try {
    const state = join(workspace, "state"), id = randomUUID();
    const directory = join(state, "project-governance", "check-runs", id);
    durableJson(join(directory, "result.json"), { status: "failed" });
    const before = readFileSync(join(directory, "result.json"));
    durableJson(join(directory, "metrics.json"), { version: 1, run_id: id, workspace,
      trigger: "test", expected_status: "failed", stage: "pre-commit", runtime_version: "3.0.0-preview.1", status: "failed",
      termination_reason: "completed", duration_ms: 10, started_at: "2026-09-20T12:00:00Z",
      ended_at: "2026-09-20T12:00:01Z", pack_count: 1, command_count: 1,
      blocked_pack_count: 0, result_digest: "sha256:" + "a".repeat(64) });
    const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const call = (args: string[]) => spawnSync(process.execPath, [cli, "telemetry", ...args], {
      cwd: workspace, encoding: "utf8", timeout: 10000, env: { ...process.env, XDG_STATE_HOME: state },
    });
    const reviewed = call(["review", "--run-id", id, "--disposition", "false-positive"]);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(JSON.parse(reviewed.stdout).status, "recorded");
    assert.equal(JSON.parse(call(["status", "--trigger", "manual"]).stdout).matched_runs, 0);
    assert.equal(JSON.parse(call(["status", "--trigger", "test"]).stdout).matched_runs, 1);
    assert.equal(call(["status", "--trigger", "invented"]).status, 2);
    const status = call(["status", "--runtime-version", "3.0.0-preview.1"]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).review_disposition_counts["false-positive"], 1);
    assert.equal(JSON.parse(status.stdout).counts.failed, 1);
    assert.equal(JSON.parse(status.stdout).expectation_counts.matched, 1);
    assert.equal(JSON.parse(call(["status", "--runtime-version", "2.8.2"]).stdout).matched_runs, 0);
    assert.equal(call(["review", "--run-id", id]).status, 2);
    assert.equal(call(["review", "--run-id", id, "--disposition", "passed"]).status, 2);
    assert.deepEqual(readFileSync(join(directory, "result.json")), before);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
