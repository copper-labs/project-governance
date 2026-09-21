import { workflowOperation } from "../src/workflow-operation.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { executeWorkflow } from "../src/workflow-executor.ts";

function fixture(fails: boolean, resources = ["fixture:device"], captureEnvironment = false, loseSupervisor = false) {
  const dir = mkdtempSync(join(tmpdir(), "engine-execute-")), path = join(dir, "ledger.sqlite");
  const continuity = new Store(path), store = new WorkflowStore(path), registry = new ResourceRegistry(join(dir, "resources.sqlite"));
  const task = continuity.createTask("execute native tests", [{ kind: "scope", provenance: "operator", body: dir }]);
  const policy = defaultPolicy();
  const request = { operation: "check" as const, scope: [dir], targets: [], destination: null, policyRevision: policy.revision };
  const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, dir);
  const op = (code: string) => ({ argv: [process.execPath, "-e", code], cwd: dir, effect: "local" });
  const recipe = parseRecipe({ version: 1, id: "native", workspace: dir, inputs: [], resources,
    operations: { test: op(loseSupervisor ? "setInterval(()=>{},1000)" : captureEnvironment ? `require("fs").writeFileSync(require("path").join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,"identity.json"), JSON.stringify({run:process.env.PROJECT_GOVERNANCE_WORKFLOW_RUN_ID,stage:process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ID}))` : `process.exit(${fails ? 7 : 0})`), later: op("require('fs').writeFileSync('later','ran')"), cleanup: op(captureEnvironment ? "require('fs').writeFileSync('cleaned', process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ARTIFACTS_JSON)" : "require('fs').writeFileSync('cleaned','yes')") },
    stages: [{ id: "test", operation: "test", deadlineMs: loseSupervisor ? 10000 : 1000 }, { id: "later", operation: "later", dependsOn: ["test"], deadlineMs: 1000 },
      { id: "cleanup", operation: "cleanup", cleanup: true, deadlineMs: 1000 }],
    deadlineMs: 5000, policyRevision: policy.revision, claims: ["native fixture"] });
  const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:test",
    recipe, recipeDigest: recipeDigest(recipe), operationId: "fixture" };
    store.authorizeWorkflow(binding);
    const run = store.submit(binding);
  return { dir, store, registry, run, close() { store.close(); registry.close(); continuity.close(); rmSync(dir, { recursive: true }); } };
}

test("native workflow preserves failure, skips dependents and executes cleanup before releasing", async () => {
  const f = fixture(true);
  try {
    const result = await executeWorkflow(f.store, f.run.id, { commandsDirectory: join(f.dir, "commands"), registry: f.registry,
      observeCleanup: async () => existsSync(join(f.dir, "cleaned")) ? "fixture cleanup observed" : null });
    assert.equal(result.state, "failed");
    assert.deepEqual(f.store.stages(f.run.id).map(s => s.state), ["failed", "blocked", "succeeded"]);
    assert.equal(f.store.stages(f.run.id)[0]!.result!.exitCode, 7);
    assert.equal(existsSync(join(f.dir, "later")), false);
    assert.equal(f.registry.inspect()[0]!.state, "released");
  } finally { f.close(); }
});

test("successful commands cannot conceal an unresolved resource obligation", async () => {
  const f = fixture(false);
  try {
    const result = await executeWorkflow(f.store, f.run.id, { commandsDirectory: join(f.dir, "commands"), registry: f.registry,
      observeCleanup: async () => null });
    assert.equal(result.state, "unknown");
    assert.equal(f.registry.inspect()[0]!.state, "held");
    assert.ok(f.store.stages(f.run.id).every(s => s.state === "succeeded"));
  } finally { f.close(); }
});

test("complete native workflow releases only after resource readback", async () => {
  const f = fixture(false);
  try {
    const result = await executeWorkflow(f.store, f.run.id, { commandsDirectory: join(f.dir, "commands"), registry: f.registry,
      observeCleanup: async () => "fixture resource observed clean" });
    assert.equal(result.state, "succeeded");
    assert.equal(existsSync(join(f.dir, "later")), true);
    assert.equal(f.registry.inspect()[0]!.state, "released");
    await assert.rejects(executeWorkflow(f.store, f.run.id, { commandsDirectory: join(f.dir, "commands"), registry: f.registry,
      observeCleanup: async () => "unused" }), /claimed or stale/);
  } finally { f.close(); }
});

