import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { commandProcesses } from "./command-owner-recovery.ts";
import { digest, durableJson } from "./core.ts";
import { narrativeFile } from "./narrative-inputs.ts";
import { observeCommand, type CommandRequest } from "./process-owner.ts";
import { settleWorkflowCommandCleanup } from "./workflow-command-cleanup.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { validateInputs, type StageResult } from "./workflow-types.ts";

/** Observe the original commands after proven worker absence. Never dispatch, signal or release a device. */
export async function recoverStoppedWorkflow(directory: string, database: string, runId: string, revision: number) {
  directory = realpathSync(directory); database = realpathSync(database);
  const request = JSON.parse(narrativeFile(directory, "request.json"));
  const owner = JSON.parse(narrativeFile(directory, "owner.json"));
  const store = new WorkflowStore(database);
  try {
    const run = store.read(runId), stages = store.stages(runId);
    if (request.version !== 1 || request.runId !== runId || realpathSync(request.database) !== database ||
        request.bindingDigest !== digest(run.binding) || realpathSync(request.commandsDirectory) !== join(directory, "commands") ||
        owner.requestDigest !== digest(request) || !Number.isSafeInteger(owner.pid) || owner.pid < 2 ||
        typeof owner.fingerprint !== "string" || !owner.fingerprint || run.revision !== revision ||
        !run.owner || !["running", "unknown"].includes(run.state)) throw new Error("Worker recovery binding or revision differs");
    const absent = () => {
      const processes = commandProcesses(), cleanupWorker = store.cleanupWorker(runId);
      if (processes.some(process => process.pid === owner.pid)) throw new Error("Workflow worker still present or PID reused");
      if (cleanupWorker && processes.some(process => process.pid === cleanupWorker.pid))
        throw new Error("Cleanup worker still present or PID reused");
    };
    absent();
    const observations: Array<{ id: string; result: StageResult }> = [];
    const receipts: Array<{ stage: string; requestDigest: string; receiptDigest: string }> = [];
    const unresolved: string[] = [];
    for (const stage of stages) {
      if (!["running", "unknown"].includes(stage.state)) continue;
      const index = run.binding.recipe.stages.findIndex(spec => spec.id === stage.id);
      const spec = run.binding.recipe.stages[index]!;
      const commandDirectory = join(directory, "commands", `${runId}-${index}`);
      if (!existsSync(join(commandDirectory, "request.json"))) { unresolved.push(stage.id); continue; }
      if (realpathSync(commandDirectory) !== commandDirectory) throw new Error("Command recovery directory uses an alias");
      const command = JSON.parse(narrativeFile(commandDirectory, "request.json")) as CommandRequest;
      if (command.version !== 1 || command.id !== `${runId}:${stage.id}` ||
          digest(command.operation) !== digest(run.binding.recipe.operations[spec.operation]) ||
          !Number.isInteger(command.deadlineMs) || command.deadlineMs < 1 || command.deadlineMs > spec.deadlineMs ||
          Object.keys(command).some(key => !["version", "id", "operation", "deadlineMs", "outputLimit", "ownerDigest"].includes(key)))
        throw new Error("Original command differs from workflow stage");
      const requestDigest = digest(command), observed = observeCommand(commandDirectory, requestDigest);
      if (!observed.receipt) { unresolved.push(stage.id); continue; }
      const settled = await settleWorkflowCommandCleanup(commandDirectory, observed.receipt,
        run.binding.recipe.operations[spec.operation]!.expectedExitCodes, 0);
      const receipt = settled.receipt;
      if (receipt.state === "unknown" || receipt.cleanup !== "confirmed") { unresolved.push(stage.id); continue; }
      const inputValidity = validateInputs(run.binding.recipe) ? "valid" : "stale";
      observations.push({ id: stage.id, result: {
        state: receipt.state === "succeeded" && inputValidity !== "valid" ? "failed" : receipt.state,
        exitCode: receipt.exitCode, cleanup: receipt.cleanup, startedAt: receipt.startedAt, endedAt: receipt.endedAt,
        log: receipt.log, inputValidity, detail: receipt.reason,
        ...(settled.recovery ? { cleanupRecovery: settled.recovery } : {}),
      } });
      receipts.push({ stage: stage.id, requestDigest, receiptDigest: digest(observed.receipt) });
    }
    absent();
    // Receipts must still be the evidence just observed; concurrent reconciliation cannot substitute bytes.
    for (const receipt of receipts) {
      const index = run.binding.recipe.stages.findIndex(stage => stage.id === receipt.stage);
      if (digest(observeCommand(join(directory, "commands", `${runId}-${index}`), receipt.requestDigest).receipt) !== receipt.receiptDigest)
        throw new Error("Command receipt changed during recovery");
    }
    if (!observations.length && run.state === "unknown") return { run, unresolved, observed: 0 };
    const evidence = { version: 1, runId, revision, workerRequestDigest: digest(request), owner,
      bindingDigest: request.bindingDigest, stagesDigest: digest(stages), receipts, unresolved };
    const evidenceDigest = digest(evidence);
    durableJson(join(directory, `worker-observation-${evidenceDigest.slice(7)}.json`), evidence);
    return { run: store.recordWorkerRecovery(runId, revision, digest(stages), request.bindingDigest, evidenceDigest, observations),
      unresolved, observed: observations.length, evidenceDigest };
  } finally { store.close(); }
}
