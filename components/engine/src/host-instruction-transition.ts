import {backedStartupHookTransition,applyBackedStartupHooks} from "./startup-hook-transition.ts";
import { requireLegacyHistory, type LegacyHistoryRequirement } from "./legacy-history-completion.ts";
import { realpathSync } from "node:fs";
import { digest } from "./core.ts";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { verifyHostInstructionBackup } from "./host-instruction-backup-check.ts";
import { installHostInstructions } from "./host-instruction-installation.ts";
import { prepareRuntimeTransition } from "./runtime-transition.ts";
import { finalizeRuntimeActivation } from "./runtime-finalization.ts";
import type { planHostInstructions } from "./host-instruction-plan.ts";
import type { BackupInput } from "./runtime-backup.ts";

/** Bind the host changes before touching installation files, so lock-only recovery cannot reopen admission. */
export function requireHostInstructionCompletion(registry: string, plan: ReturnType<typeof planHostInstructions>, block: string,
  backupDirectory: string, token: string, owner: string, startupReceipts?: string) {
  const backup = inspectRuntimeBackup(backupDirectory);
  if (backup.maintenance.token !== token || backup.maintenance.owner !== owner) throw new Error("Host instruction backup ownership differs");
  const verified = verifyHostInstructionBackup(plan, block, backupDirectory);
  const startup=backedStartupHookTransition(plan.workspace,backupDirectory,startupReceipts);
  const hostInstructionsDigest = digest({ backupDigest: verified.backupDigest, planDigest: verified.planDigest, block, ...(startup?{startupPlanDigest:startup.planDigest}:{}) });
  const generations = new RuntimeGenerations(registry);
  try { generations.requireCompletion(token, owner, "hostInstructionsDigest", hostInstructionsDigest); }
  finally { generations.close(); }
  return { ...verified, hostInstructionsDigest, startup };
}

/** Resume a backed host update with generation activation and one final admission boundary. */
export function completeHostInstructionTransition(registry: string, workspace: string, candidate: string,
  backupDirectory: string, inputs: BackupInput[], token: string, owner: string,
  plan: ReturnType<typeof planHostInstructions>, block: string, history?: LegacyHistoryRequirement, startupReceipts?: string) {
  if (history) requireLegacyHistory(registry,workspace,token,owner,history);
  if (realpathSync(workspace) !== plan.workspace) throw new Error("Host instruction workspace differs from transition");
  const required = requireHostInstructionCompletion(registry, plan, block, backupDirectory, token, owner, startupReceipts);
  const prepared = prepareRuntimeTransition(registry, workspace, candidate, backupDirectory, inputs, token, owner);
  if (!prepared.completed) {
    installHostInstructions(workspace, block, { expectedPlanDigest: required.remainingPlanDigest });
    if(required.startup)applyBackedStartupHooks(registry,workspace,backupDirectory,startupReceipts!,token,owner);
  }
  const verified = verifyHostInstructionBackup(plan, block, backupDirectory);
  if(required.startup && !backedStartupHookTransition(workspace,backupDirectory,startupReceipts)?.complete)throw new Error("Native hook completion readback required");
  if (!verified.complete) throw new Error("Host instruction completion readback required");
  return { ...finalizeRuntimeActivation(registry, workspace, token, owner, undefined, required.hostInstructionsDigest, history),
    backupDigest: prepared.backupDigest, hostInstructionsDigest: required.hostInstructionsDigest };
}
