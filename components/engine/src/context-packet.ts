import { lexicalContextOrder } from "./context-ranking.ts";
import { contextExcerpt } from "./context-excerpts.ts";
import { canonical, digest, text } from "./core.ts";
import type { Candidate, DecisionOptions, DecisionProvider, DecisionRequest, DecisionResult } from "./decisions.ts";

export interface ContextPacketRequest {
  taskRevision: string; purpose: string; required: Candidate[]; optional: Candidate[]; maximumBytes: number; optionalExcerptBytes?: number;
}

/** Ranking can reorder optional evidence; it cannot remove required context or introduce source. */
export async function buildContextPacket(input: ContextPacketRequest, provider: DecisionProvider, options: DecisionOptions = {}) {
  input = structuredClone(input);
  text(input.taskRevision, "task revision"); text(input.purpose, "purpose");
  for (const candidate of [...input.required, ...input.optional]) {
    text(candidate.id, "context candidate id", 128); text(candidate.sourceDigest, "context source digest");
    if (typeof candidate.excerpt !== "string") throw new Error("invalid context source text");
  }
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) throw new Error("invalid context byte budget");
  const ids = [...input.required, ...input.optional].map(candidate => candidate.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate context candidate");
  const bytes = (entries: Candidate[]) => Buffer.byteLength(canonical(entries));
  if (bytes(input.required) > input.maximumBytes) throw new Error("required context exceeds budget");
  if (input.optionalExcerptBytes !== undefined && (!Number.isSafeInteger(input.optionalExcerptBytes) || input.optionalExcerptBytes < 128 || input.optionalExcerptBytes > 65536)) throw new Error("Optional excerpt budget must be 128 to 65536 bytes");
  const optional = input.optionalExcerptBytes === undefined ? input.optional
    : input.optional.map(candidate => contextExcerpt(candidate, input.purpose, input.optionalExcerptBytes!));
  const request: DecisionRequest = { version: 1, kind: "rank_optional_context", taskRevision: input.taskRevision,
    // Each adapter bounds its own wire evidence. Delivery excerpts must not prevent a smaller
    // classifier excerpt from being selected from the original captured source.
    purpose: input.purpose, candidates: input.optional, dataClass: "source" };
  let decision: DecisionResult | null = null;
  let reason = "provider-unavailable";
  let order = lexicalContextOrder(request);
  try {
    if (options.signal?.aborted) { reason = "cancelled"; throw new Error("Context advice cancelled"); }
    const result = structuredClone(await provider.decide(structuredClone(request), options));
    if (result.version !== 1 || result.kind !== request.kind || result.inputDigest !== digest(request) ||
        result.delivered.length !== order.length || new Set(result.delivered).size !== order.length ||
        result.delivered.some(id => !order.includes(id))) throw new Error("invalid context ranking");
    if (options.signal?.aborted) {
      result.delivered = lexicalContextOrder(request); result.suggested = null;
      result.method = "baseline"; result.reason = "cancelled";
    }
    decision = result; order = [...result.delivered]; reason = result.reason;
  } catch { /* Optional advice failure preserves the same lexical baseline as disabled assistance. */ }
  const selected = [...input.required], omitted: string[] = [];
  for (const id of order) {
    const candidate = optional.find(entry => entry.id === id)!;
    if (bytes([...selected, candidate]) <= input.maximumBytes) selected.push(candidate);
    else omitted.push(id);
  }
  return { version: 1 as const, taskRevision: input.taskRevision, inputDigest: digest(input),
    entries: selected, omitted, bytes: bytes(selected), decision, reason,
    measurement: { excerpts: selected.filter(entry => entry.sourceRange).map(entry => ({ id: entry.id, sourceDigest: entry.sourceDigest, ...entry.sourceRange! })), availableOptionalBytes: bytes(input.optional), deliveredBytes: bytes(selected),
      tokenSavings: null, benefit: "not-evaluated" as const } };
}
