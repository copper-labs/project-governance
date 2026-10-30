import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {workflowResourceRelease}=await import(moduleUrl("workflow-resource-release"));
const {managedCommandEffect}=await import(moduleUrl("runtime-invocation"));
const {processFingerprint}=await import(moduleUrl("process-owner"));
const cli=process.env.GOVERNANCE_RESOURCE_TEST_CLI ?? (process.env.GOVERNANCE_HOST_TEST_PACKAGE ? join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js") : fileURLToPath(new URL("../src/cli.ts",import.meta.url)));
function call(f:Awaited<ReturnType<typeof ownerReleaseFixture>>,command="workflow-release-resources",args=f.args){return spawnSync(process.execPath,[cli,command,...args],{cwd:f.dir,encoding:"utf8",timeout:15000});}

test("public owner release preserves original failed outcome and emits the actual original receipt",async()=>{
 const f=await ownerReleaseFixture();try{
  const original=readFileSync(join(f.command,"result.json"));assert.equal(f.run.state,"unknown");assert.equal(f.held().length,2);
  const released=call(f);assert.equal(released.status,0,released.stderr);const result=JSON.parse(released.stdout);
  assert.equal(result.state,"released");assert.equal(result.workflowState,"unknown");assert.equal(f.held().length,0);
  assert.deepEqual(f.store.read(f.run.id),f.run);assert.deepEqual(readFileSync(join(f.command,"result.json")),original);
  const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.equal(receipt.runId,f.run.id);assert.equal(f.registry.hasRelease(receipt.leases,api.digest(receipt)),true);
  const later=f.registry.acquire(["fixture-local-producer"],"later-owner","later-operation");
  const replay=call(f);assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).receiptDigest,result.receiptDigest);f.registry.assertHeld(later[0]);
  const reconciled=call(f,"workflow-reconcile-cleanup",["--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--receipt",f.receipt,"--registry",f.registry.path,"--worker-directory",f.worker]);
  assert.equal(reconciled.status,1,reconciled.stderr);assert.equal(JSON.parse(reconciled.stdout).run.state,"failed");
  assert.equal(f.store.stages(f.run.id)[0].result.exitCode,1);
 }finally{f.close();}
});

test("public command is a managed write, never a read-only status shortcut",()=>{assert.equal(managedCommandEffect("workflow-release-resources"),"write");});

for(const field of ["revision","authority","kind","evidence-digest","registry","database"])test("changed "+field+" refuses without releasing original claims",async()=>{
 const f=await ownerReleaseFixture();try{
  const i=f.args.indexOf("--"+field);f.args[i+1]=field==="revision"?String(f.run.revision+1):field==="registry"?f.database:field==="database"?f.registry.path:"wrong";
  assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);assert.equal(existsSync(f.receipt),false);
 }finally{f.close();}
});

for(const field of ["closed","legacy-lock","unknown-identity","stale-window","other-run","changed-bytes"])test("unqualified owner evidence refuses: "+field,async()=>{
 const f=await ownerReleaseFixture();try{
  const metadata=statSync(f.report),report=JSON.parse(readFileSync(f.report,"utf8"));
  if(field==="closed")report.processClosure.closed=false;
  if(field==="legacy-lock")report.legacyLockReleased=false;
  if(field==="unknown-identity")for(const pid of Object.keys(report.observedProcessIdentities))report.observedProcessIdentities[pid]="unknown";
  if(field==="stale-window")report.ended=1;
  if(field==="other-run")report.observedProcessIdentities={2147483647:"Wed Oct 28 12:00:00 2026"};
  if(field==="changed-bytes")report.extra="changed";
  writeFileSync(f.report,JSON.stringify(report));utimesSync(f.report,metadata.atime,metadata.mtime);
  if(field!=="changed-bytes")f.args[f.args.indexOf("--evidence-digest")+1]=api.fileDigest(f.report);
  assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);
 }finally{f.close();}
});

