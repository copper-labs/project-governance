import { digest } from "./core.ts";
import { contextExcerpt } from "./context-excerpts.ts";
import { lexicalContextOrder } from "./context-ranking.ts";
import type { Candidate } from "./decisions.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { interpretNoul, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { DecisionCoverage, EvidenceItem, QuestionInstance } from "./decision-schema.ts";
import { matchesPackPath } from "./planning.ts";

export interface ContextAdvice {
  version: 1; kind: "project-governance-context-advice";
  authority: "advisory only: mandatory context, required packs and delivered required evidence are unchanged";
  mode: string; effect: string; reason: string; delivered: boolean;
  baselineVersion: "lexical-context-1"; method: "baseline" | "rank-fusion-1";
  order: string[]; baselineOrder: string[]; assessed: string[]; unassessed: string[];
  relevance: Array<{ id: string; probability: number | null; interpretation: string }>;
  coverage: DecisionCoverage;
  decision: Pick<DecisionOutcome, "consumerId" | "requestId" | "receiptId" | "method" | "reason" | "delivered" | "providerCalled" | "model" | "usage" | "latencyMs" | "budget" | "scopeState"> | null;
}

/** Code-owned reciprocal-rank merge. A missing score keeps a candidate's baseline position. */
function fuse(baseline: string[], scores: Map<string, number>): string[] {
  const lexicalRank = new Map(baseline.map((id, index) => [id, index + 1]));
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1] || lexicalRank.get(left[0])! - lexicalRank.get(right[0])!);
  const relevanceRank = new Map(ranked.map(([id], index) => [id, index + 1]));
  const assessedOrder = baseline.filter(id => scores.has(id)).sort((left, right) => {
    const score = (id: string) => 1 / (60 + lexicalRank.get(id)!) + (relevanceRank.has(id) ? 1 / (60 + relevanceRank.get(id)!) : 0);
    return score(right) - score(left) || lexicalRank.get(left)! - lexicalRank.get(right)!;
  });
  let cursor = 0;
  // Only assessed slots participate. Missing evidence cannot push an unassessed source out.
  return baseline.map(id => scores.has(id) ? assessedOrder[cursor++]! : id);
}

/**
 * Rank optional context candidates. Required content never reaches this consumer, an unassessed
 * candidate keeps its lexical position, and no usable answer falls back to the lexical order entirely.
 */
