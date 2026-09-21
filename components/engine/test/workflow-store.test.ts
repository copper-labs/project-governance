import { recoverStoppedWorkflow } from "../src/workflow-worker-recovery.ts";
import { submitCommand, waitCommand, processFingerprint } from "../src/process-owner.ts";
import { releaseRecoveredWorkflowReader } from "../src/workflow-reader-recovery.ts";
import { workflowCommand, workflowExitCode } from "../src/workflow-command.ts";
import { reconcileReleasedWorkflow } from "../src/workflow-resource-recovery.ts";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { parseRecipe, recipeDigest, validateInputs, type RunBinding, type StageResult } from "../src/workflow-types.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ResourceRegistry } from "../src/resources.ts";
import { fileDigest, digest } from "../src/core.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "engine-workflow-")), path = join(dir, "ledger.sqlite");
  writeFileSync(join(dir, "input.txt"), "before");
  const continuity = new Store(path);
  const task = continuity.createTask("prove the fixture", [{ kind: "scope", provenance: "operator", body: dir }]);
  const policy = defaultPolicy();
  const request = { operation: "check" as const, scope: [dir], targets: [join(dir, "input.txt")], destination: null, policyRevision: policy.revision };
  const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, dir);
  const recipe = parseRecipe({ version: 1, id: "fixture", workspace: dir,
    inputs: [{ path: "input.txt", digest: fileDigest(join(dir, "input.txt")) }], resources: ["fixture:device"],
    operations: { check: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: ".", effect: "read" } },
    stages: [{ id: "test", operation: "check", deadlineMs: 1000 }], deadlineMs: 3000, policyDigest: policy.revision, claims: ["fixture passed"] });
  const binding: RunBinding = { taskId: task.taskId, taskVersion: 1, actionId: action.actionId,
    authorityRef: "host:fixture", recipe, recipeDigest: recipeDigest(recipe), operationId: "fixture:1" };
  const approvals = new WorkflowStore(path); approvals.authorizeWorkflow(binding); approvals.close();
  return { dir, path, continuity, task, binding, close() { continuity.close(); rmSync(dir, { recursive: true }); } };
}
const passed: StageResult = { state: "succeeded", exitCode: 0, cleanup: "confirmed", startedAt: "start", endedAt: "end", log: "fixture-log", inputValidity: "valid", detail: "native assertions passed" };

test("lost submission response attaches to one durable run and one worker wins", () => {
  const f = fixture(), a = new WorkflowStore(f.path), b = new WorkflowStore(f.path);
  try {
    const first = a.submit(f.binding);
    assert.equal(b.submit(f.binding).id, first.id);
    assert.throws(() => b.submit({ ...f.binding, authorityRef: "changed" }), /identity conflict/);
    assert.throws(()=>a.blockUnstarted(first.id,"wrong-binding","startup failure"),/binding changed/);
    const claimed = a.claim(first.id, first.revision, "worker-a");
    assert.throws(()=>a.blockUnstarted(first.id,digest(first.binding),"startup failure"),/already started/);
    assert.throws(() => b.claim(first.id, first.revision, "worker-b"), /claimed or stale/);
    assert.throws(() => b.stage(first.id, "worker-b", "test", "running"), /stale workflow owner/);
    a.stage(first.id, "worker-a", "test", "running");
    assert.throws(() => a.transition(first.id, "worker-a", claimed.revision, "succeeded"), /unresolved/);
    a.stage(first.id, "worker-a", "test", "succeeded", passed);
    const done = a.transition(first.id, "worker-a", claimed.revision, "succeeded");
    assert.equal(done.state, "succeeded");
    assert.throws(() => a.transition(first.id, "worker-a", done.revision, "running"), /illegal/);
    assert.equal(b.submit(f.binding).id, first.id, "completed submission does not create new execution");
    assert.equal(a.events(first.id).length, 5);
  } finally { a.close(); b.close(); f.close(); }
});

test("a revised task stops new effects while preserving historical execution", () => {
  const f = fixture(), store = new WorkflowStore(f.path);
  try {
    const run = store.submit(f.binding);
    store.claim(run.id, run.revision, "worker");
    f.continuity.reviseTask(f.task.taskId, [{ kind: "constraint", body: "changed intent", provenance: "operator" }]);
    assert.throws(() => store.stage(run.id, "worker", "test", "running"), /stale or not open/);
    assert.equal(store.read(run.id).binding.taskVersion, 1);
    assert.equal(store.stages(run.id)[0]!.state, "pending");
  } finally { store.close(); f.close(); }
});

