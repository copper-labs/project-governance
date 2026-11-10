import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { test,mock } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync,writeFileSync,rmSync,mkdirSync,statSync,utimesSync,renameSync,symlinkSync } from "node:fs";
import { join,dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api,moduleUrl } from "./fixtures/workflow-owner-release.ts";
import { ownedSessionFixture,closedProbes,resources,publicOwnedPreload } from "./fixtures/android-owned-session.ts";
const {workflowResourceReleaseCommand:release}=await import(moduleUrl("workflow-resource-release"));
const {ownedAndroidAppSessionCleanup}=await import(moduleUrl("android-owned-app-session"));
const {parseRecipe}=await import(moduleUrl("workflow-types"));
const cli=process.env.GOVERNANCE_HOST_TEST_PACKAGE?join(process.env.GOVERNANCE_HOST_TEST_PACKAGE,"dist/engine/src/cli.js"):fileURLToPath(new URL("../src/cli.ts",import.meta.url));
function publicCall(f:Awaited<ReturnType<typeof ownedSessionFixture>>,command:string,args:string[]){return spawnSync(process.execPath,["--import",publicOwnedPreload(f),cli,command,...args],{cwd:f.dir,encoding:"utf8",timeout:20000});}

test("normal owned app worker proves boot ownership and closes every original claim",async()=>{const f=await ownedSessionFixture(0,true);try{assert.equal(f.run.state,"succeeded");assert.equal(f.held().length,0);const receipt=JSON.parse(readFileSync(join(f.worker,"resource-cleanup.json"),"utf8"));assert.deepEqual(receipt.leases.map((x:any)=>x.resource).sort(),[...resources].sort());assert.equal(receipt.observation.ownedLifecycle,"closed");assert.equal(receipt.observation.sdkLifecycle,"unclaimed");assert.deepEqual(receipt.observation.target.portsClosed,[5556,5557]);}finally{f.close();}});
test("failed owned native work remains failed after normal closure",async()=>{const f=await ownedSessionFixture(1,true);try{assert.equal(f.run.state,"failed");assert.equal(f.held().length,0);assert.equal(f.store.stages(f.run.id)[0].result.exitCode,1);}finally{f.close();}});
test("packed public whole-set release permits harmless successor reuse and closure",async()=>{const f=await ownedSessionFixture(1);try{const raw=readFileSync(join(f.command,"result.json")),first=publicCall(f,"workflow-release-resources",f.args);assert.equal(first.status,0,first.stderr);assert.equal(f.held().length,0);const settle=publicCall(f,"workflow-reconcile-cleanup",["--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker]);assert.equal(settle.status,1,settle.stderr);assert.equal(JSON.parse(settle.stdout).run.state,"failed");const next=await ownedSessionFixture(0,false,f.registry.path);try{const old=JSON.parse(readFileSync(f.receipt,"utf8")).leases,later=next.registry.originalLeases(next.run.id,next.run.owner);for(const lease of later)assert.equal(lease.generation,old.find((x:any)=>x.resource===lease.resource).generation+1);assert.equal(publicCall(next,"workflow-release-resources",next.args).status,0);const done=publicCall(next,"workflow-reconcile-cleanup",["--database",next.database,"--run",next.run.id,"--revision",String(next.run.revision),"--registry",next.registry.path,"--receipt",next.receipt,"--worker-directory",next.worker]);assert.equal(done.status,0,done.stderr);assert.equal(JSON.parse(done.stdout).run.state,"succeeded");assert.equal(next.held().length,0);}finally{next.close();}assert.deepEqual(readFileSync(join(f.command,"result.json")),raw);}finally{f.close();}});

for(const fault of ["preexisting","ports-before","unowned-lock","wrong-run","wrong-stage","wrong-serial","wrong-user","wrong-lock","wrong-pid","wrong-fingerprint","stale-time"]){test(`owned mode retains all claims for ${fault} boot evidence`,async()=>{const f=await ownedSessionFixture();try{const timestamp=statSync(f.bootReport),report=JSON.parse(readFileSync(f.bootReport,"utf8"));if(fault==="preexisting")report.initial.targetAbsent=false;if(fault==="ports-before")report.initial.portsClosed=[5556];if(fault==="unowned-lock")report.initial.lockAcquired=false;if(fault==="wrong-run")report.runId="other";if(fault==="wrong-stage")report.stageId="other";if(fault==="wrong-serial")report.serial="emulator-5558";if(fault==="wrong-user")report.userId=10;if(fault==="wrong-lock")report.lockPath=join(f.dir,"other.lock");if(fault==="wrong-pid")report.emulator.pid=process.pid;if(fault==="wrong-fingerprint")report.emulator.fingerprint="Fri Oct 30 00:00:00 2026";if(fault==="stale-time")report.initial.observedAt="2000-01-01T00:00:00Z";writeFileSync(f.bootReport,JSON.stringify(report));utimesSync(f.bootReport,timestamp.atime,timestamp.mtime);await assert.rejects(()=>release(f.args,f.dir,closedProbes));assert.equal(f.held().length,4);}finally{f.close();}});}
test("missing retained membership or boot report never invents ownership",async()=>{for(const filename of ["group-members.json","boot"]){const f=await ownedSessionFixture();try{rmSync(filename==="boot"?f.bootReport:join(f.command,filename));await assert.rejects(()=>release(f.args,f.dir,closedProbes));assert.equal(f.held().length,4);}finally{f.close();}}});
for(const fault of ["online","offline","transport","console","ownership-lock","local-lock"]){test(`owned target ${fault} keeps whole-set custody`,async()=>{const f=await ownedSessionFixture();try{if(fault==="local-lock")mkdirSync(f.run.binding.recipe.androidAppSession.localLocks[0].path);const probes={...closedProbes,...(fault==="online"?{devices:async()=>"List of devices attached\nemulator-5556\tdevice\n"}:{}),...(fault==="offline"?{devices:async()=>"List of devices attached\nemulator-5556\toffline\n"}:{}),...(fault==="transport"?{devices:async()=>{throw Error("transport");}}:{}),...(fault==="console"?{portClosed:async()=>false}:{}),...(fault==="ownership-lock"?{lockAbsent:async()=>false}:{})};await assert.rejects(()=>release(f.args,f.dir,probes));assert.equal(f.held().length,4);}finally{f.close();}});}
test("interrupted owned release preserves the journal, reobserves, and fences later owners",async()=>{const f=await ownedSessionFixture();try{const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted");});try{await assert.rejects(()=>release(f.args,f.dir,closedProbes),/interrupted/);}finally{stub.mock.restore();}const bytes=readFileSync(f.receipt);await release(f.args,f.dir,closedProbes);assert.deepEqual(readFileSync(f.receipt),bytes);const next=f.registry.acquire(resources,"later","later");assert.equal((await release(f.args,f.dir,{...closedProbes,devices:async()=>{throw Error("Replay cannot probe");}})).replayed,true);for(const lease of next)f.registry.assertHeld(lease);}finally{f.close();}});
test("changed boot evidence during fresh closure retains every claim",async()=>{const f=await ownedSessionFixture();try{await assert.rejects(()=>release(f.args,f.dir,{...closedProbes,devices:async()=>{writeFileSync(f.bootReport,"{}");return"List of devices attached\n";}}));assert.equal(f.held().length,4);}finally{f.close();}});
test("owned mode rejects mixed adapters, missing boot stages and non-emulator serials",async()=>{const f=await ownedSessionFixture();try{const recipe=f.run.binding.recipe,config=recipe.androidAppSession;for(const change of [{androidEmulator:{serial:config.serial,adb:config.adb,lockPath:config.emulator.lockPath}},{androidAppSession:{...config,serial:"USB_FIXTURE"}},{androidAppSession:{...config,emulator:{...config.emulator,bootStage:"missing"}}},{androidAppSession:{...config,ownership:"borrowed"}},{resources:recipe.resources.filter((x:string)=>x!=="fixture-storage")}])assert.throws(()=>parseRecipe({...recipe,...change}));assert.deepEqual((await ownedAndroidAppSessionCleanup(f.worker,f.run,f.store.stages(f.run.id),closedProbes)).observation.packages,[{name:"example.fixture",ownedTargetAbsent:true}]);}finally{f.close();}});

test("public cleanup continuation closes original owned claims without rerunning stages",async()=>{const f=await ownedSessionFixture();try{const before=f.store.stages(f.run.id),report=readFileSync(f.bootReport),result=publicCall(f,"workflow-resume-cleanup",["--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--worker-directory",f.worker]);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).run.state,"succeeded");assert.equal(f.held().length,0);assert.deepEqual(f.store.stages(f.run.id),before);assert.deepEqual(readFileSync(f.bootReport),report);}finally{f.close();}});

test("normal settlement refuses a reused original native PID",async()=>{const f=await ownedSessionFixture();try{const owner=JSON.parse(readFileSync(join(f.command,"owner.json"),"utf8")),original=childProcess.execFileSync;const stub=mock.method(childProcess,"execFileSync",((file:any,args:any,options:any)=>file==="/bin/ps"&&args[0]==="-p"&&args[1]===String(owner.pid)?"Thu Jan  1 00:00:00 1970 S":original(file,args,options))as any);syncBuiltinESMExports();try{await assert.rejects(()=>ownedAndroidAppSessionCleanup(f.worker,f.run,f.store.stages(f.run.id),closedProbes,undefined,true),/PID was reused/);}finally{stub.mock.restore();syncBuiltinESMExports();}assert.equal(f.held().length,4);}finally{f.close();}});

test("one original ownership lock may also guard a declared local obligation",async()=>{const f=await ownedSessionFixture();try{const recipe=f.run.binding.recipe,config=recipe.androidAppSession;const parsed=parseRecipe({...recipe,androidAppSession:{...config,localLocks:[{resource:"fixture-producer",path:config.emulator.lockPath},config.localLocks[1]]}});assert.equal(parsed.androidAppSession.localLocks[0].path,parsed.androidAppSession.emulator.lockPath);}finally{f.close();}});

 test("explicit recovery of failed boot with missing ownership report preserves history",async()=>{
 const f=await ownedSessionFixture(1);try{
 rmSync(f.bootReport);const original=readFileSync(join(f.command,"result.json"));
 await assert.rejects(()=>ownedAndroidAppSessionCleanup(f.worker,f.run,f.store.stages(f.run.id),closedProbes));
 const released=await release(f.args,f.dir,closedProbes);assert.equal(released.state,"released");assert.equal(f.held().length,0);
 assert.deepEqual(readFileSync(join(f.command,"result.json")),original);
 const proof=JSON.parse(readFileSync(f.receipt,"utf8")).observation.proof;
 assert.equal(proof.original.ownership.bootReport.status,"missing-after-failed-boot");
 }finally{f.close();}
 });

for(const fault of ["online","port","lock","report-appears","native","revision"])
 test("missing boot recovery retains claims for "+fault,async()=>{
 const f=await ownedSessionFixture(1);try{
 rmSync(f.bootReport);
 if(fault==="native"){const path=join(f.command,"result.json"),r=JSON.parse(readFileSync(path,"utf8"));r.cleanup="unknown";writeFileSync(path,JSON.stringify(r));}
 if(fault==="revision")f.args[f.args.indexOf("--revision")+1]=String(f.run.revision+1);
 const probes={...closedProbes,...(fault==="online"?{devices:async()=>"List of devices attached\nemulator-5556\tdevice\n"}:{}),...(fault==="port"?{portClosed:async()=>false}:{}),...(fault==="lock"?{lockAbsent:async()=>false}:{}),...(fault==="report-appears"?{devices:async()=>{writeFileSync(f.bootReport,"{}");return"List of devices attached\n";}}:{})};
 const expected:Record<string,RegExp>={online:/remain unresolved/,port:/remain unresolved/,lock:/remain unresolved/,"report-appears":/missing boot evidence changed/,native:/cleanup differs|native command receipt/,revision:/revision or workspace/};
 await assert.rejects(()=>release(f.args,f.dir,probes),expected[fault]!);assert.equal(f.held().length,4);
 }finally{f.close();}
 });
 test("missing boot recovery reobserves interrupted release and leaves successor claims alone",async()=>{
 const f=await ownedSessionFixture(1);try{
 rmSync(f.bootReport);const stub=mock.method(api.ResourceRegistry.prototype,"release",()=>{throw Error("interrupted");});
 try{await assert.rejects(()=>release(f.args,f.dir,closedProbes),/interrupted/);}finally{stub.mock.restore();}
 const bytes=readFileSync(f.receipt);await release(f.args,f.dir,closedProbes);assert.deepEqual(readFileSync(f.receipt),bytes);
 const next=f.registry.acquire(resources,"successor","successor");assert.equal((await release(f.args,f.dir,{...closedProbes,devices:async()=>{throw Error("No replay probe");}})).replayed,true);
 for(const lease of next)f.registry.assertHeld(lease);
 }finally{f.close();}
 });

 for(const fault of ["stale","artifact-alias","zero"])
 test("missing boot recovery requires complete failed-native identity: "+fault,async()=>{
 const f=await ownedSessionFixture(fault==="zero"?0:1);try{
 rmSync(f.bootReport);
 if(fault==="artifact-alias"){const dir=dirname(f.bootReport);renameSync(dir,dir+"-real");symlinkSync(dir+"-real",dir);}
 const stages=f.store.stages(f.run.id);if(fault==="stale")stages[0].result.inputValidity="stale";
 await assert.rejects(()=>ownedAndroidAppSessionCleanup(f.worker,f.run,stages,closedProbes,undefined,false,true),fault==="artifact-alias"?/directory uses an alias/:/Missing boot ownership recovery/);assert.equal(f.held().length,4);
 }finally{f.close();}
 });

 test("fast failed boot without sampled membership releases and preserves failure",async()=>{
 const f=await ownedSessionFixture(1);try{
 rmSync(f.bootReport);rmSync(join(f.command,"group-members.json"));
 const raw=readFileSync(join(f.command,"result.json"));
 const result=publicCall(f,"workflow-release-resources",f.args);assert.equal(result.status,0,result.stderr);
 assert.equal(f.held().length,0);assert.deepEqual(readFileSync(join(f.command,"result.json")),raw);
 const proof=JSON.parse(readFileSync(f.receipt,"utf8")).observation.proof;
 assert.equal(proof.original.commands[0].membershipHistory,"not-recorded");
 const settled=publicCall(f,"workflow-reconcile-cleanup",["--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker]);
 assert.equal(settled.status,1,settled.stderr);assert.equal(JSON.parse(settled.stdout).run.state,"failed");
 }finally{f.close();}
 });
 for(const fault of ["success","unknown-cleanup","wrong-owner","live-owner","revision","online","port","lock","membership-appears"])
 test("unsampled failed boot refuses "+fault,async()=>{
 const f=await ownedSessionFixture(fault==="success"?0:1);try{
 rmSync(f.bootReport);rmSync(join(f.command,"group-members.json"));
 if(fault==="revision")f.args[f.args.indexOf("--revision")+1]=String(f.run.revision+1);
 if(fault==="unknown-cleanup"){const p=join(f.command,"result.json"),r=JSON.parse(readFileSync(p,"utf8"));r.cleanup="unknown";writeFileSync(p,JSON.stringify(r));}
 if(fault==="wrong-owner"){const p=join(f.command,"owner.json"),r=JSON.parse(readFileSync(p,"utf8"));r.requestDigest="sha256:"+"0".repeat(64);writeFileSync(p,JSON.stringify(r));}
 let stub;
 if(fault==="live-owner"){const owner=JSON.parse(readFileSync(join(f.command,"owner.json"),"utf8"));const original=childProcess.execFileSync;stub=mock.method(childProcess,"execFileSync",((file:any,args:any,options:any)=>file==="/bin/ps"&&args?.includes("pid=,ppid=,pgid=,stat=")?String(original(file,args,options)).trimEnd()+`\n${owner.pid} 1 ${owner.pid} S\n`:original(file,args,options))as any);syncBuiltinESMExports();}
 const probes={...closedProbes,...(fault==="online"?{devices:async()=>"List of devices attached\nemulator-5556\tdevice\n"}:{}),...(fault==="port"?{portClosed:async()=>false}:{}),...(fault==="lock"?{lockAbsent:async()=>false}:{}),...(fault==="membership-appears"?{devices:async()=>{writeFileSync(join(f.command,"group-members.json"),"{}");return"List of devices attached\n";}}:{})};
 const expected:Record<string,RegExp>={success:/Missing boot ownership recovery/,"unknown-cleanup":/cleanup differs|native command receipt/,"wrong-owner":/ownership differs/,"live-owner":/Original command owner or process group still present/,revision:/revision or workspace/,online:/remain unresolved/,port:/remain unresolved/,lock:/remain unresolved/,"membership-appears":/membership evidence changed/};
 try{await assert.rejects(()=>release(f.args,f.dir,probes),expected[fault]!);assert.equal(f.held().length,4);}finally{stub?.mock.restore();syncBuiltinESMExports();}
 }finally{f.close();}
 });

 test("successful two-claim missing boot recovery preserves success and unavailable history",async()=>{
 const f=await ownedSessionFixture(0,false,undefined,true);try{
 rmSync(f.bootReport);const raw=readFileSync(join(f.command,"result.json")),stages=f.store.stages(f.run.id);
 await assert.rejects(()=>ownedAndroidAppSessionCleanup(f.worker,f.run,stages,closedProbes),/Missing boot ownership recovery/);
 const result=publicCall(f,"workflow-release-resources",f.args);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.equal(f.held().length,0);assert.deepEqual(readFileSync(join(f.command,"result.json")),raw);
 const proof=JSON.parse(readFileSync(f.receipt,"utf8")).observation.proof;
 assert.equal(proof.original.ownership.bootReport.status,"missing-after-successful-run");assert.equal(proof.original.ownership.historicalBootOwnership,"unavailable");assert.equal(proof.original.ownership.ownership,"not-reconstructed");
 const settled=publicCall(f,"workflow-reconcile-cleanup",["--database",f.database,"--run",f.run.id,"--revision",String(f.run.revision),"--registry",f.registry.path,"--receipt",f.receipt,"--worker-directory",f.worker]);
 assert.equal(settled.status,0,settled.stderr);assert.equal(JSON.parse(settled.stdout).run.state,"succeeded");assert.deepEqual(f.store.stages(f.run.id),stages);
 }finally{f.close();}
 });
 for(const fault of ["membership-missing","unknown-cleanup","wrong-owner","live-owner","revision","online","offline","port","lock","membership-changed","report-appears"])
 test("successful missing boot refuses "+fault,async()=>{
 const f=await ownedSessionFixture(0,false,undefined,true);try{
 rmSync(f.bootReport);if(fault==="membership-missing")rmSync(join(f.command,"group-members.json"));
 if(fault==="revision")f.args[f.args.indexOf("--revision")+1]=String(f.run.revision+1);
 if(fault==="unknown-cleanup"){const p=join(f.command,"result.json"),r=JSON.parse(readFileSync(p,"utf8"));r.cleanup="unknown";writeFileSync(p,JSON.stringify(r));}
 if(fault==="wrong-owner"){const p=join(f.command,"owner.json"),r=JSON.parse(readFileSync(p,"utf8"));r.requestDigest="sha256:"+"0".repeat(64);writeFileSync(p,JSON.stringify(r));}
 let stub;
 if(fault==="live-owner"){const owner=JSON.parse(readFileSync(join(f.command,"owner.json"),"utf8"));const original=childProcess.execFileSync;stub=mock.method(childProcess,"execFileSync",((file:any,args:any,options:any)=>file==="/bin/ps"&&args?.includes("pid=,ppid=,pgid=,stat=")?String(original(file,args,options)).trimEnd()+`\n${owner.pid} 1 ${owner.pid} S\n`:original(file,args,options))as any);syncBuiltinESMExports();}
 const probes={...closedProbes,...(fault==="report-appears"?{devices:async()=>{writeFileSync(f.bootReport,"{}");return"List of devices attached\n";}}:{}),...(fault==="offline"?{devices:async()=>"List of devices attached\nemulator-5556\toffline\n"}:{}),...(fault==="online"?{devices:async()=>"List of devices attached\nemulator-5556\tdevice\n"}:{}),...(fault==="port"?{portClosed:async()=>false}:{}),...(fault==="lock"?{lockAbsent:async()=>false}:{}),...(fault==="membership-changed"?{devices:async()=>{writeFileSync(join(f.command,"group-members.json"),"{}");return"List of devices attached\n";}}:{})};
 const expected:Record<string,RegExp>={"membership-missing":/Missing boot ownership recovery/,"unknown-cleanup":/cleanup differs|native command receipt/,"wrong-owner":/ownership differs/,"live-owner":/Original command owner or process group still present/,revision:/revision or workspace/,online:/remain unresolved/,port:/remain unresolved/,lock:/remain unresolved/,"membership-changed":/cleanup evidence changed/,"report-appears":/missing boot evidence changed/,offline:/remain unresolved/};
 try{await assert.rejects(()=>release(f.args,f.dir,probes),expected[fault]!);assert.equal(f.held().length,2);}finally{stub?.mock.restore();syncBuiltinESMExports();}
 }finally{f.close();}
 });

for(const fault of ["stale", "multi-stage", "raw-failure"]) test("successful missing boot refuses " + fault,async()=>{
 const f=await ownedSessionFixture(0,false,undefined,true);try{
 rmSync(f.bootReport);const stages=f.store.stages(f.run.id);
 if(fault==="stale")stages[0].result.inputValidity="stale";
 if(fault==="multi-stage")stages.push({...stages[0],id:"extra"});
 if(fault==="raw-failure"){const p=join(f.command,"result.json"),r=JSON.parse(readFileSync(p,"utf8"));r.state="failed";writeFileSync(p,JSON.stringify(r));}
 await assert.rejects(()=>ownedAndroidAppSessionCleanup(f.worker,f.run,stages,closedProbes,undefined,false,true),/Missing boot ownership recovery|native command receipt|cleanup differs/);
 assert.equal(f.held().length,2);
 }finally{f.close();}
});

test("successful missing boot rejects later inferred native cleanup",async()=>{
 const {DatabaseSync}=await import("node:sqlite");
 const {recoverCommandOwner}=await import(moduleUrl("command-owner-recovery"));
 const {recoverStoppedWorkflow}=await import(moduleUrl("workflow-worker-recovery"));
 const {workflowNativeResourceEvidence}=await import(moduleUrl("workflow-resource-evidence"));
 const f=await ownedSessionFixture(0,false,undefined,true);try{
  rmSync(f.bootReport);const path=join(f.command,"result.json"),raw=JSON.parse(readFileSync(path,"utf8"));
  raw.state="unknown";raw.cleanup="unknown";raw.reason="exit";writeFileSync(path,JSON.stringify(raw));
  const original=readFileSync(path),db=new DatabaseSync(f.database),stage=f.store.stages(f.run.id)[0];
  db.prepare("UPDATE engine_stage SET state='unknown',result=? WHERE run_id=? AND id=?").run(JSON.stringify({...stage.result,state:"unknown",cleanup:"unknown",detail:"exit"}),f.run.id,stage.id);db.close();
  recoverCommandOwner(f.command,raw.requestDigest,"host:fixture-owner");
  const recovered=await recoverStoppedWorkflow(f.worker,f.database,f.run.id,f.run.revision),stages=f.store.stages(f.run.id);
  assert.equal(stages[0].state,"succeeded");assert.ok(stages[0].result.cleanupRecovery);
  const native=workflowNativeResourceEvidence(f.worker,recovered.run,stages,true);
  assert.ok(native.commands[0].membersDigest);assert.ok(native.commands[0].cleanupRecovery);
  f.args[f.args.indexOf("--revision")+1]=String(recovered.run.revision);
  f.args[f.args.indexOf("--evidence-digest")+1]=api.fileDigest(path);
  await assert.rejects(()=>release(f.args,f.dir,closedProbes),/Missing boot ownership recovery/);
  assert.equal(f.held().length,2);assert.deepEqual(readFileSync(path),original);
 }finally{f.close();}
});
