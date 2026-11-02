import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, utimesSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const { workflowResourceReleaseCommand: release } = await import(moduleUrl("workflow-resource-release"));
const cli=process.env.GOVERNANCE_RESOURCE_TEST_CLI??(process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url)));
const udid="00000000-0000000000000001",bundle="example.sample.app",identifier="fixture-device",url="file:///private/apps/fixture/Sample.app/";
const pair=[`ios-device:${udid}`,`ios-app:${udid}:${bundle}`];
const replies={details:{identifier,hardwareProperties:{udid},deviceProperties:{bootState:"booted"}},
  apps:{deviceIdentifier:identifier,apps:[{bundleIdentifier:bundle,url}]},processes:{deviceIdentifier:identifier,runningProcesses:[]}};
const probes={device:async(_id:string,kind:string)=>replies[kind as keyof typeof replies],portClosed:async()=>{throw Error("No network custody");}};

async function fixture(device=false,options:{resources?:string[];localResource?:string;twoStages?:boolean;nativeExit?:number;unjoined?:boolean}={}){
  // This real short-lived process is outside the native owner's tree. Its absence
  // exercises approved missing-overlap recovery without inventing a historical PID.
  const outside=options.unjoined?JSON.parse(spawnSync(process.execPath,["-e",`const cp=require('node:child_process');console.log(JSON.stringify({[process.pid]:cp.execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'}).trim()}));`],{encoding:"utf8"}).stdout):null;
  const exit=options.nativeExit??1;
  const f=await ownerReleaseFixture(options.resources??(device?pair:["fixture-producer"]),false,exit,{
    ...(options.twoStages?{stages:[{id:"native",operation:"check",deadlineMs:5000},{id:"later",operation:"check",deadlineMs:5000,dependsOn:["native"]}]}:{}),producer:()=>device?
    `import fs from'node:fs';await new Promise(r=>setTimeout(r,400));let childStarted=false;try{throw Error('before actor');}catch{fs.writeFileSync(process.argv[2],JSON.stringify({status:'failed',childStarted,processClosure:{closed:true,notStarted:true},legacyLockHeld:false,legacyLockReleased:false,observedProcessIdentities:{},ended:Date.now()/1000}));}process.exit(${exit});`:
    `import fs from'node:fs';import{execFileSync}from'node:child_process';await new Promise(r=>setTimeout(r,400));const fingerprint=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'}).trim();fs.writeFileSync(process.argv[2],JSON.stringify({status:'failed',childStarted:true,processClosure:{closed:true,after:{group:[],observedTree:[]}},legacyLockHeld:false,legacyLockReleased:false,observedProcessIdentities:${outside?JSON.stringify(outside):'{[process.pid]:fingerprint}'},ended:Date.now()/1000}));process.exit(${exit});`});
  const lock=join(f.dir,"actual-original.lock");
  if(device){f.args[f.args.indexOf("--kind")+1]="ios-observation";f.args.push("--lock-directory",lock);if(options.localResource)f.args.push("--local-resource",options.localResource);return{...f,lock,selected:f.args};}
  const approval=join(f.dir,"approval.txt"),mapping=join(f.dir,"mapping.txt"),path=join(f.dir,"request.json");
  writeFileSync(approval,"Synthetic explicit recovery decision for this exact failed run.\n");
  writeFileSync(mapping,"Synthetic captured producer never acquires its mapped actual-original.lock mutex.\n");
  const generation=JSON.parse(readFileSync(join(f.worker,"request.json"),"utf8")).generation??null;
  writeFileSync(path,JSON.stringify({version:1,runId:f.run.id,revision:f.run.revision,owner:f.run.owner,authority:f.run.binding.authorityRef,
    workspace:f.dir,database:f.database,workerDirectory:f.worker,registry:f.registry.path,bindingDigest:api.digest(f.run.binding),leases:f.registry.originalLeases(f.run.id,f.run.owner),generation,
    report:{path:f.report,digest:api.fileDigest(f.report)},approval:{path:approval,digest:api.fileDigest(approval)},mappingEvidence:{path:mapping,digest:api.fileDigest(mapping)},
    localOnly:true,historicalMutexMappingConfirmed:true,guards:[{directory:lock,resources:f.run.binding.recipe.resources}]}));
  return{...f,lock,selected:["--kind","local-host-observed","--request-file",path,"--receipt",f.receipt]};
}

