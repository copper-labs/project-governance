import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {join} from "node:path";
import {tmpdir,hostname} from "node:os";
import {recoverStartupOwner} from "../src/startup-owner-recovery.ts";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {requireAbsentStartupHost} from "../src/startup-host-owner.ts";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {StartupTasks} from "../src/startup-tasks.ts";
import {digest,fileDigest,durableJson} from "../src/core.ts";
import {prepareInstallationHandoff,installationHandoff,cancelInstallationHandoff,withInstallationHandoffOwner} from "../src/runtime-installation-handoff.ts";
import type {RuntimePreparation} from "../src/runtime-operation-preparation.ts";

function fixture() {
 const root=realpathSync(mkdtempSync(join(tmpdir(),"installation-handoff-"))),registry=join(root,"registry.sqlite"),receipts=join(root,"startup.sqlite"),operation=join(root,"operation");
 mkdirSync(join(root,"config/governance"),{recursive:true});mkdirSync(operation);
 const lockPath=join(root,"config/governance/runtime.lock.yaml");writeFileSync(lockPath,"fixture lock\n");
 const generations=new RuntimeGenerations(registry);
 const seed=new DatabaseSync(registry);seed.prepare("UPDATE current SET revision=3,directory=?,written=1 WHERE id=1").run(join(root,"old"));seed.close();
 const tasks=new StartupTasks(receipts),environment={CODEX_THREAD_ID:"fixture-parent"};
 const event=tasks.event("codex",{session_id:environment.CODEX_THREAD_ID,hook_event_name:"SessionStart",source:"startup"},root,fileDigest(lockPath),environment);
 assert.ok("taskId" in event);
 const reader=generations.reserveStartupTask(event.taskId),host={host:"fixture",pid:123,provider:"codex" as const,fingerprint:"fixture-start"};
 const binding=tasks.bindOwner(event.taskId,host,{...reader,registry});
 const token=randomUUID(),owner=`installation:${operation}`;
 const request={mode:"update",workspace:root,registry,startupReceipts:receipts,expectedRevision:3,archive:join(root,"archive.tgz"),lock:{},inputs:[]} as unknown as RuntimePreparation;
 const savedRequest={version:1,kind:"runtime-preparation",...request};
 durableJson(join(operation,"operation.json"),{request:savedRequest,requestDigest:digest(savedRequest),token,owner,legacyLockRequired:false});
 generations.beginMaintenance(owner,3,token);
 return {root,registry,receipts,operation,lockPath,generations,tasks,environment,reader,host,binding,token,owner,request,task:event.taskId,
  close(){tasks.close();generations.close();rmSync(root,{recursive:true,force:true});},
  successor(){const db=new DatabaseSync(registry);db.prepare("UPDATE current SET revision=4,previous=directory,directory=?,written=0 WHERE id=1").run(join(root,"new"));db.close();}};
}

test("explicit update reproduces its parent-reader block, then exchanges only exact ownership",()=>{
 const f=fixture();try {
  // The old completion route refuses the owning chat even after all command readers drained.
  assert.throws(()=>f.generations.finishMaintenance(f.token,f.owner,3,{workspace:f.root,lockDigest:digest("lock"),readback:"version"}),/drained pre-write/);
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,{CODEX_THREAD_ID:"other"},()=>f.host),/startup task not found/i);
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,f.environment,()=>({...f.host,pid:124})),/native host differs/);
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.equal(f.generations.state().readers.length,0);
  assert.throws(()=>f.generations.acquire("new-command"),/admission stopped/);
  assert.throws(()=>f.generations.endMaintenance(f.token,f.owner),/completion readback/);
  assert.equal(f.generations.retireStartupReader(f.reader),false);
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.throws(()=>f.generations.handoffInstallationReader(f.token,f.owner,{...f.reader,token:randomUUID()}),/replay differs/);
  assert.throws(()=>f.generations.handoffInstallationReader(randomUUID(),f.owner,f.reader),/ownership or generation/);
  assert.throws(()=>f.generations.handoffInstallationReader(f.token,"other",f.reader),/ownership or generation/);
  assert.throws(()=>f.generations.handoffInstallationReader(f.token,f.owner,{...f.reader,revision:4}),/ownership or generation/);
  assert.throws(()=>installationHandoff(f.operation,{...f.request,archive:"changed"},f.environment,()=>f.host),/operation changed/);
  const cancelled=cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.equal(cancelled.revision,3);assert.equal(f.generations.state().readers.length,1);assert.equal(f.generations.state().maintenance,null);
  assert.deepEqual(cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),cancelled);
 }finally{f.close();}
});

