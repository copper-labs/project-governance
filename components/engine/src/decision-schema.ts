import { canonical, digest, object, text } from "./core.ts";

/** One schema owner for the expanded decision contract; every validator below derives from it. */
export const DECISION_SCHEMA_VERSION = 2;
export const DECISION_CONSUMER_IDS = ["DL01", "DL02", "DL03", "DL04", "DL05", "DL06", "DL07", "DL09", "DL12", "DL13"] as const;
export type DecisionConsumerId = typeof DECISION_CONSUMER_IDS[number];
/** The full declared effect vocabulary; RC1 consumers qualify only `advise`. */
export const DECISION_EFFECTS = ["observe", "advise", "shape-plan", "request-input", "choose-read", "choose-local"] as const;
export type DecisionEffect = typeof DECISION_EFFECTS[number];
export const DECISION_MODES = ["off", "shadow", "auto"] as const;
export type DecisionMode = typeof DECISION_MODES[number];
export type QuestionShape = "choice" | "noul" | "score";
export const DECISION_FAILURE_STAGE = ["budget", "health-storage", "transport", "response-body", "response-json", "model-identity", "answer-validation"] as const;
export type DecisionFailureStage = typeof DECISION_FAILURE_STAGE[number];

export interface QuestionDefinition {
  id: string; shape: QuestionShape; owner: DecisionConsumerId; purpose: string; instructions: string;
  /** Choice option IDs. `unknown` is always supplied so abstention is an explicit native answer. */
  options?: readonly string[];
  /** Ordered Score levels, lowest first. */
  levels?: readonly string[];
  baseline: string; effectCeiling: DecisionEffect; metric: string;
}

export interface EvidenceItem {
  id: string; text: string; sourceDigest: string;
  provenance: "captured" | "supplied" | "derived"; trust: "trusted" | "untrusted";
  range?: { firstLine: number; lastLine: number; totalLines: number };
}
export interface DecisionCoverage {
  captured: number; omitted: string[]; truncated: boolean; unavailable: string[]; limits: string[];
}
export interface DecisionScope { workspace: string; taskId: string; taskRevision: string; runId?: string }
export interface QuestionInstance {
  name: string; definitionId: string; evidenceIds: string[];
  /** The owning consumer. Independent features keep separate questions inside one compatible batch. */
  consumerId: DecisionConsumerId;
  /** Choice instances may bind a bounded supplied candidate set; `unknown` is appended by the schema. */
  candidates?: Array<{ id: string; description: string }>;
}
export interface DecisionRequest2 {
  schemaVersion: typeof DECISION_SCHEMA_VERSION; requestId: string;
  /** Bind caller capability into request reuse without transmitting it as model authority. */
  entryKind?: string;
  /** Accounting owner of the request. `consumers` lists every participant in a compatible batch. */
  consumerId: DecisionConsumerId; consumers: DecisionConsumerId[]; consumerVersion: string;
  scope: DecisionScope; subject: { digest: string; revision: string; environment: string };
  evidence: EvidenceItem[]; coverage: DecisionCoverage; questions: QuestionInstance[];
  eligibilityDigest: string | null; policyDigest: string; configDigest: string;
  budget: { deadlineMs: number; maxQuestions: number; maxRequestBytes: number; maxCandidates: number; tokenEstimate: number; tokenMethod: string };
}

