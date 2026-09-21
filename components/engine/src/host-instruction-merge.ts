import {mergeManagedInstructions} from "./managed-instructions.ts";
import {COMPILED_HOST_BLOCK} from "./provider-guidance.ts";

const start="<!-- governance-startup:start -->",end="<!-- governance-startup:end -->";
export const LEGACY_STARTUP_BLOCK=`${start}
At top-level task entry, follow \`.governance/runtime/skills/resources/startup-runtime-updates.md\`. Minor work may already be underway.
Subagents inherit the parent runtime and never check for or initiate updates.
${end}`;
export const COMPILED_STARTUP_BLOCK=`${start}
At top-level task entry, run the absolute repository-local \`.governance/runtime/bin/project-governance startup-help\` and follow its startup assessment and recovery guidance. Minor work may already be underway.
Subagents inherit the parent runtime and never check for or initiate updates.
${end}`;

/** Only the known shipped startup route migrates; authored startup policy is not an owned template. */
export function mergeHostInstructions(content:string,block:string) {
 if(block===COMPILED_HOST_BLOCK && (content.includes(start) || content.includes(end))) {
  if(content.split(start).length!==2 || content.split(end).length!==2 || content.indexOf(end)<content.indexOf(start))
   throw new Error("Malformed startup instruction markers require reconciliation");
  const begin=content.indexOf(start),finish=content.indexOf(end)+end.length,existing=content.slice(begin,finish);
  if(existing.replaceAll("\r\n","\n")!==LEGACY_STARTUP_BLOCK && existing!==COMPILED_STARTUP_BLOCK)
   throw new Error("Customized startup instructions require deliberate migration");
  content=content.slice(0,begin)+COMPILED_STARTUP_BLOCK+content.slice(finish);
 }
 return mergeManagedInstructions(content,block);
}
