import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync,readFileSync,existsSync,statSync,utimesSync,symlinkSync,rmSync} from "node:fs";
import {join} from "node:path";
import {spawnSync,execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {api,moduleUrl,ownerReleaseFixture} from "./fixtures/workflow-owner-release.ts";
const {originalAppDigest,recoverOriginalIosTestCleanup:recover,hasOriginalIosTestShape}=await import(moduleUrl("ios-original-test-cleanup"));
const udid="00000000-0000000000000001",bundle="example.synthetic.tester",identifier="fixture-device";
const appUrl="file:///private/var/containers/Bundle/Application/fixture/Tester.app/";
const data={details:{identifier,hardwareProperties:{udid},deviceProperties:{bootState:"booted"}},apps:{deviceIdentifier:identifier,apps:[]},processes:{deviceIdentifier:identifier,runningProcesses:[]}};
const physical=(overrides:Record<string,unknown>={})=>({device:async(_udid:string,kind:string)=>({...data,...overrides})[kind as keyof typeof data],portClosed:async()=>{throw Error("No port belongs to this test");}});
async function fixture(relativeDriver=false){
 let hash="",testHash="";
 const f=await ownerReleaseFixture([`ios:${udid}`],false,1,{
  recipe:dir=>{
   mkdirSync(join(dir,"Tester.app"));mkdirSync(join(dir,"original-output"));
   writeFileSync(join(dir,"Tester.app/Info.plist"),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string></dict></plist>`);
   writeFileSync(join(dir,"Tester.app/Tester"),"synthetic binary");writeFileSync(join(dir,"test.xctestrun"),"synthetic XCTest bytes");
   hash=originalAppDigest(join(dir,"Tester.app"));testHash=createHash("sha256").update("synthetic XCTest bytes").digest("hex");return{};
  },
  argv:(dir,script)=>[process.execPath,relativeDriver?"producer.mjs":script,"--app",join(dir,"Tester.app"),"--sha256",hash,"--xctestrun",join(dir,"test.xctestrun"),"--xctestrun-sha256",testHash,"--udid",udid,"--output",join(dir,"original-output")],
  producer:dir=>`import{writeFileSync}from'node:fs';import{join}from'node:path';
const args=process.argv.slice(2),flag=name=>args[args.indexOf(name)+1],out=flag('--output'),bundle=${JSON.stringify(bundle)},udid=flag('--udid'),identifier=${JSON.stringify(identifier)};
await new Promise(resolve=>setTimeout(resolve,400));
const write=(name,value)=>writeFileSync(join(out,name),JSON.stringify(value));
write('lock.log',{ok:true,command:'acquire',lock:'ios-'+udid+'.lock',lockDir:join(${JSON.stringify(dir)},'ios-'+udid+'.lock'),holder:'synthetic-owner',pid:process.pid});
write('installed-apps.json',{info:{outcome:'success'},result:{deviceIdentifier:identifier,apps:[{bundleIdentifier:bundle,url:${JSON.stringify(appUrl)}}]}});
write('uninstall.json',{info:{outcome:'success'},result:{deviceIdentifier:identifier,uninstalledApplications:[{bundleID:bundle}]}});
write('uninstalled-apps.json',{info:{outcome:'success'},result:{deviceIdentifier:identifier,apps:[]}});
write('receipt.json',{status:'failed',device:udid,bundle,appSha256:flag('--sha256'),xctestrunSha256:flag('--xctestrun-sha256'),commands:[
{argv:['node','synthetic-device-guard','acquire','ios-'+udid,'--holder','synthetic-owner'],exit:0},
{argv:['xcrun','devicectl','device','install','app',flag('--app'),'--device',udid],exit:0},
{argv:['xcodebuild','-xctestrun',flag('--xctestrun'),'-destination','platform=iOS,id='+udid],exit:0},
{argv:['xcrun','devicectl','device','uninstall','app',bundle,'--device',udid],exit:0}]});
writeFileSync(${JSON.stringify(join(dir,"closure.json"))},'{}');process.exit(1);`
 });
 return {...f,output:join(f.dir,"original-output"),options:{bundleId:()=>bundle,physical:physical()},
  recover:(options={bundleId:()=>bundle,physical:physical()})=>recover(f.worker,f.database,f.store,f.registry,f.store.read(f.run.id),options)};
}

test("original removed tester releases only its legacy lease, preserves failed evidence and reconciles normally",async()=>{
 const f=await fixture();try{
  const native=readFileSync(join(f.command,"result.json")),stages=f.store.stages(f.run.id),leases=f.registry.originalLeases(f.run.id,f.run.owner);
  const result=await f.recover();assert.equal(result.run.state,"failed");assert.equal(f.held().length,0);
  assert.deepEqual(f.store.stages(f.run.id),stages);assert.deepEqual(readFileSync(join(f.command,"result.json")),native);
  const receipt=JSON.parse(readFileSync(join(f.worker,"resource-cleanup.json"),"utf8"));
  assert.deepEqual(receipt.leases,leases);assert.equal(receipt.observation.appInstalled,false);assert.equal(receipt.observation.sdkLifecycle,"unclaimed");
  assert.equal(f.registry.hasRelease(leases,api.digest(receipt)),true);
  const successor=f.registry.acquire([`ios:${udid}`],"new-owner","new-operation");
  assert.equal((await f.recover()).run.state,"failed");f.registry.assertHeld(successor[0]);
 }finally{f.close();}
});

test("original app pins match the native path-component ordering, including symbolic link targets",async()=>{
 const f=await fixture();try{
  const root=join(f.dir,"pin-tree");mkdirSync(root);mkdirSync(join(root,"A.framework"));
  writeFileSync(join(root,"A.framework/Info"),"inside");writeFileSync(join(root,"A.framework.data"),"outside");symlinkSync("A.framework/Info",join(root,"linked"));
  const expected=execFileSync("/usr/bin/python3",["-c",`from pathlib import Path\nimport sys,hashlib\nr=Path(sys.argv[1]);h=hashlib.sha256()\nfor p in sorted(r.rglob('*')):\n if p.is_symlink():v=b'link:'+str(p.readlink()).encode()\n elif p.is_file():v=hashlib.sha256(p.read_bytes()).digest()\n else:continue\n h.update(str(p.relative_to(r)).encode()+b'\\0'+v+b'\\0')\nprint(h.hexdigest())`,root],{encoding:"utf8"}).trim();
  assert.equal(originalAppDigest(root),expected);
 }finally{f.close();}
});

for(const which of ["bundle","hash","inventory-device","container","uninstall","mtime","guard","xctestrun","app-bytes"])
test(`original physical evidence refusal: ${which}`,async()=>{
 const f=await fixture();try{
  const name=which==="inventory-device"||which==="container"?"installed-apps.json":which==="uninstall"?"uninstall.json":which==="guard"?"lock.log":"receipt.json";
  const path=join(f.output,name),meta=statSync(path),d=JSON.parse(readFileSync(path,"utf8"));
  if(which==="bundle")d.bundle="other.synthetic.app";
  if(which==="hash")d.appSha256="f".repeat(64);
  if(which==="inventory-device")d.result.deviceIdentifier="other-device";
  if(which==="container")d.result.apps[0].url="https://not-a-device/Tester.app/";
  if(which==="uninstall")d.info.outcome="failed";
  if(which==="guard")d.holder="other-holder";
  writeFileSync(path,JSON.stringify(d));utimesSync(path,meta.atime,which==="mtime"?new Date(0):meta.mtime);
  if(which==="xctestrun")writeFileSync(join(f.dir,"test.xctestrun"),"changed");
  if(which==="app-bytes")writeFileSync(join(f.dir,"Tester.app/Tester"),"changed");
  const errors:Record<string,RegExp>={bundle:/bundle identity differs/,hash:/receipt differs/,"inventory-device":/inventories differ/,container:/container differs/,uninstall:/not acknowledged/,mtime:/outside the native command window/,guard:/guard identity differs/,xctestrun:/XCTest bytes changed/,"app-bytes":/XCTest bytes changed/};
  await assert.rejects(()=>f.recover(),errors[which]!);assert.equal(f.held().length,1);assert.equal(f.store.read(f.run.id).revision,f.run.revision);
 }finally{f.close();}
});

for(const which of ["running","reinstalled","malformed","offline","different-device","guard-present","other-holder"])
test(`fresh original physical closure refusal: ${which}`,async()=>{
 const f=await fixture();try{
  if(which==="guard-present")mkdirSync(join(f.dir,`ios-${udid}.lock`));
  if(which==="other-holder")f.registry.acquire([`ios-device:${udid}`],"other-owner","other-operation");
  const probes=which==="offline"?{...physical(),device:async()=>{throw Error("offline");}}:physical(which==="running"?{processes:{deviceIdentifier:identifier,runningProcesses:[{processIdentifier:17,executable:appUrl+"Tester"}]}}:which==="reinstalled"?{apps:{deviceIdentifier:identifier,apps:[{bundleIdentifier:bundle,url:appUrl}]}}:which==="malformed"?{processes:{deviceIdentifier:identifier,runningProcesses:[{}]}}:which==="different-device"?{details:{...data.details,hardwareProperties:{udid:"other"}}}:{});
  if(which==="guard-present"||which==="other-holder")await assert.rejects(()=>f.recover({bundleId:()=>bundle,physical:probes}),which==="guard-present"?/lock remains present/:/device owner remains active/);
  else assert.equal((await f.recover({bundleId:()=>bundle,physical:probes})).run.state,"unknown");
  assert.equal(f.held().length,1);assert.equal(f.store.read(f.run.id).state,"unknown");assert.equal(existsSync(join(f.worker,"resource-cleanup.json")),false);
 }finally{f.close();}
});

test("an observation cannot release a changed lease generation",async()=>{
 const f=await fixture();try{
  let changed=false;
  const probes={...physical(),device:async(id:string,kind:string)=>{
   if(!changed){changed=true;const lease=f.registry.originalLeases(f.run.id,f.run.owner)[0];f.registry.transfer(lease,"successor","synthetic transfer");}
   return physical().device(id,kind);
  }};
  await assert.rejects(()=>f.recover({bundleId:()=>bundle,physical:probes}),/RESOURCE_STALE_OWNER/);
  assert.equal(f.registry.inspect().find((r:any)=>r.resource===`ios:${udid}`).owner,"successor");assert.equal(f.store.read(f.run.id).state,"unknown");
  assert.equal(existsSync(join(f.worker,"resource-cleanup.json")),false);
 }finally{f.close();}
});

test("selection falls through for non-test, running, multi-stage and ordinary modern-device recipes",async()=>{
 const f=await fixture();try{
  const run=f.store.read(f.run.id),stages=f.store.stages(f.run.id);
  for(const changed of [
   {...run,state:"running"},
   {...run,binding:{...run.binding,recipe:{...run.binding.recipe,resources:[`ios-device:${udid}`,`ios-app:${udid}:${bundle}`]}}},
   {...run,binding:{...run.binding,recipe:{...run.binding.recipe,stages:[...run.binding.recipe.stages,{...run.binding.recipe.stages[0],id:"cleanup",cleanup:true}]}}},
   {...run,binding:{...run.binding,recipe:{...run.binding.recipe,operations:{check:{...run.binding.recipe.operations.check,argv:[process.execPath,"producer.mjs"]}}}}}
  ])assert.equal(hasOriginalIosTestShape(changed,stages),false);
  assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("an unrelated single legacy-device recipe still dispatches its own declared pending cleanup",async()=>{
 const f=await ownerReleaseFixture([`ios:${udid}`],false,1,{stages:[{id:"native",operation:"check",deadlineMs:5000},{id:"cleanup",operation:"check",cleanup:true,deadlineMs:5000}]});
 try{
  // Reconstruct a synthetic stopped worker with only its declared cleanup still pending.
  const db=new DatabaseSync(f.database);db.prepare("UPDATE engine_stage SET state='pending',result=NULL WHERE run_id=? AND id='cleanup'").run(f.run.id);db.close();
  rmSync(join(f.worker,"commands",f.run.id+"-1"),{recursive:true,force:true});
  const {resumeStoppedWorkflowCleanup}=await import(moduleUrl("workflow-cleanup-continuation"));
  const result=await resumeStoppedWorkflowCleanup(f.worker,f.database,f.run.id,f.store.read(f.run.id).revision);
  assert.equal(result.stages.find((row:any)=>row.id==="cleanup").result.cleanup,"confirmed");
  assert.equal(existsSync(join(f.worker,"commands",f.run.id+"-1","result.json")),true);
  assert.equal(f.held().length,1); // Existing unsupported device shape still cannot release custody.
 }finally{f.close();}
});

test("relative original driver resolves against operation cwd independently of recovery cwd",async()=>{
 const f=await fixture(true);try{assert.equal((await f.recover()).run.state,"failed");assert.equal(f.held().length,0);}finally{f.close();}
});

test("missing original native membership is not expanded into a new absence exemption",async()=>{
 const f=await fixture();try{
  rmSync(join(f.command,"group-members.json"));
  await assert.rejects(()=>f.recover(),/Original process membership missing/);assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("interruption before release preserves its receipt and requires fresh physical proof on retry",async()=>{
 const f=await fixture();try{
  const original=f.store.withResourceReleaseSnapshot;
  f.store.withResourceReleaseSnapshot=()=>{throw Error("fixture stopped before registry commit");};
  await assert.rejects(()=>f.recover(),/fixture stopped/);f.store.withResourceReleaseSnapshot=original;
  const path=join(f.worker,"resource-cleanup.json"),bytes=readFileSync(path);
  const offline={...physical(),device:async()=>{throw Error("offline");}};
  assert.equal((await f.recover({bundleId:()=>bundle,physical:offline})).run.state,"unknown");assert.equal(f.held().length,1);
  assert.equal((await f.recover()).run.state,"failed");assert.deepEqual(readFileSync(path),bytes);
 }finally{f.close();}
});

test("interruption after registry release replays normal reconciliation without affecting a successor",async()=>{
 const f=await fixture();try{
  const transition=f.store.transition;f.store.transition=()=>{throw Error("fixture stopped before reconcile");};
  await assert.rejects(()=>f.recover(),/fixture stopped/);f.store.transition=transition;
  assert.equal(f.held().length,0);assert.equal(f.store.read(f.run.id).state,"unknown");
  const successor=f.registry.acquire([`ios:${udid}`],"next-owner","next-operation");
  const noProbe={...physical(),device:async()=>{throw Error("no probe after completed release");}};
  assert.equal((await f.recover({bundleId:()=>bundle,physical:noProbe})).run.state,"failed");f.registry.assertHeld(successor[0]);
 }finally{f.close();}
});

test("a changed original runtime generation refuses release and preserves its original reader",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await fixture();try{
  const db=new DatabaseSync(join(f.dir,"runtime.sqlite"));db.exec("UPDATE current SET revision=revision+1 WHERE id=1");db.close();
  await assert.rejects(()=>f.recover(),/runtime reader differs/);assert.equal(f.held().length,1);
  assert.equal(f.generations.state().readers.length,1);
 }finally{f.close();}
});

test("a conflicting retained receipt cannot be replaced on a fresh retry",async()=>{
 const f=await fixture();try{
  const release=f.store.withResourceReleaseSnapshot;f.store.withResourceReleaseSnapshot=()=>{throw Error("fixture interrupted");};
  await assert.rejects(()=>f.recover(),/fixture interrupted/);f.store.withResourceReleaseSnapshot=release;
  const path=join(f.worker,"resource-cleanup.json"),receipt=JSON.parse(readFileSync(path,"utf8"));receipt.observation.deviceIdentifier="conflicting-original";writeFileSync(path,JSON.stringify(receipt));
  await assert.rejects(()=>f.recover(),/proof changed/);assert.equal(f.held().length,1);assert.equal(f.store.read(f.run.id).state,"unknown");
 }finally{f.close();}
});

test("unconfirmed original host cleanup falls through to ordinary observation recovery",async()=>{
 const f=await fixture();try{
  const stages=f.store.stages(f.run.id);stages[0].result.cleanup="unknown";
  assert.equal(hasOriginalIosTestShape(f.store.read(f.run.id),stages),false);assert.equal(f.held().length,1);
 }finally{f.close();}
});

test("interruption after reconciliation can retire only the original retained runtime reader",{skip:!process.env.GOVERNANCE_HOST_TEST_GENERATION},async()=>{
 const f=await fixture(),{RuntimeGenerations}=await import(moduleUrl("runtime-generations")),original=RuntimeGenerations.prototype.releaseConfirmed;
 try{
  RuntimeGenerations.prototype.releaseConfirmed=()=>{throw Error("fixture stopped before runtime reader retirement");};
  await assert.rejects(()=>f.recover(),/fixture stopped/);RuntimeGenerations.prototype.releaseConfirmed=original;
  assert.equal(f.store.read(f.run.id).state,"failed");assert.equal(f.generations.state().readers.length,1);
  assert.equal((await f.recover()).run.state,"failed");assert.equal(f.generations.state().readers.length,0);
 }finally{RuntimeGenerations.prototype.releaseConfirmed=original;f.close();}
});

test("installed public continuation selects the original-owned recovery without dispatching another test",async()=>{
 const f=await fixture();try{
  const preload=join(f.dir,"physical-probes.mjs");writeFileSync(preload,`import cp from'node:child_process';import fs from'node:fs';import{syncBuiltinESMExports}from'node:module';
cp.execFile=(file,args,options,callback)=>{const replies=${JSON.stringify(data)};
if(file!=='/usr/bin/xcrun'||args.slice(0,3).join(' ')!=='devicectl device info'||!replies[args[3]]||args[5]!==${JSON.stringify(udid)})throw Error('Unexpected dispatch');
fs.writeFileSync(args[args.indexOf('--json-output')+1],JSON.stringify({info:{outcome:'success'},result:replies[args[3]]}));queueMicrotask(()=>callback(null,''));};syncBuiltinESMExports();`);
  const cli=process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url));
  const result=spawnSync(process.execPath,["--import",preload,cli,"workflow-resume-cleanup","--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--worker-directory",f.worker],{cwd:f.dir,encoding:"utf8",timeout:20000});
  assert.equal(result.status,1,result.stderr);assert.equal(JSON.parse(result.stdout).run.state,"failed");assert.equal(f.held().length,0);
 }finally{f.close();}
});
