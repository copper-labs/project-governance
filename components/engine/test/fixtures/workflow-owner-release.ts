import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { removeRuntimeFixture } from "./remove-runtime-fixture.ts";
const pkg=process.env.GOVERNANCE_HOST_TEST_PACKAGE;
export const moduleUrl=(name:string)=>pkg ? pathToFileURL(join(pkg,"dist/engine/src",name+".js")).href : new URL("../../src/"+name+".ts",import.meta.url).href;
export const api=await import(moduleUrl("host-api-v1"));
const {parseRecipe}=await import(moduleUrl("workflow-types"));
const {dispatchWorkflow}=await import(moduleUrl("workflow-worker"));
const {commandProcesses}=await import(moduleUrl("command-owner-recovery"));
const {RuntimeGenerations}=await import(moduleUrl("runtime-generations"));

/** A real benign native command writes its closure report, fails, and leaves custom leases unknown. */
export async function ownerReleaseFixture(resources:string[]=["fixture-local-producer","fixture-local-storage"], observation:boolean|"simulator"=false, exitCode=1, options?:{recipe?:(dir:string)=>Record<string,unknown>;expectedState?:string;registryPath?:string;producer?:(dir:string)=>string;workerPreload?:string;stages?:Array<{id:string;operation:string;deadlineMs:number;dependsOn?:string[]}>}) {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),"workflow-owner-release-"))),database=join(dir,"harness.sqlite");
  const report=join(dir,"closure.json"),script=join(dir,"producer.mjs"),receipt=join(dir,"release.json");
  writeFileSync(script,options?.producer?.(dir)??`import{writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
await new Promise(resolve=>setTimeout(resolve,400));
const fingerprint=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'}).trim();
writeFileSync(process.argv[2],JSON.stringify({status:'${exitCode===0?"passed":"failed"}',childStarted:true,processClosure:{closed:true,after:{group:[],observedTree:[]}},
observedProcessIdentities:{[process.pid]:fingerprint},legacyLockReleased:true,ended:Date.now()/1000,withinClosureDeadline:false,${observation===true?'deviceUdid:JSON.parse(process.argv[3]),appOrSDKLaunch:false,ownedFileLockHeld:false,observedAt:new Date().toISOString(),':observation==='simulator'?'nativeSdkRebuilt:false,exitCode:1,legacyLocksReleased:true,finished:Date.now()/1000,appClosure:[],processClosure:{closed:true,conflicts:[],observedIdentities:[{pid:process.pid,started:String(Date.now()/1000-process.uptime())}]},':''}}));process.exit(${exitCode});\n`);
  const continuity=new api.Store(database),task=continuity.createTask("synthetic local owner cleanup",[{kind:"scope",provenance:"operator",body:dir}]);
  const policy=api.defaultPolicy(),request={operation:"check",scope:[dir],targets:[script],destination:null,policyRevision:policy.revision};
  const action=api.authorizeAction(continuity,api.proposeAction(continuity,task.taskId,request),request,policy,dir);
  const recipe=parseRecipe({version:1,id:"owner-release-fixture",workspace:dir,inputs:[{path:"producer.mjs",digest:api.fileDigest(script)}],
    resources,...options?.recipe?.(dir),operations:{check:{argv:[process.execPath,script,report,JSON.stringify(resources.find(value=>value.startsWith("ios-device:"))?.slice("ios-device:".length)??"fixture")],cwd:".",effect:"local"}},
    stages:options?.stages??[{id:"native",operation:"check",deadlineMs:5000}],deadlineMs:10000,policyRevision:policy.revision,claims:["controlled fixture"]});
  const store=new api.WorkflowStore(database),binding={taskId:task.taskId,taskVersion:1,actionId:action.actionId,authorityRef:"host:fixture-owner",recipe,
    recipeDigest:api.recipeDigest(recipe),operationId:"fixture-owner:1"};store.authorizeWorkflow(binding);
  const submitted=store.submit(binding),registry=new api.ResourceRegistry(options?.registryPath??join(dir,"resources.sqlite"));
  const generation=process.env.GOVERNANCE_HOST_TEST_GENERATION;
  let generations:any,parent:any;
  const names=["GOVERNANCE_GENERATION_REGISTRY","GOVERNANCE_GENERATION_TOKEN","GOVERNANCE_GENERATION_OWNER"];
  const before=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  if(generation){
    generations=new RuntimeGenerations(join(dir,"runtime.sqlite"));generations.activate(generation,0);parent=generations.acquire("fixture-owner");
    Object.assign(process.env,{GOVERNANCE_GENERATION_REGISTRY:join(dir,"runtime.sqlite"),GOVERNANCE_GENERATION_TOKEN:parent.token,GOVERNANCE_GENERATION_OWNER:parent.owner});
    mkdirSync(join(dir,"config/governance"),{recursive:true});writeFileSync(join(dir,"config/governance/runtime.lock.yaml"),JSON.stringify(JSON.parse(readFileSync(join(generation,"installation.json"),"utf8")).lock));
  }
  let worker:string;
  const originalSpawn=childProcess.spawn;
  if(options?.workerPreload){childProcess.spawn=((executable:any,args:any,settings:any)=>originalSpawn(executable,["--import",options.workerPreload!,...args],settings))as typeof childProcess.spawn;syncBuiltinESMExports();}
  try{worker=dispatchWorkflow(database,submitted.id,join(dir,"workers"),registry.path);}
  finally{childProcess.spawn=originalSpawn;syncBuiltinESMExports();for(const name of names){if(before[name]===undefined)delete process.env[name];else process.env[name]=before[name];}if(parent)generations.release(parent.token,parent.owner);}
  const command=join(worker,"commands",submitted.id+"-0");
  let ready=false;
  for(let attempt=0;attempt<200;attempt++){
    if(store.read(submitted.id).state===(options?.expectedState??"unknown")){
      const owner=JSON.parse(readFileSync(join(worker,"owner.json"),"utf8")),pids=[owner.pid],groups:number[]=[];
      for(let index=0;index<recipe.stages.length;index++){
        const path=join(worker,"commands",submitted.id+"-"+index);if(!existsSync(join(path,"launch.json")))continue;
        const launch=JSON.parse(readFileSync(join(path,"launch.json"),"utf8")),guardian=JSON.parse(readFileSync(join(path,"guardian.json"),"utf8"));
        const members=existsSync(join(path,"group-members.json"))?JSON.parse(readFileSync(join(path,"group-members.json"),"utf8")).members:[];
        pids.push(launch.owner.pid,guardian.pid,launch.child.pid,...members.map((m:any)=>m.pid));groups.push(launch.child.processGroup);
      }
      if(!commandProcesses().some((row:any)=>pids.includes(row.pid)||groups.includes(row.group))){ready=true;break;}
    }await delay(25);
  }
  if(!ready)throw new Error("Synthetic native worker failed to close");
  const run=store.read(submitted.id),hash=api.fileDigest(report);
  const args=["--database",database,"--run",run.id,"--revision",String(run.revision),"--worker-directory",worker,"--registry",registry.path,
    "--authority",binding.authorityRef,"--kind","local-host","--evidence",report,"--evidence-digest",hash,"--receipt",receipt];
  return{dir,database,report,receipt,worker,command,store,registry,run,args,generations,
    held:()=>registry.inspect().filter((row:any)=>row.operation===run.id&&row.state==="held"),
    close(){generations?.close();store.close();registry.close();continuity.close();removeRuntimeFixture(dir);}};
}
