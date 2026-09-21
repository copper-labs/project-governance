import { assertNoWheelInterpreterDependency } from "./runtime-target-dependencies.ts";
import {assertNoLegacyStartupHooks} from "./startup-hook-transition.ts";
import { verifyLegacyHistory, type LegacyHistoryRequirement } from "./legacy-history-completion.ts";
import { hasLegacyRuntimeEntrypoints } from "./runtime-legacy-retirement.ts";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { RuntimeGenerations } from "./runtime-generations.ts";
import { inspectRuntimeGeneration } from "./runtime-inspection.ts";
import { runtimeLauncher } from "./runtime-launcher.ts";
import { compiledRuntimeLock } from "./runtime-lock.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { digest } from "./core.ts";
import { commandEnvironment } from "./process-owner.ts";

/** Reopen admission only after the installed entry point and product lock agree with native readback. */
export function finalizeRuntimeActivation(registry: string, workspace: string, token: string, owner: string, preservedInputsDigest?: string, hostInstructionsDigest?: string, history?: LegacyHistoryRequirement) {
  workspace = realpathSync(workspace); registry = realpathSync(registry);
  assertNoWheelInterpreterDependency(workspace);
  assertNoLegacyStartupHooks(workspace);
  if (hasLegacyRuntimeEntrypoints(workspace)) throw new Error("Legacy provider entrypoint remains active");
  const legacyHistoryDigest = history ? verifyLegacyHistory(workspace,history) : undefined;
  const generations = new RuntimeGenerations(registry);
  try {
    const state = generations.state();
    const completed = generations.finalization(token, owner);
    if (completed && (completed.revision !== state.revision || completed.receipt.workspace !== workspace)) throw new Error("Completed activation no longer matches this project generation");
    if (!state.directory || (!completed && (state.readers.length || state.written || state.maintenance?.token !== token || state.maintenance.owner !== owner))) throw new Error("Activation readback requires owned drained maintenance");
    const installed = inspectRuntimeGeneration(state.directory), launcher = join(workspace, ".governance/runtime/bin/project-governance");
    const lockPath = join(workspace, "config/governance/runtime.lock.yaml");
    if (realpathSync(launcher) !== launcher || realpathSync(lockPath) !== lockPath) throw new Error("Activation paths cannot use symlinks");
    const lock = compiledRuntimeLock(parse(narrativeFile(workspace, lockPath)));
    if (digest(lock) !== installed.lockDigest || narrativeFile(workspace, launcher) !== runtimeLauncher(realpathSync(process.execPath), String(installed.executable), registry, workspace)) throw new Error("Activation entry point or lock changed");
    if (completed) {
      if (completed.receipt.legacyHistoryDigest !== legacyHistoryDigest) throw new Error("Completed legacy history identity changed");
      if (completed.receipt.hostInstructionsDigest !== hostInstructionsDigest) throw new Error("Completed host instruction identity changed");
      if (completed.receipt.lockDigest !== installed.lockDigest || (preservedInputsDigest !== undefined && completed.receipt.preservedInputsDigest !== preservedInputsDigest)) throw new Error("Completed activation identity changed");
      return { state, lockDigest: installed.lockDigest, readback: completed.receipt.readback };
    }
    const readback = execFileSync(launcher, ["--version"], { cwd: workspace, encoding: "utf8", timeout: 15000, maxBuffer: 16384,
      env: { ...commandEnvironment({}), GOVERNANCE_MAINTENANCE_PROBE: token } }).trim();
    if (readback !== `project-governance ${lock.version}`) throw new Error("Installed launcher version readback failed");
    if (history && verifyLegacyHistory(workspace,history) !== legacyHistoryDigest) throw new Error("Legacy history changed during activation readback");
    return { state: generations.finishMaintenance(token, owner, state.revision, { lockDigest: installed.lockDigest, readback, workspace, ...(preservedInputsDigest ? { preservedInputsDigest } : {}), ...(hostInstructionsDigest ? { hostInstructionsDigest } : {}), ...(legacyHistoryDigest ? { legacyHistoryDigest } : {}) }), lockDigest: installed.lockDigest, readback };
  } finally { generations.close(); }
}
