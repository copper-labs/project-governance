import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {workflowResourceRelease,workflowResourceReleaseCommand}=await import(moduleUrl("workflow-resource-release"));
const {observedLocalRequest}=await import(moduleUrl("workflow-local-host-observation"));
const cli=process.env.GOVERNANCE_RESOURCE_TEST_CLI??(process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url)));

// The actual writer omits itself. Its short child has exited before native membership sampling.
function producer(){return `import fs from'node:fs';import{spawn}from'node:child_process';
const childFile=process.argv[2]+'.child';const code=\`const fs=require('node:fs'),cp=require('node:child_process');const fp=cp.execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}}).trim();fs.writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,fingerprint:fp}));process.exit(1);\`;
const child=spawn(process.execPath,['-e',code,childFile],{stdio:'ignore',detached:true});await new Promise(resolve=>child.once('exit',resolve));
const recorded=JSON.parse(fs.readFileSync(childFile,'utf8'));await new Promise(resolve=>setTimeout(resolve,700));
fs.writeFileSync(process.argv[2],JSON.stringify({status:'failed',childStarted:true,processClosure:{closed:true,after:{group:[],observedTree:[]}},observedProcessIdentities:{[recorded.pid]:recorded.fingerprint},legacyLockReleased:true,ended:Date.now()/1000}));process.exit(1);`;}

async function fixture(resources=["fixture-source","fixture-producer","fixture-storage"],joined=false){
 const f=await ownerReleaseFixture(resources,false,1,joined?{}:{producer});
 const approval=join(f.dir,"approval.txt"),mapping=join(f.dir,"mapping.txt"),requestPath=join(f.dir,"observed-request.json"),guard=join(f.dir,"actual-mutex.lock");
 writeFileSync(approval,"Synthetic explicit management decision for only this failed local run.\n");
 writeFileSync(mapping,"Synthetic original producer: all three logical reservations share this one actual mutex.\n");
 const generation=JSON.parse(readFileSync(join(f.worker,"request.json"),"utf8")).generation??null;
 const request={version:1,runId:f.run.id,revision:f.run.revision,owner:f.run.owner,authority:f.run.binding.authorityRef,
  workspace:f.dir,database:f.database,workerDirectory:f.worker,registry:f.registry.path,bindingDigest:api.digest(f.run.binding),
  leases:f.registry.originalLeases(f.run.id,f.run.owner),generation,report:{path:f.report,digest:api.fileDigest(f.report)},
  approval:{path:approval,digest:api.fileDigest(approval)},mappingEvidence:{path:mapping,digest:api.fileDigest(mapping)},
  localOnly:true,historicalMutexMappingConfirmed:true,guards:[{directory:guard,resources}]};
 const save=()=>writeFileSync(requestPath,JSON.stringify(request));save();
 return{...f,request,requestPath,guard,approval,mapping,save,observedArgs:["--kind","local-host-observed","--request-file",requestPath,"--receipt",f.receipt]};
}

test("public alternate proof releases the complete original set while ordinary missing-overlap proof refuses",async()=>{
 const f=await fixture();try{
  const original=readFileSync(f.report),native=readFileSync(join(f.command,"result.json")),stages=f.store.stages(f.run.id);
  assert.throws(()=>workflowResourceRelease(f.args,f.dir),/stale or belongs/);assert.equal(f.held().length,3);
  const released=spawnSync(process.execPath,[cli,"workflow-release-resources",...f.observedArgs],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(released.status,0,released.stderr);assert.equal(f.held().length,0);
  const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));assert.equal(receipt.observation.kind,"workflow-local-host-observed-cleanup");
  assert.equal(receipt.observation.proof.original.historicalProcessJoin,"missing");assert.equal(receipt.leases.length,3);
  assert.deepEqual(readFileSync(f.report),original);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);assert.deepEqual(f.store.stages(f.run.id),stages);
  const successor=f.registry.acquire(f.request.leases.map((x:any)=>x.resource),"successor","successor-run");
  const replay=await workflowResourceReleaseCommand(f.observedArgs,f.dir);assert.equal(replay.replayed,true);
  for(const lease of successor)f.registry.assertHeld(lease);
  const settled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});
  assert.equal(settled.status,1,settled.stderr);assert.equal(JSON.parse(settled.stdout).run.state,"failed");
  assert.deepEqual(readFileSync(join(f.command,"result.json")),native);assert.equal(f.generations?.state().readers.length??0,0);
 }finally{f.close();}
});