for(const field of ["worker","guardian","machine","native-receipt","membership","command-request"])test("unqualified original ownership refuses: "+field,async()=>{
 const f=await ownerReleaseFixture();try{
  const path=field==="worker"?join(f.worker,"owner.json"):join(f.command,field==="guardian"?"guardian.json":field==="machine"?"launch.json":field==="native-receipt"?"result.json":field==="membership"?"group-members.json":"request.json");
  const data=JSON.parse(readFileSync(path,"utf8"));
  if(field==="worker"||field==="guardian"){data.pid=process.pid;data.fingerprint=processFingerprint(process.pid);}
  if(field==="machine")data.machineId="machine:sha256:"+"a".repeat(64);
  if(field==="native-receipt")data.cleanup="unknown";
  if(field==="membership")data.identityDigest="changed";
  if(field==="command-request")data.operation.env.CHANGED="yes";
  writeFileSync(path,JSON.stringify(data));assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("transferred generations cannot be released as the original owner",async()=>{
 const f=await ownerReleaseFixture();try{
  const leases=f.registry.originalLeases(f.run.id,f.run.owner);const transferred=f.registry.transfer(leases[0],"other-owner","actual handoff");
  assert.throws(()=>workflowResourceRelease(f.args,f.dir));f.registry.assertHeld(transferred);assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("interrupted journal release reuses exact original receipt without replacing failed results",async()=>{
 const f=await ownerReleaseFixture();try{
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw new Error("synthetic interruption before atomic release");});
  try{assert.throws(()=>workflowResourceRelease(f.args,f.dir),/synthetic interruption/);}finally{stub.mock.restore();}
  const original=readFileSync(f.receipt);assert.equal(f.held().length,2);
  const released=workflowResourceRelease(f.args,f.dir);assert.equal(released.state,"released");assert.deepEqual(readFileSync(f.receipt),original);
  assert.equal(f.held().length,0);assert.equal(f.store.stages(f.run.id)[0].state,"failed");
 }finally{f.close();}
});

test("an unrelated existing receipt is never overwritten",async()=>{
 const f=await ownerReleaseFixture();try{
  writeFileSync(f.receipt,'{"runId":"other"}\n');const bytes=readFileSync(f.receipt);
  assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.deepEqual(readFileSync(f.receipt),bytes);assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("clean installed candidate also admits the normal managed public route",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION||!process.env.GOVERNANCE_HOST_TEST_PACKAGE},async()=>{
 const f=await ownerReleaseFixture();try{
  const result=spawnSync(process.execPath,[cli,"runtime-run","--registry",join(f.dir,"runtime.sqlite"),"--workspace",f.dir,"--","workflow-release-resources",...f.args],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).state,"released");assert.equal(f.held().length,0);
  assert.equal(f.generations.state().written,true);assert.equal(f.generations.state().readers.length,1,"Original workflow reader remains for normal reconciliation");
 }finally{f.close();}
});


test("late workflow revision changes refuse before the registry commit",async()=>{
 const f=await ownerReleaseFixture();try{
  const original=api.WorkflowStore.prototype.withResourceReleaseSnapshot;
  const stub=mock.method(api.WorkflowStore.prototype,"withResourceReleaseSnapshot",function(this:any,id:string,expected:string,release:()=>unknown){
   const other=new api.WorkflowStore(f.database);try{const run=other.read(id);other.transition(id,run.owner,run.revision,"reconciling");}finally{other.close();}
   return original.call(this,id,expected,release);
  });
  try{assert.throws(()=>workflowResourceRelease(f.args,f.dir),/changed before/);}finally{stub.mock.restore();}
  assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("changed native evidence during publication retains leases",async()=>{
 const f=await ownerReleaseFixture();try{
  const fs=await import("node:fs"), module=await import("node:module"),original=fs.default.linkSync;
  const stub=mock.method(fs.default,"linkSync",(...args:Parameters<typeof original>)=>{
   const result=original(...args);writeFileSync(join(f.command,"result.json"),JSON.stringify({changed:true}));return result;
  });module.syncBuiltinESMExports();
  try{assert.throws(()=>workflowResourceRelease(f.args,f.dir),/evidence changed/);}finally{stub.mock.restore();module.syncBuiltinESMExports();}
  assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("known device custody cannot use local host process cleanup",async()=>{
 const f=await ownerReleaseFixture(["device:fixture"]);try{
  assert.throws(()=>workflowResourceRelease(f.args,f.dir),/qualified resource adapter/);assert.equal(f.held().length,1);
 }finally{f.close();}
});


for(const field of ["owner","revision","token","missing"])test("original generation reader is required: "+field,{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await ownerReleaseFixture();try{
  const requestPath=join(f.worker,"request.json"),ownerPath=join(f.worker,"owner.json"),request=JSON.parse(readFileSync(requestPath,"utf8")),owner=JSON.parse(readFileSync(ownerPath,"utf8"));
  if(field==="owner")request.generation.owner="unrelated";
  if(field==="revision")request.generation.revision++;
  if(field==="token")request.generation.token="00000000-0000-4000-8000-000000000000";
  if(field==="missing")f.generations.release(request.generation.token,request.generation.owner);
  if(field!=="missing"){owner.requestDigest=api.digest(request);writeFileSync(requestPath,JSON.stringify(request));writeFileSync(ownerPath,JSON.stringify(owner));}
  assert.throws(()=>workflowResourceRelease(f.args,f.dir));assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("a transfer racing the atomic registry commit preserves every original claim",async()=>{
 const f=await ownerReleaseFixture();try{
  const original=api.ResourceRegistry.prototype.release;
  const stub=mock.method(api.ResourceRegistry.prototype,"release",function(this:any,leases:any[],observation:string){
   this.transfer(leases[0],"late-owner","observed handoff");return original.call(this,leases,observation);
  });
  try{assert.throws(()=>workflowResourceRelease(f.args,f.dir),/STALE_OWNER/);}finally{stub.mock.restore();}
  assert.equal(f.held().length,2);assert.equal(f.registry.inspect().filter((row:any)=>row.state==="released").length,0);
 }finally{f.close();}
});


test("undeclared execution fields cannot enter the native owner release path",async()=>{
 const f=await ownerReleaseFixture();try{
  const path=join(f.command,"request.json"),request=JSON.parse(readFileSync(path,"utf8"));request.undeclaredExecution={route:"other"};
  writeFileSync(path,JSON.stringify(request));assert.throws(()=>workflowResourceRelease(f.args,f.dir),/Original command differs from workflow stage/);
  assert.equal(f.held().length,2);
 }finally{f.close();}
});
