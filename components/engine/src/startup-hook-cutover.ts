import {existsSync} from "node:fs";
import {dirname,join} from "node:path";
import {narrativeFile} from "./narrative-inputs.ts";
import {startupHooks} from "./startup-hooks.ts";

/** An update without a backed hook transition may retain only an exact RC6 observer. */
export function assertPortableStartupCutover(workspace:string,registry:string) {
 const path=join(workspace,".codex/hooks.json");
 if(!existsSync(path))return;
 const original=narrativeFile(workspace,path);
 if(!original.includes("project-governance") || !original.includes("startup observe"))return;
 try {
  const current=JSON.parse(original);
  const proposal=startupHooks(current,workspace,join(dirname(registry),"startup.sqlite"));
  if(JSON.stringify(proposal.configuration)!==JSON.stringify(current))throw new Error("Incomplete managed hook set");
 } catch {
  throw new Error("Existing Codex startup hooks require a deliberate RC6 cutover before update");
 }
}