test("unknown cleanup cannot become terminal success and cancel is only a request", () => {
  const f = fixture(), store = new WorkflowStore(f.path);
  try {
    const run = store.submit(f.binding), active = store.claim(run.id, run.revision, "worker");
    store.stage(run.id, "worker", "test", "running");
    store.cancel(run.id, "host:cancel");
    assert.equal(store.read(run.id).state, "running");
    store.stage(run.id, "worker", "test", "unknown", { ...passed, state: "unknown", cleanup: "unknown" });
    assert.throws(() => store.transition(run.id, "worker", active.revision, "cancelled"), /unresolved/);
    store.transition(run.id, "worker", active.revision, "unknown");
    assert.equal(store.read(run.id).cancelRequested, true);
  } finally { store.close(); f.close(); }
});

test("recipe boundaries reject injected operations, forward dependencies and changed source", () => {
  const f = fixture();
  try {
    assert.equal(validateInputs(f.binding.recipe), true);
    writeFileSync(join(f.dir, "input.txt"), "after");
    assert.equal(validateInputs(f.binding.recipe), false);
    const raw = JSON.parse(JSON.stringify(f.binding.recipe));
    raw.stages[0].operation = "invented";
    assert.throws(() => parseRecipe(raw), /unregistered/);
    raw.stages[0].operation = "check"; raw.stages[0].dependsOn = ["later"];
    assert.throws(() => parseRecipe(raw), /dependencies must precede/);
    raw.stages[0].dependsOn = []; raw.operations.check.env = { JEV_TOKEN: "not-a-secret-test" };
    assert.throws(() => parseRecipe(raw), /credentials/);
  } finally { f.close(); }
});

test("canonical intent changes invalidate projections atomically and stale acknowledgments cannot restore freshness", () => {
  const f = fixture(), store = new WorkflowStore(f.path);
  try {
    const before = store.projectionStatus();
    assert.equal(before.complete, false);
    assert.equal(store.acknowledgeProjection(before.generation), true);
    assert.equal(store.projectionStatus().complete, true);
    f.continuity.reviseTask(f.task.taskId, [{ kind: "constraint", body: "withdraw old procedure", provenance: "operator" }]);
    const after = store.projectionStatus();
    assert.ok(after.generation > before.generation);
    assert.equal(after.complete, false);
    assert.equal(store.acknowledgeProjection(before.generation), false);
    assert.equal(store.projectionStatus().complete, false);
    assert.equal(store.acknowledgeProjection(after.generation), true);
  } finally { store.close(); f.close(); }
});

test("workflow authority binds exact commands and one run identity, not merely workspace scope", () => {
  const f = fixture(), store = new WorkflowStore(f.path);
  try {
    const request = { operation: "check" as const, scope: [f.dir], targets: [], destination: null, policyRevision: defaultPolicy().revision };
    const action = authorizeAction(f.continuity, proposeAction(f.continuity, f.task.taskId, request), request, defaultPolicy(), f.dir);
    const unbound = { ...f.binding, actionId: action.actionId, operationId: "unbound" };
    assert.throws(() => store.submit(unbound), /host-approved action binding/);
    const alteredRecipe = parseRecipe({ ...f.binding.recipe, operations: {
      check: { argv: [process.execPath, "-e", "process.exit(9)"], cwd: f.dir, effect: "local" },
    } });
    const altered = { ...f.binding, recipe: alteredRecipe, recipeDigest: recipeDigest(alteredRecipe) };
    assert.throws(() => store.submit(altered), /host-approved action binding/);
    assert.throws(() => store.authorizeWorkflow(altered), /already bound/);
    assert.throws(() => store.submit({ ...f.binding, operationId: "second-run" }), /host-approved action binding/);
    store.authorizeWorkflow(f.binding); // Lost host acknowledgment may safely retry the identical binding.
    assert.equal(store.submit(f.binding).state, "queued");
  } finally { store.close(); f.close(); }
});


