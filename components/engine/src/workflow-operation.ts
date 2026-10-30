import { digest } from "./core.ts";
import { validateCommandRequest, type CommandRequest } from "./process-owner.ts";
import { resolve } from "node:path";
import type { Recipe, Stage } from "./workflow-types.ts";

/** Dispatch and recovery must bind the same execution-owned evidence environment. */
export function workflowOperation(recipe: Recipe, runId: string, stage: Stage, commandsDirectory: string) {
  const index = recipe.stages.indexOf(stage);
  if (index < 0) throw new Error("Stage is not part of recipe");
  const selected = recipe.operations[stage.operation]!;
  return { ...selected, env: { ...selected.env,
    PROJECT_GOVERNANCE_WORKFLOW_RUN_ID: runId,
    PROJECT_GOVERNANCE_WORKFLOW_STAGE_ID: stage.id,
    PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR: resolve(commandsDirectory, `${runId}-${index}-artifacts`),
    PROJECT_GOVERNANCE_WORKFLOW_STAGE_ARTIFACTS_JSON: JSON.stringify(Object.fromEntries(
      recipe.stages.slice(0, index).map((previous, previousIndex) =>
        [previous.id, resolve(commandsDirectory, `${runId}-${previousIndex}-artifacts`)]))),
  } };
}


/** Both recovery paths accept only the native request shape originally dispatched by the workflow. */
export function validateOriginalWorkflowCommand(command: CommandRequest, recipe: Recipe, runId: string, stage: Stage, directory: string): void {
  if (command.version !== 1 || command.id !== `${runId}:${stage.id}` ||
      digest(command.operation) !== digest(workflowOperation(recipe,runId,stage,directory)) ||
      !Number.isInteger(command.deadlineMs) || command.deadlineMs < 1 || command.deadlineMs > stage.deadlineMs ||
      Object.keys(command).some(key=>!["version","id","operation","deadlineMs","outputLimit","ownerDigest","executionIdentity"].includes(key)))
    throw new Error("Original command differs from workflow stage");
  validateCommandRequest(command);
}
