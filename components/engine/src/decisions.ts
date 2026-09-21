import { lexicalContextOrder } from "./context-ranking.ts";
import { dirname } from "node:path";
import { DecisionRuntime } from "./decision-runtime.ts";
import { legacyDecisionSettings, type DecisionSettings } from "./decision-settings.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { performance } from "node:perf_hooks";
import { digest, text } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { boundDecisionEvidence, type ExcerptCoverage } from "./decision-excerpts.ts";

export type DecisionKind = "rank_optional_context" | "rank_diagnostics" | "advise_intent";
export interface Candidate { id: string; sourceDigest: string; excerpt: string; sourceRange?: { firstLine: number; lastLine: number; totalLines: number; excerptDigest: string; complete: false } }
export interface DecisionRequest {
  version: 1; kind: DecisionKind; taskRevision: string; purpose: string;
  candidates: Candidate[]; dataClass: "source" | "diagnostic" | "synthetic";
}
export interface DecisionConfig {
  mode: "off" | "auto" | "shadow"; revision: string; model: string;
  allowedQuestions: DecisionKind[]; allowedDataClasses: DecisionRequest["dataClass"][];
  deadlineMs: number; evidenceBytes: number; maxCandidates: number; minimumConfidence: number;
  allowedSourcePaths?: string[];
}
export const DECISION_FAILURE_STAGES = ["health-storage", "transport", "response-body", "response-json", "model-identity", "choice-validation"] as const;
export interface DecisionResult {
  failureStage?: typeof DECISION_FAILURE_STAGES[number];
  baselineVersion?: "lexical-context-1" | "discovery-order-1";
  version: 1; kind: DecisionKind; inputDigest: string; delivered: string[]; suggested: string[] | null;
  method: "baseline" | "jev"; reason: string; model: string | null; questionVersion: string;
  confidence: number | null; latencyMs: number; usage: { inputTokens: number | null; outputTokens: number | null };
  excerptCoverage?: ExcerptCoverage[];
  receiptId?: string | null;
}
export interface DecisionOptions { signal?: AbortSignal }
export interface DecisionProvider { decide(request: DecisionRequest, options?: DecisionOptions): Promise<DecisionResult> }
export const DEFAULT_DECISIONS: DecisionConfig = {
  mode: "off", revision: "1", model: "jev-1.13.0", allowedQuestions: [], allowedDataClasses: [],
  deadlineMs: 1000, evidenceBytes: 8192, maxCandidates: 16, minimumConfidence: 0.5,
};
const KINDS: DecisionKind[] = ["rank_optional_context", "rank_diagnostics", "advise_intent"];
const QUESTION_VERSION = "legacy.context-rank/1";
/** Invalid policy never silently enables a provider or broadens data sharing. */
export function validateDecisionConfig(config: DecisionConfig): void {
  text(config.revision, "decision configuration revision", 128);
  if (!["off", "auto", "shadow"].includes(config.mode) || typeof config.model !== "string" || !/^jev-\d+\.\d+\.\d+$/.test(config.model)) throw new Error("invalid decision mode/revision/pinned model");
  if (!Array.isArray(config.allowedQuestions) || config.allowedQuestions.some(q => !KINDS.includes(q))) throw new Error("unsupported decision question");
  if (!Array.isArray(config.allowedDataClasses) || config.allowedDataClasses.some(c => !["source", "diagnostic", "synthetic"].includes(c))) throw new Error("unsupported decision data class");
  if (config.allowedSourcePaths !== undefined && (!Array.isArray(config.allowedSourcePaths) || config.allowedSourcePaths.some(path =>
    typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").some(part => part === ".." || part === ".")))) throw new Error("invalid decision source scope");
  if (!Number.isInteger(config.deadlineMs) || config.deadlineMs < 1 || config.deadlineMs > 30_000 ||
      !Number.isInteger(config.evidenceBytes) || config.evidenceBytes < 1 || config.evidenceBytes > 32_768 ||
      !Number.isInteger(config.maxCandidates) || config.maxCandidates < 1 || config.maxCandidates > 64 ||
      !Number.isFinite(config.minimumConfidence) || config.minimumConfidence < 0 || config.minimumConfidence > 1) throw new Error("invalid decision bounds");
}

export interface LegacyDecisionOptions { token?: string; fetch?: typeof fetch; now?: () => number; scope?: BudgetScope | null; settings?: DecisionSettings }

/** One bounded HTTP call; health is advisory and cannot touch the critical execution transaction. */
export class JevDecisionAdapter implements DecisionProvider {
  readonly config: DecisionConfig;
  readonly #stateRoot: string;
  readonly #options: LegacyDecisionOptions;
  constructor(config: DecisionConfig, healthPath: string, options: LegacyDecisionOptions = {}) {
    validateDecisionConfig(config);
    this.config = structuredClone(config);
    this.#stateRoot = dirname(healthPath); this.#options = options;
  }

  async decide(request: DecisionRequest, options: DecisionOptions = {}): Promise<DecisionResult> {
    const started = performance.now();
    request = structuredClone(request);
    if (request.version !== 1 || !KINDS.includes(request.kind)) throw new Error("unsupported decision request");
    text(request.taskRevision, "task revision"); text(request.purpose, "purpose");
    const ids = new Set<string>();
    for (const candidate of request.candidates) {
      text(candidate.id, "candidate id", 128); text(candidate.sourceDigest, "candidate source digest");
      if (candidate.id === "unknown" || ids.has(candidate.id) || typeof candidate.excerpt !== "string") throw new Error("invalid or duplicate candidate");
      ids.add(candidate.id);
    }
    const baseline = request.kind === "rank_optional_context" ? lexicalContextOrder(request) : request.candidates.map(c => c.id);
    const inputDigest = digest(request);
    const result: DecisionResult = { version: 1, kind: request.kind, inputDigest, delivered: baseline,
      baselineVersion: request.kind === "rank_optional_context" ? "lexical-context-1" : "discovery-order-1",
      suggested: null, method: "baseline", reason: "off", model: null, questionVersion: QUESTION_VERSION,
      confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
    const fallback = (reason: string): DecisionResult => ({ ...result, reason, latencyMs: performance.now() - started });
    if (options.signal?.aborted) return fallback("cancelled");
    if (this.config.mode === "off") return fallback("off");
    if (!(this.#options.token ?? process.env["JEV_TOKEN"])) return fallback("missing-token");
    if (request.kind !== "rank_optional_context" || !this.config.allowedQuestions.includes(request.kind)) return fallback("question-disabled");
    if (!this.config.allowedDataClasses.includes(request.dataClass)) return fallback("data-sharing-disabled");
    if (request.dataClass === "source" && request.candidates.some(candidate =>
      candidate.id.startsWith("/") || candidate.id.includes("\\") || candidate.id.split("/").some(part => part === ".." || part === ".") ||
      !matchesPackPath(candidate.id, this.config.allowedSourcePaths ?? []))) return fallback("source-scope-disabled");
    if (!this.#options.scope) return fallback("scope-unavailable");
    if (this.#options.scope.taskRevision !== request.taskRevision) return fallback("scope-conflict");
    if (!baseline.length || baseline.length > this.config.maxCandidates) return fallback("input-budget");
    const bounded = boundDecisionEvidence(request, this.config.evidenceBytes);
    if (!bounded) return fallback("input-budget");
    result.excerptCoverage = bounded.coverage;
    request = bounded.request;
    const settings = this.#options.settings ?? legacyDecisionSettings(this.config);
    const runtime = new DecisionRuntime(settings, this.#stateRoot, { ...this.#options, ...options });
    const evidence = [{ id: "purpose", text: request.purpose, sourceDigest: digest(request.purpose), provenance: "supplied" as const, trust: "untrusted" as const },
      ...request.candidates.map((candidate, index) => ({ id: `candidate:${index}`, text: candidate.excerpt, sourceDigest: candidate.sourceDigest,
        provenance: "captured" as const, trust: "untrusted" as const }))];
    const outcome = await runtime.ask({ consumerId: "DL03", eventId: `legacy-context:${inputDigest}`, scope: this.#options.scope,
      subject: { digest: inputDigest, revision: request.taskRevision, environment: `legacy-context-${request.dataClass}` },
      evidence, coverage: { captured: evidence.length, omitted: [], truncated: bounded.coverage.some(item => item.omittedBytes > 0), unavailable: [], limits: [] },
      questions: [{ name: "suggestion", definitionId: "legacy.context-rank/1", consumerId: "DL03", evidenceIds: evidence.map(item => item.id),
        candidates: request.candidates.map(candidate => ({ id: candidate.id, description: candidate.id })) }],
      sourcePaths: request.candidates.map(candidate => candidate.id), legacyDataClass: request.dataClass, policyDigest: settings.configDigest });
    result.usage = outcome.usage; result.model = outcome.model; result.receiptId = outcome.receiptId;
    if (outcome.reason !== "cancelled" && outcome.failureStage) {
      if (outcome.failureStage === "answer-validation") result.failureStage = "model-identity";
      else if ((DECISION_FAILURE_STAGES as readonly string[]).includes(outcome.failureStage)) result.failureStage = outcome.failureStage as typeof DECISION_FAILURE_STAGES[number];
    }
    const answer = outcome.answers.suggestion;
    if (answer?.status === "invalid") { result.failureStage = "choice-validation"; return fallback("invalid-or-unavailable"); }
    if (!answer) return fallback(outcome.reason === "provider-overloaded" ? "provider-error" : outcome.reason);
    if (answer.status === "unknown") return fallback("abstention");
    if (answer.status !== "answered" || answer.shape !== "choice") return fallback("invalid-or-unavailable");
    result.confidence = answer.confidence;
    if (answer.confidence === null || answer.confidence < this.config.minimumConfidence) return fallback("abstention");
    result.suggested = [...baseline].sort((a, b) => Number(answer.probabilities[b]) - Number(answer.probabilities[a]) || baseline.indexOf(a) - baseline.indexOf(b));
    if (outcome.delivered) { result.delivered = result.suggested; result.method = "jev"; }
    result.reason = outcome.mode === "shadow" ? "shadow" : outcome.delivered ? "suggested" : outcome.reason;
    result.latencyMs = performance.now() - started;
    return result;
  }
}