test("another reader refuses handoff, and cancellation preserves both original readers",()=>{
 const f=fixture();try {
  const other=f.generations.acquire("running-command",f.token);
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/sole recorded parent/);
  assert.equal(f.generations.state().readers.length,2);
  cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.equal(f.generations.state().readers.length,2);assert.equal(f.generations.state().maintenance,null);
  f.generations.release(other.token,other.owner);
 }finally{f.close();}
});

test("successor restoration requires the handoff and survives failure between ledger commits",()=>{
 const f=fixture();try {
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);f.successor();
  assert.throws(()=>cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/original drained/);
  const receipt={workspace:f.root,lockDigest:digest("new"),readback:"version"};
  assert.throws(()=>f.generations.finishMaintenance(f.token,f.owner,4,receipt),/completion readback/);
  assert.throws(()=>f.generations.finishMaintenance(f.token,f.owner,4,receipt,{...f.reader,token:randomUUID()}),/completion readback/);
  const hook=f.generations.acquire("hook",f.token);
  assert.throws(()=>f.generations.finishMaintenance(f.token,f.owner,4,receipt,f.reader),/drained pre-write/);
  f.generations.release(hook.token,hook.owner);
  let calls=0;
  const finish=()=>{
   if(!f.generations.finalization(f.token,f.owner))f.generations.finishMaintenance(f.token,f.owner,4,receipt,f.reader);
   calls++;
   if(calls===1)throw new Error("interrupted after generation commit");
   return {...f.binding.reader,revision:4,directory:join(f.root,"new")};
  };
  assert.throws(()=>f.tasks.completeInstallation(f.task,f.binding,f.token,digest("new-file"),false,finish,()=>{}),/interrupted/);
  assert.equal(f.generations.state().readers.length,1);assert.equal(f.tasks.owner(f.task)?.reader.revision,3);
  const restored=f.tasks.completeInstallation(f.task,f.binding,f.token,digest("new-file"),false,finish,()=>{});
  assert.equal(restored.revision,4);assert.equal(f.tasks.owner(f.task)?.reader.revision,4);
  f.tasks.completeInstallation(f.task,f.binding,f.token,digest("new-file"),false,()=>{throw new Error("must replay");},()=>{});
  assert.equal(f.generations.state().readers.length,1);
 }finally{f.close();}
});

for(const olderHook of [false,true])test(`native SessionEnd during handoff leaves no resurrected reader (${olderHook?"older":"current"} hook)`,()=>{
 const f=fixture();try {
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  f.tasks.event("codex",{session_id:f.environment.CODEX_THREAD_ID,hook_event_name:"SessionEnd"},f.root,fileDigest(f.lockPath),f.environment);
  f.tasks.retireOwner(f.task,()=>olderHook?true:f.generations.retireStartupReader(f.reader));
  cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.equal(f.tasks.owner(f.task),null);assert.equal(f.generations.state().readers.length,0);
 }finally{f.close();}
});

test("a changed parent binding cannot consume or restore the saved reservation",()=>{
 const f=fixture();try {
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  const db=new DatabaseSync(f.receipts);db.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(JSON.stringify({...f.binding,host:{...f.host,pid:124}}),f.task);db.close();
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/closed or changed/);
  assert.throws(()=>cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/binding changed/);
  assert.equal(f.generations.state().maintenance?.token,f.token);
 }finally{f.close();}
});

 test("one handoff coordinator owns update or cancellation, and return releases its mutex",async()=>{
 const f=fixture();try {
  await withInstallationHandoffOwner(f.operation,async()=>{
   await assert.rejects(withInstallationHandoffOwner(f.operation,async()=>assert.fail("overlapping updater")),/locked/);
  });
  await assert.rejects(withInstallationHandoffOwner(f.operation,async()=>{throw new Error("fixture crash");}),/fixture crash/);
  await withInstallationHandoffOwner(f.operation,async()=>{});
 }finally{f.close();}
});

test("SessionEnd between saved intent and reader consumption cancels without orphaning maintenance",()=>{
 const f=fixture();try {
  const other=f.generations.acquire("other",f.token);
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/sole recorded parent/);
  f.tasks.event("codex",{session_id:f.environment.CODEX_THREAD_ID,hook_event_name:"SessionEnd"},f.root,fileDigest(f.lockPath),f.environment);
  f.tasks.retireOwner(f.task,()=>f.generations.retireStartupReader(f.reader));
  cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  assert.equal(f.generations.state().maintenance,null);
  assert.deepEqual(f.generations.state().readers.map(row=>row.token),[other.token]);
 }finally{f.close();}
});

