import {isAbsolute,join} from "node:path";

const events={SessionStart:90,SubagentStart:90,SessionEnd:3,UserPromptSubmit:10} as const;
const quote=(value:string)=>`'${value.replaceAll("'","'\\''")}'`;
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value && typeof value==="object" && !Array.isArray(value));

/** Prepare authored configuration without installing hooks or opting the project into updates. */
export function startupHooks(configuration:unknown,workspace:string,receipts:string) {
 if([workspace,receipts].some(value=>!isAbsolute(value) || /[\x00-\x1f\x7f]/u.test(value)))
  throw new Error("Startup hooks require absolute workspace and receipt paths");
 if(!record(configuration) || (configuration.hooks!==undefined && !record(configuration.hooks)))
  throw new Error("Host hook configuration must be an object");
 const result=structuredClone(configuration),hooks=(result.hooks??{}) as Record<string,unknown>;
 result.hooks=hooks;
 const command=`${quote(join(workspace,".governance/runtime/bin/project-governance"))} startup observe --provider codex --event-stdin --receipts ${quote(receipts)}`;
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
     if(!timeout || handler.command!==command || handler.type!=="command" || handler.timeout!==timeout ||
       Object.keys(handler).length!==3 || Object.keys(group).length!==1)
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
  if(!existing.length)groups.push({hooks:[{type:"command",command,timeout}]});
 }
 return {provider:"codex" as const,path:join(workspace,".codex/hooks.json"),configuration:result,
  content:JSON.stringify(result,null,2)+"\n",authority:"proposal-only" as const};
}