export type QuestionOutcome =
  | { status: "answered"; shape: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { status: "answered"; shape: "noul"; probability: number }
  | { status: "answered"; shape: "score"; score: number; confidence: number; expectation: number; distribution: Record<string, number>; legend: Record<string, string> }
  | { status: "unknown"; reason: string; native?: { shape: "choice"; choice: string; confidence: number; probabilities: Record<string, number> } }
  | { status: "unavailable"; reason: string }
  | { status: "invalid"; reason: string };

export interface DecisionEnvelope {
  model: string; payloadDigest: string; usage: { inputTokens: number | null; outputTokens: number | null };
  answers: Record<string, QuestionOutcome>;
}

const NAME = /^[a-z][a-z0-9-]{0,63}$/u;
const DEFINITION = /^[a-z][a-z0-9.-]{0,63}\/[1-9][0-9]{0,2}$/u;

/** Reject an unregistered consumer before any preparation reads evidence. */
export function decisionConsumerId(value: unknown): DecisionConsumerId {
  if (typeof value !== "string" || !(DECISION_CONSUMER_IDS as readonly string[]).includes(value)) throw new Error("Unknown decision consumer");
  return value as DecisionConsumerId;
}

/** Structural validation of a prepared request; callers cannot invent questions, IDs or budgets. */
export function validateDecisionRequest(request: DecisionRequest2, definitions: Record<string, QuestionDefinition>): void {
  if (request.schemaVersion !== DECISION_SCHEMA_VERSION) throw new Error("Unsupported decision schema version");
  text(request.requestId, "decision request id", 64);
  decisionConsumerId(request.consumerId);
  if (!Array.isArray(request.consumers) || !request.consumers.length || request.consumers.length > DECISION_CONSUMER_IDS.length ||
      new Set(request.consumers).size !== request.consumers.length || !request.consumers.includes(request.consumerId)) throw new Error("Invalid decision batch participants");
  for (const participant of request.consumers) decisionConsumerId(participant);
  text(request.consumerVersion, "consumer version", 32);
  text(request.scope.workspace, "decision workspace"); text(request.scope.taskId, "decision task", 256);
  text(request.scope.taskRevision, "decision task revision", 128);
  if (request.scope.runId !== undefined) text(request.scope.runId, "decision run id", 256);
  for (const key of ["digest", "revision", "environment"] as const) text(request.subject[key], `decision subject ${key}`, 256);
  for (const key of ["policyDigest", "configDigest"] as const) text(request[key], `decision ${key}`, 256);
  if (request.eligibilityDigest !== null) text(request.eligibilityDigest, "eligibility digest", 256);
  if (!Array.isArray(request.evidence) || !request.evidence.length || request.evidence.length > 64) throw new Error("Decision evidence must be 1..64 bounded items");
  const evidenceIds = new Set<string>();
  for (const item of request.evidence) {
    text(item.id, "evidence id", 128); text(item.sourceDigest, "evidence source digest", 256);
    if (evidenceIds.has(item.id)) throw new Error("Duplicate decision evidence id");
    if (typeof item.text !== "string") throw new Error("Decision evidence text must be a string");
    if (!["captured", "supplied", "derived"].includes(item.provenance) || !["trusted", "untrusted"].includes(item.trust)) throw new Error("Invalid decision evidence provenance or trust class");
    if (item.range && [item.range.firstLine, item.range.lastLine, item.range.totalLines].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid decision evidence range");
    evidenceIds.add(item.id);
  }
  if (!Number.isSafeInteger(request.coverage.captured) || request.coverage.captured < 0 ||
      [request.coverage.omitted, request.coverage.unavailable, request.coverage.limits].some(list => !Array.isArray(list) || list.length > 256) ||
      typeof request.coverage.truncated !== "boolean") throw new Error("Invalid decision coverage record");
  if (!Array.isArray(request.questions) || !request.questions.length || request.questions.length > request.budget.maxQuestions) throw new Error("Decision questions exceed the declared group budget");
  const names = new Set<string>();
  for (const question of request.questions) {
    if (!NAME.test(question.name) || names.has(question.name)) throw new Error("Invalid or duplicate decision question name");
    names.add(question.name);
    if (!DEFINITION.test(question.definitionId)) throw new Error("Invalid decision question identity");
    const definition = definitions[question.definitionId];
    if (!definition) throw new Error(`Unregistered decision question: ${question.definitionId}`);
    if (definition.owner !== question.consumerId || !request.consumers.includes(question.consumerId)) throw new Error("Decision question is owned by a consumer outside this batch");
    if (!question.evidenceIds.length || question.evidenceIds.some(id => !evidenceIds.has(id))) throw new Error("Decision question references unsupplied evidence");
    if (definition.shape === "choice") {
      const supplied = question.candidates ?? [];
      if (!supplied.length || supplied.length + 1 > request.budget.maxCandidates || supplied.length + 1 > 255) throw new Error("Choice candidates exceed the declared bound");
      const ids = new Set(supplied.map(candidate => text(candidate.id, "choice candidate id", 128)));
      for (const candidate of supplied) text(candidate.description, "choice description", 4000);
      if (ids.size !== supplied.length || ids.has("unknown")) throw new Error("Choice candidates must be unique and reserve the unknown option");
      if (definition.options && (ids.size !== definition.options.length || definition.options.some(id => !ids.has(id)))) throw new Error("Choice candidates differ from the registered vocabulary");
    } else if (question.candidates) throw new Error("Only Choice questions supply candidates");
    if (definition.shape === "score" && (!definition.levels || definition.levels.length < 2 || definition.levels.length > 10)) throw new Error("Score definitions require 2..10 ordered levels");
  }
  const budget = request.budget;
  if (!Number.isSafeInteger(budget.deadlineMs) || budget.deadlineMs < 1 || budget.deadlineMs > 30_000 ||
      !Number.isSafeInteger(budget.maxQuestions) || budget.maxQuestions < 1 || budget.maxQuestions > 64 ||
      !Number.isSafeInteger(budget.maxRequestBytes) || budget.maxRequestBytes < 1 || budget.maxRequestBytes > 131_072 ||
      !Number.isSafeInteger(budget.maxCandidates) || budget.maxCandidates < 2 || budget.maxCandidates > 255 ||
      !Number.isSafeInteger(budget.tokenEstimate) || budget.tokenEstimate < 0) throw new Error("Invalid decision request budget");
}

/** The exact transmitted bounded payload. Its digest is distinct from the request/evidence identity. */
export function decisionPayload(request: DecisionRequest2, definitions: Record<string, QuestionDefinition>, model: string) {
  const byId = new Map(request.evidence.map(item => [item.id, item]));
  const questions: Record<string, unknown> = {};
  for (const question of request.questions) {
    const definition = definitions[question.definitionId]!;
    const evidence = question.evidenceIds.map(id => {
      const item = byId.get(id)!;
      return { provenance: item.provenance, trust: item.trust, ...(item.range ? { range: item.range } : {}), evidence: item.text };
    });
    // The API accepts structured instructions; arbitrary sibling evidence fields are not its contract.
    const base = { instructions: { question: definition.instructions, evidence } };
    if (definition.shape === "choice") {
      const criteria: Record<string, { evidence: string; provenance?: string; trust?: string }> = {};
      for (const candidate of question.candidates!) criteria[candidate.id] = { evidence: candidate.description, provenance: "supplied", trust: "untrusted" };
      criteria["unknown"] = { evidence: "No supplied candidate is supported by this evidence, or the evidence is insufficient." };
      questions[question.name] = { ...base, type: "choice", criteria };
    } else if (definition.shape === "noul") {
      questions[question.name] = { ...base, type: "noul" };
    } else {
      questions[question.name] = { ...base, type: "score", criteria: [...definition.levels!] };
    }
  }
  return { model, state: { consumer: request.consumerId, consumers: [...request.consumers].sort(), consumerVersion: request.consumerVersion,
    coverage: { captured: request.coverage.captured, omitted: request.coverage.omitted.length,
      unavailable: request.coverage.unavailable.length, truncated: request.coverage.truncated } }, questions };
}

function probabilities(value: unknown, expected: string[]): Record<string, number> {
  const raw = object(value, "answer distribution");
  if (Object.keys(raw).sort().join("\0") !== [...expected].sort().join("\0")) throw new Error("provider invented or omitted a supplied option");
  let total = 0;
  const distribution: Record<string, number> = {};
  for (const [key, probability] of Object.entries(raw)) {
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error("invalid probability");
    distribution[key] = probability; total += probability;
  }
  if (Math.abs(total - 1) > 0.002) throw new Error("invalid probability distribution");
  return distribution;
}
function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("invalid native confidence");
  return value;
}

/**
 * Validate one provider envelope. A malformed individual answer becomes `invalid` for that question;
 * an envelope or model-identity failure invalidates the whole batch for its caller.
 */
/** Native billable usage remains observable even when answer/model validation fails. */
export function decisionNativeUsage(raw: unknown): { inputTokens: number | null; outputTokens: number | null } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const usage = body.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage as Record<string, unknown> : {};
  const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
  return { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens) };
}

