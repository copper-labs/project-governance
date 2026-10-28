import {existsSync,lstatSync,realpathSync} from "node:fs";
import {dirname,join} from "node:path";
import {parse} from "yaml";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {DatabaseSync} from "node:sqlite";
import {digest,durableJson,fileDigest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {startupStatus} from "./startup-status.ts";
import {startupEvent} from "./startup-event.ts";
import {captureStartupHostOwner,requireCurrentStartupHost,requireAbsentStartupHost} from "./startup-host-owner.ts";
import {finalizeRuntimeActivation} from "./runtime-finalization.ts";
import type {RuntimePreparation} from "./runtime-operation-preparation.ts";

interface Handoff {
 version:1; requestDigest:string; token:string; owner:string; task:string; lockDigest:string;
 binding:NonNullable<ReturnType<StartupTasks["owner"]>>;
}
export const installationHandoffPath=(directory:string)=>join(directory,"startup-handoff.json");

/** A process-scoped mutex prevents cancellation racing an updater; SQLite releases it on process exit. */
export async function withInstallationHandoffOwner<T>(directory:string,run:()=>Promise<T>):Promise<T> {
 if(realpathSync(dirname(directory))!==dirname(directory) || (existsSync(directory) && realpathSync(directory)!==directory))
  throw new Error("Installation handoff operation uses aliases");
 const path=`${directory}.handoff-mutex.sqlite`,entry=lstatSync(path,{throwIfNoEntry:false});
 if(entry && (!entry.isFile() || realpathSync(path)!==path))throw new Error("Installation handoff mutex uses aliases");
 const mutex=new DatabaseSync(path);
 try {
  mutex.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
  try{return await run();}finally{mutex.exec("ROLLBACK");}
 }finally{mutex.close();}
}

function authorizeHandoff(handoff:Handoff,request:RuntimePreparation,environment:NodeJS.ProcessEnv,
 capture:typeof captureStartupHostOwner,allowAbsent:boolean,proveAbsent:typeof requireAbsentStartupHost) {
 if(environment.HARNESS_AGENT_ANCESTRY || environment.GOVERNANCE_PARENT_TASK || environment.GOVERNANCE_PARENT_LOCK_DIGEST)
  throw new Error("Delegated workers cannot recover an installation handoff");
 try {
  const native=startupEvent("codex",{session_id:environment.CODEX_THREAD_ID,hook_event_name:"UserPromptSubmit"},request.workspace,true,environment);
  if(native.action!=="reserve" || native.taskId!==handoff.task)throw new Error("Installation handoff requires the exact native parent");
  requireCurrentStartupHost(handoff.binding.host,capture);
  return "current" as const;
 }catch(error) {
  if(!allowAbsent)throw error;
  // A different live parent never gains custody. Recovery requires positive local PID absence.
  proveAbsent(handoff.binding.host);return "absent" as const;
 }
}

/** This is an explicit parent update, not absent-owner recovery or automatic compatibility. */
export function installationHandoff(directory:string,request:RuntimePreparation,
 environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner,allowAbsent=false,
 proveAbsent=requireAbsentStartupHost):Handoff|null {
 const path=installationHandoffPath(directory);if(!existsSync(path))return null;
 if(request.mode!=="update" || !request.startupReceipts)throw new Error("Installation handoff requires an explicit managed update");
 const saved=JSON.parse(narrativeFile(directory,"operation.json"));
 const value=JSON.parse(narrativeFile(directory,path)) as Handoff;
 if(value.version!==1 || value.requestDigest!==saved.requestDigest || saved.requestDigest!==digest(saved.request) ||
  digest(saved.request)!==digest({version:1,kind:"runtime-preparation",...request}) ||
  value.token!==saved.token || value.owner!==saved.owner || saved.owner!==`installation:${realpathSync(directory)}`)
  throw new Error("Installation handoff operation changed");
 if(value.binding.reader.owner!==`startup-task:${value.task}` ||
  value.binding.reader.registry!==realpathSync(request.registry) || value.binding.reader.revision!==request.expectedRevision)
  throw new Error("Installation handoff requires the exact native parent and generation");
 authorizeHandoff(value,request,environment,capture,allowAbsent,proveAbsent);
 return value;
}

/** Write intent before consuming the reservation, retaining the original operation/candidate identities. */
export function prepareInstallationHandoff(directory:string,request:RuntimePreparation,
 environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner,proveAbsent=requireAbsentStartupHost) {
 let value=installationHandoff(directory,request,environment,capture,true,proveAbsent);
 if(!value) {
  if(request.mode!=="update" || !request.startupReceipts)throw new Error("Installation handoff requires an explicit managed update");
  const native=startupEvent("codex",{session_id:environment.CODEX_THREAD_ID,hook_event_name:"UserPromptSubmit"},request.workspace,true,environment);
  if(native.action!=="reserve")throw new Error("Installation handoff requires the owning native parent");
  const status=startupStatus(request.startupReceipts,native.taskId,request);
  if(status.state!=="open" || !status.owner)
   throw new Error("Installation handoff requires the current open startup binding");
  requireCurrentStartupHost(status.owner.host,capture);
  const lockPath=join(request.workspace,"config/governance/runtime.lock.yaml"),lockDigest=fileDigest(lockPath);
  if(status.lockDigest!==lockDigest) {
   // Discovery retains its earlier lock. Explicit installation verifies the live generation instead.
   const lock=compiledRuntimeLock(parse(narrativeFile(request.workspace,lockPath)));
   if(digest(lock)!==inspectRuntimeGeneration(status.owner.reader.directory).lockDigest || fileDigest(lockPath)!==lockDigest)
    throw new Error("Installation lock differs from the recorded current runtime");
  }
  const saved=JSON.parse(narrativeFile(directory,"operation.json"));
  value={version:1,requestDigest:saved.requestDigest,token:saved.token,owner:saved.owner,task:native.taskId,
   lockDigest,binding:status.owner};
  durableJson(installationHandoffPath(directory),value);
  value=installationHandoff(directory,request,environment,capture)!;
 }
 const tasks=new StartupTasks(request.startupReceipts!);
 try {
  const handoff=value;
  tasks.reserveOwner(handoff.task,handoff.binding,()=>{
   const authority=authorizeHandoff(handoff,request,environment,capture,true,proveAbsent);
   if(fileDigest(join(request.workspace,"config/governance/runtime.lock.yaml"))!==handoff.lockDigest)
    throw new Error("Installation lock changed before reader handoff");
   const generations=new RuntimeGenerations(request.registry);
   try {const {registry:unused,...reader}=handoff.binding.reader;generations.handoffInstallationReader(handoff.token,handoff.owner,reader,authority==="absent");}
   finally {generations.close();}
  });
 }finally {tasks.close();}
 return value;
}

/** Finalize the generation inside the task transaction; either ledger can safely replay after a crash. */
export function installationHandoffFinalizer(directory:string,request:RuntimePreparation,
 environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner,proveAbsent=requireAbsentStartupHost):typeof finalizeRuntimeActivation {
 const handoff=installationHandoff(directory,request,environment,capture,true,proveAbsent);
 if(!handoff)return finalizeRuntimeActivation;
 return (registry,workspace,token,owner,preserved,hostInstructions,history)=>{
  authorizeHandoff(handoff,request,environment,capture,true,proveAbsent);
  const tasks=new StartupTasks(request.startupReceipts!);
  try {
   if(tasks.workspace(handoff.task)!==request.workspace || token!==handoff.token || owner!==handoff.owner || registry!==request.registry || workspace!==request.workspace)
    throw new Error("Installation handoff completion scope changed");
   const {registry:unused,...reader}=handoff.binding.reader;
   let result:ReturnType<typeof finalizeRuntimeActivation>|undefined;
   tasks.completeInstallation(handoff.task,handoff.binding,token,fileDigest(join(workspace,"config/governance/runtime.lock.yaml")),false,()=>{
    result=finalizeRuntimeActivation(registry,workspace,token,owner,preserved,hostInstructions,history,reader);
    return {...reader,registry,revision:result.state.revision,directory:result.state.directory!};
   },restored=>{const generations=new RuntimeGenerations(registry);try{generations.releaseConfirmed(restored.token,restored.owner,restored.revision);}finally{generations.close();}});
   return result??finalizeRuntimeActivation(registry,workspace,token,owner,preserved,hostInstructions,history,reader);
  }finally{tasks.close();}
 };
}

export function cancelInstallationHandoff(directory:string,request:RuntimePreparation,
 environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner,proveAbsent=requireAbsentStartupHost) {
 const handoff=installationHandoff(directory,request,environment,capture,true,proveAbsent);
 if(!handoff)throw new Error("Recorded installation handoff required for cancellation");
 const tasks=new StartupTasks(request.startupReceipts!);
 try {
  const {registry,...reader}=handoff.binding.reader;
  if(fileDigest(join(request.workspace,"config/governance/runtime.lock.yaml"))!==handoff.lockDigest)
   throw new Error("Installation cancellation cannot discard an activated lock");
  return tasks.completeInstallation(handoff.task,handoff.binding,handoff.token,handoff.lockDigest,true,closed=>{
   const generations=new RuntimeGenerations(registry);
   try{return {...generations.cancelInstallationHandoff(handoff.token,handoff.owner,reader,closed),registry};}finally{generations.close();}
  },restored=>{const generations=new RuntimeGenerations(registry);try{generations.releaseConfirmed(restored.token,restored.owner,restored.revision);}finally{generations.close();}});
 }finally{tasks.close();}
}
