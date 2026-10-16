import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {digest,fileDigest} from "../src/core.ts";
import {StartupOwnerChanged,StartupTasks} from "../src/startup-tasks.ts";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {stageRuntimeArchive} from "../src/runtime-staging.ts";
import {captureStartupHostOwner} from "../src/startup-host-owner.ts";
import {observeStartup} from "../src/startup-observation.ts";
import {removeRuntimeFixture} from "./fixtures/remove-runtime-fixture.ts";
import type {CompiledRuntimeLock} from "../src/runtime-lock.ts";

function fixture() {
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-label-"))),tasks=new StartupTasks(join(root,"tasks.sqlite"));
 const event={hook_event_name:"UserPromptSubmit",session_id:"synthetic-continuation"};
 const receipt=tasks.event("codex",event,root,digest("lock"),{});
 if(receipt.action!=="reserve")throw new Error("Expected synthetic reservation");
 const host={provider:"codex" as const,host:"original-label",machineId:`machine:sha256:${"a".repeat(64)}`,pid:123,fingerprint:"same-process"};
 const reader={registry:join(root,"registry.sqlite"),directory:root,revision:7,owner:`startup-task:${receipt.taskId}`,token:"exact-reader"};
 return {root,tasks,event,taskId:receipt.taskId,host,reader,dispose(){tasks.close();rmSync(root,{recursive:true,force:true});}};
}

test("hostname-only continuation reuses the original durable binding and exact reservation",()=>{
 const f=fixture();
 try {
  f.tasks.bindOwner(f.taskId,f.host,f.reader);
  const original=f.tasks.owner(f.taskId)!,originalDigest=digest(original);
  const bound=f.tasks.bindOwner(f.taskId,{...f.host,host:"renamed-label"},f.reader);
  assert.deepEqual(bound,original);
  assert.equal(digest(f.tasks.owner(f.taskId)),originalDigest);
  let reserved=0;
  f.tasks.reserveOwner(f.taskId,bound,()=>{reserved++;});assert.equal(reserved,1);
  // A second observer must return the stored label, not restamp active ownership.
  const second=new StartupTasks(join(f.root,"tasks.sqlite"));
  try {assert.deepEqual(second.bindOwner(f.taskId,{...f.host,host:"another-label"},f.reader),original);}
  finally {second.close();}
  f.tasks.event("codex",{...f.event,hook_event_name:"SessionEnd"},f.root,digest("lock"),{});
  assert.throws(()=>f.tasks.reserveOwner(f.taskId,bound,()=>{reserved++;}),/closed or changed/);
  assert.equal(reserved,1);assert.deepEqual(f.tasks.owner(f.taskId),original);
 }finally {f.dispose();}
});

test("a label change cannot conceal foreign process, machine, reader or legacy identity",()=>{
 const f=fixture();
 try {
  f.tasks.bindOwner(f.taskId,f.host,f.reader);const original=f.tasks.owner(f.taskId);
  for(const changed of [
   {...f.host,pid:124},{...f.host,fingerprint:"reused-pid"},
   {...f.host,machineId:`machine:sha256:${"b".repeat(64)}`},
   (({machineId:unused,...legacy})=>legacy)(f.host),
  ])assert.throws(()=>f.tasks.bindOwner(f.taskId,{...changed,host:"renamed-label"},f.reader),StartupOwnerChanged);
  for(const changed of [
   {...f.reader,registry:join(f.root,"foreign.sqlite")},{...f.reader,revision:8},
   {...f.reader,token:"new-reader"},{...f.reader,directory:join(f.root,"other")},
  ])assert.throws(()=>f.tasks.bindOwner(f.taskId,{...f.host,host:"renamed-label"},changed),StartupOwnerChanged);
  assert.deepEqual(f.tasks.owner(f.taskId),original);
  const other=f.tasks.event("codex",{...f.event,session_id:"legacy"},f.root,digest("lock"),{});
  if(other.action!=="reserve")throw new Error("Expected legacy fixture");
  const {machineId:unused,...legacy}=f.host,reader={...f.reader,owner:`startup-task:${other.taskId}`};
  f.tasks.bindOwner(other.taskId,legacy,reader);
  assert.throws(()=>f.tasks.bindOwner(other.taskId,{...legacy,host:"renamed-label"},reader),StartupOwnerChanged);
  assert.throws(()=>f.tasks.bindOwner(other.taskId,f.host,reader),StartupOwnerChanged);
  assert.deepEqual(f.tasks.owner(other.taskId),{host:legacy,reader});
 }finally {f.dispose();}
});