test("cancellation before dispatch skips ordinary work but retains cleanup", async () => {
  const f = fixture(false);
  try {
    f.store.cancel(f.run.id, "host:cancel");
    const result = await executeWorkflow(f.store, f.run.id, { commandsDirectory: join(f.dir, "commands"), registry: f.registry,
      observeCleanup: async () => existsSync(join(f.dir, "cleaned")) ? "cleanup readback" : null });
    assert.equal(result.state, "cancelled");
    assert.deepEqual(f.store.stages(f.run.id).map(s => s.state), ["cancelled", "cancelled", "succeeded"]);
    assert.equal(existsSync(join(f.dir, "later")), false);
    assert.equal(f.registry.inspect()[0]!.state, "released");
  } finally { f.close(); }
});

test("cleanup continuation keeps failed work and skips undispatched ordinary stages", async () => {
  const f=fixture(true, ["fixture:device"], true);
  try {
    const run=f.store.claim(f.run.id,f.run.revision,"stopped-worker");
    f.registry.acquire(run.binding.recipe.resources,run.owner!,run.id);
    f.store.stage(run.id,run.owner!,"test","running");
    const failed={state:"failed" as const,exitCode:7,cleanup:"confirmed" as const,startedAt:"start",endedAt:"end",log:"original",inputValidity:"valid" as const,detail:"exit"};
    f.store.stage(run.id,run.owner!,"test","failed",failed);
    const unknown=f.store.transition(run.id,run.owner!,run.revision,"unknown");
    const {digest}=await import("../src/core.ts");
    const continuation={revision:unknown.revision,stagesDigest:digest(f.store.stages(run.id))};
    const result=await executeWorkflow(f.store,run.id,{commandsDirectory:join(f.dir,"commands"),registry:f.registry,
      cleanupContinuation:continuation,observeCleanup:async()=>existsSync(join(f.dir,"cleaned"))?"observed cleanup":null});
    assert.equal(result.state,"failed");
    assert.deepEqual(f.store.stages(run.id).map(stage=>stage.state),["failed","blocked","succeeded"]);
    assert.deepEqual(f.store.stages(run.id)[0]!.result,failed);
    assert.equal(existsSync(join(f.dir,"later")),false);
    assert.equal(existsSync(join(f.dir,"commands",`${run.id}-0`)),false);
    assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "cleaned"), "utf8")), {
      test: join(f.dir, "commands", `${run.id}-0-artifacts`), later: join(f.dir, "commands", `${run.id}-1-artifacts`),
    });
    assert.equal(f.registry.inspect()[0]!.state,"released");
    await assert.rejects(executeWorkflow(f.store,run.id,{commandsDirectory:join(f.dir,"commands"),registry:f.registry,
      cleanupContinuation:continuation,observeCleanup:async()=>"unused"}));
  } finally {f.close();}
});

test("cleanup continuation refuses unresolved commands before dispatch", async()=>{
 const f=fixture(false);
 try {
  const run=f.store.claim(f.run.id,f.run.revision,"stopped-worker");
  f.registry.acquire(run.binding.recipe.resources,run.owner!,run.id);
  f.store.stage(run.id,run.owner!,"test","running");
  const unknown=f.store.transition(run.id,run.owner!,run.revision,"unknown");
  const {digest}=await import("../src/core.ts");
  await assert.rejects(executeWorkflow(f.store,run.id,{commandsDirectory:join(f.dir,"commands"),registry:f.registry,
   cleanupContinuation:{revision:unknown.revision,stagesDigest:digest(f.store.stages(run.id))},observeCleanup:async()=>"unused"}),/effects remain unresolved/);
  assert.equal(f.store.read(run.id).state,"unknown");assert.equal(existsSync(join(f.dir,"cleaned")),false);
  assert.equal(f.registry.inspect()[0]!.state,"held");
 } finally {f.close();}
});

