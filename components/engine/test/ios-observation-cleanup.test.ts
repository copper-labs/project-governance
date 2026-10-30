import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync, utimesSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {workflowResourceReleaseCommand:release}=await import(moduleUrl("workflow-resource-release"));
const {processFingerprint}=await import(moduleUrl("process-owner"));
const udid="00000000-0000000000000001",bundle="example.sample.app",identifier="fixture-device",appUrl="file:///private/apps/fixture/Sample.app/";
const resources=[`ios-device:${udid}`,`ios-app:${udid}:${bundle}`,"fixture-local-storage"];
const cli=process.env.GOVERNANCE_RESOURCE_TEST_CLI??(process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url)));
const data={details:{identifier,hardwareProperties:{udid},deviceProperties:{bootState:"booted"}},
 apps:{deviceIdentifier:identifier,apps:[{bundleIdentifier:bundle,url:appUrl}]},processes:{deviceIdentifier:identifier,runningProcesses:[]}};
function probes(overrides:Record<string,unknown>={}){return{device:async(_id:string,kind:string)=>({...data,...overrides})[kind as keyof typeof data],portClosed:async()=>{throw Error("No network claim selected");}};}
async function fixture(exitCode=0,claims=resources){
 const f=await ownerReleaseFixture(claims,true,exitCode),lock=join(f.dir,"original-owner.lock");
 f.args[f.args.indexOf("--kind")+1]="ios-observation";f.args.push("--local-resource","fixture-local-storage","--lock-directory",lock);
 return{...f,lock};
}
function preload(f:Awaited<ReturnType<typeof fixture>>){
 const path=join(f.dir,"qualified-probes.mjs");
 writeFileSync(path,`import cp from'node:child_process';import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';
 const replies=${JSON.stringify(data)};cp.execFile=(file,args,options,callback)=>{
 if(file!=='/usr/bin/xcrun'||args.slice(0,3).join(' ')!=='devicectl device info'||!replies[args[3]]||args[5]!==${JSON.stringify(udid)})throw Error('Unexpected non-observation command');
 fs.writeFileSync(args[args.indexOf('--json-output')+1],JSON.stringify({info:{outcome:'success'},result:replies[args[3]]}));queueMicrotask(()=>callback(null,''));};syncBuiltinESMExports();`);
 return path;
}

test("public mixed owner route preserves every original claim and successful outcome until normal reconciliation",async()=>{
 const f=await fixture();try{
  const native=readFileSync(join(f.command,"result.json")),original=f.registry.originalLeases(f.run.id,f.run.owner);
  const result=spawnSync(process.execPath,["--import",preload(f),cli,"workflow-release-resources",...f.args],{cwd:f.dir,encoding:"utf8",timeout:20000});
  assert.equal(result.status,0,result.stderr);assert.equal(f.held().length,0);assert.deepEqual(f.store.read(f.run.id),f.run);
  const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.deepEqual(receipt.leases,original);
  assert.equal(receipt.observation.proof.fresh.assertions.sdkLifecycle,"unclaimed");
  assert.equal(receipt.observation.proof.fresh.assertions.device.appProcessAbsent,true);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);
  const settled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(settled.status,0,settled.stderr);assert.equal(JSON.parse(settled.stdout).run.state,"succeeded");
 }finally{f.close();}
});

test("failed observation outcomes stay failed after mixed cleanup",async()=>{
 const f=await fixture(1);try{assert.equal((await release(f.args,f.dir,probes())).state,"released");assert.equal(f.store.stages(f.run.id)[0].state,"failed");assert.equal(f.store.stages(f.run.id)[0].result.exitCode,1);}finally{f.close();}
});

test("original confirmed native cleanup covers a fast observation with no membership history",async()=>{
 const f=await fixture();try{
  rmSync(join(f.command,"group-members.json"));
  assert.equal((await release(f.args,f.dir,probes())).state,"released");
  const receipt=JSON.parse(readFileSync(f.receipt,"utf8")),command=receipt.observation.proof.original.commands[0];
  assert.equal(command.membersDigest,null);assert.equal(command.membershipHistory,"not-recorded");assert.equal(command.closureAuthority,"original-confirmed-native-receipt");
 }finally{f.close();}
});