for(const [device,unjoined] of [[false,false],[false,true],[true,false]] as const)test("public recovery preserves never-acquired reports and failed results; device="+device+"; unjoined="+unjoined,async()=>{
  const f=await fixture(device,{unjoined});try{
    const report=readFileSync(f.report),native=readFileSync(join(f.command,"result.json")),stages=f.store.stages(f.run.id);
    let args=[...f.selected];
    if(device){
      const preload=join(f.dir,"observation-only.mjs");writeFileSync(preload,`import cp from'node:child_process';import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';const replies=${JSON.stringify(replies)};cp.execFile=(file,args,options,callback)=>{if(file!=='/usr/bin/xcrun'||args.slice(0,3).join(' ')!=='devicectl device info'||!replies[args[3]]||args[5]!==${JSON.stringify(udid)})throw Error('Unexpected actor command');fs.writeFileSync(args[args.indexOf('--json-output')+1],JSON.stringify({info:{outcome:'success'},result:replies[args[3]]}));queueMicrotask(()=>callback(null,''));};syncBuiltinESMExports();`);
      args=["--import",preload,cli,"workflow-release-resources",...args];
    }else args=[cli,"workflow-release-resources",...args];
    const result=spawnSync(process.execPath,args,{cwd:f.dir,encoding:"utf8",timeout:20000});
    assert.equal(result.status,0,result.stderr);assert.equal(f.held().length,0);
    const receipt=JSON.parse(readFileSync(f.receipt,"utf8"));
    assert.equal(device?receipt.observation.proof.original.executionBoundary:receipt.observation.proof.original.legacyMutexEvidence,device?"before-first-device-actor":"original-never-acquired-and-fresh-absent");
    if(!device)assert.equal(receipt.observation.proof.original.historicalProcessJoin,unjoined?"missing":"present");
    assert.deepEqual(readFileSync(f.report),report);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);assert.deepEqual(f.store.stages(f.run.id),stages);
    const successor=f.registry.acquire(f.run.binding.recipe.resources,"successor","next-run");assert.equal((await release(f.selected,f.dir,probes)).replayed,true);for(const lease of successor)f.registry.assertHeld(lease);
    const settled=spawnSync(process.execPath,[cli,"workflow-reconcile-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:15000});
    assert.equal(settled.status,1,settled.stderr);assert.equal(JSON.parse(settled.stdout).run.state,"failed");assert.deepEqual(readFileSync(f.report),report);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);
  }finally{f.close();}
});

for(const device of [false,true])for(const mutation of ["held","missing-held","closed","stale","live-lock","native","authority","revision"])
test("never-acquired recovery refuses "+mutation+"; device="+device,async()=>{
  const f=await fixture(device);try{
    const metadata=statSync(f.report),report=JSON.parse(readFileSync(f.report,"utf8"));
    if(mutation==="held")report.legacyLockHeld=true;if(mutation==="missing-held")delete report.legacyLockHeld;if(mutation==="closed")report.processClosure.closed=false;if(mutation==="stale")report.ended=1;
    if(["held","missing-held","closed","stale"].includes(mutation)){
      writeFileSync(f.report,JSON.stringify(report));utimesSync(f.report,metadata.atime,metadata.mtime);
      if(device)f.selected[f.selected.indexOf("--evidence-digest")+1]=api.fileDigest(f.report);
      else{const path=f.selected[f.selected.indexOf("--request-file")+1],request=JSON.parse(readFileSync(path,"utf8"));request.report.digest=api.fileDigest(f.report);writeFileSync(path,JSON.stringify(request));}
    }
    if(mutation==="live-lock")mkdirSync(f.lock);
    if(mutation==="native"){const p=join(f.command,"result.json"),r=JSON.parse(readFileSync(p,"utf8"));r.cleanup="unknown";writeFileSync(p,JSON.stringify(r));}
    if(mutation==="authority"||mutation==="revision"){
      if(device)f.selected[f.selected.indexOf("--"+mutation)+1]=mutation==="authority"?"other":String(f.run.revision+1);
      else{const path=f.selected[f.selected.indexOf("--request-file")+1],r=JSON.parse(readFileSync(path,"utf8"));r[mutation]=mutation==="authority"?"other":f.run.revision+1;writeFileSync(path,JSON.stringify(r));}
    }
    const expected=mutation==="stale"?/stale/:mutation==="live-lock"?/lock remains present/:mutation==="native"?/Original confirmed native cleanup differs/:
      mutation==="authority"||mutation==="revision"?/Original resource owner, workflow revision or workspace differs/:device?/before-first-device-actor and never-held/:/Owner cleanup remains unresolved/;
    await assert.rejects(()=>release(f.selected,f.dir,probes),expected);assert.equal(f.held().length,device?2:1);
  }finally{f.close();}
});

