import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,chmodSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {removeRuntimeFixture} from "./fixtures/remove-runtime-fixture.ts";
import {stageRuntimeArchive} from "../src/runtime-staging.ts";
import type {CompiledRuntimeLock} from "../src/runtime-lock.ts";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {StartupTasks} from "../src/startup-tasks.ts";
import {startupStatus} from "../src/startup-status.ts";
import {startupCommand} from "../src/startup-command.ts";
import {relinquishStartupOwner as sourceRelinquish} from "../src/startup-owner-relinquishment.ts";
import {digest,fileDigest} from "../src/core.ts";

const installed=process.env.GOVERNANCE_HOST_TEST_PACKAGE;
const relinquish:typeof sourceRelinquish=installed
 ? (await import(pathToFileURL(join(installed,"dist/engine/src/startup-owner-relinquishment.js")).href)).relinquishStartupOwner
 : sourceRelinquish;

function fixture() {
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-relinquish-"))),registry=join(root,"registry.sqlite"),receipts=join(root,"startup.sqlite");
 mkdirSync(join(root,"config/governance"),{recursive:true});
 const lockPath=join(root,"config/governance/runtime.lock.yaml");
 function runtime(version:string) {
  const source=join(root,version,"package"),archive=join(root,version,"archive.tgz");
  mkdirSync(join(source,"dist/engine/src"),{recursive:true});mkdirSync(join(source,"dist/engine/assets"),{recursive:true});
  writeFileSync(join(source,"package.json"),JSON.stringify({name:"@organta/project-governance",version,type:"module",engines:{node:">=24.16.0 <25"},bin:{"project-governance":"dist/engine/src/cli.js"}}));
  writeFileSync(join(source,"dist/engine/src/cli.js"),`console.log("project-governance ${version}");`);
  writeFileSync(join(source,"dist/engine/assets/runtime-dependencies.lock.json"),JSON.stringify({lockfileVersion:3,name:"@organta/project-governance",version,packages:{"":{}}}));
  execFileSync("tar",["-czf",archive,"-C",join(root,version),"package"]);
  const lock:CompiledRuntimeLock={schema_version:2,package:"@organta/project-governance",version,
   artifact:{url:`file:///${version}.tgz`,integrity:"sha512-"+createHash("sha512").update(readFileSync(archive)).digest("base64")},
   source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1};
  return stageRuntimeArchive(archive,lock,join(root,version,"stages"));
 }
 const old=runtime("3.0.0"),generations=new RuntimeGenerations(registry);
 generations.activate(old.directory,0);writeFileSync(lockPath,JSON.stringify(old.lock));
 const tasks=new StartupTasks(receipts),host={host:"fixture",pid:123,provider:"codex" as const,fingerprint:"same-live-host"};
 function owner(session:string) {
  const environment={CODEX_THREAD_ID:session};
  const event=tasks.event("codex",{session_id:session,hook_event_name:"UserPromptSubmit"},root,fileDigest(lockPath),environment);
  assert.ok("taskId" in event);
  const reader=generations.reserveStartupTask(event.taskId),binding=tasks.bindOwner(event.taskId,host,{...reader,registry});
  return {environment,task:event.taskId,reader,binding,bindingDigest:digest(binding)};
 }
 const a=owner("chat-a"),b=owner("chat-b"),scope={workspace:root,registry};
 const release=(which=a)=>relinquish(receipts,which.bindingDigest,"operator:fixture",scope,which.environment,()=>host);
 return {root,registry,receipts,lockPath,generations,tasks,host,scope,a,b,old,runtime,owner,release,
  close(){tasks.close();generations.close();removeRuntimeFixture(root);}};
}

test("two chats on one live host relinquish only their own reservations, without ending either task",()=>{
 const f=fixture();try {
  const command=f.generations.acquire("running-command"),beforeB=f.tasks.owner(f.b.task);
  const result=f.release() as {reservation:string;sessionEnded:boolean;taskOutcome:string};
  assert.equal(result.reservation,"released");assert.equal(result.sessionEnded,false);assert.equal(result.taskOutcome,"unknown");
  assert.equal(f.tasks.owner(f.a.task),null);assert.deepEqual(f.tasks.owner(f.b.task),beforeB);
  assert.deepEqual(f.generations.state().readers.map(r=>r.owner).sort(),[f.b.reader.owner,command.owner].sort());
  assert.equal(startupStatus(f.receipts,f.a.task,f.scope).state,"open");
  f.release(f.b);
  assert.equal(f.generations.state().readers.length,1);
  const next=f.runtime("3.0.1");
  assert.throws(()=>f.generations.activate(next.directory,1),/drained readers/);
  f.generations.release(command.token,command.owner);
  assert.equal(f.generations.activate(next.directory,1).revision,2);
 }finally{f.close();}
});

