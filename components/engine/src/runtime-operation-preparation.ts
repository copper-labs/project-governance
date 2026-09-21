import { requireLegacyMigrationOwnership } from "./legacy-migration-ownership.ts";
import type { planHostInstructions } from "./host-instruction-plan.ts";
import type { LegacyHistoryRequirement } from "./legacy-history-completion.ts";
import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { digest, durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { stageRuntimeOperation } from "./runtime-stage-operation.ts";
import { backupRuntimeOperation } from "./runtime-backup-operation.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import type { CompiledRuntimeLock } from "./runtime-lock.ts";
import type { BackupInput } from "./runtime-backup.ts";

export interface RuntimePreparation {
  mode?: "init" | "update" | "repair";
  workspace: string;
  registry: string;
  archive: string;
  lock: CompiledRuntimeLock;
  expectedRevision: number;
  inputs: BackupInput[];
  hostPlan?: ReturnType<typeof planHostInstructions>;
  history?: LegacyHistoryRequirement;
  startupReceipts?: string;
  lockedCheckout?: boolean;
}

/** Compose preparation without activating. The caller must hold the legacy writer exclusion,
 * when applicable, throughout this call and the subsequent transition.
 */
export async function prepareRuntimeOperation(input: RuntimePreparation, operationDirectory: string,
  validateScope: () => void) {
  if (input.mode !== undefined && !["init","update","repair"].includes(input.mode))throw new Error("Invalid installation mode");
  if(input.lockedCheckout!==undefined && (input.lockedCheckout!==true || input.mode!=="init"))throw new Error("Locked checkout requires explicit initial installation");
  if (input.mode === "repair" && (input.hostPlan || input.startupReceipts))throw new Error("Forward repair cannot change host instructions");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw new Error("Invalid installation revision");
  const legacyLockRequired=requireLegacyMigrationOwnership(input.workspace);
  const directory=resolve(operationDirectory);
  const request={version:1,kind:"runtime-preparation",...input,workspace:realpathSync(input.workspace),
    archive:realpathSync(input.archive),registry:resolve(input.registry),
    inputs:input.inputs.map(value=>({...value,path:resolve(value.path)}))};
  let created=false;
  try {mkdirSync(directory,{mode:0o700});created=true;}
  catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  if(realpathSync(directory)!==directory)throw new Error("Installation operation uses aliases");
  const receiptPath=join(directory,"operation.json");
  if(created) {
    validateScope();
    durableJson(receiptPath,{request,legacyLockRequired,requestDigest:digest(request),token:randomUUID(),owner:`installation:${directory}`});
  }
  const saved=JSON.parse(narrativeFile(directory,receiptPath));
  if(saved.requestDigest!==digest(request)||digest(saved.request)!==digest(request)||saved.owner!==`installation:${directory}`)
    throw new Error("Installation operation identity differs");
  if(typeof saved.legacyLockRequired!=="boolean")throw new Error("Installation legacy ownership requirement missing");
  requireLegacyMigrationOwnership(request.workspace,saved.legacyLockRequired);
  const staged=stageRuntimeOperation(request.archive,request.lock,join(directory,"staging"));
  const generations=new RuntimeGenerations(request.registry);
  let maintenance;
  try {maintenance=generations.beginMaintenance(saved.owner,request.expectedRevision,saved.token);}
  finally{generations.close();}
  const backup=await backupRuntimeOperation(request.registry,maintenance.token,maintenance.owner,
    request.inputs,join(directory,"backup"),validateScope);
  const prepared={version:1,state:"prepared",requestDigest:saved.requestDigest,workspace:request.workspace,
    registry:request.registry,candidate:staged.directory,backup:backup.directory,
    backupDigest:backup.receiptDigest,maintenance,activation:"not-performed"};
  durableJson(join(directory,"prepared.json"),prepared);
  return prepared;
}
