import { requireLegacyHistory, type LegacyHistoryRequirement } from "./legacy-history-completion.ts";
import { retireLegacyRuntimeEntrypoints } from "./runtime-legacy-retirement.ts";
import { assertNoWheelInterpreterDependency } from "./runtime-target-dependencies.ts";
import { realpathSync } from "node:fs";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { activateBackedRuntime } from "./runtime-activation.ts";
import { updateActivatedRuntimeLock } from "./runtime-lock-update.ts";
import { installActivatedLauncher } from "./runtime-launcher.ts";
import { finalizeRuntimeActivation } from "./runtime-finalization.ts";
import { inspectRuntimeBackup } from "./runtime-backup-inspection.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import type { BackupInput } from "./runtime-backup.ts";
import { digest, object } from "./core.ts";
import { resolve } from "node:path";

/** Resume one backed transition. Failures retain maintenance; never silently roll back new evidence. */
export function prepareRuntimeTransition(registry: string, workspace: string, candidate: string,
  backupDirectory: string, inputs: BackupInput[], token: string, owner: string,lockText?:string) {
  registry = realpathSync(registry); workspace = realpathSync(workspace);
  assertNoWheelInterpreterDependency(workspace);
  const backup = inspectRuntimeBackup(backupDirectory), installed = inspectRuntimeGeneration(candidate);
  const expected = inputs.map(input => ({ path: resolve(input.path), kind: input.kind })).sort((a, b) => a.path.localeCompare(b.path));
  const actual = backup.records.map(raw => { const record = object(raw); return { path: record.source, kind: record.kind }; })
    .sort((a, b) => String(a.path).localeCompare(String(b.path)));
  if (digest(expected) !== digest(actual) || backup.maintenance.token !== token || backup.maintenance.owner !== owner) throw new Error("Transition backup scope or ownership differs");
  const generations = new RuntimeGenerations(registry);
  let completed: boolean;
  try {
    completed = generations.finalization(token, owner) !== null;
    if (completed) {
      const state = generations.state();
      const activation = generations.activation(digest({ backup: backup.receiptDigest, candidate: installed.directory,
        lock: installed.lockDigest, tree: installed.installedTree, inputs: expected, token, owner }));
      if (!activation || activation.revision !== state.revision || activation.directory !== state.directory) throw new Error("Completed transition identity differs");
      if (state.revision !== backup.revision + 1 || state.directory !== installed.directory || state.previous !== backup.generation) throw new Error("Completed transition identity differs");
    }
  } finally { generations.close(); }
  if (!completed) {
    activateBackedRuntime(registry, candidate, backupDirectory, inputs, token, owner);
    updateActivatedRuntimeLock(registry, workspace, backupDirectory, token, owner,lockText);
    installActivatedLauncher(registry, workspace, backupDirectory, token, owner);
    retireLegacyRuntimeEntrypoints(registry, workspace, backupDirectory, token, owner);
  }
  return { completed, backupDigest: backup.receiptDigest };
}

export function completeRuntimeTransition(registry: string, workspace: string, candidate: string,
  backupDirectory: string, inputs: BackupInput[], token: string, owner: string, history?: LegacyHistoryRequirement) {
  if (history) requireLegacyHistory(registry,workspace,token,owner,history);
  const prepared = prepareRuntimeTransition(registry, workspace, candidate, backupDirectory, inputs, token, owner);
  return { ...finalizeRuntimeActivation(registry, workspace, token, owner, undefined, undefined, history), backupDigest: prepared.backupDigest };
}
