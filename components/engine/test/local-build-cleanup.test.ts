import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, renameSync, symlinkSync, rmSync, existsSync, mkdirSync, readdirSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api, moduleUrl, ownerReleaseFixture } from "./fixtures/workflow-owner-release.ts";
const {holdBuildLocks,localBuild,observeLocalBuild}=await import(moduleUrl("local-build-cleanup"));
const {assertBuildCleanupAdmission,observeWorkflowCleanup}=await import(moduleUrl("workflow-cleanup-observation"));
const {workflowResourceReleaseCommand}=await import(moduleUrl("workflow-resource-release"));
const {resumeStoppedWorkflowCleanup}=await import(moduleUrl("workflow-cleanup-continuation"));
const reportFree=()=>`import{writeFileSync}from'node:fs';await new Promise(r=>setTimeout(r,300));writeFileSync(process.argv[2],'[]');`;

for(const exit of [0,1])test(`normal local build finishes and releases without a project closure report: exit ${exit}`,async()=>{
 const f=await ownerReleaseFixture(["gradle:synthetic-build"],false,exit,{recipe:()=>({localBuild:{posixLockFiles:[]}}),expectedState:exit?"failed":"succeeded",
  producer:()=>reportFree()+`process.exit(${exit});`});
 try{assert.equal(f.held().length,0);assert.equal(f.store.stages(f.run.id)[0].result.exitCode,exit);assert.equal(readFileSync(f.report,"utf8"),'[]');if(f.generations)assert.equal(f.generations.state().readers.length,0);}finally{f.close();}
});

test("one local cleanup handles multiple settled build stages",async()=>{
 const f=await ownerReleaseFixture(["build:synthetic"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[]}}),expectedState:"succeeded",producer:reportFree,
  stages:[{id:"one",operation:"check",deadlineMs:5000},{id:"two",operation:"check",dependsOn:["one"],deadlineMs:5000}]});
 try{assert.equal(f.held().length,0);assert.equal(f.store.stages(f.run.id).length,2);}finally{f.close();}
});

test("POSIX lock guard excludes another owner and retains lock bytes",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-lock-"))),path=join(dir,"work.lock");writeFileSync(path,"original");
 const first=await holdBuildLocks([path]);
 try{await assert.rejects(holdBuildLocks([path]),/busy or unavailable/);first.assertCurrent();assert.equal(readFileSync(path,"utf8"),"original");}
 finally{await first.close();}
 const second=await holdBuildLocks([path]);await second.close();rmSync(dir,{recursive:true});
});

test("lock replacement and symlinks refuse without deleting either owner file",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-lock-"))),path=join(dir,"work.lock");writeFileSync(path,"");
 const held=await holdBuildLocks([path]);
 try{renameSync(path,path+".old");writeFileSync(path,"successor");assert.throws(held.assertCurrent,/identity changed/);}
 finally{await held.close();}
 symlinkSync(path,path+".link");await assert.rejects(holdBuildLocks([path+".link"]),/unavailable/);
 assert.equal(readFileSync(path,"utf8"),"successor");rmSync(dir,{recursive:true});
});

test("absent lock stays absent and a later creator invalidates the observation",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-lock-"))),path=join(dir,"work.lock");
 const held=await holdBuildLocks([path]);try{assert.equal(existsSync(path),false);held.assertCurrent();writeFileSync(path,"");assert.throws(held.assertCurrent,/identity changed/);}finally{await held.close();rmSync(dir,{recursive:true});}
});

test("new build dispatch requires an explicit cleanup contract before claiming resources",()=>{
 assert.throws(()=>assertBuildCleanupAdmission({resources:["gradle:fixture"]} as any),/BUILD_CLEANUP_REQUIRED/);
 assert.throws(()=>localBuild({posixLockFiles:["relative"]}),/absolute/);
 assert.throws(()=>localBuild({posixLockFiles:[],unknown:true}),/absolute/);
 assert.throws(()=>assertBuildCleanupAdmission({resources:["local:fixture","device:fixture"],localBuild:{posixLockFiles:[]},operations:{}} as any),/Mixed build\/device/);
});

