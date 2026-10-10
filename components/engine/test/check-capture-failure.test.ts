import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { DatabaseSync } from "node:sqlite";
import { digest } from "../src/core.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { dispatchChecks } from "../src/check-worker.ts";
import { inspectCheckRun } from "../src/check-status.ts";

test("detached capture failures retain bounded cause and never dispatch a native command", async () => {
  const root = mkdtempSync(join(tmpdir(), "check-capture-failure-")), runs = mkdtempSync(join(tmpdir(), "check-capture-runs-"));
  let stopped = false;
  const registry = join(runs, "registry.sqlite"), generations = new RuntimeGenerations(registry);
  const fixtureDb = new DatabaseSync(registry); fixtureDb.prepare("UPDATE current SET directory=?,revision=1 WHERE id=1").run(root); fixtureDb.close();
  const parent = generations.acquire("fixture-parent");
  const names = ["GOVERNANCE_GENERATION_REGISTRY", "GOVERNANCE_GENERATION_TOKEN", "GOVERNANCE_GENERATION_OWNER"];
  const saved = names.map(name => process.env[name]);
  Object.assign(process.env, { GOVERNANCE_GENERATION_REGISTRY: registry, GOVERNANCE_GENERATION_TOKEN: parent.token, GOVERNANCE_GENERATION_OWNER: parent.owner });
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    git("commit", "--allow-empty", "-qm", "base");
    writeFileSync(join(root, "oversized.zip"), Buffer.alloc(17 * 1024 * 1024));
    const scope = resolveChangeScope(root, { baseRef: "HEAD" });
    const packs = mergePacks([{ source: "fixture", origin: "target", value: { id: "fixture", enforcement: "blocking", stages: ["pre-push"], commands: [{ run: [process.execPath, "-e", "require('fs').writeFileSync('executed','wrong');console.log(JSON.stringify({status:'passed',findings:[]}))"] }] } }]);
    const submitted = dispatchChecks(packs, buildPlan(packs, { stage: "pre-push", mode: "impacted", changedPaths: ["oversized.zip"] }),
      { subject: new ValidationSubject(root, scope), scope, assets: new PackagedCheckerAssets(resolve("src/project_governance_runtime/defaults")), packIds: new Set(["fixture"]), stage: "pre-push", asOf: "2026-10-10T00:00:00Z" }, { root: runs, deadlineMs: 15000 });
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
    generations.release(parent.token, parent.owner);
    let observed = inspectCheckRun(submitted.run_id, runs); const deadline = Date.now() + 20000;
    while ((observed.state !== "incomplete" || observed.orchestrator_failure?.["reason"] !== "change-packet-capture-failed" || generations.state().readers.length) && Date.now() < deadline) { await new Promise(done => setTimeout(done, 100)); observed = inspectCheckRun(submitted.run_id, runs); }
    stopped = observed.state === "incomplete" && observed.orchestrator_failure?.["reason"] === "change-packet-capture-failed" && generations.state().readers.length === 0;
    assert.ok(stopped); assert.equal(generations.state().readers.length, 0); assert.equal(existsSync(join(root, "executed")), false); assert.equal(existsSync(join(submitted.run_directory, "result.json")), false);
    assert.deepEqual(observed.commands, []);
    assert.equal(observed.orchestrator_failure?.["reason"], "change-packet-capture-failed");
    assert.equal(observed.orchestrator_failure?.["phase"], "packet-capture");
    assert.equal(observed.orchestrator_failure?.["commands_started"], false);
    assert.deepEqual(observed.orchestrator_failure?.["capture"], { reason: "source-over-limit", record: 0, side: "after", source_kind: "worktree", path_digest: digest("oversized.zip"), size_bytes: 17 * 1024 * 1024, limit_bytes: 16 * 1024 * 1024 });
    const original = readFileSync(join(submitted.run_directory, "failure.json"));
    const work = JSON.parse(readFileSync(join(submitted.run_directory, "dispatch.json"), "utf8"));
    assert.throws(() => execFileSync(process.execPath, [resolve("components/engine/src/check-worker.ts"), "--worker", submitted.run_directory, digest(work)], { stdio: "pipe" }));
    assert.deepEqual(readFileSync(join(submitted.run_directory, "failure.json")), original);
  } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); generations.close(); if (stopped) { rmSync(root, { recursive: true, force: true }); rmSync(runs, { recursive: true, force: true }); } }
});
