import { contextExcerpt } from "./context-excerpts.ts";
import { canonical, digest, text } from "./core.ts";
import { buildContextPacket, type ContextPacketRequest } from "./context-packet.ts";
import type { DecisionOptions, DecisionProvider, DecisionResult } from "./decisions.ts";
import { lexicalContextOrder } from "./context-ranking.ts";

export interface ContextEvaluationCase {
  id: string; request: ContextPacketRequest; usefulOptionalIds: string[];
  usefulSpans?: Array<{ candidateId: string; sourceDigest: string; firstLine: number; lastLine: number }>;
}
export interface SelectionScore { usefulEvidenceSelected: number | null; usefulEvidenceMissed: number | null; usefulSelected: number; usefulMissedBySelection: string[]; recall: number | null; deliveredBytes: number }
export interface CaseResult {
  id: string; inputDigest: string; omittedCandidates: string[]; oversizedUsefulCandidates: string[]; baseline: SelectionScore; candidate: SelectionScore;
  decision: DecisionResult | null; fallbackReason: string;
  shadow: SelectionScore | null;
  lexical: SelectionScore;
}
const baseline: DecisionProvider = { async decide(request) {
  return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(item => item.id),
    suggested: null, method: "baseline", reason: "evaluation-baseline", model: null, questionVersion: "deterministic-order-1",
    confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
} };

/** Paired frozen inputs separate retrieval omissions from selection errors; this is not a development-speed claim. */
export async function evaluateContext(cases: ContextEvaluationCase[], provider: DecisionProvider, options: DecisionOptions = {}) {
  cases = structuredClone(cases);
  if (!cases.length || cases.length > 1000) throw new Error("evaluation needs 1 to 1000 cases");
  const seen = new Set<string>();
  // Validate the entire set before making any potentially billable call.
  for (const entry of cases) {
    text(entry.id, "case id", 128);
    if (seen.has(entry.id)) throw new Error("duplicate evaluation case");
    seen.add(entry.id);
    if (!Array.isArray(entry.usefulOptionalIds) || new Set(entry.usefulOptionalIds).size !== entry.usefulOptionalIds.length) throw new Error("invalid gold IDs");
    for (const id of entry.usefulOptionalIds) {
      text(id, "gold id", 128);
      if (entry.request.required.some(candidate => candidate.id === id)) throw new Error("gold IDs must describe optional context");
    }
    if (entry.usefulSpans !== undefined) {
      if (!Array.isArray(entry.usefulSpans) || entry.usefulSpans.length > 1000) throw new Error("Invalid useful evidence spans");
      const spans = new Set<string>();
      for (const span of entry.usefulSpans) {
        if (!entry.usefulOptionalIds.includes(span.candidateId) || !Number.isSafeInteger(span.firstLine) || span.firstLine < 1 ||
            !Number.isSafeInteger(span.lastLine) || span.lastLine < span.firstLine) throw new Error("Invalid useful evidence span");
        text(span.sourceDigest, "gold source digest");
        const key = digest(span); if (spans.has(key)) throw new Error("Duplicate useful evidence span"); spans.add(key);
        const source = entry.request.optional.find(candidate => candidate.id === span.candidateId);
        if (source && (source.sourceDigest !== span.sourceDigest || span.lastLine > (source.sourceRange?.totalLines ?? (source.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? []).length)))
          throw new Error("Useful evidence source identity or line range mismatch");
      }
    }
    await buildContextPacket(entry.request, baseline);
  }
  const results: CaseResult[] = [];
  for (const entry of cases) {
    const reference = await buildContextPacket(entry.request, baseline);
    const candidate = await buildContextPacket(entry.request, provider, options);
    const lexical = await buildContextPacket(entry.request, { async decide(request) {
      return { ...await baseline.decide(request), delivered: lexicalContextOrder(request), reason: "evaluation-lexical-1" };
    } });
    const available = new Set(entry.request.optional.map(item => item.id));
    const omittedCandidates = entry.usefulOptionalIds.filter(id => !available.has(id));
    const oversizedUsefulCandidates = entry.usefulOptionalIds.filter(id => {
      if (reference.omissionReasons[id] === "excerpt-unrepresentable") return true;
      const candidate = entry.request.optional.find(candidate => candidate.id === id);
      const delivered = candidate && entry.request.optionalExcerptBytes !== undefined ? contextExcerpt(candidate, entry.request.purpose, entry.request.optionalExcerptBytes) : candidate;
      return delivered !== undefined && Buffer.byteLength(canonical([...entry.request.required, delivered])) > entry.request.maximumBytes;
    });
    const score = (packet: typeof reference) => {
      const selected = new Set(packet.entries.map(item => item.id));
      const hits = entry.usefulOptionalIds.filter(id => selected.has(id));
      const evidenceHits = entry.usefulSpans?.filter(span => packet.entries.some(candidate =>
        candidate.id === span.candidateId && candidate.sourceDigest === span.sourceDigest &&
        (!candidate.sourceRange || (candidate.sourceRange.firstLine <= span.firstLine && candidate.sourceRange.lastLine >= span.lastLine)))).length;
      return { usefulEvidenceSelected: evidenceHits ?? null,
        usefulEvidenceMissed: evidenceHits === undefined ? null : entry.usefulSpans!.length - evidenceHits, usefulSelected: hits.length, usefulMissedBySelection: entry.usefulOptionalIds.filter(id => available.has(id) && !selected.has(id)),
        recall: entry.usefulOptionalIds.length ? hits.length / entry.usefulOptionalIds.length : null, deliveredBytes: packet.bytes };
    };
    let shadow: SelectionScore | null = null;
    const observed = candidate.decision;
    if (observed?.reason === "shadow" && observed.suggested) {
      // Replay only captured advice through the same validator and budget. No second provider call.
      const replay = await buildContextPacket(entry.request, { async decide() {
        return { ...observed, delivered: [...observed.suggested!], reason: "evaluation-shadow-replay" };
      } });
      if (replay.decision) shadow = score(replay);
    }
    results.push({ id: entry.id, inputDigest: reference.inputDigest, omittedCandidates, oversizedUsefulCandidates, baseline: score(reference),
      candidate: score(candidate), lexical: score(lexical), shadow, decision: candidate.decision, fallbackReason: candidate.reason });
  }
  return summarizeEvaluation(cases, results);
}

