import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, copyFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const { workflowResourceRelease } = await import(moduleUrl("workflow-resource-release"));
const { processFingerprint } = await import(moduleUrl("process-owner"));
const { recoverCommandOwner } = await import(moduleUrl("command-owner-recovery"));
const { qualifiedWorkflowCommandCleanup } = await import(moduleUrl("workflow-command-cleanup"));
const { workflowResourceEvidence } = await import(moduleUrl("workflow-resource-evidence"));
const cli=process.env.GOVERNANCE_HOST_TEST_PACKAGE ? join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js") : fileURLToPath(new URL("../src/cli.ts",import.meta.url));

async function fixture(resources=["local:fixture-build","local:fixture-manifest"],exitCode=0) {
 const f=await ownerReleaseFixture(resources,false,exitCode,{producer:()=>`import{writeFileSync}from'node:fs';await new Promise(r=>setTimeout(r,400));writeFileSync(process.argv[2],JSON.stringify([{name:'synthetic-build',exitCode:${exitCode}}]));process.exit(${exitCode});`});
 assert.equal(existsSync(join(f.command,"group-members.json")),true,"Synthetic fixture must retain sampled process membership");
 const native=join(f.command,"result.json"),args=[...f.args];
 args[args.indexOf("--evidence")+1]=native;args[args.indexOf("--evidence-digest")+1]=api.fileDigest(native);
 return {...f,native,nativeArgs:args};
}

test("explicit local owner can select its original native cleanup without a duplicate report",async()=>{
 const f=await fixture();try{
  const native=readFileSync(f.native),report=readFileSync(f.report),stages=f.store.stages(f.run.id);
  const result=spawnSync(process.execPath,[cli,"workflow-release-resources",...f.nativeArgs],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).state,"released");
  assert.equal(f.held().length,0);assert.deepEqual(f.store.read(f.run.id),f.run);
  assert.deepEqual(readFileSync(f.native),native);assert.deepEqual(readFileSync(f.report),report);assert.deepEqual(f.store.stages(f.run.id),stages);
  const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.equal(receipt.observation.proof.closureAuthority,"original-confirmed-native-receipt");
  const reconciled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--receipt",f.receipt,"--registry",f.registry.path,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(reconciled.status,0,reconciled.stderr);assert.equal(JSON.parse(reconciled.stdout).run.state,"succeeded");
  assert.deepEqual(f.store.stages(f.run.id),stages);
  if(f.generations)assert.equal(f.generations.state().readers.length,0);
 }finally{f.close();}
});

test("the malformed project report remains rejected rather than being rewritten",async()=>{
 const f=await fixture();try{assert.throws(()=>workflowResourceRelease(f.args,f.dir),/must be an object/);assert.equal(f.held().length,2);assert.equal(existsSync(f.receipt),false);}finally{f.close();}
});

for(const resources of [["opaque-build"],["ios:fixture"],["device:fixture"],["service:fixture"],["remote:fixture"],["local:fixture-build","tcp:12345"]])
test("native receipt cannot release external or unclassified scope: "+resources.join(","),async()=>{
 const f=await fixture(resources);try{
  assert.throws(()=>workflowResourceRelease(f.nativeArgs,f.dir),/qualified resource adapter|exclusively local reservations/);
  assert.equal(f.held().length,resources.length);assert.equal(existsSync(f.receipt),false);
 }finally{f.close();}
});

for(const field of ["digest","unknown-cleanup","missing-membership","live-member","wrong-runtime","copied-receipt"])
test("native receipt requires exact original closure: "+field,async()=>{
 const f=await fixture();try{
  let expected=/Selected original native cleanup digest differs/;
  if(field==="digest")f.nativeArgs[f.nativeArgs.indexOf("--evidence-digest")+1]="sha256:"+"0".repeat(64);
  if(field==="unknown-cleanup"||field==="wrong-runtime"){
   const receipt=JSON.parse(readFileSync(f.native,"utf8"));
   if(field==="unknown-cleanup")receipt.cleanup="unknown";else receipt.runtimeVersion="0.0.0";
   writeFileSync(f.native,JSON.stringify(receipt));expected=/Original confirmed native cleanup differs/;
  }
  if(field==="missing-membership"){unlinkSync(join(f.command,"group-members.json"));expected=/Original process membership missing/;}
  if(field==="live-member"){
   const path=join(f.command,"group-members.json"),record=JSON.parse(readFileSync(path,"utf8"));
   record.members.push({pid:process.pid,fingerprint:processFingerprint(process.pid)});record.identityDigest=api.digest(record.members);writeFileSync(path,JSON.stringify(record));
   expected=/process group still present or PID reused/;
  }
  if(field==="copied-receipt"){
   const copy=join(f.dir,"copied-result.json");copyFileSync(f.native,copy);f.nativeArgs[f.nativeArgs.indexOf("--evidence")+1]=copy;expected=/must be an object/;
  }
  assert.throws(()=>workflowResourceRelease(f.nativeArgs,f.dir),expected);assert.equal(f.held().length,2);assert.equal(existsSync(f.receipt),false);
 }finally{f.close();}
});

