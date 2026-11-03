import { join } from "node:path";
import { digest, durableJson } from "./core.ts";
import { assertLocalBuildScope, observeLocalBuild } from "./local-build-cleanup.ts";
import { ownedAndroidAppSessionCleanup } from "./android-owned-app-session.ts";
import { observeAndroidAppSession } from "./android-app-session.ts";
import { observeAndroidEmulatorCleanup } from "./android-emulator.ts";
import { observePhysicalCleanup } from "./physical-cleanup.ts";
import { observeSimulatorCleanup } from "./simulator-cleanup.ts";
import type { Recipe } from "./workflow-types.ts";
import type { WorkflowRun, WorkflowStage } from "./workflow-store.ts";
import type { Lease } from "./resources.ts";
import type { CleanupObservation } from "./workflow-executor.ts";
import { preserveWorkflowReleaseReceipt } from "./workflow-release-receipt.ts";

/** Known build claims must have a finish path before any worker or reservation is created. */
export function assertBuildCleanupAdmission(recipe: Recipe, checkCapability=true) {
  if(recipe.localBuild)assertLocalBuildScope(recipe,recipe.localBuild,checkCapability);
  else if(recipe.resources.some(resource=>/^(?:gradle|build):/u.test(resource))) {
    if(recipe.androidEmulator || recipe.androidAppSession || recipe.resources.some(resource=>/^(?:ios-|android-|device:)/u.test(resource)))
      throw Error("Mixed build/device cleanup is unsupported; keep their reservations in separately owned workflows");
    throw Error("BUILD_CLEANUP_REQUIRED: declare localBuild.posixLockFiles before dispatch; use [] only for coordination-only reservations");
  }
}

/** Finish and continuation share the same dispatch; device semantics remain with their owners. */
export async function observeWorkflowCleanup(directory:string,run:WorkflowRun,stages:WorkflowStage[],leases:readonly Lease[]):Promise<string|CleanupObservation|null> {
  if(run.binding.recipe.localBuild) {
    const observed=await observeLocalBuild(directory,run,stages);
    try {
      const receipt={runId:run.id,bindingDigest:digest(run.binding),leases:[...leases],observation:observed.proof};
      const saved=preserveWorkflowReleaseReceipt(join(directory,"resource-cleanup.json"),receipt);
      if(digest(saved)!==digest(receipt))throw Error("Original build release receipt differs");
      return {digest:digest(saved),assertCurrent:observed.assertCurrent,close:observed.close};
    }catch(error){await observed.close();throw error;}
  }
  const resources=leases.map(lease=>lease.resource),recipe=run.binding.recipe,app=recipe.androidAppSession;
  const observation=app ? app.ownership==="owned-emulator"
    ? await ownedAndroidAppSessionCleanup(directory,run,stages,undefined,undefined,true).then(x=>x.observation,()=>null)
    : await observeAndroidAppSession(resources,app,recipe.workspace)
    : recipe.androidEmulator ? await observeAndroidEmulatorCleanup(resources,recipe.androidEmulator,recipe.workspace)
    : await observeSimulatorCleanup(resources) ?? await observePhysicalCleanup(resources);
  if(!observation)return null;
  const receipt={runId:run.id,bindingDigest:digest(run.binding),leases,observation};
  durableJson(join(directory,"resource-cleanup.json"),receipt);
  return digest(receipt);
}
