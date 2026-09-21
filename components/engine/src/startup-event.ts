import {realpathSync} from "node:fs";
import {digest} from "./core.ts";

/** Normalize native events before any discovery. Seen identity must come from durable task state. */
export function startupEvent(provider:string,eventValue:unknown,workspace:string,seen:boolean,
 environment:NodeJS.ProcessEnv=process.env) {
 const deferred=(reason:string)=>({action:"defer" as const,discover:false as const,reason});
 if(!eventValue || typeof eventValue!=="object" || Array.isArray(eventValue))return deferred("malformed-event");
 const event=eventValue as Record<string,unknown>;
 if(environment.HARNESS_AGENT_ANCESTRY || environment.GOVERNANCE_PARENT_TASK ||
    environment.GOVERNANCE_PARENT_LOCK_DIGEST || event.agent_id || event.hook_event_name==="SubagentStart")
   return deferred("delegated-worker");
 if(provider!=="codex")return deferred("uncertified-host");
 if(typeof event.session_id!=="string" || !event.session_id.trim() || event.session_id.length>128 || /[\x00-\x1f]/u.test(event.session_id))
   return deferred("missing-session-identity");
 if(!["SessionStart","SessionEnd","UserPromptSubmit"].includes(String(event.hook_event_name)))return deferred("unsupported-event");
 const root=realpathSync(workspace),taskId=digest({provider,session:event.session_id,workspace:root});
 if(event.hook_event_name==="SessionEnd")return {action:"close" as const,discover:false as const,taskId,root};
 return {action:"reserve" as const,discover:!seen && event.hook_event_name==="SessionStart" && event.source==="startup",
   taskId,root,reason:seen?"existing-task":event.hook_event_name==="SessionStart" && event.source==="startup"?"initial-startup":"continuation"};
}