test("schema-1 upgrade retains runs without inventing workflow authorization", () => {
  const f = fixture();
  const old = new WorkflowStore(f.path);
  const run = old.submit(f.binding); old.close();
  const database = new DatabaseSync(f.path);
  database.exec("DROP TABLE engine_action_binding; UPDATE meta SET value='1' WHERE key='engine_schema'");
  database.close();
  const upgraded = new WorkflowStore(f.path);
  try {
    assert.deepEqual(upgraded.read(run.id).binding, run.binding);
    assert.throws(() => upgraded.claim(run.id, run.revision, "worker"), /host-approved action binding/);
    assert.equal(upgraded.read(run.id).state, "queued");
    upgraded.authorizeWorkflow(f.binding);
    assert.equal(upgraded.claim(run.id, run.revision, "worker").state, "running");
  } finally { upgraded.close(); f.close(); }
});


test("worker startup registry refusal becomes a durable blocked run without executing a stage",()=>{
  const f=fixture(),store=new WorkflowStore(f.path);
  try {
    const run=store.submit(f.binding),directory=join(f.dir,"worker"),registry=join(f.dir,"registry.sqlite");
    mkdirSync(directory);
    const resources=new ResourceRegistry(registry);resources.close();
    const legacy=new DatabaseSync(registry);legacy.exec("PRAGMA user_version=1");legacy.close();
    const worker=fileURLToPath(new URL("../src/workflow-worker.ts",import.meta.url));
    const request={version:1,database:f.path,runId:run.id,bindingDigest:digest(run.binding),registry,
      commandsDirectory:join(directory,"commands"),workerDigest:fileDigest(worker),generation:null};
    writeFileSync(join(directory,"request.json"),JSON.stringify(request));
    const result=spawnSync(process.execPath,[worker,"--worker",directory,digest(request)],{encoding:"utf8",timeout:5000});
    assert.equal(result.status,2,result.stderr);
    assert.equal(store.read(run.id).state,"blocked");
    assert.equal(store.stages(run.id)[0]!.state,"blocked");
    assert.equal(existsSync(request.commandsDirectory),false);
    const failure=JSON.parse(readFileSync(join(directory,"startup-failure.json"),"utf8"));
    assert.equal(failure.reason,"resource-protocol-migration-required");
    assert.equal(failure.requestDigest,digest(request));
    assert.throws(()=>store.blockUnstarted(run.id,digest(run.binding),"again"),/already started/);
  } finally {store.close();f.close();}
});


test("cleanup-only recovery requires the exact released receipt and preserves failed assertions", () => {
  const f=fixture(),store=new WorkflowStore(f.path),registry=new ResourceRegistry(join(f.dir,"resources.sqlite"));
  try {
    const submitted=store.submit(f.binding),run=store.claim(submitted.id,submitted.revision,"worker");
    const leases=registry.acquire(run.binding.recipe.resources,"worker",run.id);
    store.stage(run.id,"worker","test","running");
    store.stage(run.id,"worker","test","failed",{...passed,state:"failed",exitCode:1});
    const unknown=store.transition(run.id,"worker",run.revision,"unknown");
    const receipt={runId:run.id,bindingDigest:digest(run.binding),leases,observation:{kind:"fixture-cleanup"}};
    assert.throws(()=>reconcileReleasedWorkflow(store,registry,run.id,unknown.revision,receipt),/not bound/);
    registry.release(leases,digest(receipt));
    assert.throws(()=>reconcileReleasedWorkflow(store,registry,run.id,unknown.revision,{...receipt,bindingDigest:"wrong"}),/binding differs/);
    assert.throws(()=>reconcileReleasedWorkflow(store,registry,run.id,unknown.revision-1,receipt),/current unresolved/);
    const later=registry.acquire(run.binding.recipe.resources,"later-worker","later-operation");
    const receiptPath=join(f.dir,"cleanup.json");writeFileSync(receiptPath,JSON.stringify(receipt));
    const result=workflowCommand("workflow-reconcile-cleanup",["--database",f.path,"--run",run.id,
      "--revision",String(unknown.revision),"--receipt",receiptPath,"--registry",registry.path]).run;
    assert.equal(workflowExitCode(result.state),1);
    assert.equal(registry.inspect()[0]!.state,"held");
    registry.assertHeld(later[0]!);
    const workerDirectory=join(f.dir,"worker");mkdirSync(workerDirectory);
    const workerRequest={version:1,database:f.path,runId:run.id,bindingDigest:digest(run.binding),generation:null};
    writeFileSync(join(workerDirectory,"request.json"),JSON.stringify(workerRequest));
    writeFileSync(join(workerDirectory,"owner.json"),JSON.stringify({requestDigest:digest(workerRequest),pid:process.pid}));
    assert.throws(()=>releaseRecoveredWorkflowReader(workerDirectory,f.path,result),/still present/);
    const exited=spawnSync(process.execPath,["-e","process.exit(0)"],{timeout:5000});
    assert.equal(exited.status,0);
    writeFileSync(join(workerDirectory,"owner.json"),JSON.stringify({requestDigest:digest(workerRequest),pid:exited.pid}));
    assert.equal(releaseRecoveredWorkflowReader(workerDirectory,f.path,result).state,"not-retained");
    assert.equal(result.state,"failed");
    assert.equal(store.stages(run.id)[0]!.result!.exitCode,1);
    assert.equal(reconcileReleasedWorkflow(store,registry,run.id,result.revision,receipt).revision,result.revision);
  }finally{registry.close();store.close();f.close();}
});