/** Aggregate observed selection and native usage without treating repeated receipts as new calls. */
function summarizeEvaluation(cases: ContextEvaluationCase[], results: CaseResult[]) {
  const sum = (side: "baseline" | "candidate", field: "usefulSelected" | "deliveredBytes") => results.reduce((total, item) => total + item[side][field], 0);
  const seenUsage = new Set<string>();
  const usages = results.filter(item => {
    const id = item.decision?.receiptId;
    if (!id) return true;
    if (seenUsage.has(id)) return false;
    seenUsage.add(id); return true;
  }).map(item => item.decision?.usage);
  const tokens = (field: "inputTokens" | "outputTokens") => usages.every(value => typeof value?.[field] === "number")
    ? usages.reduce((total, value) => total + value![field]!, 0) : null;
  const paired = (side: "candidate" | "shadow", reference: "baseline" | "lexical") => {
    const pairs = results.filter(item => item[side] !== null);
    return {
      cases: pairs.length,
      wins: pairs.filter(item => item[side]!.usefulSelected > item[reference].usefulSelected).map(item => item.id),
      ties: pairs.filter(item => item[side]!.usefulSelected === item[reference].usefulSelected).map(item => item.id),
      losses: pairs.filter(item => item[side]!.usefulSelected < item[reference].usefulSelected).map(item => item.id),
    };
  };
  return { version: 1, datasetDigest: digest(cases), results, summary: {
    cases: cases.length, candidateOmissions: results.reduce((total, item) => total + item.omittedCandidates.length, 0),
    oversizedUsefulCandidates: results.reduce((total, item) => total + item.oversizedUsefulCandidates.length, 0),
    baselineUsefulSelected: sum("baseline", "usefulSelected"), candidateUsefulSelected: sum("candidate", "usefulSelected"),
    baselineDeliveredBytes: sum("baseline", "deliveredBytes"), candidateDeliveredBytes: sum("candidate", "deliveredBytes"),
    providerInputTokens: tokens("inputTokens"), providerOutputTokens: tokens("outputTokens"),
    regressions: results.filter(item => item.candidate.usefulSelected < item.baseline.usefulSelected).map(item => item.id),
    shadowCases: results.filter(item => item.shadow !== null).length,
    lexicalUsefulSelected: results.reduce((total, item) => total + item.lexical.usefulSelected, 0),
    lexicalDeliveredBytes: results.reduce((total, item) => total + item.lexical.deliveredBytes, 0),
    shadowRegressions: results.filter(item => item.shadow !== null && item.shadow.usefulSelected < item.baseline.usefulSelected).map(item => item.id),
    pairedSelection: { candidateVsBaseline: paired("candidate", "baseline"), candidateVsLexical: paired("candidate", "lexical"),
      shadowVsBaseline: paired("shadow", "baseline"), shadowVsLexical: paired("shadow", "lexical") },
    evidenceLabeledCases: cases.filter(entry => entry.usefulSpans !== undefined).length,
    candidateEvidenceMisses: results.every(item => item.candidate.usefulEvidenceMissed !== null)
      ? results.reduce((total, item) => total + item.candidate.usefulEvidenceMissed!, 0) : null,
    tokenSavings: null, developmentBenefit: "unqualified" as const,
  } };
}
