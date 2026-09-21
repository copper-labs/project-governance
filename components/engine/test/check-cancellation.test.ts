import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { processFingerprint } from "../src/process-owner.ts";
import { dispatchChecks } from "../src/check-worker.ts";
import { inspectCheckRun } from "../src/check-status.ts";
import { requestCheckCancellation } from "../src/check-cancellation.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";

test("cancel stops owned native execution and prevents the next command", async () => {
  const root = mkdtempSync(join(tmpdir(), "check-cancel-")), repo = join(root, "repo"), runs = join(root, "runs");
  try {
    mkdirSync(repo); execFileSync("git", ["init", "-q"], { cwd: repo });
    const packs = mergePacks([{ source: "fixture", origin: "target", value: { id: "fixture", enforcement: "blocking", stages: ["pre-commit"], commands: [
      { run: [process.execPath, "-e", "require('fs').writeFileSync('started','yes');setInterval(()=>{},1000)"] },
      { run: [process.execPath, "-e", "require('fs').writeFileSync('should-not-run','yes')"] },
    ] } }]);
    const scope = resolveChangeScope(repo, { all: true });
    const submitted = dispatchChecks(packs, buildPlan(packs, { mode: "all", stage: "pre-commit", changedPaths: [] }), {
      subject: new ValidationSubject(repo, scope), scope, stage: "pre-commit", asOf: "2026-09-20T12:00:00Z", packIds: new Set(["fixture"]),
      assets: new PackagedCheckerAssets(fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url))),
    }, { root: runs, deadlineMs: 10000 });
    const deadline = Date.now() + 12000;
    while (!existsSync(join(repo, "started")) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(existsSync(join(repo, "started")));
    requestCheckCancellation(submitted.run_directory, submitted.run_id, "operator:test");
    let observed = inspectCheckRun(submitted.run_id, runs);
    while (observed.state !== "terminal" && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); observed = inspectCheckRun(submitted.run_id, runs); }
    assert.equal(observed.state, "terminal"); assert.equal(observed.status, "failed");
    assert.equal(observed.result?.["termination_reason"], "cancelled");
    assert.equal(existsSync(join(repo, "should-not-run")), false);
    const commands = (observed.result?.["results"] as Array<{ commands: Array<{ command_receipt: { cleanup: string; reason: string } }> }>)[0]!.commands;
    assert.equal(commands[0]!.command_receipt.reason, "cancelled"); assert.equal(commands[0]!.command_receipt.cleanup, "confirmed");
    // A terminal command result precedes advisory projection and reader release. Do not delete a live worker's directory.
    const intent = JSON.parse(readFileSync(join(submitted.run_directory, "run.json"), "utf8")) as { owner: { pid: number; fingerprint: string } };
    while (processFingerprint(intent.owner.pid) === intent.owner.fingerprint && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.notEqual(processFingerprint(intent.owner.pid), intent.owner.fingerprint, "detached worker must finish before fixture cleanup");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
