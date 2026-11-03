import { observeWorkflowCleanup } from "./workflow-cleanup-observation.ts";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { recoverStoppedWorkflow } from "./workflow-worker-recovery.ts";
import { executeWorkflow } from "./workflow-executor.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { ResourceRegistry } from "./resources.ts";
import { recoverOriginalIosTestCleanup } from "./ios-original-test-cleanup.ts";
import { releaseRecoveredWorkflowReader } from "./workflow-reader-recovery.ts";
import { workflowRecoveryIdentity } from "./workflow-reader-recovery.ts";
import { reconcileReleasedWorkflow, type WorkflowCleanupReceipt } from "./workflow-resource-recovery.ts";

/** Continue only declared, undispatched cleanup under the original resource generations. */
export async function resumeStoppedWorkflowCleanup(directory: string, database: string, runId: string, revision: number) {
  directory=realpathSync(directory);database=realpathSync(database);
  const request=JSON.parse(narrativeFile(directory,"request.json"));
  if(typeof request.registry!=="string" || !existsSync(request.registry))throw new Error("Original workflow resource registry required");
  const store=new WorkflowStore(database),registry=new ResourceRegistry(request.registry);
  try {
    const current=store.read(runId);
    if(current.revision!==revision)throw new Error("Worker recovery binding or revision differs");
    // A crash after registry release must finish bookkeeping, not reacquire or rebuild.
    const receiptPath=join(directory,"resource-cleanup.json");
    if(current.binding.recipe.localBuild && existsSync(receiptPath)) {
      const receipt=JSON.parse(narrativeFile(directory,receiptPath)) as WorkflowCleanupReceipt;
      if(registry.hasRelease(receipt.leases,digest(receipt))) {
        const identity=workflowRecoveryIdentity(directory,database,current);
        identity.assertAbsent();identity.assertUnchanged();
        const observed=current.state==="running"?await recoverStoppedWorkflow(directory,database,runId,revision):{run:current};
        const run=reconcileReleasedWorkflow(store,registry,runId,observed.run.revision,receipt);
        releaseRecoveredWorkflowReader(directory,database,run);
        return {run,stages:store.stages(runId)};
      }
    }
    // This qualified original-only path never dispatches a cleanup stage or rewrites test results.
    const originalPhysical=await recoverOriginalIosTestCleanup(directory,database,store,registry,current);
    if(originalPhysical)return originalPhysical;
    const recovered=await recoverStoppedWorkflow(directory,database,runId,revision);
    if(recovered.unresolved.length)throw new Error("Original command effects remain unresolved");
    const run=await executeWorkflow(store,runId,{commandsDirectory:join(directory,"commands"),registry,
      cleanupContinuation:{revision:recovered.run.revision,stagesDigest:digest(store.stages(runId))},
      observeCleanup:(observed,leases)=>observeWorkflowCleanup(directory,observed,store.stages(observed.id),leases)});
    if(["succeeded","failed","cancelled","blocked"].includes(run.state))releaseRecoveredWorkflowReader(directory,database,run);
    return {run,stages:store.stages(runId)};
  } finally {registry.close();store.close();}
}
