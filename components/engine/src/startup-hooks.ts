import {isAbsolute,join} from "node:path";
import {CONTEXT_HOOK_SECONDS} from "./context-timing.ts";

const events={SessionStart:90,SubagentStart:90,SessionEnd:3,UserPromptSubmit:CONTEXT_HOOK_SECONDS} as const;
export const MANAGED_CODEX_STARTUP_COMMAND='root="$(git rev-parse --show-toplevel)" && "$root/.governance/runtime/bin/project-governance" startup observe --provider codex --event-stdin';
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value && typeof value==="object" && !Array.isArray(value));

/** Prepare authored configuration without installing hooks or opting the project into updates. */
export function startupHooks(configuration:unknown,workspace:string,receipts:string) {
 if([workspace,receipts].some(value=>!isAbsolute(value) || /[\x00-\x1f\x7f]/u.test(value)))
  throw new Error("Startup hooks require absolute workspace and receipt paths");
 if(!record(configuration) || (configuration.hooks!==undefined && !record(configuration.hooks)))
  throw new Error("Host hook configuration must be an object");
 const result=structuredClone(configuration),hooks=(result.hooks??{}) as Record<string,unknown>;
 result.hooks=hooks;
 // This file is tracked and copied to linked worktrees. Resolve the active tree at invocation;
 // the installed launcher supplies its own registry, which owns the default receipt store.
 const command=MANAGED_CODEX_STARTUP_COMMAND;
 // Never silently replace an old or customized handler: two observers would hold two authorities.
 for(const [name,groups] of Object.entries(hooks)) {
  if(!Array.isArray(groups))throw new Error("Host hook event must contain handler groups");
  for(const group of groups) {
   if(!record(group) || !Array.isArray(group.hooks))throw new Error("Malformed host hook group");
   for(const handler of group.hooks) {
    if(!record(handler))throw new Error("Malformed host hook handler");
    if(typeof handler.command!=="string")continue;
    if(handler.command.includes("governance-startup.py"))throw new Error("Legacy startup hooks require deliberate migration");
    if(handler.command.includes("startup observe") && handler.command.includes("project-governance")) {
     const timeout=events[name as keyof typeof events];
     const completePrompt=name==="UserPromptSubmit" && handler.additionalContextLimit===0;
     const previousPromptTimeout=name==="UserPromptSubmit" && handler.timeout===10;
     if(!timeout || handler.command!==command || handler.type!=="command" || handler.timeout!==timeout && !previousPromptTimeout ||
       Object.keys(handler).length!==(completePrompt?4:3) ||
       (handler.additionalContextLimit!==undefined && !completePrompt) || Object.keys(group).length!==1)
      throw new Error("Existing startup hook differs; reconcile its configuration deliberately");
    }
   }
  }
 }
 for(const [name,timeout] of Object.entries(events)) {
  const groups=(hooks[name]??[]) as {hooks:Record<string,unknown>[]}[];
  hooks[name]=groups;
  const existing=groups.flatMap(group=>group.hooks).filter(handler=>handler.command===command);
  if(existing.length>1)throw new Error("Duplicate startup hook handlers require reconciliation");
  if(!existing.length)groups.push({hooks:[{type:"command",command,timeout,...(name==="UserPromptSubmit"?{additionalContextLimit:0}:{})}]});
  else if(name==="UserPromptSubmit") { existing[0]!.additionalContextLimit=0; existing[0]!.timeout=timeout; }
 }
 return {provider:"codex" as const,path:join(workspace,".codex/hooks.json"),configuration:result,
  content:JSON.stringify(result,null,2)+"\n",authority:"proposal-only" as const};
}