test("resource release cannot settle an unknown command outcome",()=>{
  const f=fixture(),store=new WorkflowStore(f.path),registry=new ResourceRegistry(join(f.dir,"resources.sqlite"));
  try {
    const pending=store.submit(f.binding),run=store.claim(pending.id,pending.revision,"worker");
    const leases=registry.acquire(run.binding.recipe.resources,"worker",run.id);
    store.stage(run.id,"worker","test","running");
    store.stage(run.id,"worker","test","unknown",{...passed,state:"unknown",exitCode:null,cleanup:"unknown"});
    const unknown=store.transition(run.id,"worker",run.revision,"unknown");
    const receipt={runId:run.id,bindingDigest:digest(run.binding),leases,observation:{kind:"fixture-cleanup"}};
    registry.release(leases,digest(receipt));
    assert.throws(()=>reconcileReleasedWorkflow(store,registry,run.id,unknown.revision,receipt),/effects remain unresolved/);
    assert.equal(store.read(run.id).state,"unknown");
    assert.equal(store.read(run.id).revision,unknown.revision);
  }finally{registry.close();store.close();f.close();}
});

test("worker recovery commits only current observations and cannot settle the workflow", () => {
 const f=fixture(),store=new WorkflowStore(f.path),other=new WorkflowStore(f.path);
 try {
  const pending=store.submit(f.binding),run=store.claim(pending.id,pending.revision,"worker");
  store.stage(run.id,"worker","test","running");
  const stages=store.stages(run.id),snapshot=digest(stages),binding=digest(run.binding),evidence=digest({fixture:"verified owner absence"});
  const apply=(revision=run.revision,observations=[{id:"test",result:passed}])=>store.recordWorkerRecovery(run.id,revision,snapshot,binding,evidence,observations);
  assert.throws(()=>apply(run.revision-1),/stale/);
  assert.throws(()=>apply(run.revision,[{id:"test",result:passed},{id:"missing",result:passed}]),/settled or unstarted/);
  assert.deepEqual(store.stages(run.id),stages);
  const recovered=apply();
  assert.equal(recovered.state,"unknown");
  assert.equal(recovered.owner,"worker");
  assert.equal(store.stages(run.id)[0]?.state,"succeeded");
  assert.throws(()=>other.recordWorkerRecovery(run.id,run.revision,snapshot,binding,evidence,[{id:"test",result:passed}]),/stale/);
  assert.throws(()=>store.recordWorkerRecovery(run.id,recovered.revision,digest(store.stages(run.id)),binding,evidence,[{id:"test",result:{...passed,state:"failed"}}]),/settled or unstarted/);
 } finally {store.close();other.close();f.close();}
});

