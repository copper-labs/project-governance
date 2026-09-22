import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { digest, durableJson } from "../src/core.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("normal status delivery is compact, full retrieval is explicit, and native evidence stays unchanged", () => {
  const state = mkdtempSync(join(tmpdir(), "check-status-cli-")), id = randomUUID();
  const directory = join(state, "project-governance", "check-runs", id);
  try {
    mkdirSync(directory, { recursive: true });
    durableJson(join(directory, "run.json"), { version: 1, id, plan: { execution_order: [] }, owner: null });
    const result = { run_id: id, run_directory: directory, status: "failed", termination_reason: "completed",
      plan: { changed_paths: ["private-source-path"], selected_packs: ["example"], execution_order: ["example"] },
      results: [{ pack_id: "example", status: "failed", commands: [{ status: "failed", stdout: "raw-log ".repeat(12000),
        findings: [{ severity: "blocking", rule_id: "example.failure", message: "Retain the actual failure" }],
        command_receipt: { state: "failed", cleanup: "confirmed", exitCode: 1, log: join(directory, "output.log") } }] }] };
    const path = join(directory, "result.json"); durableJson(path, result);
    const before = readFileSync(path);
    const invoke = (extra: string[] = []) => spawnSync(process.execPath, [cli, "check-status", "--run", id, ...extra], {
      encoding: "utf8", env: { ...process.env, XDG_STATE_HOME: state }, maxBuffer: 1024 * 1024,
    });
    const compact = invoke(); assert.equal(compact.status, 1, compact.stderr);
    const observed = JSON.parse(compact.stdout);
    assert.equal(observed.state, "terminal"); assert.equal(observed.status, "failed");
    assert.equal(observed.result.findings[0].message, "Retain the actual failure");
    assert.deepEqual(observed.result.cleanup, { observed_commands: 1, confirmed: 1 });
    assert.equal(observed.result.evidence.path, path); assert.equal(observed.result.evidence.digest, digest(result));
    assert.doesNotMatch(compact.stdout, /raw-log|private-source-path/);
    const full = invoke(["--full"]); assert.equal(full.status, 1, full.stderr);
    assert.deepEqual(JSON.parse(full.stdout).result, result);
    assert.ok(Buffer.byteLength(compact.stdout) < Buffer.byteLength(full.stdout) / 10);
    assert.deepEqual(readFileSync(path), before);
    durableJson(path, { ...result, status: "passed", results: [] });
    assert.equal(invoke().status, 0);
    assert.equal(invoke(["--full"]).status, 0);
    rmSync(path);
    assert.equal(invoke().status, 2);
  } finally { rmSync(state, { recursive: true, force: true }); }
});