test("explicit legacy recovery shares native cleanup and preserves the original result",async()=>{
 const f=await ownerReleaseFixture(["legacy-build-producer"],false,0,{producer:reportFree});
 try{
  const native=join(f.command,"result.json"),bytes=readFileSync(native),declaration=join(f.dir,"build-cleanup.json");writeFileSync(declaration,JSON.stringify({posixLockFiles:[]}));
  const args=[...f.args];args[args.indexOf("--kind")+1]="local-build";args[args.indexOf("--evidence")+1]=native;args[args.indexOf("--evidence-digest")+1]=api.fileDigest(native);
  args.push("--build-cleanup",declaration,"--build-cleanup-digest",api.fileDigest(declaration));
  assert.equal((await workflowResourceReleaseCommand(args,f.dir)).state,"released");assert.equal(f.held().length,0);assert.deepEqual(readFileSync(native),bytes);
  const successor=f.registry.acquire(["legacy-build-producer"],"next","next-run");
  assert.equal((await workflowResourceReleaseCommand(args,f.dir)).replayed,true);successor.forEach((lease:any)=>f.registry.assertHeld(lease));
 }finally{f.close();}
});

test("shared cleanup does not accept unknown original process cleanup",async()=>{
 const f=await ownerReleaseFixture(["local:legacy-build"],false,0,{producer:reportFree});
 try{const native=join(f.command,"result.json"),raw=JSON.parse(readFileSync(native,"utf8"));raw.cleanup="unknown";writeFileSync(native,JSON.stringify(raw));
  await assert.rejects(observeLocalBuild(f.worker,f.run,f.store.stages(f.run.id),{posixLockFiles:[]}),/confirmed native cleanup differs/);assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("normal cleanup receipt is deterministic on repeat observations",async()=>{
 const f=await ownerReleaseFixture(["local:legacy-build"],false,0,{producer:reportFree});
 try{
  const declared={...f.run,binding:{...f.run.binding,recipe:{...f.run.binding.recipe,localBuild:{posixLockFiles:[]}}}};
  // Pure observation fixture; the original native operation binding does not change.
  const leases=f.registry.originalLeases(f.run.id,f.run.owner),stages=f.store.stages(f.run.id);
  const first=await observeWorkflowCleanup(f.worker,declared,stages,leases);assert.equal(typeof first,"object");await first.close();
  const second=await observeWorkflowCleanup(f.worker,declared,stages,leases);assert.equal(first.digest,second.digest);await second.close();
 }finally{f.close();}
});

for(const point of ["before-release","after-release"])test(`worker interruption ${point} resumes cleanup without replaying the build`,async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-interruption-"))),preload=join(dir,"interrupt.mjs");
 writeFileSync(preload,`import {ResourceRegistry} from ${JSON.stringify(moduleUrl("resources"))};\nconst original=ResourceRegistry.prototype.release;ResourceRegistry.prototype.release=function(...args){${point==="after-release"?'original.apply(this,args);':''}process.exit(77);};`);
 const f=await ownerReleaseFixture(["build:interrupted"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[]}}),producer:reportFree,workerPreload:preload,expectedState:"running"});
 try {
  const native=join(f.command,"result.json"),bytes=readFileSync(native),stages=f.store.stages(f.run.id);
  const result=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,f.run.revision);
  assert.equal(result.run.state,"succeeded");assert.equal(f.held().length,0);assert.deepEqual(readFileSync(native),bytes);assert.deepEqual(f.store.stages(f.run.id),stages);
  if(f.generations)assert.equal(f.generations.state().readers.length,0);
  const next=f.registry.acquire(["build:interrupted"],"new-owner","new-build");
  const repeat=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,result.run.revision);assert.equal(repeat.run.state,"succeeded");next.forEach((lease:any)=>f.registry.assertHeld(lease));
 }finally{f.close();rmSync(dir,{recursive:true});}
});

