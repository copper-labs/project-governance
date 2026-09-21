import { realpathSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { commandProcesses } from "./command-owner-recovery.ts";
import { releaseRuntimeReader, type RuntimeReader } from "./runtime-reader.ts";
import type { WorkflowRun } from "./workflow-store.ts";

/** Retire a detached reader only after terminal reconciliation and confirmed worker absence. */
export function releaseRecoveredWorkflowReader(directory: string, database: string, run: WorkflowRun) {
  if (!["succeeded", "failed", "cancelled", "blocked"].includes(run.state)) throw new Error("Workflow is not terminal");
  directory=realpathSync(directory);
  const request=JSON.parse(narrativeFile(directory,join(directory,"request.json")));
  const owner=JSON.parse(narrativeFile(directory,join(directory,"owner.json")));
  if(request.version!==1 || request.runId!==run.id || realpathSync(request.database)!==realpathSync(database) ||
      request.bindingDigest!==digest(run.binding) || owner.requestDigest!==digest(request) ||
      !Number.isSafeInteger(owner.pid) || owner.pid<1) throw new Error("Workflow reader recovery binding differs");
  // Even PID reuse refuses recovery: this path never signals a process or guesses absence.
  if(commandProcesses().some(process=>process.pid===owner.pid))throw new Error("Workflow worker still present");
  const reader=request.generation as RuntimeReader | null | undefined;
  if(reader && (reader.owner!==`workflow:${run.id}` || typeof reader.registry!=="string" ||
      typeof reader.token!=="string" || !Number.isSafeInteger(reader.revision) || typeof reader.directory!=="string"))
    throw new Error("Workflow generation reader binding differs");
  releaseRuntimeReader(reader ?? null,true);
  return {state:reader?"released":"not-retained"};
}
