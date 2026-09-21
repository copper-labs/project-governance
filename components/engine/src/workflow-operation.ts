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
