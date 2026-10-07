import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkTelemetry } from "../src/check-telemetry.ts";
import { inspectCheckRun } from "../src/check-status.ts";
import { digest } from "../src/core.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { processLiveFingerprint } from "../src/process-owner.ts";
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
      // The fixture proves detached ownership and exactly-once execution, not a three-second startup target on CI hosts.
      console.log(JSON.stringify(dispatchChecks(packs,buildPlan(packs,{stage:'pre-commit',mode:'all',changedPaths:[]}),{subject:new ValidationSubject(root,scope),scope,assets:new PackagedCheckerAssets(${JSON.stringify(assets)}),packIds:new Set(['fixture']),stage:'pre-commit',asOf:'2026-09-20T12:00:00Z'},{root:${JSON.stringify(runs)},deadlineMs:15000,trigger:"test",expectedStatus:"failed"})));
    `;
    const submitted = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 5000,
      env: { ...process.env, GOVERNANCE_GENERATION_REGISTRY: generationPath, GOVERNANCE_GENERATION_TOKEN: parent.token, GOVERNANCE_GENERATION_OWNER: parent.owner } }));
    generations.release(parent.token, parent.owner);
    assert.equal(generations.state().readers.length, 1);
    let observed = inspectCheckRun(submitted.run_id, runs);
    const deadline = Date.now() + 20000;
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

test("declared check credentials cross detached boundaries without leaking or halting independent packs", async () => {
  const root = mkdtempSync(join(tmpdir(), "detached-check-credentials-")), runs = join(root, "runs"), repo = join(root, "repo");
  const canaries = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  let verified = false;
  try {
    mkdirSync(repo); execFileSync("git", ["init", "-q"], { cwd: repo });
    const native = (label: string, declared: boolean) => `
      const fs=require('node:fs');
      const isolated=!process.env.JEV_TOKEN&&!process.env.ENGINE_UNSELECTED_TOKEN&&!process.env.ENGINE_LATER_TOKEN;
      if(!isolated||Boolean(process.env.OPENAI_API_KEY)!==${declared})process.exit(7);
      fs.appendFileSync('calls',${JSON.stringify(label + "\n")});
      console.log(JSON.stringify({status:'passed',findings:[]}));`;
    const command = (label: string, declared = false) => ({ run: [process.execPath, "-e", native(label, declared)], ...(declared ? { credentialEnv: ["OPENAI_API_KEY"] } : {}) });
    const pack = (id: string, commands: unknown[], extra: Record<string, unknown> = {}) => ({ source: "fixture", origin: "target", value: { id, enforcement: "blocking", stages: ["pre-commit"], commands, ...extra } });
    const documents = [pack("a-declared", [command("declared", true), { ...command("wrong-stage", true), stages: ["post-commit"], credentialEnv: ["ENGINE_LATER_TOKEN"] }]),
      pack("b-undeclared", [command("undeclared")]),
      pack("c-missing", [{ ...command("missing"), credentialEnv: ["ENGINE_MISSING_TOKEN"] }, command("after-missing")], { fail_fast: false }),
      pack("d-dependent", [command("dependent")], { depends_on: ["c-missing"] }),
      pack("e-independent", [command("independent")]),
      pack("z-unselected", [{ ...command("unselected"), credentialEnv: ["ENGINE_UNSELECTED_TOKEN"] }])];
    const source = `
      import { dispatchChecks } from ${JSON.stringify(new URL("../src/check-worker.ts", import.meta.url).href)};
      import { mergePacks } from ${JSON.stringify(new URL("../src/pack-configuration.ts", import.meta.url).href)};
      import { buildPlan } from ${JSON.stringify(new URL("../src/planning.ts", import.meta.url).href)};
      import { resolveChangeScope, ValidationSubject } from ${JSON.stringify(new URL("../src/change-subject.ts", import.meta.url).href)};
      import { PackagedCheckerAssets } from ${JSON.stringify(new URL("../src/checker-assets.ts", import.meta.url).href)};
      const root=${JSON.stringify(repo)},packs=mergePacks(${JSON.stringify(documents)}),scope=resolveChangeScope(root,{all:true});
      const plan=buildPlan(packs,{stage:'pre-commit',mode:'all',changedPaths:[],explicitPackIds:['a-declared','b-undeclared','c-missing','d-dependent','e-independent']});
      console.log(JSON.stringify(dispatchChecks(packs,plan,{subject:new ValidationSubject(root,scope),scope,assets:new PackagedCheckerAssets(${JSON.stringify(fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url)))}),packIds:new Set(Object.keys(packs)),stage:'pre-commit',asOf:'2026-10-07T12:00:00Z'},{root:${JSON.stringify(runs)},deadlineMs:20000,trigger:'test',expectedStatus:'failed'})));`;
    const env: NodeJS.ProcessEnv = { ...process.env, OPENAI_API_KEY: canaries[0], JEV_TOKEN: canaries[1], ENGINE_UNSELECTED_TOKEN: canaries[2], ENGINE_LATER_TOKEN: canaries[3] };
    delete env.ENGINE_MISSING_TOKEN;
    const submitted = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 5000, env }));
    let observed = inspectCheckRun(submitted.run_id, runs);
    const deadline = Date.now() + 25000;
    while (observed.state !== "terminal" && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); observed = inspectCheckRun(submitted.run_id, runs); }
    assert.equal(observed.state, "terminal"); assert.equal(observed.status, "failed");
    const result = JSON.parse(readFileSync(join(submitted.run_directory, "result.json"), "utf8"));
    assert.deepEqual(result.results.map((pack: { pack_id: string; status: string }) => [pack.pack_id, pack.status]),
      [["a-declared", "passed"], ["b-undeclared", "passed"], ["c-missing", "failed"], ["e-independent", "passed"]]);
    assert.deepEqual(result.blocked, { "d-dependent": ["c-missing"] });
    const missing = result.results.find((pack: { pack_id: string }) => pack.pack_id === "c-missing").commands[0];
    assert.equal(missing.findings[0].rule_id, "checker.credential-unavailable");
    assert.equal(missing.exit_code, null); assert.equal(missing.command_receipt, undefined);
    assert.equal(readFileSync(join(repo, "calls"), "utf8"), "declared\nundeclared\nafter-missing\nindependent\n");
    const writers: Array<{ pid: number; fingerprint: string }> = [];
    const inspect = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) inspect(path);
        else if (entry.isFile()) {
          const bytes = readFileSync(path);
          assert.ok(canaries.every(value => !bytes.includes(value)), "raw credentials must not appear in retained check evidence");
          if (["owner.json", "guardian.json"].includes(entry.name)) writers.push(JSON.parse(bytes.toString()));
          if (entry.name === "run.json") { const run = JSON.parse(bytes.toString()); if (run.owner) writers.push(run.owner); }
        }
      }
    };
    inspect(runs);
    const writersDeadline = Date.now() + 5000;
    while (writers.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < writersDeadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(writers.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint), "recorded writers must finish before fixture cleanup");
    inspect(runs); verified = true;
  } finally {
    if (verified) rmSync(root, { recursive: true, force: true });
    else console.error(`Preserved synthetic check evidence: ${root}`);
  }
});
