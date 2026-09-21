import { canonical } from "./core.ts";
import type { DecisionRequest } from "./decisions.ts";

export interface ExcerptCoverage { id: string; sourceBytes: number; excerptBytes: number; omittedBytes: number; lines: number[] }
/** Equal per-candidate budgets keep a large file from crowding out peers; lexical matches only choose whole lines. */
export function boundDecisionEvidence(request: DecisionRequest, maximumBytes: number): { request: DecisionRequest; coverage: ExcerptCoverage[] } | null {
  const bytes = (value: unknown) => Buffer.byteLength(canonical(value));
  const headers = { ...request, candidates: request.candidates.map(candidate => ({ ...candidate, excerpt: "" })) };
  const overhead = bytes(headers);
  if (overhead > maximumBytes || !request.candidates.length) return null;
  const allowance = Math.floor((maximumBytes - overhead) / request.candidates.length);
  const terms = [...new Set(request.purpose.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [])];
  const coverage: ExcerptCoverage[] = [];
  const candidates = request.candidates.map(candidate => {
    const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const ranked = lines.map((line, index) => ({ line, index,
      score: terms.reduce((sum, term) => sum + Number(line.toLowerCase().includes(term)), 0) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const selected: number[] = [];
    let cost = 0;
    for (const item of ranked) {
      const next = bytes(item.line) - 2;
      if (cost + next <= allowance) { selected.push(item.index); cost += next; }
    }
    selected.sort((a, b) => a - b);
    const excerpt = selected.map(index => lines[index]!).join("");
    const sourceBytes = Buffer.byteLength(candidate.excerpt), excerptBytes = Buffer.byteLength(excerpt);
    coverage.push({ id: candidate.id, sourceBytes, excerptBytes, omittedBytes: sourceBytes - excerptBytes, lines: selected.map(index => index + 1) });
    return { ...candidate, excerpt };
  });
  const bounded = { ...request, candidates };
  if (candidates.some(candidate => !candidate.excerpt.trim()) || bytes(bounded) > maximumBytes) return null;
  return { request: bounded, coverage };
}