for(const mutation of ["started","not-started","contradictory-launch","live-app","disconnected","late-transfer"])
test("before-device recovery refuses "+mutation,async()=>{
  const f=await fixture(true);try{
    if(["started","not-started","contradictory-launch"].includes(mutation)){
      const metadata=statSync(f.report),r=JSON.parse(readFileSync(f.report,"utf8"));
      if(mutation==="started")r.childStarted=true;if(mutation==="not-started")delete r.processClosure.notStarted;if(mutation==="contradictory-launch")r.appOrSDKLaunch=true;
      writeFileSync(f.report,JSON.stringify(r));utimesSync(f.report,metadata.atime,metadata.mtime);f.selected[f.selected.indexOf("--evidence-digest")+1]=api.fileDigest(f.report);
    }
    let once=false;const p={...probes,device:async(id:string,kind:string)=>{
      if(mutation==="disconnected")throw Error("offline");
      if(mutation==="late-transfer"&&!once){once=true;f.registry.transfer(f.registry.originalLeases(f.run.id,f.run.owner)[0],"other-owner","handoff");}
      if(mutation==="live-app"&&kind==="processes")return{deviceIdentifier:identifier,runningProcesses:[{executable:url+"Sample",processIdentifier:17}]};return probes.device(id,kind);
    }};
    const expected=mutation==="late-transfer"?/RESOURCE_STALE_OWNER/:mutation==="live-app"||mutation==="disconnected"?/Fresh qualified iOS device\/app closure unavailable/:/before-first-device-actor and never-held/;
    await assert.rejects(()=>release(f.selected,f.dir,p),expected);assert.equal(f.held().length,2);
  }finally{f.close();}
});

for(const shape of ["triple-without-local","pair-with-local","two-stages","successful-native"])
test("before-device recovery refuses incompatible original shape: "+shape,async()=>{
  const f=await fixture(true,{...(shape==="triple-without-local"?{resources:[...pair,"fixture-storage"]}:{}),
    ...(shape==="pair-with-local"?{localResource:"fixture-storage"}:{}),...(shape==="two-stages"?{twoStages:true}:{}),...(shape==="successful-native"?{nativeExit:0}:{})});try{
    await assert.rejects(()=>release(f.selected,f.dir,probes),shape==="triple-without-local"||shape==="pair-with-local"?/Exact iOS observation device\/app\/local-storage claims required/:/before-first-device-actor and never-held/);
    assert.equal(f.held().length,shape==="triple-without-local"?3:2);
  }finally{f.close();}
});

test("ordinary local admission keeps its explicit false-release rule",async()=>{
  const f=await fixture();try{await assert.rejects(()=>release(f.args,f.dir),/Owner cleanup remains unresolved/);assert.equal(f.held().length,1);}finally{f.close();}
});

test("interrupted before-device recovery reobserves without changing its journal",async()=>{
  const f=await fixture(true);try{
    const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted before commit");});
    try{await assert.rejects(()=>release(f.selected,f.dir,probes),/interrupted before commit/);}finally{stub.mock.restore();}
    const journal=readFileSync(f.receipt);assert.equal(f.held().length,2);let calls=0;
    await release(f.selected,f.dir,{...probes,device:async(id:string,kind:string)=>{calls++;return probes.device(id,kind);}});
    assert.equal(calls,3);assert.deepEqual(readFileSync(f.receipt),journal);assert.equal(f.held().length,0);
  }finally{f.close();}
});