test("stopped-worker observation refuses live owners and binds original command receipts", async () => {
 const f=fixture(),store=new WorkflowStore(f.path);
 try {
  const pending=store.submit(f.binding),run=store.claim(pending.id,pending.revision,"worker");
  store.stage(run.id,"worker","test","running");
  const directory=join(f.dir,"worker"),commands=join(directory,"commands");mkdirSync(commands,{recursive:true});
  const request={version:1,database:f.path,runId:run.id,bindingDigest:digest(run.binding),commandsDirectory:commands};
  writeFileSync(join(directory,"request.json"),JSON.stringify(request));
  const ownerPath=join(directory,"owner.json");
  writeFileSync(ownerPath,JSON.stringify({requestDigest:digest(request),pid:process.pid,fingerprint:processFingerprint(process.pid)}));
  await assert.rejects(recoverStoppedWorkflow(directory,f.path,run.id,run.revision),/still present/);
  const cli=fileURLToPath(new URL("../src/cli.ts",import.meta.url));
  const cliArgs=[cli,"workflow-recover-observation","--worker-directory",directory,"--database",f.path,"--run",run.id,"--revision",String(run.revision)];
  const live=spawnSync(process.execPath,cliArgs,{encoding:"utf8"});
  assert.equal(live.status,2);assert.equal(live.stdout,"");
  const dead=spawnSync(process.execPath,["-e",""]);
  writeFileSync(ownerPath,JSON.stringify({requestDigest:digest(request),pid:dead.pid,fingerprint:"fixture exited worker"}));
  const commandDirectory=join(commands,`${run.id}-0`);
  const job=submitCommand(commandDirectory,{id:`${run.id}:test`,operation:run.binding.recipe.operations.check!,deadlineMs:1000,outputLimit:4096});
  const result=await waitCommand(commandDirectory,job.requestDigest,5000);assert.equal(result.receipt?.state,"succeeded");
  const original=readFileSync(join(commandDirectory,"result.json"));
  await assert.rejects(recoverStoppedWorkflow(directory,f.path,run.id,run.revision-1),/revision differs/);
  const commandPath=join(commandDirectory,"request.json"),commandBytes=readFileSync(commandPath);
  const changed=JSON.parse(commandBytes.toString());changed.id="different-stage";writeFileSync(commandPath,JSON.stringify(changed));
  await assert.rejects(recoverStoppedWorkflow(directory,f.path,run.id,run.revision),/differs from workflow stage/);
  assert.equal(store.read(run.id).state,"running");writeFileSync(commandPath,commandBytes);
  const response=spawnSync(process.execPath,cliArgs,{encoding:"utf8"});
  assert.equal(response.status,1,response.stderr);
  const recovered=JSON.parse(response.stdout);
  assert.equal(recovered.run.state,"unknown");assert.equal(recovered.observed,1);
  assert.equal(store.stages(run.id)[0]?.state,"succeeded");
  assert.deepEqual(readFileSync(join(commandDirectory,"result.json")),original);
  assert.equal((await recoverStoppedWorkflow(directory,f.path,run.id,recovered.run.revision)).observed,0);
  const cleanup=store.claimPendingCleanup(run.id,recovered.run.revision,digest(store.stages(run.id)),{pid:process.pid,fingerprint:processFingerprint(process.pid)!});
  assert.equal(store.cleanupWorker(run.id)?.pid,process.pid);
  await assert.rejects(recoverStoppedWorkflow(directory,f.path,run.id,cleanup.revision),/Cleanup worker still present/);
 } finally {store.close();f.close();}
});

test("worker loss with missing command reservation remains unresolved without dispatch", async () => {
 const f=fixture(),store=new WorkflowStore(f.path);
 try {
  const pending=store.submit(f.binding),run=store.claim(pending.id,pending.revision,"worker");
  store.stage(run.id,"worker","test","running");
  const directory=join(f.dir,"worker"),commands=join(directory,"commands");mkdirSync(commands,{recursive:true});
  const request={version:1,database:f.path,runId:run.id,bindingDigest:digest(run.binding),commandsDirectory:commands};
  writeFileSync(join(directory,"request.json"),JSON.stringify(request));
  const dead=spawnSync(process.execPath,["-e",""]);
  writeFileSync(join(directory,"owner.json"),JSON.stringify({requestDigest:digest(request),pid:dead.pid,fingerprint:"exited fixture"}));
  const result=await recoverStoppedWorkflow(directory,f.path,run.id,run.revision);
  assert.deepEqual(result.unresolved,["test"]);assert.equal(result.observed,0);
  assert.equal(result.run.state,"unknown");assert.equal(store.stages(run.id)[0]?.state,"running");
  assert.equal(existsSync(join(commands,`${run.id}-0`)),false);
 } finally {store.close();f.close();}
});
