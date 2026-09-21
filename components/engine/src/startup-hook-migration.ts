import {startupHooks} from "./startup-hooks.ts";
import {digest,object} from "./core.ts";

const command='python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" codex';
const timeouts:Record<string,number>={SessionStart:90,SubagentStart:90,SessionEnd:3,UserPromptSubmit:10};

/** A proposal only: the backed lifecycle coordinator must own replacement and admission. */
export function planStartupHookMigration(configuration:unknown,workspace:string,receipts:string) {
 const original=object(configuration,"startup configuration"),copy=structuredClone(original);
 const hooks=object(copy.hooks??{},"startup hooks");copy.hooks=hooks;
 const migrated:string[]=[];
 for(const [event,raw] of Object.entries(hooks)) {
  if(!Array.isArray(raw))throw new Error("Host hook event must contain handler groups");
  const groups:unknown[]=[];let found=false;
  for(const value of raw) {
   const group=object(value,"startup hook group");
   if(!Array.isArray(group.hooks))throw new Error("Malformed startup hook group");
   const handlers:unknown[]=[];let removed=false;
   for(const entry of group.hooks) {
    const handler=object(entry,"startup hook handler");
    if(typeof handler.command!=="string" || !handler.command.includes("governance-startup.py")){handlers.push(handler);continue;}
    if(found || !timeouts[event] || handler.command!==command || handler.type!=="command" || handler.timeout!==timeouts[event] ||
      Object.keys(handler).sort().join()!=="command,timeout,type" || Object.keys(group).sort().join()!=="hooks")
      throw new Error("Customized or duplicate legacy startup hook requires deliberate reconciliation");
    found=true;removed=true;migrated.push(event);
   }
   if(!removed || handlers.length)groups.push({...group,hooks:handlers});
  }
  hooks[event]=groups;
 }
 if(migrated.length && migrated.length!==Object.keys(timeouts).length)
  throw new Error("Incomplete legacy startup hook set requires reconciliation");
 const proposal=startupHooks(copy,workspace,receipts);
 return {...proposal,originalDigest:digest(original),migrated,
  requirements:["verified-original-backup","owned-drained-runtime-transition","native-hook-trust-review"]};
}
