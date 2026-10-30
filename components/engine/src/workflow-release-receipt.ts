import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, linkSync, rmSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import { durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import type { WorkflowCleanupReceipt } from "./workflow-resource-recovery.ts";

/** Publish complete evidence once; concurrent owners must consume the winner, never replace its bytes. */
export function preserveWorkflowReleaseReceipt(path: string, receipt: WorkflowCleanupReceipt): WorkflowCleanupReceipt {
  if (!existsSync(path)) {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    const temporary=path+"."+randomUUID()+".pending";
    durableJson(temporary,receipt);
    try { linkSync(temporary,path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code!=="EEXIST") throw error; }
    finally { rmSync(temporary,{force:true}); }
    const directory=openSync(dirname(path),"r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  return JSON.parse(narrativeFile(dirname(path),path)) as WorkflowCleanupReceipt;
}
