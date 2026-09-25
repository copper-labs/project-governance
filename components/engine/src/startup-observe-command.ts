import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {join} from "node:path";
import {startupInput} from "./startup-input.ts";
import {narrativeFile} from "./narrative-inputs.ts";
import {observeStartup} from "./startup-observation.ts";
import {nativeOwnerRolloverResult} from "./startup-prompt-rollover.ts";
import {promptContext} from "./prompt-context.ts";
import {collectContextHostUsage} from "./context-observations.ts";
import {ContextRouteError,recordContextFailure} from "./context-route-errors.ts";
import {startupHookOutput} from "./startup-hook-output.ts";

function sameNativeWorktree(workspace:string,cwd:string):boolean {
 try {
  const root=realpathSync(workspace),actual=realpathSync(cwd);
  if(actual===root)return true;
  if(!actual.startsWith(root+"/"))return false;
  const environment={...process.env};
  for(const key of Object.keys(environment))if(key.startsWith("GIT_"))delete environment[key];
  return realpathSync(execFileSync("git",["rev-parse","--show-toplevel"],
   {cwd:actual,env:environment,encoding:"utf8",timeout:1000,stdio:["ignore","pipe","pipe"]}).trim())===root;
 } catch { return false; }
}

/** Native events cannot cross from a stale tracked sibling hook into another tree's receipts. */
export async function startupObserveCommand(input:{provider:string;eventFile:string|undefined;eventStdin:boolean;
 workspace:string;registry:string;receipts:string;installedScope:boolean}) {
 const {provider,eventFile,eventStdin,workspace,registry,receipts,installedScope}=input;
 if(installedScope && eventStdin && provider==="codex" && !sameNativeWorktree(workspace,process.cwd()))return {};
 let event:unknown;
 try { event=eventStdin?await startupInput(process.stdin,3000,provider==="codex"?262144:65536):JSON.parse(narrativeFile(process.cwd(),eventFile!)); }
 catch(error) {
  if(!eventStdin || provider!=="codex")throw error;
  try{recordContextFailure(workspace,new ContextRouteError("prompt-input-unavailable","Native event input was malformed, unavailable or exceeded its limit."));}catch{/* Nonblocking analytics. */}
  return {};
 }
 const nativeEvent=event && typeof event==="object" && !Array.isArray(event) ? event as Record<string,unknown> : {};
 if(installedScope && eventStdin && provider==="codex" && nativeEvent.cwd!==undefined &&
   (typeof nativeEvent.cwd!=="string" || !sameNativeWorktree(workspace,nativeEvent.cwd)))return {};
 const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 let receipt;
 try { receipt=await observeStartup({provider,event,workspace,registry,receipts},token?{token}:{}); }
 catch(error) {
  if(eventStdin){
   const rollover=await nativeOwnerRolloverResult(error,provider,event,workspace,registry,receipts);
   if(rollover!==undefined)return rollover;
  }
  throw error;
 }
 if(nativeEvent.hook_event_name==="UserPromptSubmit") {
  const context=await promptContext(provider,event,workspace);
  return eventStdin?context:{...receipt,context};
 }
 if(provider==="codex" && nativeEvent.hook_event_name==="SessionEnd" &&
   typeof nativeEvent.session_id==="string" && typeof nativeEvent.transcript_path==="string") {
  const usage=collectContextHostUsage(workspace,nativeEvent.session_id,nativeEvent.transcript_path);
  if(!eventStdin)return {...receipt,usage};
 }
 return eventStdin?startupHookOutput(event,receipt):receipt;
}