test("ordinary cleanup holds the real lock through the registry release",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-lock-transaction-"))),lock=join(dir,"work.lock"),preload=join(dir,"observe.mjs"),mark=join(dir,"locked.json");writeFileSync(lock,"");
 writeFileSync(preload,`import {ResourceRegistry} from ${JSON.stringify(moduleUrl("resources"))};import{spawnSync}from'node:child_process';import{writeFileSync}from'node:fs';const release=ResourceRegistry.prototype.release;ResourceRegistry.prototype.release=function(...args){const result=spawnSync('/usr/bin/python3',['-I','-S','-c','import fcntl,sys;f=open(sys.argv[1],"r+");fcntl.lockf(f,fcntl.LOCK_EX|fcntl.LOCK_NB)',${JSON.stringify(lock)}]);writeFileSync(${JSON.stringify(mark)},JSON.stringify({status:result.status}));return release.apply(this,args);};`);
 const f=await ownerReleaseFixture(["build:locked"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[lock]}}),producer:reportFree,workerPreload:preload,expectedState:"succeeded"});
 try{assert.equal(f.held().length,0);assert.notEqual(JSON.parse(readFileSync(mark,"utf8")).status,0);}finally{f.close();rmSync(dir,{recursive:true});}
});

test("busy real lock retains the reservation, reports why, then resumes without a build",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-busy-"))),lock=join(dir,"work.lock");writeFileSync(lock,"");
 const external=await holdBuildLocks([lock]);
 const f=await ownerReleaseFixture(["build:busy"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[lock]}}),producer:reportFree});
 try {
  assert.equal(f.held().length,1);assert.match(f.store.cleanupBlocker(f.run.id).reason,/busy or unavailable/);
  const bytes=readFileSync(join(f.command,"result.json"));await external.close();
  const result=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,f.run.revision);
  assert.equal(result.run.state,"succeeded");assert.equal(f.held().length,0);assert.equal(f.store.cleanupBlocker(f.run.id),null);assert.deepEqual(readFileSync(join(f.command,"result.json")),bytes);
 }finally{await external.close();f.close();rmSync(dir,{recursive:true});}
});

for(const change of ["create","replace","remove-parent"])test(`cleanup retry permits fresh ${change} lock state without changing its intent`,async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-lock-retry-"))),parent=join(dir,"locks"),lock=join(parent,"build.lock"),preload=join(dir,"interrupt.mjs");
 if(change!=="create"){mkdirSync(parent);writeFileSync(lock,"old");}
 writeFileSync(preload,`import{ResourceRegistry}from ${JSON.stringify(moduleUrl("resources"))};ResourceRegistry.prototype.release=function(){process.exit(77);};`);
 const f=await ownerReleaseFixture(["build:retry"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[lock]}}),producer:reportFree,workerPreload:preload,expectedState:"running"});
 try{
  const receipt=join(f.worker,"resource-cleanup.json"),before=readFileSync(receipt),native=readFileSync(join(f.command,"result.json"));
  if(change==="create"){mkdirSync(parent);writeFileSync(lock,"new");}
  if(change==="replace"){renameSync(lock,lock+".old");writeFileSync(lock,"new");}
  if(change==="remove-parent")rmSync(parent,{recursive:true});
  const result=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,f.run.revision);
  assert.equal(result.run.state,"succeeded");assert.equal(f.held().length,0);
  assert.deepEqual(readFileSync(receipt),before);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);
  assert.equal(readdirSync(join(f.worker,"local-build-observations")).length,2);
 }finally{f.close();rmSync(dir,{recursive:true});}
});

test("missing lock parents are observed without creating them and later creation invalidates the check",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-new-lock-"))),parent=join(dir,"new","locks"),lock=join(parent,"build.lock");
 const held=await holdBuildLocks([lock]);
 try{held.assertCurrent();assert.equal(existsSync(parent),false);mkdirSync(parent,{recursive:true});assert.throws(held.assertCurrent,/identity changed/);}
 finally{await held.close();rmSync(dir,{recursive:true});}
});