test("public cleanup continuation runs only pending cleanup after original worker exit", async()=>{
 const f=fixture(true,[]);
 try {
  const {writeFileSync,mkdirSync}=await import("node:fs");
  const {spawnSync}=await import("node:child_process");
  const {fileURLToPath}=await import("node:url");
  const {digest}=await import("../src/core.ts");
  const run=f.store.claim(f.run.id,f.run.revision,"original-worker");
  f.store.stage(run.id,run.owner!,"test","running");
  f.store.stage(run.id,run.owner!,"test","failed",{state:"failed",exitCode:7,cleanup:"confirmed",startedAt:"start",endedAt:"end",log:"original",inputValidity:"valid",detail:"exit"});
  const unknown=f.store.transition(run.id,run.owner!,run.revision,"unknown");
  const directory=join(f.dir,"worker"),commandsDirectory=join(directory,"commands");mkdirSync(commandsDirectory,{recursive:true});
  const request={version:1,runId:run.id,database:f.store.path,bindingDigest:digest(run.binding),commandsDirectory,registry:f.registry.path};
  writeFileSync(join(directory,"request.json"),JSON.stringify(request));
  const dead=spawnSync(process.execPath,["-e",""]);
  writeFileSync(join(directory,"owner.json"),JSON.stringify({requestDigest:digest(request),pid:dead.pid,fingerprint:"exited fixture"}));
  const cli=fileURLToPath(new URL("../src/cli.ts",import.meta.url));
  const response=spawnSync(process.execPath,[cli,"workflow-resume-cleanup","--worker-directory",directory,"--database",f.store.path,"--run",run.id,"--revision",String(unknown.revision)],{encoding:"utf8",timeout:15000});
  assert.equal(response.status,1,response.stderr);
  assert.equal(JSON.parse(response.stdout).run.state,"failed");
  assert.deepEqual(f.store.stages(run.id).map(stage=>stage.state),["failed","blocked","succeeded"]);
  assert.ok(existsSync(join(f.dir,"cleaned")));assert.equal(existsSync(join(f.dir,"later")),false);
  assert.ok(f.store.cleanupWorker(run.id));
 }finally{f.close();}
});

test("a stopped cleanup worker is reconciled without replaying its completed command", async () => {
  const f = fixture(true, []);
  try {
    const { writeFileSync, mkdirSync, readFileSync, readdirSync } = await import("node:fs");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { digest } = await import("../src/core.ts");
    const { submitCommand, waitCommand } = await import("../src/process-owner.ts");
    const run = f.store.claim(f.run.id, f.run.revision, "original-worker");
    const failed = { state: "failed" as const, exitCode: 7, cleanup: "confirmed" as const,
      startedAt: "start", endedAt: "end", log: "original", inputValidity: "valid" as const, detail: "exit" };
    f.store.stage(run.id, run.owner!, "test", "running");
    f.store.stage(run.id, run.owner!, "test", "failed", failed);
    const unknown = f.store.transition(run.id, run.owner!, run.revision, "unknown");
    const directory = join(f.dir, "worker"), commandsDirectory = join(directory, "commands");
    mkdirSync(commandsDirectory, { recursive: true });
    const request = { version: 1, runId: run.id, database: f.store.path, bindingDigest: digest(run.binding),
      commandsDirectory, registry: f.registry.path };
    writeFileSync(join(directory, "request.json"), JSON.stringify(request));
    const original = spawnSync(process.execPath, ["-e", ""]);
    writeFileSync(join(directory, "owner.json"), JSON.stringify({ requestDigest: digest(request),
      pid: original.pid, fingerprint: "exited original fixture" }));
    const stopped = spawnSync(process.execPath, ["-e", ""]);
    // Model a cleanup worker that dispatched but did not record its native result.
    f.store.claimPendingCleanup(run.id, unknown.revision, digest(f.store.stages(run.id)),
      { pid: stopped.pid!, fingerprint: "exited cleanup fixture" });
    f.store.stage(run.id, run.owner!, "cleanup", "running");
    const commandDirectory = join(commandsDirectory, `${run.id}-2`);
    const command = submitCommand(commandDirectory, { id: `${run.id}:cleanup`,
      operation: workflowOperation(run.binding.recipe, run.id, run.binding.recipe.stages[2]!, commandsDirectory), deadlineMs: 1000, outputLimit: 4096 });
    const observed = await waitCommand(commandDirectory, command.requestDigest, 5000);
    assert.equal(observed.receipt?.state, "succeeded");
    const receipt = readFileSync(join(commandDirectory, "result.json"));
    // A sentinel distinguishes observation from executing the same cleanup again.
    writeFileSync(join(f.dir, "cleaned"), "preserve after original cleanup");
    const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const response = spawnSync(process.execPath, [cli, "workflow-resume-cleanup", "--worker-directory", directory,
      "--database", f.store.path, "--run", run.id, "--revision", String(f.store.read(run.id).revision)],
      { encoding: "utf8", timeout: 15000 });
    assert.equal(response.status, 1, response.stderr);
    assert.equal(JSON.parse(response.stdout).run.state, "failed");
    assert.deepEqual(f.store.stages(run.id).map(stage => stage.state), ["failed", "blocked", "succeeded"]);
    assert.deepEqual(f.store.stages(run.id)[0]!.result, failed);
    assert.deepEqual(readFileSync(join(commandDirectory, "result.json")), receipt);
    assert.equal(readFileSync(join(f.dir, "cleaned"), "utf8"), "preserve after original cleanup");
    assert.deepEqual(readdirSync(commandsDirectory), [`${run.id}-2`]);
    assert.equal(existsSync(join(f.dir, "later")), false);
  } finally { f.close(); }
});

