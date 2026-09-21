import {realpathSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
import {parse} from "yaml";
import {startupObservationOwner} from "./startup-observation-owner.ts";
import {fileDigest,digest} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {startupEvent} from "./startup-event.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {discoverStartupRelease} from "./startup-discovery.ts";
import {captureStartupHostOwner} from "./startup-host-owner.ts";

/** Observe startup under the active generation; never apply a release from a host event. */
export async function observeStartup(input:{provider:string;event:unknown;workspace:string;registry:string;receipts:string},
 options:{token?:string;fetch?:typeof fetch;environment?:NodeJS.ProcessEnv}={}) {
 const environment=options.environment??process.env;
 const preliminary=startupEvent(input.provider,input.event,input.workspace,false,environment);
 if(preliminary.action==="defer")return preliminary;
 const workspace=realpathSync(input.workspace),registry=realpathSync(input.registry);
 const generations=new RuntimeGenerations(registry);
 let reader:ReturnType<RuntimeGenerations["acquire"]>|undefined;
 let tasks:StartupTasks|undefined;
 try {
  if(preliminary.action==="close") {
    // Closing must remain possible after maintenance has stopped new reader admission.
    tasks=new StartupTasks(input.receipts);
    const receipt=tasks.event(input.provider,input.event,workspace,fileDigest(join(workspace,"config/governance/runtime.lock.yaml")),environment);
    const retired=tasks.retireOwner(preliminary.taskId,binding=>{
      const owner=`startup-task:${preliminary.taskId}`,held=generations.state().readers.filter(value=>value.owner===owner);
      if(held.length>1)throw new Error("Startup task has ambiguous reader ownership");
      if(binding && (binding.reader.registry!==registry || binding.reader.owner!==owner ||
        (held[0] && (held[0].token!==binding.reader.token || held[0].revision!==binding.reader.revision))))
        throw new Error("Startup reader differs from recorded owner");
      if(binding) {
        const {registry:unused,...recorded}=binding.reader;
        return generations.retireStartupReader(recorded);
      }
      if(held[0])generations.releaseConfirmed(String(held[0].token),owner,Number(held[0].revision));
    });
    return retired?receipt:{...receipt,retirement:"pending-update" as const};
  }
  reader=generations.acquire(startupObservationOwner(workspace));
  const installed=inspectRuntimeGeneration(reader.directory),lockPath=join(workspace,"config/governance/runtime.lock.yaml");
  const lock=compiledRuntimeLock(parse(narrativeFile(workspace,lockPath)));
  if(digest(lock)!==installed.lockDigest)throw new Error("Startup lock differs from active generation");
  const lockDigest=fileDigest(lockPath);
  const host=captureStartupHostOwner(input.provider);
  if(!host)return {action:"defer" as const,discover:false as const,reason:"native-owner-unavailable"};
  tasks=new StartupTasks(input.receipts);
  const receipt=tasks.event(input.provider,input.event,workspace,lockDigest,environment);
  const prior=tasks.owner(preliminary.taskId);
  const planned=prior?.reader??{registry,token:randomUUID(),revision:reader.revision,directory:reader.directory,
    owner:`startup-task:${preliminary.taskId}`};
  if(planned.registry!==registry)throw new Error("Startup reservation registry changed");
  // Persist intent first. A crash leaves either a recoverable binding or an exact replayable reader.
  tasks.bindOwner(preliminary.taskId,host,planned);
  tasks.reserveOwner(preliminary.taskId,{host,reader:planned},()=>{generations.reserveStartupTask(preliminary.taskId,planned);});
  if(!receipt.discover || !("taskId" in receipt))return receipt;
  try {
   const profile=parse(narrativeFile(workspace,"config/governance/profile.yaml"));
   const result=await discoverStartupRelease(profile,lock,{...options,cachePath:realpathSync(input.receipts)+".metadata.json"});
   if(fileDigest(lockPath)!==lockDigest)throw new Error("Startup lock changed during discovery");
   tasks.completeDiscovery(receipt.taskId,lockDigest,result);
   return {...receipt,discover:false,discovery:"complete",result};
  }catch(error) {
   // Receipts carry bounded status, not transport exception text that may contain credentials.
   tasks.completeDiscovery(receipt.taskId,lockDigest,{status:"discovery-failed",reason:"candidate-discovery-incomplete"});
   throw error;
  }
 }finally {
  try{tasks?.close();}finally {
   try{if(reader)generations.release(reader.token,reader.owner);}finally{generations.close();}
  }
 }
}