test("reservation still refuses a generation changed between binding and acquisition",()=>{
 const f=fixture();
 try {
  f.tasks.bindOwner(f.taskId,f.host,f.reader);
  const bound=f.tasks.bindOwner(f.taskId,{...f.host,host:"renamed-label"},f.reader);
  const second=new StartupTasks(join(f.root,"tasks.sqlite"));
  try {second.completeUpdate(f.taskId,digest(bound),digest("new-lock"),"c".repeat(40),()=>({...f.reader,revision:8,directory:join(f.root,"new-generation")}));}
  finally {second.close();}
  let calls=0;assert.throws(()=>f.tasks.reserveOwner(f.taskId,bound,()=>{calls++;}),/closed or changed/);
  assert.equal(calls,0);assert.equal(f.tasks.owner(f.taskId)!.reader.revision,8);
 }finally {f.dispose();}
});

test("ordinary startup observation after a hostname change preserves task and reader",async context=>{
 const current=captureStartupHostOwner("codex");
 if(!current){context.skip("Native Codex ancestor required for observation integration");return;}
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-label-observe-")));
 let tasks:StartupTasks|undefined,generations:RuntimeGenerations|undefined;
 try {
  const source=join(root,"package");mkdirSync(join(source,"dist/engine/src"),{recursive:true});mkdirSync(join(source,"dist/engine/assets"));
  writeFileSync(join(source,"package.json"),JSON.stringify({name:"@organta/project-governance",version:"3.0.0",type:"module",engines:{node:">=24.16.0 <25"},bin:{"project-governance":"dist/engine/src/cli.js"}}));
  writeFileSync(join(source,"dist/engine/src/cli.js"),'console.log("project-governance 3.0.0");');
  writeFileSync(join(source,"dist/engine/assets/runtime-dependencies.lock.json"),JSON.stringify({lockfileVersion:3,name:"@organta/project-governance",version:"3.0.0",packages:{"":{}}}));
  const archive=join(root,"runtime.tgz");execFileSync("tar",["-czf",archive,"-C",root,"package"]);
  const lock:CompiledRuntimeLock={schema_version:2,package:"@organta/project-governance",version:"3.0.0",artifact:{url:"file:///synthetic-runtime.tgz",integrity:"sha512-"+createHash("sha512").update(readFileSync(archive)).digest("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1};
  mkdirSync(join(root,"config/governance"),{recursive:true});
  const lockPath=join(root,"config/governance/runtime.lock.yaml");writeFileSync(lockPath,JSON.stringify(lock));
  const registry=join(root,"registry.sqlite"),receipts=join(root,"tasks.sqlite");
  const staged=stageRuntimeArchive(archive,lock,join(root,"staging"));
  generations=new RuntimeGenerations(registry);generations.activate(staged.directory,0);
  tasks=new StartupTasks(receipts);
  const event={hook_event_name:"UserPromptSubmit",session_id:"synthetic-observe"};
  const receipt=tasks.event("codex",event,root,fileDigest(lockPath),{});
  if(receipt.action!=="reserve")throw new Error("Expected observation fixture");
  const reader=generations.reserveStartupTask(receipt.taskId);
  tasks.bindOwner(receipt.taskId,{...current,host:"saved-label-before-rename"},{registry,...reader});
  const original=tasks.owner(receipt.taskId)!;
  const result=await observeStartup({provider:"codex",event,workspace:root,registry,receipts},{environment:{},fetch:async()=>assert.fail("Continuation must not perform discovery")});
  assert.equal(result.action,"reserve");assert.equal(result.discover,false);
  assert.deepEqual(tasks.owner(receipt.taskId),original);
  assert.deepEqual(generations.state().readers.map(row=>({...row})),[{token:reader.token,revision:reader.revision,owner:reader.owner}]);
 }finally {tasks?.close();generations?.close();removeRuntimeFixture(root);}
});
