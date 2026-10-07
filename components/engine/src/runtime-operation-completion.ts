import { installProjectDefaults } from "./runtime-project-defaults.ts";
import { forwardRepairRuntime } from "./runtime-forward-repair.ts";
import { requireLegacyMigrationOwnership } from "./legacy-migration-ownership.ts";
import { completeHostInstructionTransition } from "./host-instruction-transition.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { digest, durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { stageRuntimeOperation } from "./runtime-stage-operation.ts";
import { completeRuntimeTransition } from "./runtime-transition.ts";
import type { RuntimePreparation } from "./runtime-operation-preparation.ts";
import { contextDoctor, type ContextReadiness } from "./context-doctor.ts";

/** A passive diagnostic cannot turn completed activation into failed installation authority. */
export function runtimeContextReadinessSnapshot(workspace: string,
  readReadiness: (workspace: string) => ContextReadiness = root => contextDoctor(root).readiness) {
  const observedAt = new Date().toISOString();
  let readiness: ContextReadiness;
  try { readiness = readReadiness(workspace); }
  catch { readiness = { version: 1, status: "unavailable", selection: "not-configured", mode: null, provider: "unknown", sharing: "unknown",
    promptHook: "unavailable", issues: ["context.readiness-unavailable"],
    next: "Activation completed, but passive context readiness could not be inspected. Run doctor for a fresh readback when available.",
    basis: "current-configuration-only", providerAvailability: "not-probed", hostConsumption: "not-observed" }; }
  return { ...readiness, observedAt, observation: "activation-completion-snapshot" as const };
}

/** Complete only the exact saved preparation. Existing activation receipts govern interrupted replay. */
export async function completePreparedRuntimeOperation(operationDirectory: string,
  readReadiness: (workspace: string) => ContextReadiness = root => contextDoctor(root).readiness) {
  const directory=realpathSync(operationDirectory);
  const saved=JSON.parse(narrativeFile(directory,join(directory,"operation.json")));
  const prepared=JSON.parse(narrativeFile(directory,join(directory,"prepared.json")));
  const request=saved.request as RuntimePreparation;
  if(saved.requestDigest!==digest(request)||prepared.requestDigest!==saved.requestDigest||
      prepared.state!=="prepared"||prepared.workspace!==request.workspace||prepared.registry!==request.registry||
      saved.owner!==`installation:${directory}`||prepared.maintenance?.owner!==saved.owner||
      prepared.maintenance?.token!==saved.token||prepared.maintenance?.revision!==request.expectedRevision||
      prepared.backup!==join(directory,"backup"))throw new Error("Prepared installation identity differs");
  if(typeof saved.legacyLockRequired!=="boolean")throw new Error("Installation legacy ownership requirement missing");
  requireLegacyMigrationOwnership(request.workspace,saved.legacyLockRequired);
  const staged=stageRuntimeOperation(request.archive,request.lock,join(directory,"staging"));
  if(prepared.candidate!==staged.directory)throw new Error("Prepared candidate differs");
  const backup=inspectRuntimeBackup(prepared.backup);
  if(backup.receiptDigest!==prepared.backupDigest)throw new Error("Prepared backup differs");
  if(request.mode!==undefined && !["init","update","repair"].includes(request.mode))throw new Error("Invalid installation mode");
  if(request.lockedCheckout!==undefined && (request.lockedCheckout!==true || request.mode!=="init"))throw new Error("Locked checkout requires explicit initial installation");
  if(request.mode==="repair" && (request.hostPlan || request.startupReceipts))throw new Error("Forward repair cannot change host instructions");
  if(request.mode==="init")installProjectDefaults(request.workspace,request.registry,prepared.backup,saved.token,saved.owner);
  const activated=request.mode==="repair" ? await forwardRepairRuntime(request.registry,request.workspace,prepared.candidate,
    prepared.backup,request.inputs,saved.token,saved.owner,request.history) : request.hostPlan ? completeHostInstructionTransition(request.registry,request.workspace,prepared.candidate,
    prepared.backup,request.inputs,saved.token,saved.owner,request.hostPlan,COMPILED_HOST_BLOCK,request.history,request.startupReceipts)
    : completeRuntimeTransition(request.registry,request.workspace,prepared.candidate,
      prepared.backup,request.inputs,saved.token,saved.owner,request.history);
  const completedPath=join(directory,"completed.json");
  if(existsSync(completedPath)) {
    const retained=JSON.parse(narrativeFile(directory,completedPath));
    const {contextReadiness,...originalActivation}=retained.result??{};
    // The original activation identities must agree; current readers are live state, not immutable receipt identity.
    const {state:originalState,...originalIdentity}=originalActivation;
    const {state:currentState,...currentIdentity}=activated;
    if(retained.version!==1||retained.requestDigest!==saved.requestDigest||digest(originalIdentity)!==digest(currentIdentity)||
      originalState?.revision!==currentState.revision||originalState?.directory!==currentState.directory)
      throw new Error("Completed installation identity differs");
    // Replaying completion preserves its original observation; doctor owns an explicitly fresh readback.
    return {...activated,contextReadiness};
  }
  const result={...activated,contextReadiness:runtimeContextReadinessSnapshot(request.workspace,readReadiness)};
  durableJson(completedPath,{version:1,requestDigest:saved.requestDigest,result});
  return result;
}
