import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {stageRuntimeArchive} from "../src/runtime-staging.ts";
import {RuntimeGenerations} from "../src/runtime-generations.ts";
import {StartupTasks} from "../src/startup-tasks.ts";
import {fileDigest} from "../src/core.ts";
import {startupReleaseCandidate} from "../src/startup-release-assets.ts";
import {prepareStartupCandidate} from "../src/startup-preparation.ts";
import {applyPreparedStartup} from "../src/startup-application.ts";
import {runtimeLauncher} from "../src/runtime-launcher.ts";
import type {CompiledRuntimeLock} from "../src/runtime-lock.ts";

test("startup preparation joins saved discovery to inactive installation and reuses exact preparation",async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"startup-prepare-"))),workspace=join(root,"project");
 let generations:RuntimeGenerations|undefined,tasks:StartupTasks|undefined;
 try {
  const archiveFor=(version:string)=>{
   const source=join(root,version,"package");mkdirSync(join(source,"dist/engine/src"),{recursive:true});mkdirSync(join(source,"dist/engine/assets"));
   writeFileSync(join(source,"package.json"),JSON.stringify({name:"@organta/project-governance",version,type:"module",engines:{node:">=24.16.0 <25"},bin:{"project-governance":"dist/engine/src/cli.js"}}));
   writeFileSync(join(source,"dist/engine/src/cli.js"),`console.log("project-governance ${version}");`);
   writeFileSync(join(source,"dist/engine/assets/runtime-dependencies.lock.json"),JSON.stringify({lockfileVersion:3,name:"@organta/project-governance",version,packages:{"":{}}}));
   const archive=join(root,version+".tgz");execFileSync("tar",["-czf",archive,"-C",join(root,version),"package"]);
   return {archive,bytes:readFileSync(archive)};
  };
  const first=archiveFor("3.0.0"),next=archiveFor("3.1.0"),api="https://api.github.com/repos/example/governance";
  const lockFor=(version:string,bytes:Buffer):CompiledRuntimeLock=>({schema_version:2,package:"@organta/project-governance",version,
   artifact:{url:`https://github.com/example/governance/releases/download/${version}/runtime.tgz`,integrity:"sha512-"+createHash("sha512").update(bytes).digest("base64")},source_commit:"a".repeat(40),node:">=24.16.0 <25",configuration_schema:1});
  const current=lockFor("3.0.0",first.bytes),candidate=lockFor("3.1.0",next.bytes),lockBytes=Buffer.from(JSON.stringify(candidate));
  const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
  const metadata=Buffer.from(JSON.stringify({schema_version:1,version:"3.1.0",lock_sha256:hash(lockBytes),startup_contract:2,automatic:true,from_version:"3.0.0",before_version:"3.1.0",configuration_schema:1,integration_change:false}));
  const bodies=[metadata,lockBytes,next.bytes];
  const release={immutable:true,draft:false,prerelease:false,tag_name:"3.1.0",assets:["runtime-update.json","runtime.lock.yaml","runtime.tgz"].map((name,index)=>({name,state:"uploaded",size:bodies[index]!.length,digest:`sha256:${hash(bodies[index]!)}`,url:`${api}/releases/assets/${index}`,browser_download_url:candidate.artifact.url}))};
  const discovered=await startupReleaseCandidate(current,release,{api,read:async url=>bodies[Number(url.split("/").at(-1))]!});
  mkdirSync(join(workspace,"config/governance"),{recursive:true});
  const lockPath=join(workspace,"config/governance/runtime.lock.yaml");writeFileSync(lockPath,JSON.stringify(current));
  writeFileSync(join(workspace,"config/governance/profile.yaml"),"runtime_updates:\n  policy: compatible\n");
  writeFileSync(join(workspace,".gitignore"),".governance/\n");
  const git=(...args:string[])=>execFileSync("git",args,{cwd:workspace,stdio:["ignore","pipe","pipe"]});
  git("init");git("config","user.name","Fixture");git("config","user.email","fixture@example.invalid");git("config","commit.gpgsign","false");git("add",".");git("commit","-m","Prepare fixture");
  const registry=join(root,"registry.sqlite"),receipts=join(root,"tasks.sqlite"),stage=stageRuntimeArchive(first.archive,current,join(root,"initial"));
  generations=new RuntimeGenerations(registry);generations.activate(stage.directory,0);tasks=new StartupTasks(receipts);
  mkdirSync(join(workspace,".governance/runtime/bin"),{recursive:true});
  writeFileSync(join(workspace,".governance/runtime/bin/project-governance"),runtimeLauncher(realpathSync(process.execPath),stage.executable,registry,workspace),{mode:0o700});
  const event={session_id:"preparation",hook_event_name:"SessionStart",source:"startup"},task=tasks.event("codex",event,workspace,fileDigest(lockPath),{});assert.ok("taskId" in task);
  const reader=generations.reserveStartupTask(task.taskId),host={host:"fixture",provider:"codex" as const,pid:123,fingerprint:"start"};
  tasks.bindOwner(task.taskId,host,{registry,...reader});tasks.completeDiscovery(task.taskId,fileDigest(lockPath),{status:"available",candidate:discovered});
  const input={workspace,registry,receipts,task:task.taskId,workState:"minor",reason:"Independent small change",directory:join(root,"preparation")};
  let requests=0;
  const options={environment:{...process.env,CODEX_THREAD_ID:"preparation"},capture:()=>host,fetch:(async url=>{
   requests++;const path=String(url);return new Response(path.includes("/tags/")?JSON.stringify(release):bodies[Number(path.split("/").at(-1))]!);
  }) as typeof fetch};
  const prepared=await prepareStartupCandidate(input,options);assert.equal(prepared.status,"prepared");assert.equal(requests,4);
  assert.equal(generations.state().directory,stage.directory);assert.equal(generations.state().readers.length,1);assert.equal(generations.state().maintenance,null);
  assert.deepEqual(await prepareStartupCandidate(input,{...options,fetch:async()=>{throw new Error("must reuse");}}),prepared);
  await assert.rejects(prepareStartupCandidate({...input,reason:"Changed assessment"},options),/request changed/);
  const applied=await applyPreparedStartup(input,{...options,fetch:async()=>{throw new Error("must reuse");}});
  assert.equal(applied.status,"updated");assert.equal(generations.state().revision,2);
  assert.equal(generations.state().maintenance,null);assert.equal(generations.state().readers.length,1);
  assert.equal(readFileSync(lockPath,"utf8"),lockBytes.toString());
  assert.equal(tasks.owner(task.taskId)!.reader.revision,2);
  assert.deepEqual(await applyPreparedStartup(input,{...options,fetch:async()=>{throw new Error("must reuse");}}),applied);
  assert.equal(generations.state().revision,2);assert.equal(generations.state().readers.length,1);
 }finally{tasks?.close();generations?.close();rmSync(root,{recursive:true,force:true});}
});
