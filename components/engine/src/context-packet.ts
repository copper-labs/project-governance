import { procedureExcerpt, procedureAdvisoryExcerpt } from "./context-procedures.ts";
import { lexicalContextOrder } from "./context-ranking.ts";
import { contextExcerpt, type Span } from "./context-excerpts.ts";
import { canonical, digest, text } from "./core.ts";
import { CONTEXT_PATH_LIMIT, CONTEXT_PROMPT_LIMIT } from "./context-limits.ts";
import type { Candidate, DecisionOptions, DecisionProvider, DecisionRequest, DecisionResult } from "./decisions.ts";
import type { PassageJudgment, PassageUnitOrder, WholeFilePassageExclusion } from "./context-passage-advice.ts";
import { NOUL_REGIONS } from "./decision-runtime.ts";

export interface ContextPacketRequest {
  taskRevision: string; purpose: string; required: Candidate[]; optional: Candidate[]; maximumBytes: number; optionalExcerptBytes?: number;
  priorityIds?: string[];
  sourceSpans?: Record<string, Span[]>;
  passageJudgments?: Record<string, PassageJudgment>;
  passageUnitOrder?: Record<string, PassageUnitOrder>;
  passageExclusions?: Record<string, WholeFilePassageExclusion>;
  procedurePaths?: string[]; procedureBytes?: number;
  sourceLinks?: Array<{ source: string; target: string; sourceDigest: string; targetDigest: string }>;
}

