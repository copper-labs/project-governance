import { releaseRecoveredWorkflowReader } from "./workflow-reader-recovery.ts";
import { reconcileReleasedWorkflow, type WorkflowCleanupReceipt } from "./workflow-resource-recovery.ts";
import { parseArgs } from "node:util";
import { join } from "node:path";
import { statSync } from "node:fs";
import { narrativeFile } from "./narrative-inputs.ts";
import { recipeDigest, type RunState } from "./workflow-types.ts";
import { resolveWorkflowRecipe } from "./workflow-catalog.ts";
import { WorkflowStore } from "./workflow-store.ts";
import { dispatchWorkflow } from "./workflow-worker.ts";
import { ResourceRegistry, resourceRegistryPath } from "./resources.ts";
import { checkRunRoot } from "./check-run.ts";

/** Host authorization already lives in the task ledger; this entry point cannot create an authorized action. */
export function workflowCommand(command: string, args: string[]) {
  const submitting = command === "workflow-submit";
  if (!["workflow-submit", "workflow-status", "workflow-cancel", "workflow-reconcile-cleanup"].includes(command)) throw new Error("Unknown workflow command");
  const names = submitting
    ? ["database", "task", "task-version", "action", "recipe", "authority", "operation-id"]
    : ["database", "run", ...(command === "workflow-cancel" ? ["authority"] : command === "workflow-reconcile-cleanup" ? ["revision", "receipt", "registry", "worker-directory"] : [])];
  const options: Record<string, { type: "string" }> = Object.fromEntries(names.map(name => [name, { type: "string" }]));
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options });
  if (!values.database || !statSync(values.database).isFile()) throw new Error("Existing task ledger required");
  const store = new WorkflowStore(values.database);
  try {
    if (!submitting) {
      if (!values.run) throw new Error("Workflow run ID required");
      if (command === "workflow-reconcile-cleanup") {
        const revision = Number(values.revision);
        if (!values.revision || !/^\d+$/u.test(values.revision) || !Number.isSafeInteger(revision) || !values.receipt)
          throw new Error("Current workflow revision and cleanup receipt required");
        const path = values.registry ?? resourceRegistryPath();
        if (!statSync(path).isFile()) throw new Error("Existing resource registry required");
        const receipt = JSON.parse(narrativeFile(process.cwd(), values.receipt)) as WorkflowCleanupReceipt;
        const registry = new ResourceRegistry(path);
        try { reconcileReleasedWorkflow(store, registry, values.run, revision, receipt); }
        finally { registry.close(); }
        if (values["worker-directory"]) releaseRecoveredWorkflowReader(values["worker-directory"],values.database,store.read(values.run));
      }
      if (command === "workflow-cancel") {
        if (!values.authority) throw new Error("Cancellation authority required");
        store.cancel(values.run, values.authority);
      }
      const run = store.read(values.run);
      return { run, stages: store.stages(run.id) };
    }
    const version = Number(values["task-version"]);
    if (!values.task || !Number.isSafeInteger(version) || version < 1 || !values.action || !values.recipe || !values.authority || !values["operation-id"]) throw new Error("Complete workflow binding required");
    const recipe = resolveWorkflowRecipe(JSON.parse(narrativeFile(process.cwd(), values.recipe)));
    const run = store.submit({ taskId: values.task, taskVersion: version, actionId: values.action, authorityRef: values.authority,
      recipe, recipeDigest: recipeDigest(recipe), operationId: values["operation-id"] });
    const workerDirectory = dispatchWorkflow(values.database, run.id, join(checkRunRoot(), "..", "workflows"), resourceRegistryPath());
    return { run, workerDirectory };
  } finally { store.close(); }
}

/** Pending work must not be mistaken for successful verification by shell callers. */
export function workflowExitCode(state: RunState): number {
  if (state === "succeeded") return 0;
  return ["queued", "running", "reconciling"].includes(state) ? 2 : 1;
}
