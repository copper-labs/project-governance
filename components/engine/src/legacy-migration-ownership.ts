import { fstatSync, lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { narrativeFile } from "./narrative-inputs.ts";
import { legacyRuntimeLock } from "./legacy-runtime-lock.ts";

/** The transition-only launcher owns flock; its inherited descriptor must still name this workspace lock.
 * This validates the cooperating launcher boundary, not exclusion against an adversarial same-user process.
 */
export function requireLegacyMigrationOwnership(workspace: string, required = false): boolean {
  workspace=realpathSync(workspace);
  const lockPath=join(workspace,"config/governance/runtime.lock.yaml");
  let lock;
  try {lock=parse(narrativeFile(workspace,lockPath));}
  catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT" && !required)return false;throw error;}
  if(lock?.schema_version!==1 && !required)return false;
  if(lock?.schema_version===1)legacyRuntimeLock(lock);
  const descriptor=process.env.GOVERNANCE_LEGACY_LOCK_FD;
  if(!descriptor || !/^[0-9]+$/u.test(descriptor) || !Number.isSafeInteger(Number(descriptor)) || Number(descriptor)<3)
    throw new Error("Legacy migration requires the locked launcher handoff");
  const path=join(workspace,".governance/runtime-use.lock"),current=lstatSync(path),held=fstatSync(Number(descriptor));
  if(!current.isFile()||current.isSymbolicLink()||realpathSync(path)!==path||!held.isFile()||current.dev!==held.dev||current.ino!==held.ino)
    throw new Error("Legacy migration lock descriptor differs");
  return true;
}