for(const field of ["revision","owner","authority","binding","leases","reader","local-only","mapping-unconfirmed","unmapped","extra","partial","report","approval","mapping","live-lock","lock-alias","parent-alias","missing-parent","native","machine","membership","live-reported-pid","stale-window"])
test("observed local recovery retains all claims when "+field+" differs",async()=>{
 const f=await fixture();try{
  if(field==="revision")f.request.revision++;
  if(field==="owner")f.request.owner="other";
  if(field==="authority")f.request.authority="other";
  if(field==="binding")f.request.bindingDigest="sha256:"+"a".repeat(64);
  if(field==="leases")f.request.leases[0].generation++;
  if(field==="reader")f.request.generation={token:"other"};
  if(field==="local-only")f.request.localOnly=false;
  if(field==="mapping-unconfirmed")f.request.historicalMutexMappingConfirmed=false;
  if(field==="unmapped")f.request.guards[0]!.resources=f.request.guards[0]!.resources.slice(1);
  if(field==="extra")f.request.guards[0]!.resources=[...f.request.guards[0]!.resources,"extra"];
  if(field==="partial")f.request.leases=f.request.leases.slice(1);
  if(field==="report")writeFileSync(f.report,"{}");
  if(field==="approval")writeFileSync(f.approval,"changed");
  if(field==="mapping")writeFileSync(f.mapping,"changed");
  if(field==="live-lock")mkdirSync(f.guard);
  if(field==="lock-alias")symlinkSync(f.dir,f.guard);
  if(field==="parent-alias"){const alias=join(f.dir,"alias");symlinkSync(f.dir,alias);f.request.guards[0]!.directory=join(alias,"absent.lock");}
  if(field==="missing-parent")f.request.guards[0]!.directory=join(f.dir,"missing","absent.lock");
  if(field==="native"){const path=join(f.command,"result.json"),data=JSON.parse(readFileSync(path,"utf8"));data.cleanup="unknown";writeFileSync(path,JSON.stringify(data));}
  if(field==="machine"){const path=join(f.command,"launch.json"),data=JSON.parse(readFileSync(path,"utf8"));data.machineId="machine:sha256:"+"a".repeat(64);writeFileSync(path,JSON.stringify(data));}
  if(field==="membership"){const path=join(f.command,"group-members.json"),data=JSON.parse(readFileSync(path,"utf8"));data.identityDigest="changed";writeFileSync(path,JSON.stringify(data));}
  if(field==="live-reported-pid"||field==="stale-window"){
   const metadata=statSync(f.report),data=JSON.parse(readFileSync(f.report,"utf8"));
   if(field==="live-reported-pid")data.observedProcessIdentities={[process.pid]:"Wed Oct 28 12:00:00 2026"};else data.ended=1;
   writeFileSync(f.report,JSON.stringify(data));utimesSync(f.report,metadata.atime,metadata.mtime);f.request.report.digest=api.fileDigest(f.report);
  }
  f.save();await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir));assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("approved alternate request cannot take known device custody",async()=>{
 const f=await fixture(["device:fixture","fixture-producer","fixture-storage"]);try{
  await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/qualified resource adapter/);assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("interrupted alternate journal is resumed without changing original receipt or raw failure",async()=>{
 const f=await fixture();try{
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("synthetic before-release interruption");});
  try{await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/synthetic before-release/);}finally{stub.mock.restore();}
  const journal=readFileSync(f.receipt);assert.equal(f.held().length,3);
  await workflowResourceReleaseCommand(f.observedArgs,f.dir);assert.equal(f.held().length,0);assert.deepEqual(readFileSync(f.receipt),journal);
  assert.equal(f.store.stages(f.run.id)[0].result.exitCode,1);
 }finally{f.close();}
});