test("process loss releases only the updater mutex and retains the original maintenance operation",async()=>{
 const f=fixture();try {
  const module=new URL("../src/runtime-installation-handoff.ts",import.meta.url).href;
  const child=spawnSync(process.execPath,["--input-type=module","-e",`import {withInstallationHandoffOwner} from ${JSON.stringify(module)};
   await withInstallationHandoffOwner(${JSON.stringify(f.operation)},async()=>process.exit(37));`],{encoding:"utf8"});
  assert.equal(child.status,37,child.stderr);
  await withInstallationHandoffOwner(f.operation,async()=>{
   assert.equal(f.generations.state().maintenance?.token,f.token);
   assert.equal(f.generations.state().readers[0]?.token,f.reader.token);
  });
 }finally{f.close();}
});

 test("absent-parent recovery can cancel or replay an existing handoff but cannot take a live reservation",()=>{
 const f=fixture();try {
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  const absent=()=>requireAbsentStartupHost(f.host,()=>[],"fixture",null);
  const live=()=>requireAbsentStartupHost(f.host,()=>[{pid:123,parent:1,group:123}],"fixture",null);
  assert.throws(()=>cancelInstallationHandoff(f.operation,f.request,{CODEX_THREAD_ID:"recovery-parent"},()=>null,live),/PID remains present/);
  prepareInstallationHandoff(f.operation,f.request,{CODEX_THREAD_ID:"recovery-parent"},()=>null,absent);
  assert.throws(()=>cancelInstallationHandoff(f.operation,f.request,{HARNESS_AGENT_ANCESTRY:"child"},()=>null,absent),/Delegated workers/);
  cancelInstallationHandoff(f.operation,f.request,{CODEX_THREAD_ID:"recovery-parent"},()=>null,absent);
  assert.equal(f.generations.state().maintenance,null);assert.equal(f.generations.state().readers.length,1);
 }finally{f.close();}
 const unconsumed=fixture();try {
  assert.throws(()=>unconsumed.generations.handoffInstallationReader(unconsumed.token,unconsumed.owner,unconsumed.reader,true),/already consumed/);
  assert.equal(unconsumed.generations.state().readers.length,1);
 }finally{unconsumed.close();}
});

 test("canonical mutex ownership refuses operation and mutex aliases",async()=>{
 const f=fixture();try {
  const alias=join(f.root,"alias");symlinkSync(f.operation,alias);
  await assert.rejects(withInstallationHandoffOwner(alias,async()=>assert.fail("alias updater")),/aliases/);
  const target=join(f.root,"target.sqlite");writeFileSync(target,"");symlinkSync(target,f.operation+".handoff-mutex.sqlite");
  await assert.rejects(withInstallationHandoffOwner(f.operation,async()=>assert.fail("alias mutex")),/aliases/);
 }finally{f.close();}
});

 test("host completion requirements prevent cancellation before activation",()=>{
 const f=fixture();try {
  prepareInstallationHandoff(f.operation,f.request,f.environment,()=>f.host);
  f.generations.requireCompletion(f.token,f.owner,"hostInstructionsDigest",digest("host-mutation"));
  assert.throws(()=>cancelInstallationHandoff(f.operation,f.request,f.environment,()=>f.host),/before activation/);
  assert.equal(f.generations.state().maintenance?.token,f.token);
 }finally{f.close();}
});

 test("absent-owner recovery before consumption still allows cancellation",()=>{
 const f=fixture();try {
  const exited=spawnSync(process.execPath,["-e",""]);
  assert.equal(exited.status,0);
  const host={...f.host,host:hostname(),pid:exited.pid};
  const db=new DatabaseSync(f.receipts);
  db.prepare("UPDATE owners SET binding=? WHERE task_id=?").run(JSON.stringify({...f.binding,host}),f.task);db.close();
  const other=f.generations.acquire("other",f.token);
  assert.throws(()=>prepareInstallationHandoff(f.operation,f.request,f.environment,()=>host),/sole recorded parent/);
  recoverStartupOwner(f.receipts,f.task,digest({...f.binding,host}),"fixture explicit recovery");
  cancelInstallationHandoff(f.operation,f.request,{CODEX_THREAD_ID:"recovery-parent"},()=>null);
  assert.equal(f.tasks.owner(f.task),null);assert.equal(f.generations.state().maintenance,null);
  assert.deepEqual(f.generations.state().readers.map(row=>row.token),[other.token]);
 }finally{f.close();}
});