/** Source-bound advice shapes automatic optional evidence; required context and explicit pins stay intact. */
export async function buildContextPacket(input: ContextPacketRequest, provider: DecisionProvider, options: DecisionOptions = {}) {
  input = structuredClone(input);
  text(input.taskRevision, "task revision"); text(input.purpose, "purpose", CONTEXT_PROMPT_LIMIT);
  for (const candidate of [...input.required, ...input.optional]) {
    text(candidate.id, "context candidate id", CONTEXT_PATH_LIMIT); text(candidate.sourceDigest, "context source digest");
    if (typeof candidate.excerpt !== "string") throw new Error("invalid context source text");
  }
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) throw new Error("invalid context byte budget");
  const ids = [...input.required, ...input.optional].map(candidate => candidate.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate context candidate");
  const bytes = (entries: Candidate[]) => Buffer.byteLength(canonical(entries));
  if (bytes(input.required) > input.maximumBytes) throw new Error("required context exceeds budget");
  if (input.optionalExcerptBytes !== undefined && (!Number.isSafeInteger(input.optionalExcerptBytes) || input.optionalExcerptBytes < 128 || input.optionalExcerptBytes > 65536)) throw new Error("Optional excerpt budget must be 128 to 65536 bytes");
  const judgmentLimitations: Record<string, "judgment-source-mismatch" | "judgment-not-representable"> = {};
  const unitOrdering: Record<string, "uncertain-score"> = {};
  const verifiedPositive = new Set<string>();
  const verifiedNegative = new Set<string>();
  // Descriptions cannot exclude source. A whole-body judgment must match this captured original.
  for (const candidate of input.optional) {
    const exclusion = input.passageExclusions?.[candidate.id];
    if (!exclusion || input.priorityIds?.includes(candidate.id) || input.procedurePaths?.includes(candidate.id) || options.signal?.aborted) continue;
    if (exclusion.sourceDigest !== candidate.sourceDigest) { judgmentLimitations[candidate.id] = "judgment-source-mismatch"; continue; }
    if (exclusion.scope !== "whole-file" || exclusion.complete !== true || exclusion.interpretation !== "negative" ||
        !Number.isFinite(exclusion.probability) || exclusion.probability < 0 || exclusion.probability > NOUL_REGIONS.supportedNegative ||
        exclusion.excerptDigest !== digest(candidate.excerpt) || candidate.sourceRange || candidate.sourceRanges ||
        candidate.sourceUnits?.some(unit => !unit.complete) || input.passageJudgments?.[candidate.id] || input.passageUnitOrder?.[candidate.id]) {
      judgmentLimitations[candidate.id] = "judgment-not-representable"; continue;
    }
    verifiedNegative.add(candidate.id);
  }
  const optional = input.optional.map(candidate => {
    const judgment = input.passageJudgments?.[candidate.id];
    if (input.optionalExcerptBytes === undefined) {
      if (judgment?.interpretation === "positive") {
        if (judgment.sourceDigest !== candidate.sourceDigest) judgmentLimitations[candidate.id] = "judgment-source-mismatch";
        else if (judgment.excerptDigest !== digest(candidate.excerpt)) judgmentLimitations[candidate.id] = "judgment-not-representable";
        else verifiedPositive.add(candidate.id);
      }
      return candidate;
    }
    const baseline = () => contextExcerpt(candidate, input.purpose, input.optionalExcerptBytes!, input.sourceSpans?.[candidate.id]);
    const orderedExcerpt = () => {
      const advice = input.passageUnitOrder?.[candidate.id];
      if (!advice) return null;
      if (advice.kind === "procedure" && !input.procedurePaths?.includes(candidate.id)) return null;
      if (advice.sourceDigest !== candidate.sourceDigest) { judgmentLimitations[candidate.id] = "judgment-source-mismatch"; return null; }
      const excerpt = advice.kind === "procedure" ? procedureAdvisoryExcerpt(candidate, input.purpose, advice.preferredSpans, input.optionalExcerptBytes!)
        : contextExcerpt(candidate, input.purpose, input.optionalExcerptBytes!, input.sourceSpans?.[candidate.id], advice.preferredSpans);
      if (!excerpt || Buffer.byteLength(excerpt.excerpt) > input.optionalExcerptBytes! || digest(excerpt.excerpt) !== advice.excerptDigest) {
        judgmentLimitations[candidate.id] = "judgment-not-representable"; return null;
      }
      unitOrdering[candidate.id] = "uncertain-score"; return excerpt;
    };
    if (!judgment || judgment.interpretation !== "positive") return orderedExcerpt() ?? baseline();
    if (judgment.sourceDigest !== candidate.sourceDigest) { judgmentLimitations[candidate.id] = "judgment-source-mismatch"; return baseline(); }
    const excerpt = judgment.procedure
      ? procedureExcerpt(candidate, judgment.preferredSpans, input.procedureBytes ?? input.optionalExcerptBytes!) : contextExcerpt(candidate, input.purpose, input.optionalExcerptBytes!, input.sourceSpans?.[candidate.id], judgment.preferredSpans);
    if (!excerpt || digest(excerpt.excerpt) !== judgment.excerptDigest) { judgmentLimitations[candidate.id] = "judgment-not-representable"; return baseline(); }
    const ordered = orderedExcerpt();
    if (!ordered) { verifiedPositive.add(candidate.id); return excerpt; }
    const anchor = judgment.preferredSpans[0];
    if (!anchor || ordered.sourceUnits?.some(unit => unit.complete && unit.firstLine <= anchor.start && unit.lastLine >= anchor.end)) verifiedPositive.add(candidate.id);
    return ordered;
  });
  const unrepresentable = new Set(input.optionalExcerptBytes === undefined ? [] : optional
    .filter((candidate, index) => Buffer.byteLength(candidate.excerpt) > (input.procedurePaths?.includes(candidate.id) ? input.procedureBytes ?? input.optionalExcerptBytes! : input.optionalExcerptBytes!) ||
      (!candidate.excerpt.trim() && Boolean(input.optional[index]!.excerpt.trim())))
    .map(candidate => candidate.id));
  const empty = new Set(input.optional.filter(candidate => !candidate.excerpt.trim()).map(candidate => candidate.id));
  const request: DecisionRequest = { version: 1, kind: "rank_optional_context", taskRevision: input.taskRevision,
    // Each adapter bounds its own wire evidence. Delivery excerpts must not prevent a smaller
    // classifier excerpt from being selected from the original captured source.
    purpose: input.purpose, candidates: input.optional.filter(candidate =>
      !unrepresentable.has(candidate.id) && !empty.has(candidate.id) && !verifiedNegative.has(candidate.id)), dataClass: "source" };
  let decision: DecisionResult | null = null;
  let reason = request.candidates.length ? "provider-unavailable" : verifiedNegative.size > 0 && verifiedNegative.size === input.optional.length
    ? "complete-passage-no-match" : "no-assessable-candidates";
  let order = lexicalContextOrder(request);
  if (request.candidates.length) try {
    if (options.signal?.aborted) { reason = "cancelled"; throw new Error("Context advice cancelled"); }
    const result = structuredClone(await provider.decide(structuredClone(request), options));
    if (![1, 3].includes(result.version) || result.kind !== request.kind || result.inputDigest !== digest(request) ||
        result.delivered.length !== order.length || new Set(result.delivered).size !== order.length ||
        result.delivered.some(id => !order.includes(id))) throw new Error("invalid context ranking");
    if (options.signal?.aborted) {
      result.delivered = lexicalContextOrder(request); result.suggested = null;
      result.method = "baseline"; result.reason = "cancelled";
    }
    decision = result; order = [...result.delivered]; reason = result.reason;
  } catch { /* Optional advice failure preserves the same lexical baseline as disabled assistance. */ }
  const role = (id: string) => verifiedPositive.has(id) ? input.passageJudgments?.[id]?.role ?? null
    : unitOrdering[id] ? input.passageUnitOrder?.[id]?.role ?? null : null;
  if (input.priorityIds) {
    if (!Array.isArray(input.priorityIds) || input.priorityIds.length > 128 || input.priorityIds.some(id => !ids.includes(id))) throw new Error("Invalid context priority paths");
    order = [...new Set([...input.priorityIds.filter(id => order.includes(id)), ...order])];
  }
  if (input.passageJudgments || input.passageUnitOrder) {
    const pinned = new Set(input.priorityIds ?? []);
    const advised = (id: string) => !judgmentLimitations[id] && (verifiedPositive.has(id) || Boolean(unitOrdering[id]));
    const unpinned = order.filter(id => !pinned.has(id));
    const remaining = unpinned.filter(advised).sort((a, b) => Number(verifiedPositive.has(b)) - Number(verifiedPositive.has(a)) ||
      (verifiedPositive.has(a) && verifiedPositive.has(b) ? input.passageJudgments![b]!.probability - input.passageJudgments![a]!.probability : 0));
    const roles = new Set<string>(), balanced: string[] = [];
    while (remaining.length) {
      const nextRole = balanced.length ? remaining.findIndex(id => {
        const value = role(id);
        return value !== null && !roles.has(value);
      }) : 0;
      const id = remaining.splice(nextRole < 0 ? 0 : nextRole, 1)[0]!; balanced.push(id);
      const value = role(id); if (value) roles.add(value);
    }
    // Confirmed bodies retain their relevance order. Uncertain fragments keep whole-file order;
    // small differences between them only order units inside their original file.
    order = [...order.filter(id => pinned.has(id)), ...balanced, ...unpinned.filter(id => !advised(id))];
  }
  if (input.procedurePaths) {
    const pinned = new Set(input.priorityIds ?? []), procedures = new Set(input.procedurePaths.filter(id => !judgmentLimitations[id] &&
      (verifiedPositive.has(id) && input.passageJudgments?.[id]?.procedure || unitOrdering[id] && input.passageUnitOrder?.[id]?.kind === "procedure")));
    // The declaration supplies this category. Preserve advisory order within both queues;
    // uncertain quotes never enlarge a procedure's ordinary slot.
    const procedureOrder = order.filter(id => !pinned.has(id) && procedures.has(id));
    const sources = order.filter(id => !pinned.has(id) && !procedures.has(id)), balanced: string[] = [];
    for (let index = 0; index < Math.max(procedureOrder.length, sources.length); index++) {
      if (procedureOrder[index]) balanced.push(procedureOrder[index]!);
      if (sources[index]) balanced.push(sources[index]!);
    }
    order = [...order.filter(id => pinned.has(id)), ...balanced];
  }
  const pairedEvidence: Array<{ source: string; target: string }> = [];
  if (input.sourceLinks) {
    // The shared capture admits at most 64 files; extraction retains 128 literal links per file.
    if (!Array.isArray(input.sourceLinks) || input.sourceLinks.length > 8192) throw new Error("Invalid captured source relationships");
    const originals = new Map(input.optional.map(candidate => [candidate.id, candidate]));
    const pinned = new Set(input.priorityIds ?? []), pairs = new Map<string, string[]>();
    for (const source of order) {
      if (!verifiedPositive.has(source) || input.passageJudgments?.[source]?.role !== "test") continue;
      const targets = new Set(input.sourceLinks.filter(link => link.source === source &&
        link.sourceDigest === originals.get(source)?.sourceDigest && link.targetDigest === originals.get(link.target)?.sourceDigest &&
        !judgmentLimitations[link.target] && (verifiedPositive.has(link.target) || unitOrdering[link.target]) &&
        role(link.target) === "implementation").map(link => link.target));
      pairs.set(source, order.filter(target => targets.has(target) && !pinned.has(target)));
    }
    // A confirmed assertion can name its implementation through a current literal import.
    // This preserves both originals without turning uncertain evidence into a pin or approval.
    const sequence = order.filter(id => pinned.has(id));
    for (const source of order) {
      if (!sequence.includes(source)) sequence.push(source);
      for (const target of pairs.get(source) ?? []) {
        if (!sequence.includes(target)) { sequence.push(target); pairedEvidence.push({ source, target }); }
      }
    }
    order = sequence;
  }
  const selected = [...input.required], omitted = input.optional
    .filter(candidate => unrepresentable.has(candidate.id) || verifiedNegative.has(candidate.id))
    .map(candidate => candidate.id);
  const omissionReasons: Record<string, "excerpt-unrepresentable" | "packet-budget" | "whole-file-negative-passage"> = {};
  for (const id of omitted) omissionReasons[id] = verifiedNegative.has(id) ? "whole-file-negative-passage" : "excerpt-unrepresentable";
  const deliveryOrder = [...order, ...input.optional.filter(candidate =>
    empty.has(candidate.id) && !unrepresentable.has(candidate.id) && !verifiedNegative.has(candidate.id)).map(candidate => candidate.id)];
  const upgrades = new Map<string, Candidate[]>();
  const firstUnits = new Map<string, Candidate>();
  for (const candidate of input.optional) {
    const judgment = input.passageJudgments?.[candidate.id], advisory = unitOrdering[candidate.id] ? input.passageUnitOrder?.[candidate.id] : undefined;
    const preferred = advisory?.preferredSpans ?? (verifiedPositive.has(candidate.id) ? judgment?.preferredSpans : undefined);
    if (!preferred?.length || judgmentLimitations[candidate.id] || input.optionalExcerptBytes === undefined || input.priorityIds?.includes(candidate.id)) continue;
    // Advice was checked against the original source and full excerpt above. Prefixes reuse that
    // exact source-owned ordering; uncertainty keeps its ordinary allowance and visible label.
    const variants = preferred.map((_, index) => {
      const spans = preferred.slice(0, index + 1);
      return advisory?.kind === "procedure" ? procedureAdvisoryExcerpt(candidate, input.purpose, spans, input.optionalExcerptBytes!)
        : judgment?.procedure && !advisory ? procedureExcerpt(candidate, spans, input.procedureBytes ?? input.optionalExcerptBytes!)
        : contextExcerpt(candidate, input.purpose, input.optionalExcerptBytes!, input.sourceSpans?.[candidate.id], spans);
    }).filter((item): item is Candidate => item !== null);
    if (variants.length) { firstUnits.set(candidate.id, variants[0]!); upgrades.set(candidate.id, variants.slice(1)); }
  }
  const pinnedOrder = deliveryOrder.filter(id => input.priorityIds?.includes(id));
  const evidenceOrder = deliveryOrder.filter(id => !pinnedOrder.includes(id) && (verifiedPositive.has(id) || unitOrdering[id]));
  const backgroundOrder = deliveryOrder.filter(id => !pinnedOrder.includes(id) && !evidenceOrder.includes(id));
  const admit = (id: string) => {
    // Admit an ordinary bounded excerpt intact. Larger procedure allowances use section rounds;
    // when an ordinary excerpt cannot fit, its first validated unit can still preserve evidence.
    const ordinary = optional.find(entry => entry.id === id)!;
    const first = firstUnits.get(id);
    const fitsOrdinary = input.optionalExcerptBytes === undefined || Buffer.byteLength(ordinary.excerpt) <= input.optionalExcerptBytes;
    const candidate = first && (!fitsOrdinary || bytes([...selected, ordinary]) > input.maximumBytes) ? first : ordinary;
    if (bytes([...selected, candidate]) <= input.maximumBytes) selected.push(candidate);
    else { omitted.push(id); omissionReasons[id] = "packet-budget"; }
  };
  for (const id of pinnedOrder) admit(id);
  for (const id of evidenceOrder) admit(id);
  const rounds = Math.max(0, ...evidenceOrder.map(id => Math.max(upgrades.get(id)?.length ?? 0,
    (input.passageJudgments?.[id]?.preferredSpans.length ?? 0) - 1)));
  for (let round = 0; round < rounds; round++) for (const id of evidenceOrder) {
    const index = selected.findIndex(item => item.id === id);
    if (index < 0) continue;
    const source = input.optional.find(item => item.id === id)!;
    const ranges = (candidate: Candidate) => candidate.sourceRanges ?? (candidate.sourceRange ? [candidate.sourceRange] :
      [{ firstLine: 1, lastLine: source.excerpt.split("\n").length }]);
    const retains = (candidate: Candidate, existing: Candidate) => ranges(existing)
      .every(old => ranges(candidate).some(next => next.firstLine <= old.firstLine && next.lastLine >= old.lastLine));
    const ordinaryUpgrade = upgrades.get(id)?.[round];
    if (ordinaryUpgrade) {
      const candidate = ordinaryUpgrade;
      const trial = [...selected]; trial[index] = candidate;
      if (retains(candidate, selected[index]!) && bytes(trial) <= input.maximumBytes) selected[index] = candidate;
    }
    const judgment = input.passageJudgments?.[id];
    if (!judgment || !verifiedPositive.has(id) || judgmentLimitations[id] || judgment.procedure ||
      judgment.preferredSpans.length < round + 2 || input.optionalExcerptBytes === undefined || input.priorityIds?.includes(id)) continue;
    // The ordinary slot protects breadth. Additional confirmed source units use only space still
    // available in the declared packet, without clipping away evidence already delivered.
    const existing = selected[index]!;
    let low = Math.max(input.optionalExcerptBytes, Buffer.byteLength(existing.excerpt)), high = Math.min(65536, input.maximumBytes), best = existing;
    while (low <= high) {
      const allowance = Math.floor((low + high) / 2);
      const candidate = contextExcerpt(source, input.purpose, allowance, input.sourceSpans?.[id], judgment.preferredSpans.slice(0, round + 2));
      const trial = [...selected]; trial[index] = candidate;
      if (!retains(candidate, existing)) low = allowance + 1;
      else if (bytes(trial) > input.maximumBytes) high = allowance - 1;
      else { best = candidate; low = allowance + 1; }
    }
    selected[index] = best;
  }
  for (const id of backgroundOrder) admit(id);
  const omittedJudgedUnits = deliveryOrder.flatMap(id => {
    const judgment = input.passageJudgments?.[id], delivered = selected.find(item => item.id === id);
    if (!judgment || judgment.interpretation !== "positive" || judgmentLimitations[id]) return [];
    return judgment.preferredSpans.filter(span => !delivered?.sourceUnits?.some(unit => unit.complete && unit.firstLine <= span.start && unit.lastLine >= span.end))
      .map(span => ({ path: id, firstLine: span.start, lastLine: span.end, reason: "packet-budget" }));
  });
  return { version: 3 as const, taskRevision: input.taskRevision, inputDigest: digest(input),
    entries: selected, omitted, omissionReasons, omittedJudgedUnits, judgmentLimitations,
    unitOrdering: Object.fromEntries(selected.filter(item => unitOrdering[item.id]).map(item => [item.id, unitOrdering[item.id]])), bytes: bytes(selected), decision, reason,
    measurement: { excerpts: selected.filter(entry => entry.sourceRange || entry.sourceRanges).map(entry => ({ id: entry.id, sourceDigest: entry.sourceDigest,
      ...entry.sourceRange, ...(entry.sourceRanges ? { ranges: entry.sourceRanges } : {}), ...(entry.sourceUnits ? { units: entry.sourceUnits } : {}) })), availableOptionalBytes: bytes(input.optional), deliveredBytes: bytes(selected),
      relationships: { basis: "literal-import-from-confirmed-test", reorderedPairs: pairedEvidence.length,
        preview: pairedEvidence.slice(0, 32).map(pair => ({ ...pair,
          delivered: selected.some(item => item.id === pair.source) && selected.some(item => item.id === pair.target) })),
        truncated: pairedEvidence.length > 32 },
      tokenSavings: null, benefit: "not-evaluated" as const } };
}
