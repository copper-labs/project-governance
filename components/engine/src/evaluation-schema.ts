import { randomUUID } from "node:crypto";
import { object, text } from "./core.ts";
import type { DecisionCoverage, QuestionOutcome } from "./decision-schema.ts";
import type { DecisionProviderIdentity, DecisionUsage } from "./decision-providers.ts";
import type { TransportTiming } from "./decision-transport.ts";
import type { EvaluationReservation } from "./decision-budget.ts";

/** Fixed adapter guardrails; daily allowances remain separately operator-owned. */
export const EVALUATION_LIMITS = Object.freeze({ images: 128, imageBytes: 10 * 1024 * 1024,
  totalImageBytes: 10 * 1024 * 1024, serializedBytes: 16 * 1024 * 1024, questions: 64,
  evidenceItems: 256, choices: 254, levels: 10, dimension: 16384, pixels: 64 * 1024 * 1024 });
export type EvaluationEvidence = { id: string; role?: string } & (
  { type: "text"; text: string } | { type: "image"; path: string });
export type EvaluationQuestion = { name: string; instructions: string } & (
  { type: "predicate" } | { type: "choice"; choices: Array<{ value: string; description: string }> } |
  { type: "score"; levels: Array<{ label: string; description: string }> });
export interface EvaluationAssociation { session: string; taskId: string; taskRevision: string; attemptId: string }
export interface EvaluationRequest {
  version: 1; evaluationId: string; evidence: EvaluationEvidence[]; questions: EvaluationQuestion[];
  localOnly?: boolean; association?: EvaluationAssociation;
}
export interface EvaluationEvidenceDescriptor {
  id: string; type: "text" | "image"; role: string | null; digest: string; bytes: number;
  reference?: string; mediaType?: "image/png" | "image/jpeg" | "image/webp"; width?: number; height?: number;
}
export interface CapturedEvaluationEvidence { descriptor: EvaluationEvidenceDescriptor; text?: string; dataUrl?: string }
export interface EvaluationResult {
  version: 3; kind: "supplied-evaluation"; evaluationId: string | null; requestId: string; receiptId: string | null;
  requestIdentity: string | null; payloadDigest: string | null; provider: DecisionProviderIdentity | null;
  effect: "advise"; status: "complete" | "partial" | "invalid" | "unsupported" | "unavailable";
  reason: string; providerCalled: boolean; answers: Record<string, QuestionOutcome>;
  evidence: EvaluationEvidenceDescriptor[]; association: EvaluationAssociation | null; coverage: DecisionCoverage;
  budget: EvaluationReservation | null; usage: DecisionUsage; tokenEstimate: number | null;
  timing: { preparationMs: number; providerMs: number; totalMs: number; transport?: TransportTiming };
}
function keys(value: Record<string, unknown>, permitted: string[]) {
  if (Object.keys(value).some(key => !permitted.includes(key))) throw new Error("evaluation-unknown-field");
}
const id = (value: unknown, field: string) => {
  const result = text(value, field, 128);
  if (/[\x00-\x1f]/u.test(result)) throw new Error("evaluation-invalid-identity");
  return result;
};
/** JSON inputs carry evidence and questions only, never transport or execution authority. */
export function parseEvaluationRequest(raw: unknown): EvaluationRequest {
  const value = object(raw); keys(value, ["version", "evaluationId", "evidence", "questions", "localOnly", "association"]);
  if (value.version !== 1) throw new Error("evaluation-version-invalid");
  const evaluationId = id(value.evaluationId, "evaluation id");
  if (value.localOnly !== undefined && typeof value.localOnly !== "boolean") throw new Error("evaluation-local-only-invalid");
  if (!Array.isArray(value.evidence) || !value.evidence.length || value.evidence.length > EVALUATION_LIMITS.evidenceItems) throw new Error("evaluation-evidence-limit");
  const evidence: EvaluationEvidence[] = value.evidence.map(raw => {
    const item = object(raw); keys(item, ["id", "type", "text", "path", "role"]);
    const common = { id: id(item.id, "evidence id"), ...(item.role === undefined ? {} : { role: text(item.role, "evidence role", 256) }) };
    if (item.type === "text" && typeof item.text === "string" && item.path === undefined && Buffer.byteLength(item.text) <= EVALUATION_LIMITS.serializedBytes) return { ...common, type: "text", text: item.text };
    if (item.type === "image" && item.text === undefined) return { ...common, type: "image", path: text(item.path, "image path", 4096) };
    throw new Error("evaluation-evidence-invalid");
  });
  if (evidence.reduce((total, item) => total + (item.type === "text" ? Buffer.byteLength(item.text) : 0), 0) > EVALUATION_LIMITS.serializedBytes) throw new Error("evaluation-text-byte-limit");
  if (new Set(evidence.map(item => item.id)).size !== evidence.length) throw new Error("evaluation-evidence-id-repeated");
  if (!Array.isArray(value.questions) || !value.questions.length || value.questions.length > EVALUATION_LIMITS.questions) throw new Error("evaluation-question-limit");
  const questions: EvaluationQuestion[] = value.questions.map(raw => {
    const item = object(raw); keys(item, ["name", "type", "instructions", "choices", "levels"]);
    const name = id(item.name, "question name"); if (!/^[a-z][a-z0-9-]{0,63}$/u.test(name)) throw new Error("evaluation-question-name-invalid");
    const common = { name, instructions: text(item.instructions, "question instructions", 16000) };
    if (item.type === "predicate" && item.choices === undefined && item.levels === undefined) return { ...common, type: "predicate" };
    if (item.type === "choice" && item.levels === undefined && Array.isArray(item.choices) && item.choices.length >= 1 && item.choices.length <= EVALUATION_LIMITS.choices) {
      const choices = item.choices.map(raw => { const choice = object(raw); keys(choice, ["value", "description"]); return { value: id(choice.value, "choice value"), description: text(choice.description, "choice description", 4000) }; });
      if (new Set(choices.map(item => item.value)).size !== choices.length || choices.some(item => item.value === "unknown")) throw new Error("evaluation-choice-identity-invalid");
      return { ...common, type: "choice", choices };
    }
    if (item.type === "score" && item.choices === undefined && Array.isArray(item.levels) && item.levels.length >= 2 && item.levels.length <= EVALUATION_LIMITS.levels) {
      const levels = item.levels.map(raw => { const level = object(raw); keys(level, ["label", "description"]); return { label: text(level.label, "score label", 256), description: text(level.description, "score description", 4000) }; });
      if (new Set(levels.map(item => item.label)).size !== levels.length) throw new Error("evaluation-score-identity-invalid");
      return { ...common, type: "score", levels };
    }
    throw new Error("evaluation-question-invalid");
  });
  if (new Set(questions.map(item => item.name)).size !== questions.length) throw new Error("evaluation-question-name-repeated");
  let association: EvaluationAssociation | undefined;
  if (value.association !== undefined) {
    const entry = object(value.association); keys(entry, ["session", "taskId", "taskRevision", "attemptId"]);
    association = { session: id(entry.session, "association session"), taskId: id(entry.taskId, "association task"), taskRevision: id(entry.taskRevision, "association revision"), attemptId: id(entry.attemptId, "association attempt") };
  }
  return { version: 1, evaluationId, evidence, questions, ...(value.localOnly === undefined ? {} : { localOnly: value.localOnly as boolean }), ...(association ? { association } : {}) };
}
export const evaluationExitCode = (result: EvaluationResult): number => result.status === "complete" &&
  Object.keys(result.answers).length > 0 && Object.values(result.answers).every(answer => ["answered", "unknown", "refused"].includes(answer.status)) ? 0 : 1;

/** Structured failures retain unresolved identities as null rather than fabricating observations. */
export function unavailableEvaluation(reason: string): EvaluationResult {
  return { version: 3, kind: "supplied-evaluation", evaluationId: null, requestId: randomUUID(), receiptId: null,
    requestIdentity: null, payloadDigest: null, provider: null, effect: "advise", status: "invalid", reason,
    providerCalled: false, answers: {}, evidence: [], association: null,
    coverage: { captured: 0, omitted: [], truncated: false, unavailable: [], limits: [] }, budget: null,
    usage: { inputTokens: null, outputTokens: null }, tokenEstimate: null, timing: { preparationMs: 0, providerMs: 0, totalMs: 0 } };
}