test("native release preserves a failed build and successor claims on replay",async()=>{
 const f=await fixture(undefined,1);try{
  const original=readFileSync(f.native),stages=f.store.stages(f.run.id);workflowResourceRelease(f.nativeArgs,f.dir);
  const leases=f.registry.acquire(["local:fixture-build","local:fixture-manifest"],"successor","successor-work");
  assert.equal(workflowResourceRelease(f.nativeArgs,f.dir).replayed,true);
  for(const lease of leases)f.registry.assertHeld(lease);
  const reconciled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--receipt",f.receipt,"--registry",f.registry.path,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(reconciled.status,1,reconciled.stderr);assert.equal(JSON.parse(reconciled.stdout).run.state,"failed");assert.deepEqual(f.store.stages(f.run.id),stages);
  if(f.generations)assert.equal(f.generations.state().readers.length,0);
  for(const lease of leases)f.registry.assertHeld(lease);
  assert.equal(f.store.stages(f.run.id)[0].state,"failed");assert.deepEqual(readFileSync(f.native),original);
 }finally{f.close();}
});

test("a symlink replacing the actual original native receipt cannot supply closure",async()=>{
 const f=await fixture();try{
  const copy=join(f.dir,"saved-result.json");copyFileSync(f.native,copy);unlinkSync(f.native);symlinkSync(copy,f.native);
  assert.throws(()=>workflowResourceRelease(f.nativeArgs,f.dir),/uses an alias/);assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("a caller alias may select the same canonical original receipt",async()=>{
 const f=await fixture();try{
  const alias=join(f.dir,"original-result-link.json");symlinkSync(f.native,alias);f.nativeArgs[f.nativeArgs.indexOf("--evidence")+1]=alias;
  assert.equal(workflowResourceRelease(f.nativeArgs,f.dir).state,"released");assert.equal(f.held().length,0);
 }finally{f.close();}
});

test("multiple settled local commands cannot select native-only cleanup",async()=>{
 const f=await ownerReleaseFixture(["local:fixture-build"],false,0,{stages:[{id:"native",operation:"check",deadlineMs:5000},{id:"second",operation:"check",deadlineMs:5000,dependsOn:["native"]}]});
 try{
  const path=join(f.command,"result.json"),args=[...f.args];args[args.indexOf("--evidence")+1]=path;args[args.indexOf("--evidence-digest")+1]=api.fileDigest(path);
  assert.equal(f.store.stages(f.run.id).every((stage:any)=>stage.state==="succeeded"),true);
  assert.throws(()=>workflowResourceRelease(args,f.dir),/one original local producer\/storage command/);assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("later owner recovery cannot be relabeled original native confirmation",async()=>{
 const f=await fixture();try{
  const raw=JSON.parse(readFileSync(f.native,"utf8"));raw.cleanup="unknown";writeFileSync(f.native,JSON.stringify(raw));
  const request=JSON.parse(readFileSync(join(f.command,"request.json"),"utf8"));recoverCommandOwner(f.command,api.digest(request),"host:synthetic-cleanup");
  const qualified=qualifiedWorkflowCommandCleanup(f.command,raw,[0]);assert.equal(qualified?.receipt.cleanup,"confirmed");assert.ok(qualified?.recovery);
  const stages=f.store.stages(f.run.id);stages[0].result.cleanupRecovery=qualified.recovery;
  assert.throws(()=>workflowResourceEvidence(f.worker,f.run,stages,f.native,api.fileDigest(f.native)),/original supervisor's confirmed cleanup/);
  assert.equal(f.held().length,2);assert.equal(existsSync(f.receipt),false);
 }finally{f.close();}
});

test("native release journal retries preserve bytes and transferred ownership refuses",async()=>{
 const f=await fixture();try{
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("synthetic interrupted native release");});
  try{assert.throws(()=>workflowResourceRelease(f.nativeArgs,f.dir),/synthetic interrupted/);}finally{stub.mock.restore();}
  const original=readFileSync(f.receipt);assert.equal(f.held().length,2);
  workflowResourceRelease(f.nativeArgs,f.dir);assert.deepEqual(readFileSync(f.receipt),original);
 }finally{f.close();}
 const f2=await fixture();try{
  const original=f2.registry.originalLeases(f2.run.id,f2.run.owner),transferred=f2.registry.transfer(original[0],"new-owner","synthetic handoff");
  assert.throws(()=>workflowResourceRelease(f2.nativeArgs,f2.dir),/STALE_OWNER/);f2.registry.assertHeld(transferred);assert.equal(f2.held().length,2);
 }finally{f2.close();}
});

test("native release requires its original runtime reader",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await fixture();try{
  const request=JSON.parse(readFileSync(join(f.worker,"request.json"),"utf8"));
  f.generations.release(request.generation.token,request.generation.owner);
  assert.throws(()=>workflowResourceRelease(f.nativeArgs,f.dir),/Original workflow generation reader differs/);assert.equal(f.held().length,2);
 }finally{f.close();}
});