export async function contextAdvice(runtime: DecisionRuntime, candidates: Candidate[],
  scope: BudgetScope | null, options: { purpose: string; eventId: string; policyDigest: string; environment: string; revision: string; subjectDigest: string; excerptBytes: number }): Promise<ContextAdvice> {
  const eligibility = runtime.eligibility("DL03");
  const request = { version: 1 as const, kind: "rank_optional_context" as const, taskRevision: options.revision,
    purpose: options.purpose, candidates, dataClass: "source" as const };
  const baseline = lexicalContextOrder(request);
  const base: ContextAdvice = {
    version: 1, kind: "project-governance-context-advice",
    authority: "advisory only: mandatory context, required packs and delivered required evidence are unchanged",
    mode: eligibility.mode, effect: eligibility.effect, reason: eligibility.reasons[0] ?? "no-assessable-evidence",
    delivered: false, baselineVersion: "lexical-context-1", method: "baseline",
    order: baseline, baselineOrder: baseline, assessed: [], unassessed: baseline, relevance: [],
    coverage: { captured: candidates.length, omitted: [], truncated: false, unavailable: [], limits: [] }, decision: null,
  };
  if (eligibility.mode === "off" || !candidates.length) return base;

  const available = Math.max(0, options.excerptBytes - Buffer.byteLength(options.purpose));
  const eligible = baseline.filter(id => matchesPackPath(id, runtime.settings.legacy.allowedSourcePaths ?? []));
  if (!eligible.length) return { ...base, reason: "source-scope-disabled", coverage: { ...base.coverage,
    omitted: baseline, limits: ["No optional candidate is approved for classifier disclosure; lexical delivery remains available."] } };
  // The decision schema admits 64 evidence items including the purpose.
  const count = Math.min(eligible.length, runtime.settings.legacy.maxCandidates, 63, Math.floor(available / 128));
  if (!count) return { ...base, reason: "input-budget", coverage: { ...base.coverage, omitted: baseline,
    limits: ["evidence budget cannot fit purpose and one minimum-size excerpt"], truncated: true } };
  const selected = eligible.slice(0, count).map(id => candidates.find(candidate => candidate.id === id)!);
  const allowance = Math.min(65536, Math.floor(available / selected.length));
  const evidence: EvidenceItem[] = [], questions: QuestionInstance[] = [];
  const limits: string[] = [];
  const purposeId = "task:purpose";
  evidence.push({ id: purposeId, text: options.purpose, sourceDigest: digest(options.purpose), provenance: "supplied", trust: "untrusted" });
  const index = new Map<string, string>();
  let counter = 0;
  for (const candidate of selected) {
    let bounded = candidate;
    // An already ranged or unrepresentable candidate keeps its captured excerpt and coverage record.
    try { bounded = contextExcerpt(candidate, options.purpose, allowance); } catch { limits.push(`${candidate.id}: excerpt unavailable`); }
    if (Buffer.byteLength(bounded.excerpt) > allowance) {
      limits.push(`${candidate.id}: no faithful excerpt fits the evidence allowance; preserved in baseline position`);
      continue;
    }
    if (bounded.sourceRange) limits.push(`${candidate.id}: excerpt bounded to ${allowance} bytes`);
    const evidenceId = `context:${candidate.id}`;
    evidence.push({ id: evidenceId, text: bounded.excerpt, sourceDigest: candidate.sourceDigest, provenance: "captured", trust: "untrusted",
      ...(bounded.sourceRange ? { range: { firstLine: bounded.sourceRange.firstLine, lastLine: bounded.sourceRange.lastLine, totalLines: bounded.sourceRange.totalLines } } : {}) });
    const name = `q${++counter}`;
    questions.push({ name, definitionId: "context.relevance/1", consumerId: "DL03", evidenceIds: [evidenceId, purposeId] });
    index.set(name, candidate.id);
  }
  const omitted = baseline.filter(id => ![...index.values()].includes(id));
  const coverage: DecisionCoverage = { ...base.coverage, captured: index.size, omitted, truncated: limits.length > 0 || omitted.length > 0, limits };
  if (!questions.length) return { ...base, reason: "no-assessable-evidence", coverage };
  const outcome = await runtime.ask({ consumerId: "DL03", eventId: `${options.eventId}:DL03`, scope,
    subject: { digest: options.subjectDigest, revision: options.revision, environment: options.environment },
    evidence, coverage, questions, sourcePaths: [...index.values()],
    eligibilityDigest: null, policyDigest: options.policyDigest });
  const decision = { consumerId: outcome.consumerId, requestId: outcome.requestId, receiptId: outcome.receiptId,
    method: outcome.method, reason: outcome.reason, delivered: outcome.delivered, providerCalled: outcome.providerCalled, model: outcome.model,
    usage: outcome.usage, latencyMs: outcome.latencyMs, budget: outcome.budget, scopeState: outcome.scopeState };
  const relevance: ContextAdvice["relevance"] = [], scores = new Map<string, number>();
  for (const [name, id] of index) {
    const reading = interpretNoul(outcome.answers[name]);
    relevance.push({ id, probability: reading.probability, interpretation: reading.value });
    if (reading.probability !== null) scores.set(id, reading.probability);
  }
  const assessed = [...scores.keys()], unassessed = baseline.filter(id => !scores.has(id));
  if (!outcome.delivered || !assessed.length) {
    return { ...base, mode: outcome.mode, reason: outcome.delivered ? "no-usable-answer" : outcome.reason,
      coverage, relevance, assessed, unassessed, decision };
  }
  return { ...base, mode: outcome.mode, reason: outcome.reason, delivered: true, method: "rank-fusion-1",
    order: fuse(baseline, scores), coverage, relevance, assessed, unassessed, decision };
}
