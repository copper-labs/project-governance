import assert from "node:assert/strict";
import { test,mock } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync,writeFileSync,statSync,utimesSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api,moduleUrl,ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {workflowResourceReleaseCommand:release}=await import(moduleUrl("workflow-resource-release"));
const udid="00000000-0000-0000-0000-000000000001",resources=[`ios-simulator:${udid}`,"fixture-local-producer"];
const cli=process.env.GOVERNANCE_RESOURCE_TEST_CLI??(process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url)));
const devices={devices:{runtime:[{udid,state:"Shutdown"}]}};
const probes=(value:unknown=devices)=>({devices:async()=>value,portClosed:async()=>{throw Error("No network selected");}});
async function fixture(options?:Parameters<typeof ownerReleaseFixture>[3]){const f=await ownerReleaseFixture(resources,"simulator",1,options);f.args[f.args.indexOf("--kind")+1]="ios-simulator-build";f.args.push("--local-resource",resources[1],"--lock-directory",join(f.dir,"producer.lock"),"--simulator-lock-directory",join(f.dir,"simulator.lock"));return f;}

test("public compiler-only simulator release preserves failed results and both original generations",async()=>{
 const f=await fixture();try{
  const path=join(f.dir,"simulator-probe.mjs");writeFileSync(path,`import cp from'node:child_process';import{syncBuiltinESMExports}from'node:module';const fn=()=>{throw Error('Unexpected callback execution');};fn[Symbol.for('nodejs.util.promisify.custom')]=async(file,args)=>{if(file!=='/usr/bin/xcrun'||args.join(' ')!=='simctl list devices --json')throw Error('Unexpected simulator execution');return{stdout:JSON.stringify(${JSON.stringify(devices)}),stderr:''};};cp.execFile=fn;syncBuiltinESMExports();`);
  const native=readFileSync(join(f.command,"result.json")),leases=f.registry.originalLeases(f.run.id,f.run.owner);
  const result=spawnSync(process.execPath,["--import",path,cli,"workflow-release-resources",...f.args],{cwd:f.dir,encoding:"utf8",timeout:20000});assert.equal(result.status,0,result.stderr);
  assert.equal(f.held().length,0);const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.deepEqual(receipt.leases,leases);assert.equal(receipt.observation.proof.fresh.assertions.sdkLifecycle,"unclaimed");assert.equal(receipt.observation.proof.fresh.assertions.physicalDevice,"unclaimed");assert.deepEqual(readFileSync(join(f.command,"result.json")),native);
  const reconciled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});assert.equal(reconciled.status,1,reconciled.stderr);assert.equal(JSON.parse(reconciled.stdout).run.state,"failed");
 }finally{f.close();}
});

for(const field of ["app","sdk","lock","conflict","stale","identity"])test("compiler-only original proof refuses: "+field,async()=>{
 const f=await fixture();try{
  const metadata=statSync(f.report),o=JSON.parse(readFileSync(f.report,"utf8"));if(field==="app")o.appClosure=[{bundle:"example.app"}];if(field==="sdk")o.nativeSdkRebuilt=true;if(field==="lock")o.legacyLocksReleased=false;if(field==="conflict")o.processClosure.conflicts=["unresolved"];if(field==="stale")o.finished=1;if(field==="identity")o.processClosure.observedIdentities=[{pid:2147483647,started:"1"}];
  writeFileSync(f.report,JSON.stringify(o));utimesSync(f.report,metadata.atime,metadata.mtime);f.args[f.args.indexOf("--evidence-digest")+1]=api.fileDigest(f.report);await assert.rejects(()=>release(f.args,f.dir,probes()));assert.equal(f.held().length,2);
 }finally{f.close();}
});

for(const value of [{devices:{runtime:[{udid,state:"Booted"}]}},{devices:{runtime:[{udid,state:"Shutdown"},{udid,state:"Shutdown"}]}},{}])test("fresh simulator shutdown cannot be missing, live or ambiguous: "+JSON.stringify(value),async()=>{
 const f=await fixture();try{await assert.rejects(()=>release(f.args,f.dir,probes(value)),/Fresh qualified simulator/);assert.equal(f.held().length,2);}finally{f.close();}
});

test("compiler closeout cannot join a process from a different original stage",async()=>{
 const producer=()=>`import fs from'node:fs';const first=process.env.PROJECT_GOVERNANCE_WORKFLOW_STAGE_ID==='first';
 const path=process.argv[2]+'.first';if(first)fs.writeFileSync(path,JSON.stringify({pid:process.pid,started:Date.now()/1000-process.uptime()}));
 await new Promise(resolve=>setTimeout(resolve,400));const identity=JSON.parse(fs.readFileSync(path,'utf8'));
 fs.writeFileSync(process.argv[2],JSON.stringify({nativeSdkRebuilt:false,status:'failed',exitCode:1,legacyLocksReleased:true,appClosure:[],finished:Date.now()/1000,processClosure:{closed:true,conflicts:[],observedIdentities:[identity]}}));process.exit(first?0:1);`;
 const f=await fixture({producer,stages:[{id:"first",operation:"check",deadlineMs:5000},{id:"native",operation:"check",deadlineMs:5000,dependsOn:["first"]}]});try{
  assert.equal(f.store.stages(f.run.id).find((x:any)=>x.id==="first").state,"succeeded");
  await assert.rejects(()=>release(f.args,f.dir,probes()),/Original compiler process identities differ/);assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("simulator interruption replay keeps the original receipt and never releases a later owner",async()=>{
 const f=await fixture();try{
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted");});try{await assert.rejects(()=>release(f.args,f.dir,probes()),/interrupted/);}finally{stub.mock.restore();}
  const original=readFileSync(f.receipt);assert.equal((await release(f.args,f.dir,probes())).state,"released");assert.deepEqual(readFileSync(f.receipt),original);
  const next=f.registry.acquire([resources[1]],"later","later-op");assert.equal((await release(f.args,f.dir,{...probes(),devices:async()=>{throw Error("Must not reprobe historical release");}})).replayed,true);f.registry.assertHeld(next[0]);
 }finally{f.close();}
});

test("a simulator observation racing a producer transfer cannot partially release",async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>release(f.args,f.dir,{...probes(),devices:async()=>{f.registry.transfer(f.registry.originalLeases(f.run.id,f.run.owner)[0],"later","actual transfer");return devices;}}),/STALE_OWNER/);assert.equal(f.held().length,2);assert.equal(f.registry.inspect().filter((v:any)=>v.state==="released").length,0);
 }finally{f.close();}
});