for(const mutation of ["guard","approval","mapping","native","workflow","transfer"])
test("fresh observations and snapshot fences reject a late "+mutation+" change",async()=>{
 const f=await fixture();try{
  const fs=await import("node:fs"),module=await import("node:module"),original=fs.default.linkSync;
  const stub=mock.method(fs.default,"linkSync",(...args:Parameters<typeof original>)=>{
   const result=original(...args);
   if(mutation==="guard")mkdirSync(f.guard);
   if(mutation==="approval")writeFileSync(f.approval,"changed");
   if(mutation==="mapping")writeFileSync(f.mapping,"changed");
   if(mutation==="native")writeFileSync(join(f.command,"result.json"),"{}");
   if(mutation==="workflow")f.store.transition(f.run.id,f.run.owner,f.run.revision,"reconciling");
   if(mutation==="transfer")f.registry.transfer(f.request.leases[0],"late-owner","observed handoff");
   return result;
  });module.syncBuiltinESMExports();
  try{await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir));}finally{stub.mock.restore();module.syncBuiltinESMExports();}
  assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("an incomplete process enumeration refuses fresh evidence",async()=>{
 const f=await fixture();try{
  const cp=await import("node:child_process"),module=await import("node:module"),original=cp.default.execFileSync;
  const stub=mock.method(cp.default,"execFileSync",((...args:any[])=>args[0]==="/bin/ps"&&args[1][0]==="-axo"?"1 0 1 S\n":(original as any)(...args))as typeof original);module.syncBuiltinESMExports();
  try{await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/Incomplete process enumeration/);}finally{stub.mock.restore();module.syncBuiltinESMExports();}
  assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("mapping snapshots do not themselves observe or release custody",async()=>{
 const f=await fixture();try{mkdirSync(f.guard);const selected=observedLocalRequest(f.observedArgs,f.dir);assert.throws(()=>selected.observe(),/lock remains present/);assert.equal(f.held().length,3);}finally{f.close();}
});

test("an original joined report must retain the ordinary local-host route",async()=>{
 const f=await fixture(undefined,true);try{
  await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/Original identity join exists/);assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("fresh inventory retains a reused original workflow worker PID after the ordinary start-time check",async()=>{
 const f=await fixture();try{
  const ownerPath=join(f.worker,"owner.json"),metadata=statSync(ownerPath),owner=JSON.parse(readFileSync(ownerPath,"utf8"));
  utimesSync(ownerPath,metadata.atime,new Date(metadata.mtimeMs-10000));
  const replacement=execFileSync("/bin/date",["-u","+%a %b %e %T %Y"],{encoding:"utf8",env:{...process.env,LC_ALL:"C"}}).trim();
  const cp=await import("node:child_process"),module=await import("node:module"),original=cp.default.execFileSync;
  const stub=mock.method(cp.default,"execFileSync",((...args:any[])=>{
   if(args[0]==="/bin/ps"&&args[1][0]==="-p"&&args[1][1]===String(owner.pid))return replacement+(args[1][3]==="lstart=,stat="?" S\n":"\n");
   const result=(original as any)(...args);
   return args[0]==="/bin/ps"&&args[1][0]==="-axo"?result.trimEnd()+`\n${owner.pid} 1 ${owner.pid} S\n`:result;
  })as typeof original);module.syncBuiltinESMExports();
  try{await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/Original command owner or process group still present or PID reused/);}finally{stub.mock.restore();module.syncBuiltinESMExports();}
  assert.equal(f.held().length,3);
 }finally{f.close();}
});

test("a named pipe cannot block approval reference inspection",async()=>{
 const f=await fixture();try{
  const fifo=join(f.dir,"approval.fifo");execFileSync("/usr/bin/mkfifo",[fifo]);f.request.approval.path=fifo;f.save();
  const result=spawnSync(process.execPath,[cli,"workflow-release-resources",...f.observedArgs],{cwd:f.dir,encoding:"utf8",timeout:3000});
  assert.equal(result.status,2,"Reference inspection must refuse the pipe, not time out");
  assert.match(result.stderr,/Command could not complete/);
  assert.throws(()=>observedLocalRequest(f.observedArgs,f.dir),/bounded ordinary file/);assert.equal(f.held().length,3);
 }finally{f.close();}
});

for(const target of ["request","guard","reference"])test("undeclared "+target+" fields cannot enter an observed cleanup journal",async()=>{
 const f=await fixture();try{
  Object.assign(target==="request"?f.request:target==="guard"?f.request.guards[0]!:f.request.approval,{undeclared:"synthetic extra"});f.save();
  await assert.rejects(()=>workflowResourceReleaseCommand(f.observedArgs,f.dir),/Unexpected or missing recovery request fields/);assert.equal(f.held().length,3);
 }finally{f.close();}
});
