import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, realpathSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { runtimeMaintenanceCommand } from "../src/runtime-maintenance-command.ts";
import { inspectRuntimeBackup } from "../src/runtime-backup-inspection.ts";
import { runtimeMigrationPlan } from "../src/runtime-migration-plan.ts";
import { backupRuntimeState } from "../src/runtime-backup.ts";

test("invalid maintenance arguments cannot create a registry", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintenance-invalid-")), registry = join(root, "registry.sqlite");
  try {
    for (const args of [["--action","begin","--revision","-1"],["--action","end"],["--action","begin","--revision","0","--token","wrong"]])
      await assert.rejects(runtimeMaintenanceCommand("runtime-maintenance", ["--registry",registry,"--owner","fixture",...args]));
    await assert.rejects(runtimeMaintenanceCommand("runtime-maintenance", ["--registry",registry,"--owner","fixture","--action","end","--token","missing-token"]));
    await assert.rejects(runtimeMaintenanceCommand("runtime-maintenance", ["--registry",registry,"--owner","fixture","--action","begin","--revision","1"]));
    const file = join(root,"source"); writeFileSync(file,"preserve");
    await assert.rejects(runtimeMaintenanceCommand("runtime-backup", ["--registry",registry,"--owner","fixture","--token","missing-token","--destination",join(root,"backup"),"--file",file]));
    assert.equal(existsSync(join(root,"backup")), false);
    assert.equal(existsSync(registry), false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("saved project scope backs up without retyping inputs and refuses stale plans before creating output", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),"maintenance-plan-"))), registry = join(root,"registry.sqlite");
  const generations = new RuntimeGenerations(registry);
  try {
    const {token} = generations.beginMaintenance("fixture",0);
    const source = join(root,"AGENTS.md"), saved = join(root,"plan.json");
    writeFileSync(source,"Authored rules\n");
    const plan = runtimeMigrationPlan(root);
    writeFileSync(saved,JSON.stringify(plan));
    const invoke = (destination:string) => runtimeMaintenanceCommand("runtime-backup",[
      "--registry",registry,"--owner","fixture","--token",token,"--destination",destination,"--project-plan",saved]);
    await invoke(join(root,"backup"));
    assert.equal(inspectRuntimeBackup(join(root,"backup")).records.length,plan.inputs.length);
    writeFileSync(source,"Changed rules\n");
    await assert.rejects(invoke(join(root,"stale")),/plan changed/);
    assert.equal(existsSync(join(root,"stale")),false);
    assert.equal(generations.state().maintenance?.token,token);
  } finally { generations.close(); rmSync(root,{recursive:true,force:true}); }
});

test("scope invalidation during backup leaves a failed receipt and retains maintenance", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(),"maintenance-scope-"))), registry = join(root,"registry.sqlite");
  const generations = new RuntimeGenerations(registry);
  try {
    const {token} = generations.beginMaintenance("fixture",0), source = join(root,"policy"), destination = join(root,"backup");
    writeFileSync(source,"Preserve me\n");
    let validations = 0;
    await assert.rejects(backupRuntimeState(registry,token,"fixture",[{path:source,kind:"file"}],destination,()=>{
      if (++validations === 2) throw new Error("Scope changed during backup");
    }),/Scope changed/);
    assert.equal(validations,2);
    assert.equal(JSON.parse(readFileSync(join(destination,"backup.json"),"utf8")).state,"failed");
    assert.equal(generations.state().maintenance?.token,token);
    assert.equal(readFileSync(source,"utf8"),"Preserve me\n");
  } finally { generations.close(); rmSync(root,{recursive:true,force:true}); }
});

