import { workflowOperation } from "./workflow-operation.ts";
import { settleWorkflowCommandCleanup } from "./workflow-command-cleanup.ts";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest } from "./core.ts";
import { randomUUID } from "node:crypto";
import { cancelCommand, submitCommand, waitCommand, processFingerprint } from "./process-owner.ts";
import { ResourceRegistry, type Lease } from "./resources.ts";
import { WorkflowStore, type WorkflowRun } from "./workflow-store.ts";
import { validateInputs, type StageResult } from "./workflow-types.ts";

export interface ExecutionOptions {
  commandsDirectory: string;
  registry: ResourceRegistry;
  /** Resource-specific readback is required: exited processes alone do not prove device/Metro cleanup. */
  observeCleanup: (run: WorkflowRun, leases: readonly Lease[]) => Promise<string | null>;
  outputLimit?: number;
  /** Internal continuation only; caller must verify original worker absence. */
  cleanupContinuation?: { revision: number; stagesDigest: string };
}

/** One deterministic worker drives native stages. Observers only read the ledger or request cancellation. */
export async function executeWorkflow(store: WorkflowStore, id: string, options: ExecutionOptions): Promise<WorkflowRun> {
  const pending = store.read(id), continuation = options.cleanupContinuation;
  const owner = continuation ? pending.owner! : randomUUID();
  let retained: Lease[] = [];
  if (continuation) {
    retained = options.registry.inspect().filter(lease => lease.operation === id).map(({resource, owner, operation, generation}) => ({resource, owner, operation, generation}));
    if (digest(retained.map(lease => lease.resource).sort()) !== digest([...pending.binding.recipe.resources].sort()) ||
        retained.some(lease => lease.owner !== owner)) throw new Error("Original workflow resource ownership differs");
    for (const lease of retained) options.registry.assertHeld(lease);
  }
  const fingerprint = continuation ? processFingerprint(process.pid) : null;
  if (continuation && !fingerprint) throw new Error("Cleanup worker identity unavailable");
  let run = continuation ? store.claimPendingCleanup(id, continuation.revision, continuation.stagesDigest, { pid: process.pid, fingerprint: fingerprint! })
    : store.claim(id, pending.revision, owner);
  const recipe = run.binding.recipe;
  const deadline = Date.now() + recipe.deadlineMs;
  let leases: Lease[] = retained, unresolved = false, failed = continuation ? store.stages(id).some(stage => stage.state !== "pending" && stage.state !== "succeeded") : false;
  mkdirSync(options.commandsDirectory, { recursive: true, mode: 0o700 });
  try {
    if (!continuation && recipe.resources.length) leases = options.registry.acquire(recipe.resources, owner, run.id);
  } catch (error) {
    for (const stage of recipe.stages) store.stage(id, owner, stage.id, "blocked");
    return store.transition(id, owner, run.revision, "blocked");
  }
  for (const stage of recipe.stages) {
    if (continuation && store.stages(id).find(row => row.id === stage.id)!.state !== "pending") continue;
    run = store.read(id);
    const valid = validateInputs(recipe);
    if (unresolved || (!stage.cleanup && (failed || run.cancelRequested || !valid || Date.now() >= deadline))) {
      store.stage(id, owner, stage.id, run.cancelRequested ? "cancelled" : "blocked");
      failed = true;
      continue;
    }
    // Intent and lease fences are checked immediately before the durable stage reservation.
    try {
      for (const lease of leases) options.registry.assertHeld(lease);
      store.stage(id, owner, stage.id, "running");
    } catch {
      store.stage(id, owner, stage.id, "blocked");
      failed = true;
      continue;
    }
    const startedAt = new Date().toISOString();
    let result: StageResult;
    try {
      // Index-based paths prevent host-provided stage names from escaping the command directory.
      const directory = join(options.commandsDirectory, `${id}-${recipe.stages.indexOf(stage)}`);
      const artifactDirectory = resolve(`${directory}-artifacts`);
      mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
      const operation = workflowOperation(recipe, id, stage, options.commandsDirectory);
      const command = submitCommand(directory, { id: `${id}:${stage.id}`, operation,
        deadlineMs: stage.cleanup ? stage.deadlineMs : Math.max(1, Math.min(stage.deadlineMs, deadline - Date.now())),
        outputLimit: options.outputLimit ?? 1024 * 1024 });
      // An absent acknowledgment is uncertain, not permission to dispatch again.
      const observationDeadline = Date.now() + stage.deadlineMs + (recipe.operations[stage.operation]!.terminationGraceMs ?? 1000) + 5000;
      let observed;
      do {
        if (store.read(id).cancelRequested && !stage.cleanup) cancelCommand(directory, command.requestDigest, run.binding.authorityRef);
        observed = await waitCommand(directory, command.requestDigest, 250);
      } while (observed.state !== "terminal" && Date.now() < observationDeadline);
      const settled = observed.receipt ? await settleWorkflowCommandCleanup(directory,observed.receipt,
        recipe.operations[stage.operation]!.expectedExitCodes) : null;
      const receipt = settled?.receipt;
      const inputValidity = validateInputs(recipe) ? "valid" : "stale";
      result = receipt ? { state: settled?.verificationFailed || (receipt.state === "succeeded" && inputValidity !== "valid") ? "failed" : receipt.state,
        ...(settled?.verificationFailed ? { commandOutcome: "unknown" as const } : {}),
        exitCode: receipt.exitCode, cleanup: receipt.cleanup, startedAt: receipt.startedAt, endedAt: receipt.endedAt,
        log: receipt.log, inputValidity, detail: receipt.reason, ...(settled?.recovery ? { cleanupRecovery: settled.recovery } : {}) } : {
        state: "unknown", exitCode: null, cleanup: "unknown", startedAt, endedAt: new Date().toISOString(),
        log: join(directory, "output.log"), inputValidity, detail: "command outcome unresolved; observe original submission" };
    } catch {
      result = { state: "unknown", exitCode: null, cleanup: "unknown", startedAt, endedAt: new Date().toISOString(),
        log: "", inputValidity: "unknown", detail: "execution interrupted; effects require reconciliation" };
    }
    store.stage(id, owner, stage.id, result.state, result);
    unresolved ||= result.state === "unknown" || result.cleanup === "unknown";
    failed ||= result.state !== "succeeded";
  }
  if (!unresolved && leases.length) {
    try {
      const observation = await options.observeCleanup(store.read(id), leases);
      if (observation) options.registry.release(leases, observation);
      else unresolved = true;
    } catch { unresolved = true; }
  }
  run = store.read(id);
  return store.transition(id, owner, run.revision,
    unresolved ? "unknown" : run.cancelRequested ? "cancelled" : failed ? "failed" : "succeeded");
}
