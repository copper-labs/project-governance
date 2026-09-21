import { realpathSync } from "node:fs";
import { text } from "./core.ts";
import type { BudgetScope } from "./decision-budget.ts";

/** Only a caller's verified job/ledger binding can supply automatic identity. No ambient current task. */
export function resolveDecisionScope(workspace: string, explicit: { taskId?: string; revision?: string },
  binding?: { taskId: string; revision: string; workspace: string }): BudgetScope | null {
  workspace = realpathSync(workspace);
  if (binding) {
    if (realpathSync(binding.workspace) !== workspace) throw new Error("Decision binding belongs to another workspace");
    if ((explicit.taskId !== undefined && explicit.taskId !== binding.taskId) ||
        (explicit.revision !== undefined && explicit.revision !== binding.revision)) throw new Error("Explicit decision identity conflicts with its binding");
  }
  const taskId = binding?.taskId ?? explicit.taskId, revision = binding?.revision ?? explicit.revision;
  if (taskId === undefined && !binding) return null;
  return { workspace, taskId: text(taskId, "decision task", 256), taskRevision: text(revision, "decision revision", 128) };
}