test("legacy recovery retries changed lock observations, accepts equals flags, and rejects changed declaration bytes",async()=>{
 const f=await ownerReleaseFixture(["local:legacy-build"],false,0,{producer:reportFree});
 try{
  const native=join(f.command,"result.json"),declaration=join(f.dir,"build-cleanup.json"),lock=join(f.dir,"real.lock");
  writeFileSync(declaration,JSON.stringify({posixLockFiles:[lock]}));
  const args=[...f.args];args[args.indexOf("--kind")+1]="local-build";args[args.indexOf("--evidence")+1]=native;args[args.indexOf("--evidence-digest")+1]=api.fileDigest(native);
  args.push("--build-cleanup="+declaration,"--build-cleanup-digest="+api.fileDigest(declaration));
  const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("synthetic release interruption");});
  try{await assert.rejects(workflowResourceReleaseCommand(args,f.dir),/synthetic release interruption/);}finally{stub.mock.restore();}
  const before=readFileSync(f.receipt);writeFileSync(lock,"later");
  assert.equal((await workflowResourceReleaseCommand(args,f.dir)).state,"released");assert.deepEqual(readFileSync(f.receipt),before);
  writeFileSync(declaration,JSON.stringify({posixLockFiles:[]}));
  await assert.rejects(workflowResourceReleaseCommand(args,f.dir),/Exact local build cleanup declaration required/);
 }finally{f.close();}
});

test("qualified owner recovery remains labelled and cannot lose membership evidence",async()=>{
 const f=await ownerReleaseFixture(["local:recovered-build"],false,0);
 try{
  const {recoverCommandOwner}=await import(moduleUrl("command-owner-recovery"));
  const {qualifiedWorkflowCommandCleanup}=await import(moduleUrl("workflow-command-cleanup"));
  const native=join(f.command,"result.json"),raw=JSON.parse(readFileSync(native,"utf8"));raw.cleanup="unknown";writeFileSync(native,JSON.stringify(raw));
  const request=JSON.parse(readFileSync(join(f.command,"request.json"),"utf8"));recoverCommandOwner(f.command,api.digest(request),"host:synthetic-cleanup");
  const qualified=qualifiedWorkflowCommandCleanup(f.command,raw,[0]),stages=f.store.stages(f.run.id);stages[0].result.cleanupRecovery=qualified.recovery;
  const observed=await observeLocalBuild(f.worker,f.run,stages,{posixLockFiles:[]});
  assert.deepEqual(observed.proof.commands[0].cleanupRecovery,qualified.recovery);await observed.close();
  rmSync(join(f.command,"group-members.json"));
  await assert.rejects(observeLocalBuild(f.worker,f.run,stages,{posixLockFiles:[]}),/membership|cleanup differs/);
 }finally{f.close();}
});

test("recovery rejects a declaration different from the bound recipe",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-declaration-"))),lock=join(dir,"busy.lock");writeFileSync(lock,"");const held=await holdBuildLocks([lock]);
 const f=await ownerReleaseFixture(["build:declaration"],false,0,{recipe:()=>({localBuild:{posixLockFiles:[lock]}}),producer:reportFree});
 try{
  const path=join(f.dir,"different.json");writeFileSync(path,JSON.stringify({posixLockFiles:[]}));const args=[...f.args];args[args.indexOf("--kind")+1]="local-build";
  args.push("--build-cleanup",path,"--build-cleanup-digest",api.fileDigest(path));
  await assert.rejects(workflowResourceReleaseCommand(args,f.dir),/Original build cleanup declaration differs/);assert.equal(f.held().length,1);
 }finally{await held.close();f.close();rmSync(dir,{recursive:true});}
});