for(const which of ["other-chat","other-digest","other-host","delegated","missing-session","wrong-registry"])
test(`relinquishment refuses ${which} without dropping either reader`,()=>{
 const f=fixture();try {
  const environment:NodeJS.ProcessEnv={...f.a.environment},scope={...f.scope};
  let binding=f.a.bindingDigest,host=f.host;
  if(which==="other-chat")environment.CODEX_THREAD_ID="chat-c";
  if(which==="other-digest")binding=f.b.bindingDigest;
  if(which==="other-host")host={...host,pid:124};
  if(which==="delegated")environment.HARNESS_AGENT_ANCESTRY="parent";
  if(which==="missing-session")delete environment.CODEX_THREAD_ID;
  if(which==="wrong-registry")scope.registry=f.receipts;
  assert.throws(()=>relinquish(f.receipts,binding,"operator:fixture",scope,environment,()=>host));
  assert.equal(f.generations.state().readers.length,2);assert.ok(f.tasks.owner(f.a.task));assert.ok(f.tasks.owner(f.b.task));
 }finally{f.close();}
});

test("maintenance refuses relinquishment and preserves its exact original binding",()=>{
 const f=fixture();try {
  const token=f.generations.beginMaintenance("other-updater",1);
  assert.throws(()=>f.release(),/active maintenance/);
  assert.deepEqual(f.tasks.owner(f.a.task),f.a.binding);assert.equal(f.generations.state().readers.length,2);
  f.generations.endMaintenance(token.token,token.owner);
 }finally{f.close();}
});

for(const which of ["lock","payload","generation","reader"])
test(`relinquishment refuses changed ${which} without claiming release`,()=>{
 const f=fixture();try {
  if(which==="lock")writeFileSync(f.lockPath,JSON.stringify({...f.old.lock,source_commit:"b".repeat(40)}));
  if(which==="payload"){
   const file=join(f.old.directory,"node_modules/@organta/project-governance/dist/engine/src/cli.js");
   chmodSync(file,0o600);writeFileSync(file,"changed");
  }
  if(which==="generation" || which==="reader"){
   const db=new DatabaseSync(f.registry);
   if(which==="generation")db.exec("UPDATE current SET revision=2 WHERE id=1");
   else db.prepare("UPDATE readers SET token=? WHERE owner=?").run(randomUUID(),f.a.reader.owner);
   db.close();
  }
  assert.throws(()=>f.release());assert.ok(f.tasks.owner(f.a.task));assert.equal(f.generations.state().readers.length,2);
 }finally{f.close();}
});

test("interrupted cross-ledger release replays its exact intent without disturbing the other chat",()=>{
 const f=fixture();try {
  assert.throws(()=>f.tasks.relinquishOwner(f.a.task,f.a.bindingDigest,binding=>{
   f.generations.relinquishStartupReader(binding.reader);throw new Error("fixture interruption");
  }),/fixture interruption/);
  assert.ok(f.tasks.owner(f.a.task));assert.equal(f.generations.state().readers.length,1);
  f.release();assert.equal(f.tasks.owner(f.a.task),null);assert.ok(f.tasks.owner(f.b.task));
 }finally{f.close();}
});

test("replay after activation is evidence only; a resumed prompt acquires the current generation",()=>{
 const f=fixture();try {
  const receipt=f.release();f.release(f.b);
  const next=f.runtime("3.0.1");f.generations.activate(next.directory,1);writeFileSync(f.lockPath,JSON.stringify(next.lock));
  assert.deepEqual(f.release(),receipt);assert.equal(f.generations.state().readers.length,0);
  const resumed=f.tasks.event("codex",{session_id:"chat-a",hook_event_name:"UserPromptSubmit"},f.root,fileDigest(f.lockPath),f.a.environment);
  assert.ok("refreshRequired" in resumed && resumed.refreshRequired);
  const current=f.owner("chat-a");assert.equal(current.reader.revision,2);assert.equal(current.reader.directory,next.directory);
  assert.throws(()=>f.release(),/binding changed/);
  assert.deepEqual(f.tasks.owner(current.task),current.binding);
  f.release(current);assert.equal(f.generations.state().readers.length,0);
 }finally{f.close();}
});