test("commands receive execution-owned identity and a fresh artifact destination", async () => {
  const f = fixture(false, [], true);
  try {
    const commandsDirectory = join(f.dir, "commands");
    const result = await executeWorkflow(f.store, f.run.id, { commandsDirectory, registry: f.registry,
      observeCleanup: async () => "no external resources" });
    assert.equal(result.state, "succeeded");
    const identity = JSON.parse(readFileSync(join(commandsDirectory, `${f.run.id}-0-artifacts`, "identity.json"), "utf8"));
    assert.deepEqual(identity, { run: f.run.id, stage: "test" });
    assert.deepEqual(JSON.parse(readFileSync(join(f.dir, "cleaned"), "utf8")), {
      test: join(commandsDirectory, `${f.run.id}-0-artifacts`),
      later: join(commandsDirectory, `${f.run.id}-1-artifacts`),
    });
    assert.deepEqual(f.store.read(f.run.id).binding.recipe.operations.test!.env, {});
  } finally { f.close(); }
});

test("public command recovery releases workflow resources after worker and guardian loss without claiming command success", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { processFingerprint } = await import("../src/process-owner.ts");
  const { digest } = await import("../src/core.ts");
  const f = fixture(false, ["fixture:device"], false, true);
  const commands = join(f.dir, "commands"), commandDirectory = join(commands, `${f.run.id}-0`);
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  let records: Array<{pid:number;fingerprint:string}> = [];
  let execution: ReturnType<typeof executeWorkflow> | undefined;
  try {
    const observation = digest({ kind: "fixture-adapter", appAbsent: true });
    execution = executeWorkflow(f.store, f.run.id, { commandsDirectory: commands, registry: f.registry,
      observeCleanup: async () => existsSync(join(f.dir, "cleaned")) ? observation : null });
    const until = Date.now() + 5000;
    while ((!existsSync(join(commandDirectory, "launch.json")) || !existsSync(join(commandDirectory, "guardian.json")) || !existsSync(join(commandDirectory, "group-members.json"))) && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 20));
    const read = (name: string) => JSON.parse(readFileSync(join(commandDirectory, name), "utf8"));
    const launch = read("launch.json"), guardian = read("guardian.json"), request = read("request.json");
    records = [guardian, launch.owner, launch.child];
    const args = [cli, "command-resume-cleanup", "--directory", commandDirectory, "--digest", digest(request), "--authority", "test:recover"];
    const premature = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 5000 });
    assert.equal(premature.status, 2, "live original worker refuses recovery");
    for (const record of [guardian, launch.owner]) {
      assert.equal(processFingerprint(record.pid), record.fingerprint);
      process.kill(record.pid, "SIGKILL");
    }
    const stoppedBy = Date.now() + 3000;
    while ([guardian, launch.owner].some(record => processFingerprint(record.pid) === record.fingerprint) && Date.now() < stoppedBy)
      await new Promise(resolve => setTimeout(resolve, 20));
    const recovered = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 5000 });
    assert.equal(recovered.status, 0, recovered.stderr);
    const result = await execution;
    assert.equal(result.state, "failed");
    const first = f.store.stages(f.run.id)[0]!.result!;
    assert.equal(first.commandOutcome, "unknown");
    assert.equal(first.cleanup, "confirmed");
    assert.ok(first.cleanupRecovery);
    assert.equal(read("result.json").state, "unknown", "original command receipt remains unknown");
    assert.equal(existsSync(join(f.dir, "later")), false);
    assert.equal(existsSync(join(f.dir, "cleaned")), true);
    assert.equal(f.registry.inspect()[0]!.state, "released");
    assert.equal(f.registry.inspect()[0]!.observation, observation);
  } finally {
    for (const record of records) if (processFingerprint(record.pid) === record.fingerprint) process.kill(record.pid, "SIGKILL");
    if (execution) await execution.catch(() => {});
    f.close();
  }
});
