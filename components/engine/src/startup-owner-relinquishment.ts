import {realpathSync} from "node:fs";
import {dirname,join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {parse} from "yaml";
import {digest,fileDigest,text} from "./core.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {compiledRuntimeLock} from "./runtime-lock.ts";
import {inspectRuntimeGeneration} from "./runtime-inspection.ts";
import {RuntimeGenerations} from "./runtime-generations.ts";
import {StartupTasks} from "./startup-tasks.ts";
import {startupStatus} from "./startup-status.ts";
import {startupEvent} from "./startup-event.ts";
import {captureStartupHostOwner,requireCurrentStartupHost} from "./startup-host-owner.ts";

/** The native owning chat may stop reserving its runtime without ending the chat or host. */
export function relinquishStartupOwner(receipts:string,bindingDigest:string,authority:string,
 scope:{workspace:string;registry:string},environment:NodeJS.ProcessEnv=process.env,capture=captureStartupHostOwner) {
 text(authority,"startup relinquishment authority");
 if(!/^sha256:[a-f0-9]{64}$/u.test(bindingDigest))throw new Error("Startup relinquishment binding digest required");
 const workspace=realpathSync(scope.workspace),registry=realpathSync(scope.registry);
 if(workspace!==scope.workspace || registry!==scope.registry || realpathSync(receipts)!==receipts)
  throw new Error("Startup relinquishment scope must be canonical");
 if(receipts!==join(dirname(registry),"startup.sqlite"))throw new Error("Startup relinquishment requires this installation's default receipt store");
 const native=startupEvent("codex",{session_id:environment.CODEX_THREAD_ID,hook_event_name:"UserPromptSubmit"},workspace,true,environment);
 if(native.action!=="reserve")throw new Error("Startup relinquishment requires the owning native chat");
 // Inspect the slow native/payload boundary before taking the receipt store's shared writer lock.
 const status=startupStatus(receipts,native.taskId,{workspace,registry});
 let verified=status.owner as NonNullable<ReturnType<StartupTasks["owner"]>>|null;
 if(!verified) {
  const history=new DatabaseSync(receipts,{readOnly:true});
  try {
   const row=history.prepare("SELECT binding FROM owner_history WHERE task_id=? AND json_extract(binding,'$.bindingDigest')=? AND json_type(binding,'$.relinquishment')='object' ORDER BY json_extract(binding,'$.relinquishment.observedAt') DESC,binding DESC LIMIT 1").get(native.taskId,bindingDigest);
   verified=row?JSON.parse(String(row.binding)).binding:null;
  }finally{history.close();}
 }
 if(!verified || digest(verified)!==bindingDigest)throw new Error("Startup relinquishment owner binding changed or unavailable");
 if(verified.reader.registry!==registry || verified.reader.owner!==`startup-task:${native.taskId}`)
  throw new Error("Startup relinquishment registry or native chat differs");
 requireCurrentStartupHost(verified.host,capture);
 const generations=new RuntimeGenerations(registry);
 try {
  const state=generations.state(),lockPath=join(workspace,"config/governance/runtime.lock.yaml"),lockDigest=fileDigest(lockPath);
  if(status.owner) {
   const reader=verified.reader;
   if(!state.directory || state.revision<reader.revision || (state.revision===reader.revision && state.directory!==reader.directory))
    throw new Error("Startup relinquishment generation changed");
   const lock=compiledRuntimeLock(parse(narrativeFile(workspace,lockPath)));
   if(digest(lock)!==inspectRuntimeGeneration(state.directory).lockDigest || fileDigest(lockPath)!==lockDigest)
    throw new Error("Startup relinquishment lock differs from selected runtime");
  }
  const tasks=new StartupTasks(receipts);
  try {
   return tasks.relinquishOwner(native.taskId,bindingDigest,(binding,replay)=>{
    if(digest(binding)!==digest(verified))throw new Error("Startup relinquishment verified binding changed");
    if(replay)return null;
    // A fresh owner appeared after the replay pre-check: inspect it on a new invocation.
    if(!status.owner || !state.directory || fileDigest(lockPath)!==lockDigest)throw new Error("Startup relinquishment snapshot changed; retry");
    generations.relinquishStartupReader(binding.reader,{revision:state.revision,directory:state.directory});
    return {version:1,kind:"startup-owner-relinquishment",taskId:native.taskId,bindingDigest,registry,
     revision:binding.reader.revision,currentRevision:state.revision,lockDigest,authority,observedAt:new Date().toISOString(),reservation:"released",
     sessionEnded:false,taskOutcome:"unknown",replayedWork:false,resume:"select-current-runtime-and-refresh-context"};
   });
  }finally{tasks.close();}
 }finally{generations.close();}
}