test("missing history cannot convert unknown native cleanup into original confirmed closure",async()=>{
 const f=await fixture();try{
  rmSync(join(f.command,"group-members.json"));const path=join(f.command,"result.json"),receipt=JSON.parse(readFileSync(path,"utf8"));receipt.cleanup="unknown";writeFileSync(path,JSON.stringify(receipt));
  await assert.rejects(()=>release(f.args,f.dir,probes()));assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("recovered cleanup without membership cannot impersonate original supervisor confirmation",async()=>{
 const f=await fixture(1);try{
  rmSync(join(f.command,"group-members.json"));const path=join(f.command,"result.json"),raw=JSON.parse(readFileSync(path,"utf8"));
  raw.state="unknown";raw.cleanup="unknown";writeFileSync(path,JSON.stringify(raw));
  const stage=f.store.stages(f.run.id)[0],db=new DatabaseSync(f.database);
  db.prepare("UPDATE engine_stage SET state='unknown',result=? WHERE run_id=? AND id=?").run(JSON.stringify({...stage.result,state:"unknown",cleanup:"unknown"}),f.run.id,stage.id);db.close();
  const {recoverCommandOwner}=await import(moduleUrl("command-owner-recovery"));
  const {recoverStoppedWorkflow}=await import(moduleUrl("workflow-worker-recovery"));
  recoverCommandOwner(f.command,raw.requestDigest,"host:fixture-owner");const recovered=await recoverStoppedWorkflow(f.worker,f.database,f.run.id,f.run.revision);
  f.args[f.args.indexOf("--revision")+1]=String(recovered.run.revision);
  assert.ok(f.store.stages(f.run.id)[0].result.cleanupRecovery);
  await assert.rejects(()=>release(f.args,f.dir,probes()),/Original process membership missing/);assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("a newly appearing historical membership file refuses observation release",async()=>{
 const f=await fixture();try{
  const path=join(f.command,"group-members.json"),bytes=readFileSync(path);rmSync(path);let once=false;
  const p={...probes(),device:async(id:string,kind:string)=>{if(!once){once=true;writeFileSync(path,bytes);}return probes().device(id,kind);}};
  await assert.rejects(()=>release(f.args,f.dir,p),/membership evidence changed/);assert.equal(f.held().length,3);
 }finally{f.close();}
});

for(const field of ["launch","lock","device","date","bytes"])test("original observation refusal: "+field,async()=>{
 const f=await fixture();try{
  const metadata=statSync(f.report),r=JSON.parse(readFileSync(f.report,"utf8"));
  if(field==="launch")r.appOrSDKLaunch=true;if(field==="lock")r.ownedFileLockHeld=true;if(field==="device")r.deviceUdid="wrong";if(field==="date")r.observedAt="2000-01-01T00:00:00Z";if(field==="bytes")r.changed=true;
  writeFileSync(f.report,JSON.stringify(r));utimesSync(f.report,metadata.atime,metadata.mtime);
  if(field!=="bytes")f.args[f.args.indexOf("--evidence-digest")+1]=api.fileDigest(f.report);
  await assert.rejects(()=>release(f.args,f.dir,probes()));assert.equal(f.held().length,3);
 }finally{f.close();}
});

for(const field of ["live-app","wrong-device","missing-app","unknown-process","disconnect"])test("fresh physical refusal: "+field,async()=>{
 const f=await fixture();try{
  const p=field==="disconnect"?{...probes(),device:async()=>{throw Error("offline");}}:probes(field==="live-app"?{processes:{deviceIdentifier:identifier,runningProcesses:[{executable:appUrl+"Sample",processIdentifier:17}]}}:field==="wrong-device"?{details:{...data.details,hardwareProperties:{udid:"other"}}}:field==="missing-app"?{apps:{deviceIdentifier:identifier,apps:[]}}:{processes:{deviceIdentifier:identifier,runningProcesses:[{}]}});
  await assert.rejects(()=>release(f.args,f.dir,p),/Fresh qualified/);assert.equal(f.held().length,3);assert.equal(existsSync(f.receipt),false);
 }finally{f.close();}
});

for(const field of ["present-lock","symlink-lock","unsupported-claim","live-worker"])test("original owner refusal before device observation: "+field,async()=>{
 const f=await fixture(0,field==="unsupported-claim"?[...resources,"remote:other"]:resources);try{
  if(field==="present-lock")mkdirSync(f.lock);if(field==="symlink-lock")symlinkSync("nonexistent",f.lock);
  if(field==="live-worker"){const p=join(f.worker,"owner.json"),o=JSON.parse(readFileSync(p,"utf8"));o.pid=process.pid;o.fingerprint=processFingerprint(process.pid);writeFileSync(p,JSON.stringify(o));}
  let called=false;await assert.rejects(()=>release(f.args,f.dir,{...probes(),device:async()=>{called=true;throw Error("No probe expected");}}));assert.equal(called,false);assert.equal(f.held().length,field==="unsupported-claim"?4:3);
 }finally{f.close();}
});

test("interrupted mixed release reuses the original receipt and obtains fresh closure again",async()=>{
 const f=await fixture();try{
  let calls=0;const p={...probes(),device:async(id:string,kind:string)=>{calls++;return probes().device(id,kind);}};
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted");});
  try{await assert.rejects(()=>release(f.args,f.dir,p),/interrupted/);}finally{stub.mock.restore();}
  const bytes=readFileSync(f.receipt);assert.equal(f.held().length,3);assert.equal((await release(f.args,f.dir,p)).state,"released");assert.deepEqual(readFileSync(f.receipt),bytes);assert.equal(calls,6);
  const next=f.registry.acquire([resources[0]],"later","later-operation");assert.equal((await release(f.args,f.dir,{...probes(),device:async()=>{throw Error("Already recorded release must not reprobe");}})).replayed,true);f.registry.assertHeld(next[0]);
 }finally{f.close();}
});

for(const race of ["report","workflow","lease","lock"])test("mixed observation race preserves claims: "+race,async()=>{
 const f=await fixture();try{
  let once=false;const p={...probes(),device:async(id:string,kind:string)=>{
   if(!once){once=true;if(race==="report")writeFileSync(f.report,'{}');if(race==="workflow")f.store.transition(f.run.id,f.run.owner,f.run.revision,"reconciling");if(race==="lease")f.registry.transfer(f.registry.originalLeases(f.run.id,f.run.owner)[0],"later","transfer");if(race==="lock")mkdirSync(f.lock);}
   return probes().device(id,kind);
  }};
  await assert.rejects(()=>release(f.args,f.dir,p));assert.equal(f.held().length,3);assert.equal(f.registry.inspect().filter((x:any)=>x.state==="released").length,0);
 }finally{f.close();}
});

test("final protected candidate admits the mixed route through managed invocation",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION||!process.env.GOVERNANCE_HOST_TEST_PACKAGE},async()=>{
 const f=await fixture();try{
  const p=preload(f);const result=spawnSync(process.execPath,[cli,"runtime-run","--registry",join(f.dir,"runtime.sqlite"),"--workspace",f.dir,"--","workflow-release-resources",...f.args],{cwd:f.dir,env:{...process.env,NODE_OPTIONS:'--import='+JSON.stringify(p)},encoding:"utf8",timeout:20000});
  assert.equal(result.status,0,result.stderr);assert.equal(f.held().length,0);assert.equal(f.generations.state().written,true);
 }finally{f.close();}
});

test("delayed fresh device readback cannot commit a stale release",async()=>{
 const f=await fixture();try{
  let reads=0;const stub=mock.method(performance,"now",()=>reads++===0?0:6000);
  try{await assert.rejects(()=>release(f.args,f.dir,probes()),/expired before/);}finally{stub.mock.restore();}
  assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("a lock appearing after receipt publication prevents the final release",async()=>{
 const f=await fixture();try{
  const fs=await import("node:fs"),module=await import("node:module"),original=fs.default.linkSync;
  const stub=mock.method(fs.default,"linkSync",(...args:Parameters<typeof original>)=>{const result=original(...args);mkdirSync(f.lock);return result;});module.syncBuiltinESMExports();
  try{await assert.rejects(()=>release(f.args,f.dir,probes()),/lock remains present/);}finally{stub.mock.restore();module.syncBuiltinESMExports();}
  assert.equal(f.held().length,3);assert.equal(existsSync(f.receipt),true);
 }finally{f.close();}
});

test("interrupted release cannot substitute a different local custody mapping",async()=>{
 const f=await fixture();try{
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted");});
  try{await assert.rejects(()=>release(f.args,f.dir,probes()),/interrupted/);}finally{stub.mock.restore();}
  const bytes=readFileSync(f.receipt);f.args[f.args.indexOf("--lock-directory")+1]=join(f.dir,"different.lock");
  await assert.rejects(()=>release(f.args,f.dir,probes()),/binding differs/);assert.deepEqual(readFileSync(f.receipt),bytes);assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("a generation reader lost during device observation cannot release the claims",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await fixture();try{
  const request=JSON.parse(readFileSync(join(f.worker,"request.json"),"utf8"));let once=false;
  const p={...probes(),device:async(id:string,kind:string)=>{if(!once){once=true;f.generations.release(request.generation.token,request.generation.owner);}return probes().device(id,kind);}};
  await assert.rejects(()=>release(f.args,f.dir,p),/generation reader differs/);assert.equal(f.held().length,3);
 }finally{f.close();}
});