test("admission refuses noncanonical ancestors and unsafe existing files before execution",()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),"build-admission-path-"))),alias=join(dir,"alias"),lock=join(dir,"work.lock");
 symlinkSync(dir,alias);writeFileSync(lock,"");
 const recipe=(path:string)=>({resources:["build:fixture"],operations:{read:{effect:"read"}},localBuild:{posixLockFiles:[path]}} as any);
 try{
  assert.throws(()=>assertBuildCleanupAdmission(recipe(join(alias,"new","work.lock"))),/canonical/);
  assert.throws(()=>assertBuildCleanupAdmission(recipe(dir)),/regular file/);
  symlinkSync(lock,lock+".symlink");assert.throws(()=>assertBuildCleanupAdmission(recipe(lock+".symlink")),/regular file/);
  linkSync(lock,lock+".hardlink");assert.throws(()=>assertBuildCleanupAdmission(recipe(lock)),/regular file/);
  assertBuildCleanupAdmission(recipe(join(dir,"not-created","work.lock")));
 }finally{rmSync(dir,{recursive:true});}
});

 test("legacy names are permitted only by explicit historical build recovery",async()=>{
 const {assertLocalBuildScope}=await import(moduleUrl("local-build-cleanup"));
 const recipe={resources:["legacy-build-producer"],operations:{x:{effect:"local"}}};
 assert.throws(()=>assertLocalBuildScope(recipe as any,{posixLockFiles:[]},false),/exclusively declared/);
 assert.doesNotThrow(()=>assertLocalBuildScope(recipe as any,{posixLockFiles:[]},false,true));
 for(const name of ["device:fixture","remote:fixture","service:fixture","workspace-v1:fixture",
   "Android-Pixel","IOS-Sim","android_emulator","iosSimulator","simulator","emulator-5554","DeviceOne","app-session"])
 assert.throws(()=>assertLocalBuildScope({...recipe,resources:[name]} as any,{posixLockFiles:[]},false,true));
 });


test("original failed spawn releases a declared build without inventing child evidence",async()=>{
 const f=await ownerReleaseFixture(["build:spawn-failed"],false,1,{recipe:()=>({localBuild:{posixLockFiles:[]}}),allowMissingReport:true,argv:(_dir,script)=>[script],expectedState:"failed"});
 try{
  const receipt=JSON.parse(readFileSync(join(f.command,"result.json"),"utf8"));
  assert.equal(receipt.reason,"spawn-failed");assert.equal(receipt.cleanup,"confirmed");assert.equal(receipt.exitCode,null);
  assert.equal(JSON.parse(readFileSync(join(f.command,"launch.json"),"utf8")).state,"intent");
  assert.equal(f.held().length,0);assert.equal(existsSync(f.report),false);
 }finally{f.close();}
});


test("failed-spawn recovery preserves originals and rejects contradictory evidence",async()=>{
 const f=await ownerReleaseFixture(["legacy-spawn-producer"],false,1,{allowMissingReport:true,argv:(_dir,script)=>[script]});
 try {
  const native=join(f.command,"result.json"),launch=join(f.command,"launch.json"),membership=join(f.command,"group-members.json");
  const original=readFileSync(native),originalLaunch=readFileSync(launch);
  const observe=()=>observeLocalBuild(f.worker,f.run,f.store.stages(f.run.id),{posixLockFiles:[]},true);
  const proof=await observe();proof.assertCurrent();await proof.close();assert.equal(f.held().length,1);
  for(const patch of [{reason:"owner-lost"},{cleanup:"unknown"},{exitCode:0},{signal:"SIGTERM"}]) {
   writeFileSync(native,JSON.stringify({...JSON.parse(original.toString()),...patch}));
   await assert.rejects(observe);writeFileSync(native,original);
  }
  writeFileSync(launch,JSON.stringify({...JSON.parse(originalLaunch.toString()),child:{pid:42,processGroup:42}}));
  await assert.rejects(observe,/failed-spawn/);writeFileSync(launch,originalLaunch);
  writeFileSync(membership,"{}");await assert.rejects(observe,/failed-spawn/);rmSync(membership);
  const declaration=join(f.dir,"build-cleanup.json");writeFileSync(declaration,JSON.stringify({posixLockFiles:[]}));
  const args=[...f.args];args[args.indexOf("--kind")+1]="local-build";args[args.indexOf("--evidence")+1]=native;args[args.indexOf("--evidence-digest")+1]=api.fileDigest(native);
  args.push("--build-cleanup",declaration,"--build-cleanup-digest",api.fileDigest(declaration));
  assert.equal((await workflowResourceReleaseCommand(args,f.dir)).state,"released");
  assert.equal(f.held().length,0);assert.deepEqual(readFileSync(native),original);assert.deepEqual(readFileSync(launch),originalLaunch);
 }finally{f.close();}
});


