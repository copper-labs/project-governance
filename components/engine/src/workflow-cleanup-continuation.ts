import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest, durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { recoverStoppedWorkflow } from "./workflow-worker-recovery.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { ResourceRegistry } from "./resources.ts";
import { observePhysicalCleanup } from "./physical-cleanup.ts";
import { observeSimulatorCleanup } from "./simulator-cleanup.ts";
import { releaseRecoveredWorkflowReader } from "./workflow-reader-recovery.ts";

/** Continue only declared, undispatched cleanup under the original resource generations. */
export async function resumeStoppedWorkflowCleanup(directory: string, database: string, runId: string, revision: number) {
  directory=realpathSync(directory);database=realpathSync(database);
  const request=JSON.parse(narrativeFile(directory,"request.json"));
  if(typeof request.registry!=="string" || !existsSync(request.registry))throw new Error("Original workflow resource registry required");
  const recovered=await recoverStoppedWorkflow(directory,database,runId,revision);
  if(recovered.unresolved.length)throw new Error("Original command effects remain unresolved");
  const store=new WorkflowStore(database),registry=new ResourceRegistry(request.registry);
  try {
    const run=await executeWorkflow(store,runId,{commandsDirectory:join(directory,"commands"),registry,
      cleanupContinuation:{revision:recovered.run.revision,stagesDigest:digest(store.stages(runId))},
      observeCleanup:async(observed,leases)=>{
        const resources=leases.map(lease=>lease.resource);
        const observation=await observeSimulatorCleanup(resources) ?? await observePhysicalCleanup(resources);
        if(!observation)return null;
        const receipt={runId,bindingDigest:digest(observed.binding),leases,observation};
        durableJson(join(directory,"resource-cleanup.json"),receipt);
        return digest(receipt);
      }});
    if(["succeeded","failed","cancelled","blocked"].includes(run.state))releaseRecoveredWorkflowReader(directory,database,run);
    return {run,stages:store.stages(runId)};
  } finally {registry.close();store.close();}
}
