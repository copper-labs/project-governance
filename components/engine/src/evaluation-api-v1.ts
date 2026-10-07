import { realpathSync } from "node:fs";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime } from "./decision-runtime.ts";
import { unavailableEvaluation, type EvaluationResult } from "./evaluation-schema.ts";
export type { EvaluationRequest, EvaluationResult, EvaluationEvidence, EvaluationQuestion } from "./evaluation-schema.ts";
export const EVALUATION_API_VERSION = 1 as const;

/** This narrow surface exposes evidence evaluation only, never host authorization or task execution. */
export async function evaluateEvidence(request: unknown, options: { workspace?: string } = {}): Promise<EvaluationResult> {
  let root: string;
  try {
    if (!options || typeof options !== "object" || Object.keys(options).some(key => key !== "workspace") ||
      options.workspace !== undefined && typeof options.workspace !== "string") throw new Error("invalid options");
    root = realpathSync(options.workspace ?? process.cwd());
  } catch { return unavailableEvaluation("evaluation-workspace-invalid"); }
  try {
    const settings = loadProfileDecisionSettings(root);
    return await new DecisionRuntime(settings, contextStateRoot(root)).evaluate(request, root);
  } catch { return unavailableEvaluation("evaluation-configuration-unavailable"); }
}