export function parseDecisionEnvelope(raw: unknown, request: DecisionRequest2, definitions: Record<string, QuestionDefinition>, model: string, payloadDigest: string): DecisionEnvelope {
  const body = object(raw, "provider response");
  if (body["model"] !== model) throw new Error("provider model mismatch");
  const answersRaw = object(body["answers"], "provider answers");
  const answers: Record<string, QuestionOutcome> = {};
  for (const question of request.questions) {
    const definition = definitions[question.definitionId]!;
    try {
      const answer = object(answersRaw[question.name], "provider answer");
      if (answer["type"] !== definition.shape) throw new Error("answer shape does not match its question");
      if (definition.shape === "choice") {
        const options = [...question.candidates!.map(candidate => candidate.id), "unknown"];
        const distribution = probabilities(answer["probabilities"], options);
        const choice = answer["choice"];
        if (typeof choice !== "string" || !options.includes(choice)) throw new Error("invalid provider choice");
        const native = confidence(answer["confidence"]);
        if (distribution[choice]! < Math.max(...Object.values(distribution))) throw new Error("choice contradicts distribution");
        answers[question.name] = choice === "unknown"
          ? { status: "unknown", reason: "provider-unknown-option", native: { shape: "choice", choice, confidence: native, probabilities: distribution } }
          : { status: "answered", shape: "choice", choice, confidence: native, probabilities: distribution };
      } else if (definition.shape === "noul") {
        const probability = answer["noul"];
        if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error("invalid boolean probability");
        answers[question.name] = { status: "answered", shape: "noul", probability };
      } else {
        const levels = [...definition.levels!];
        const keys = levels.map((_, index) => String(index));
        const distribution = probabilities(answer["probabilities"], keys);
        const legend = object(answer["legend"], "score legend");
        if (Object.keys(legend).length !== levels.length || keys.some((key, index) => legend[key] !== levels[index])) throw new Error("invalid score legend");
        const expectation = keys.reduce((sum, key, index) => sum + index * distribution[key]!, 0);
        const score = answer["score"];
        if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > levels.length - 1 || Math.abs(score - expectation) > 0.002 * (levels.length - 1)) throw new Error("invalid weighted score");
        answers[question.name] = { status: "answered", shape: "score", score, confidence: confidence(answer["confidence"]),
          expectation, distribution, legend: legend as Record<string, string> };
      }
    } catch (error) {
      answers[question.name] = { status: "invalid", reason: error instanceof Error ? error.message.slice(0, 120) : "invalid answer" };
    }
  }
  if (Object.keys(answersRaw).some(name => !Object.hasOwn(answers, name))) throw new Error("provider answered an unrequested question");
  return { model, payloadDigest, usage: decisionNativeUsage(raw), answers };
}

/** Byte-level upper estimate, avoiding language-dependent characters-per-token assumptions. */
export function estimateTokens(payload: unknown): number {
  return Buffer.byteLength(canonical(payload));
}
export function requestIdentity(request: DecisionRequest2): string {
  return digest({ ...request, requestId: "" });
}
