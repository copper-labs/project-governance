import { digest } from "./core.ts";
import { ResourceRegistry, type Lease } from "./resources.ts";
import { WorkflowStore } from "./workflow-store.ts";

export interface WorkflowCleanupReceipt {
  runId: string;
  bindingDigest: string;
  leases: Lease[];
  observation: unknown;
}

/** Close only a cleanup-only unknown outcome after the resource owner recorded release.
 * This never dispatches work, revises command results, or treats process exit as device cleanup.
 */
export function reconcileReleasedWorkflow(store: WorkflowStore, registry: ResourceRegistry,
  id: string, expectedRevision: number, receipt: WorkflowCleanupReceipt) {
  const run = store.read(id);
  if (!["unknown", "reconciling", "succeeded", "failed", "cancelled"].includes(run.state) || !run.owner || run.revision !== expectedRevision)
    throw new Error("Workflow recovery requires the current unresolved revision");
  if (receipt.runId !== id || receipt.bindingDigest !== digest(run.binding) || !receipt.observation)
    throw new Error("Cleanup receipt workflow binding differs");
  const expected = [...run.binding.recipe.resources].sort();
  if (!expected.length || digest(receipt.leases.map(lease => lease.resource).sort()) !== digest(expected))
    throw new Error("Cleanup receipt resource scope differs");
  if (receipt.leases.some(lease => lease.operation !== id || lease.owner !== run.owner) ||
      !registry.hasRelease(receipt.leases, digest(receipt)))
    throw new Error("Resource release is not bound to this cleanup receipt");
  const stages = store.stages(id);
  if (stages.some(stage => ["pending", "running", "unknown"].includes(stage.state) ||
      (["succeeded", "failed"].includes(stage.state) && (!stage.result || stage.result.cleanup !== "confirmed"))))
    throw new Error("Command effects remain unresolved");
  const next = run.cancelRequested ? "cancelled" :
    stages.every(stage => stage.state === "succeeded" && stage.result?.inputValidity === "valid") ? "succeeded" : "failed";
  if (["succeeded", "failed", "cancelled"].includes(run.state)) {
    if (run.state !== next) throw new Error("Terminal workflow outcome differs");
    return run;
  }
  const recovering = run.state === "unknown" ? store.transition(id, run.owner, run.revision, "reconciling") : run;
  return store.transition(id, run.owner, recovering.revision, next);
}
