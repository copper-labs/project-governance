import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { backupRuntimeState, type BackupInput } from "./runtime-backup.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { digest, object } from "./core.ts";

/** Resume the same pre-transition backup; a partial snapshot is never replaced in place. */
export async function backupRuntimeOperation(registry: string, token: string, owner: string,
  inputs: BackupInput[], destination: string, validateScope?: () => void) {
  let exists=true;
  try {lstatSync(destination);} catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;exists=false;}
  if(!exists)await backupRuntimeState(registry,token,owner,inputs,destination,validateScope);
  const backup=inspectRuntimeBackup(destination);
  const expected=inputs.map(input=>({path:resolve(input.path),kind:input.kind})).sort((a,b)=>a.path.localeCompare(b.path));
  const actual=backup.records.map(raw=>{const value=object(raw);return {path:value.source,kind:value.kind};})
    .sort((a,b)=>String(a.path).localeCompare(String(b.path)));
  if(digest(expected)!==digest(actual)||backup.maintenance.token!==token||backup.maintenance.owner!==owner)
    throw new Error("Backup operation scope or owner differs");
  const generations=new RuntimeGenerations(registry);
  try {
    const state=generations.state();
    if(state.maintenance?.token!==token||state.maintenance.owner!==owner||state.readers.length||
       state.revision!==backup.revision||state.directory!==backup.generation)
      throw new Error("Backup operation requires original drained maintenance");
  }finally{generations.close();}
  return {...backup,reused:exists};
}
