import {realpathSync} from "node:fs";
import {text} from "./core.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {requireAbsentStartupHost} from "./startup-host-owner.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";

/** Release only the persisted task reservation; no work is replayed or declared successful. */
export function recoverStartupOwner(receipts:string,taskId:string,bindingDigest:string,authority:string,
 scope?:{workspace:string;registry:string}) {
 text(authority,"startup recovery authority");
 if(!/^sha256:[a-f0-9]{64}$/u.test(taskId) || !/^sha256:[a-f0-9]{64}$/u.test(bindingDigest))throw new Error("Startup recovery identity required");
 const tasks=new StartupTasks(realpathSync(receipts));
 try {
  if(scope && tasks.workspace(taskId)!==realpathSync(scope.workspace))throw new Error("Startup recovery workspace differs");
  const recorded=tasks.owner(taskId);
  if(scope && recorded && recorded.reader.registry!==realpathSync(scope.registry))throw new Error("Startup recovery registry differs");
  const result=tasks.recoverOwner(taskId,bindingDigest,binding=>{
   const {reader}=binding;
   if(reader.owner!==`startup-task:${taskId}` || realpathSync(reader.registry)!==reader.registry ||
     !Number.isSafeInteger(reader.revision) || reader.revision<1 || !reader.token)throw new Error("Invalid recorded startup reader");
   const absence=requireAbsentStartupHost(binding.host);
   const generations=new RuntimeGenerations(reader.registry);
   try{
    const {registry:unused,...recorded}=reader;
    if(!generations.retireStartupReader(recorded))throw new Error("Startup update recovery must complete before owner retirement");
   }finally{generations.close();}
   return {version:1,taskId,bindingDigest,registry:reader.registry,authority,absence,observedAt:new Date().toISOString(),
     reservation:"released",taskOutcome:"unknown",replayed:false};
  });
  if(scope && result.registry!==realpathSync(scope.registry))throw new Error("Startup recovery receipt registry differs");
  return result;
 }finally{tasks.close();}
}