test("interruption after reader release can finish bookkeeping after a completed activation",()=>{
 const f=fixture();try {
  assert.throws(()=>f.tasks.relinquishOwner(f.a.task,f.a.bindingDigest,binding=>{
   f.generations.relinquishStartupReader(binding.reader);throw new Error("interrupted before task commit");
  }),/interrupted/);
  f.release(f.b);const next=f.runtime("3.0.1");
  f.generations.activate(next.directory,1);writeFileSync(f.lockPath,JSON.stringify(next.lock));
  const result=f.release() as {revision:number;currentRevision:number};
  assert.equal(result.revision,1);assert.equal(result.currentRevision,2);
  assert.equal(f.tasks.owner(f.a.task),null);assert.equal(f.generations.state().readers.length,0);
 }finally{f.close();}
});

test("real SessionEnd after relinquishment remains closed and is never re-opened by replay",()=>{
 const f=fixture();try {
  const receipt=f.release();
  f.tasks.event("codex",{session_id:"chat-a",hook_event_name:"SessionEnd"},f.root,fileDigest(f.lockPath),f.a.environment);
  assert.deepEqual(f.release(),receipt);assert.equal(startupStatus(f.receipts,f.a.task,f.scope).state,"closed");
  assert.ok(f.tasks.owner(f.b.task));
 }finally{f.close();}
});

test("public relinquish parser cannot select another task or accept a fabricated lifecycle event",async()=>{
 const f=fixture();try {
  for(const option of ["--task","--provider","--event-file","--operation-directory"])
   await assert.rejects(startupCommand(["relinquish","--receipts",f.receipts,"--binding-digest",f.a.bindingDigest,"--authority","operator:fixture",option,"other"],f.scope),/requires only/);
  assert.equal(f.generations.state().readers.length,2);
 }finally{f.close();}
});

test("slow native verification leaves the receipt-store writer available to native hooks",()=>{
 const f=fixture();try {
  let verified=false;
  relinquish(f.receipts,f.a.bindingDigest,"operator:fixture",f.scope,f.a.environment,()=>{
   const db=new DatabaseSync(f.receipts);
   try {db.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE; ROLLBACK");verified=true;}finally{db.close();}
   return f.host;
  });
  assert.equal(verified,true);assert.ok(f.tasks.owner(f.b.task));
 }finally{f.close();}
});

test("a restored successor reader cannot be consumed through the old task binding",()=>{
 const f=fixture();try {
  const next=f.runtime("3.0.1"),db=new DatabaseSync(f.registry);
  db.prepare("UPDATE current SET revision=2,directory=? WHERE id=1").run(next.directory);
  db.prepare("UPDATE readers SET revision=2 WHERE token=?").run(f.a.reader.token);db.close();
  writeFileSync(f.lockPath,JSON.stringify(next.lock));
  assert.throws(()=>f.release(),/reader changed/);
  assert.equal(f.generations.state().readers.find(r=>r.token===f.a.reader.token)?.revision,2);
  assert.deepEqual(f.tasks.owner(f.a.task),f.a.binding);
 }finally{f.close();}
});

test("maintenance and a changed generation after preflight both refuse the pinned release",()=>{
 const f=fixture();try {
  const expected={revision:1,directory:f.old.directory},token=f.generations.beginMaintenance("updater-after-preflight",1);
  assert.throws(()=>f.generations.relinquishStartupReader(f.a.reader,expected),/active maintenance/);
  f.generations.endMaintenance(token.token,token.owner);
  const db=new DatabaseSync(f.registry);db.exec("UPDATE current SET revision=2 WHERE id=1");db.close();
  assert.throws(()=>f.generations.relinquishStartupReader(f.a.reader,expected),/generation changed/);
  assert.equal(f.generations.state().readers.length,2);
 }finally{f.close();}
});

test("an older concurrent hook can restore an identical binding and replay selects the latest release",()=>{
 const f=fixture();try {
  f.release();
  f.tasks.bindOwner(f.a.task,f.host,f.a.binding.reader);
  f.generations.reserveStartupTask(f.a.task,f.a.reader);
  const latest=f.release();
  assert.deepEqual(f.release(),latest);assert.ok(f.tasks.owner(f.b.task));
 }finally{f.close();}
});

test("a real closed task with retirement pending cannot relinquish its update-owned binding",()=>{
 const f=fixture();try {
  f.tasks.event("codex",{session_id:"chat-a",hook_event_name:"SessionEnd"},f.root,fileDigest(f.lockPath),f.a.environment);
  assert.throws(()=>f.release(),/Open startup task/);
  assert.deepEqual(f.tasks.owner(f.a.task),f.a.binding);assert.equal(f.generations.state().readers.length,2);
 }finally{f.close();}
});
