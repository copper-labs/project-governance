import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkTelemetry } from "../src/check-telemetry.ts";
import { inspectCheckRun } from "../src/check-status.ts";
import { digest } from "../src/core.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { DatabaseSync } from "node:sqlite";

test("whole check sequence survives submitter exit and a duplicate worker cannot replay it", async () => {
  const root = mkdtempSync(join(tmpdir(), "detached-check-")), runs = join(root, "runs"), repo = join(root, "repo");
  const generationPath = join(root, "generation.sqlite"), generations = new RuntimeGenerations(generationPath);
  const fixture = new DatabaseSync(generationPath);
  fixture.prepare("UPDATE current SET directory=?,revision=1 WHERE id=1").run(root); fixture.close();
  const parent = generations.acquire("check-submitter");
  try {
    mkdirSync(repo); execFileSync("git", ["init", "-q"], { cwd: repo });
    const worker = new URL("../src/check-worker.ts", import.meta.url), assets = fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url));
    const source = `
      import { dispatchChecks } from ${JSON.stringify(worker.href)};
      import { mergePacks } from ${JSON.stringify(new URL("../src/pack-configuration.ts", import.meta.url).href)};
      import { buildPlan } from ${JSON.stringify(new URL("../src/planning.ts", import.meta.url).href)};
      import { resolveChangeScope, ValidationSubject } from ${JSON.stringify(new URL("../src/change-subject.ts", import.meta.url).href)};
      import { PackagedCheckerAssets } from ${JSON.stringify(new URL("../src/checker-assets.ts", import.meta.url).href)};
      const root=${JSON.stringify(repo)};
      const packs=mergePacks([{source:'fixture',origin:'target',value:{id:'fixture',enforcement:'blocking',stages:['pre-commit'],commands:[{run:[process.execPath,'-e',"setTimeout(()=>{require('fs').appendFileSync('count','1');console.log(JSON.stringify({status:'passed',findings:[]}))},200)"]},{run:[process.execPath,'-e',"require('fs').appendFileSync('count','2');console.log(JSON.stringify({status:'passed',findings:[]}))"]}]}}]);
      const scope=resolveChangeScope(root,{all:true});
      console.log(JSON.stringify(dispatchChecks(packs,buildPlan(packs,{stage:'pre-commit',mode:'all',changedPaths:[]}),{subject:new ValidationSubject(root,scope),scope,assets:new PackagedCheckerAssets(${JSON.stringify(assets)}),packIds:new Set(['fixture']),stage:'pre-commit',asOf:'2026-09-20T12:00:00Z'},{root:${JSON.stringify(runs)},deadlineMs:3000,trigger:"test",expectedStatus:"failed"})));
    `;
    const submitted = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 5000,
      env: { ...process.env, GOVERNANCE_GENERATION_REGISTRY: generationPath, GOVERNANCE_GENERATION_TOKEN: parent.token, GOVERNANCE_GENERATION_OWNER: parent.owner } }));
    generations.release(parent.token, parent.owner);
    assert.equal(generations.state().readers.length, 1);
    let observed = inspectCheckRun(submitted.run_id, runs);
    const deadline = Date.now() + 10000;
    while ((observed.state !== "terminal" || generations.state().readers.length) && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); observed = inspectCheckRun(submitted.run_id, runs); }
    assert.equal(generations.state().readers.length, 0);
    assert.equal(generations.state().written, true);
    assert.equal(observed.state, "terminal"); assert.equal(observed.status, "passed");
    assert.equal(checkTelemetry(runs,repo).expectation_counts.unexpected,1);
    assert.equal(readFileSync(join(repo, "count"), "utf8"), "12");
    assert.equal(JSON.parse(readFileSync(join(submitted.run_directory, "metrics.json"), "utf8")).trigger, "test");
    assert.equal(JSON.parse(readFileSync(join(submitted.run_directory, "metrics.json"), "utf8")).expected_status, "failed");
    const work = JSON.parse(readFileSync(join(submitted.run_directory, "dispatch.json"), "utf8"));
    assert.throws(() => execFileSync(process.execPath, [fileURLToPath(worker), "--worker", submitted.run_directory, digest(work)], { stdio: "pipe" }));
    assert.equal(readFileSync(join(repo, "count"), "utf8"), "12");
  } finally { generations.close(); rmSync(root, { recursive: true, force: true }); }
});
