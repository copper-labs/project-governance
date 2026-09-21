import { realpathSync } from "node:fs";
import { digest, object, text } from "./core.ts";
import { OPERATION_CATALOG, resolveWorkflowRecipe } from "./workflow-catalog.ts";
import { safeSubjectPath, type ValidationSubject } from "./change-subject.ts";
import { recipeDigest } from "./workflow-types.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretChoice, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";

const MAX_CANDIDATES = 12;

export interface WorkflowCandidate {
  id: string; description: string; recipeId: string; recipeDigest: string;
  stages: Array<{ id: string; operation: string; effect: string }>; resources: string[]; claims: string[];
}
export interface WorkflowAdvice {
  version: 1; kind: "project-governance-workflow-advice";
  authority: "advisory only: no workflow is submitted, no command is generated and no authority is granted";
  mode: string; effect: string; reason: string; delivered: boolean;
  candidates: WorkflowCandidate[]; rejected: Array<{ id: string; reason: string }>;
  recommended: { id: string; recipeId: string; recipeDigest: string; confidence: number | null; margin: number | null } | null;
  unknownIntent: boolean; coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/**
 * Resolve caller-supplied recipe candidates through the project operation catalog. The catalog holds
 * operations, not a workflow inventory: a workflow ID is never invented from an operation name.
 */
export function resolveWorkflowCandidates(raw: unknown, root: string, subject: ValidationSubject): { candidates: WorkflowCandidate[]; rejected: Array<{ id: string; reason: string }>; sourcePaths: string[] } {
  const document = object(raw, "workflow candidates");
  if (document["version"] !== 1 || !Array.isArray(document["candidates"])) throw new Error("Unsupported workflow candidate document");
  if (document["candidates"].length > MAX_CANDIDATES) throw new Error("Workflow candidate list exceeds its bound");
  const workspace = realpathSync(root);
  const candidates: WorkflowCandidate[] = [], rejected: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>();
  const sourcePaths = new Set<string>([OPERATION_CATALOG]);
  for (const value of document["candidates"]) {
    const entry = object(value, "workflow candidate");
    for (const key of Object.keys(entry)) if (!["id", "description", "recipe"].includes(key)) throw new Error("Unknown workflow candidate field");
    const id = text(entry["id"], "workflow candidate id", 128);
    if (seen.has(id)) throw new Error("Duplicate workflow candidate id");
    seen.add(id);
    try {
      let rawRecipe = entry["recipe"];
      if (typeof rawRecipe === "string") {
        const path = safeSubjectPath(rawRecipe);
        sourcePaths.add(path);
        if (subject.source(path)?.file_type !== "regular") throw new Error("Captured recipe unavailable");
        rawRecipe = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path, 64 * 1024)));
      }
      if (realpathSync(text(object(rawRecipe)["workspace"], "recipe workspace")) !== workspace) {
        rejected.push({ id, reason: "workspace-out-of-scope" }); continue;
      }
      const recipe = resolveWorkflowRecipe(rawRecipe, subject);
      // Out-of-scope candidates are rejected before any evidence leaves this project subject.
      if (recipe.workspace !== workspace) { rejected.push({ id, reason: "workspace-out-of-scope" }); continue; }
      if (Object.values(recipe.operations).some(operation => !["read", "local"].includes(operation.effect))) { rejected.push({ id, reason: "ineligible-effect" }); continue; }
      candidates.push({ id, description: text(entry["description"], "workflow candidate description", 1000), recipeId: recipe.id,
        recipeDigest: recipeDigest(recipe), resources: recipe.resources, claims: recipe.claims,
        stages: recipe.stages.map(stage => ({ id: stage.id, operation: stage.operation, effect: recipe.operations[stage.operation]!.effect })) });
    } catch (error) { rejected.push({ id, reason: error instanceof Error ? error.message.slice(0, 200) : "unresolved recipe" }); }
  }
  return { candidates, rejected, sourcePaths: [...sourcePaths] };
}

/** RC1 workflow advice: match intent to eligible registered recipes, or return unknown. */
export async function workflowAdvice(runtime: DecisionRuntime, supplied: { candidates: WorkflowCandidate[]; rejected: Array<{ id: string; reason: string }> } | null,
  scope: BudgetScope | null, options: { task: string; eventId: string; policyDigest: string; environment: string; revision: string; subjectDigest: string; sourcePaths: string[] }): Promise<WorkflowAdvice> {
  const eligibility = runtime.eligibility("DL04");
  const candidates = supplied?.candidates ?? [], rejected = supplied?.rejected ?? [];
  const limits: string[] = [];
  if (!supplied) limits.push("no --workflow-candidates supplied: eligibility is unknown and no recommendation is possible");
  if (rejected.length) limits.push(`${rejected.length} supplied candidate(s) rejected before preparation`);
  const base: WorkflowAdvice = {
    version: 1, kind: "project-governance-workflow-advice",
    authority: "advisory only: no workflow is submitted, no command is generated and no authority is granted",
    mode: eligibility.mode, effect: eligibility.effect, reason: eligibility.reasons[0] ?? "no-eligible-candidate",
    delivered: false, candidates, rejected, recommended: null, unknownIntent: false,
    coverage: { captured: candidates.length, omitted: rejected.map(entry => entry.id), truncated: false, unavailable: [], limits }, decision: null,
  };
  if (eligibility.mode === "off" || !candidates.length) return base;

  const taskId = "task:request";
  const evidence: EvidenceItem[] = [{ id: taskId, text: options.task, sourceDigest: digest(options.task), provenance: "supplied", trust: "untrusted" }];
  for (const candidate of candidates) {
    evidence.push({ id: `workflow:${candidate.id}`, text: JSON.stringify({ description: candidate.description, stages: candidate.stages, claims: candidate.claims }),
      sourceDigest: candidate.recipeDigest, provenance: "supplied", trust: "untrusted" });
  }
  const questions: QuestionInstance[] = [{ name: "match", definitionId: "workflow.match/1", consumerId: "DL04",
    evidenceIds: [taskId, ...candidates.map(candidate => `workflow:${candidate.id}`)],
    candidates: candidates.map(candidate => ({ id: candidate.id, description: candidate.description })) }];
  const outcome = await runtime.ask({ consumerId: "DL04", eventId: `${options.eventId}:DL04`, scope,
    subject: { digest: options.subjectDigest, revision: options.revision, environment: options.environment },
    evidence, coverage: base.coverage, questions, sourcePaths: options.sourcePaths,
    eligibilityDigest: digest(candidates.map(candidate => ({ id: candidate.id, recipeDigest: candidate.recipeDigest }))),
    policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  if (!outcome.delivered) return { ...base, mode: outcome.mode, reason: outcome.reason, decision };
  const answer = outcome.answers["match"];
  const choice = interpretChoice(answer);
  if (!choice.value) {
    return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true,
      unknownIntent: answer?.status === "unknown", decision };
  }
  const chosen = candidates.find(candidate => candidate.id === choice.value)!;
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true,
    recommended: { id: chosen.id, recipeId: chosen.recipeId, recipeDigest: chosen.recipeDigest, confidence: choice.confidence, margin: choice.margin }, decision };
}
