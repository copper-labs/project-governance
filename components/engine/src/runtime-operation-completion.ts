import { installProjectDefaults } from "./runtime-project-defaults.ts";
import { forwardRepairRuntime } from "./runtime-forward-repair.ts";
import { requireLegacyMigrationOwnership } from "./legacy-migration-ownership.ts";
import { completeHostInstructionTransition } from "./host-instruction-transition.ts";
import { COMPILED_HOST_BLOCK } from "./provider-guidance.ts";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { digest, durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { stageRuntimeOperation } from "./runtime-stage-operation.ts";
import { completeRuntimeTransition } from "./runtime-transition.ts";
import type { RuntimePreparation } from "./runtime-operation-preparation.ts";

/** Complete only the exact saved preparation. Existing activation receipts govern interrupted replay. */
export async function completePreparedRuntimeOperation(operationDirectory: string) {
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
  const result=request.mode==="repair" ? await forwardRepairRuntime(request.registry,request.workspace,prepared.candidate,
    prepared.backup,request.inputs,saved.token,saved.owner,request.history) : request.hostPlan ? completeHostInstructionTransition(request.registry,request.workspace,prepared.candidate,
    prepared.backup,request.inputs,saved.token,saved.owner,request.hostPlan,COMPILED_HOST_BLOCK,request.history,request.startupReceipts)
    : completeRuntimeTransition(request.registry,request.workspace,prepared.candidate,
      prepared.backup,request.inputs,saved.token,saved.owner,request.history);
  durableJson(join(directory,"completed.json"),{version:1,requestDigest:saved.requestDigest,result});
  return result;
}