test("CLI maintenance and backup preserve declared inputs and retain incomplete obligations", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "maintenance-cli-"))), registry = join(root, "registry.sqlite");
  const invoke = (command: string, args: string[]) => {
    const result = spawnSync(process.execPath,[fileURLToPath(new URL("../src/cli.ts",import.meta.url)),command,"--registry",registry,"--owner","fixture",...args],{encoding:"utf8",timeout:5000});
    return {...result,value:result.stdout.trim()?JSON.parse(result.stdout):null};
  };
  try {
    const file = join(root,"policy.json"), absent = join(root,"not-created"); writeFileSync(file,'{"preserve":true}\n');
    const begin = invoke("runtime-maintenance",["--action","begin","--revision","0"]);
    assert.equal(begin.status,0,begin.stderr); assert.ok(begin.value.token);
    const extra = Array.from({length:65},(_,i)=>join(root,`rule-${i}.yaml`));
    for (const path of extra) writeFileSync(path,"rule: preserved\n");
    const destination = join(root,"backup");
    const backup = invoke("runtime-backup",["--token",begin.value.token,"--destination",destination,"--file",file,"--absent",absent,...extra.flatMap(path=>["--file",path])]);
    assert.equal(backup.status,0,backup.stderr);
    const inspected = inspectRuntimeBackup(destination); assert.equal(inspected.records.length,67);
    assert.equal(readFileSync(file,"utf8"),'{"preserve":true}\n'); assert.equal(existsSync(absent),false);
    assert.equal(invoke("runtime-maintenance",["--action","end","--token",begin.value.token]).status,0);
    const next = invoke("runtime-maintenance",["--action","begin","--revision","0"]);
    const generations = new RuntimeGenerations(registry);
    try {
      generations.requireCompletion(next.value.token,"fixture","hostInstructionsDigest","fixture-digest");
      assert.equal(invoke("runtime-maintenance",["--action","end","--token",next.value.token]).status,2);
      assert.equal(generations.state().maintenance?.token,next.value.token);
    } finally { generations.close(); }
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("durable maintenance token recovers only the same owner and revision",async()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"maintenance-replay-"))),registry=join(root,"registry.sqlite");
  const token="6b8585c9-fbf6-4b79-b1d3-74cbe934e52a";
  const begin=(owner:string,revision="0",operation=token)=>runtimeMaintenanceCommand("runtime-maintenance",[
    "--registry",registry,"--owner",owner,"--action","begin","--revision",revision,"--operation-token",operation]);
  try {
    await assert.rejects(begin("operation","0","invalid"));assert.equal(existsSync(registry),false);
    const first=await begin("operation");assert.deepEqual(await begin("operation"),first);
    await assert.rejects(begin("other"),/already owned/);
    await assert.rejects(begin("operation","1"),/revision changed/);
    await assert.rejects(begin("operation","0","8427a3ef-b191-41f1-8bf2-102fb974c2de"),/already owned/);
    const state=new RuntimeGenerations(registry);
    try {assert.equal(state.state().maintenance?.token,token);}
    finally{state.close();}
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("backup operation reuses verified bytes but never replaces partial or mismatched snapshots",async()=>{
  const {backupRuntimeOperation}=await import("../src/runtime-backup-operation.ts");
  const root=realpathSync(mkdtempSync(join(tmpdir(),"backup-replay-"))),registry=join(root,"registry.sqlite");
  const generations=new RuntimeGenerations(registry);
  try {
    const {token}=generations.beginMaintenance("fixture",0),source=join(root,"policy"),destination=join(root,"backup");
    writeFileSync(source,"original");const inputs=[{path:source,kind:"file" as const}];
    const first=await backupRuntimeOperation(registry,token,"fixture",inputs,destination);
    assert.equal(first.reused,false);writeFileSync(source,"transition wrote new policy");
    const replay=await backupRuntimeOperation(registry,token,"fixture",inputs,destination);
    assert.equal(replay.reused,true);assert.equal(replay.receiptDigest,first.receiptDigest);
    await assert.rejects(backupRuntimeOperation(registry,token,"other",inputs,destination),/owner differs/);
    await assert.rejects(backupRuntimeOperation(registry,token,"fixture",[],destination),/scope/);
    writeFileSync(join(destination,"0.data"),"corrupted");
    await assert.rejects(backupRuntimeOperation(registry,token,"fixture",inputs,destination),/payload changed/);
    assert.equal(readFileSync(join(destination,"0.data"),"utf8"),"corrupted");
    assert.equal(generations.state().maintenance?.token,token);
  }finally{generations.close();rmSync(root,{recursive:true,force:true});}
});