test("failed spawn still fences live owners, device callers and late contradictory evidence",async()=>{
 const {workflowNativeResourceEvidence}=await import(moduleUrl("workflow-resource-evidence"));
 const f=await ownerReleaseFixture(["legacy-spawn"],false,1,{allowMissingReport:true,argv:(_d,s)=>[s]});
 try {
  const stages=f.store.stages(f.run.id),check=()=>workflowNativeResourceEvidence(f.worker,f.run,stages,true,true);
  assert.throws(()=>workflowNativeResourceEvidence(f.worker,f.run,stages,true),/ownership differs/);
  assert.throws(()=>workflowNativeResourceEvidence(f.worker,f.run,stages,false),/ownership differs/);
  const guardian=join(f.command,"guardian.json"),bytes=readFileSync(guardian),g=JSON.parse(bytes.toString());
  writeFileSync(guardian,JSON.stringify({...g,pid:process.pid,fingerprint:execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'}).trim()}));
  assert.throws(check().assertCurrent,/still present/);
  writeFileSync(guardian,JSON.stringify({...g,fingerprint:'invalid'}));assert.throws(check,/identity unavailable/);writeFileSync(guardian,bytes);
  const proof=check(),members=join(f.command,'group-members.json');writeFileSync(members,'{}');assert.throws(proof.assertCurrent,/membership evidence changed/);rmSync(members);
  const owner=join(f.command,'owner.json'),launch=join(f.command,'launch.json'),ownerBytes=readFileSync(owner),launchBytes=readFileSync(launch);
  const live={pid:process.pid,fingerprint:execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'}).trim()};
  writeFileSync(owner,JSON.stringify({...JSON.parse(ownerBytes.toString()),...live}));writeFileSync(launch,JSON.stringify({...JSON.parse(launchBytes.toString()),owner:live}));
  assert.throws(check().assertCurrent,/still present/);writeFileSync(owner,ownerBytes);writeFileSync(launch,launchBytes);
  writeFileSync(launch,JSON.stringify({...JSON.parse(launchBytes.toString()),startedAt:'2000-01-01T00:00:00.000Z'}));assert.throws(check,/failed-spawn/);writeFileSync(launch,launchBytes);
  const result=join(f.command,'result.json'),original=readFileSync(result);
  for(const change of [{state:'succeeded'},{reason:'exit'},{signal:'SIGTERM'}]){
   writeFileSync(result,JSON.stringify({...JSON.parse(original.toString()),...change}));assert.throws(check,/failed-spawn/);writeFileSync(result,original);
  }
  rmSync(result);assert.throws(check);writeFileSync(result,original);
  assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("failed spawn retains a busy real lock then resumes without changing its failed receipt",async()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'spawn-lock-'))),lock=join(dir,'build.lock');writeFileSync(lock,'original');
 const held=await holdBuildLocks([lock]);
 const f=await ownerReleaseFixture(['build:failed-spawn'],false,1,{allowMissingReport:true,argv:(_d,s)=>[s],recipe:()=>({localBuild:{posixLockFiles:[lock]}})});
 try {
  assert.equal(f.held().length,1);assert.match(f.store.cleanupBlocker(f.run.id).reason,/busy or unavailable/);
  const result=join(f.command,'result.json'),bytes=readFileSync(result);await held.close();
  const resumed=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,f.run.revision);
  assert.equal(resumed.run.state,'failed');assert.equal(f.held().length,0);assert.deepEqual(readFileSync(result),bytes);assert.equal(readFileSync(lock,'utf8'),'original');
 }finally{await held.close();f.close();rmSync(dir,{recursive:true});}
});
