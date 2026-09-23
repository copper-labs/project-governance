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
  const clip = (candidate: DecisionRequest["candidates"][number], limit: number) => {
    const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const ranked = lines.map((line, index) => ({ line, index,
      score: terms.reduce((sum, term) => sum + Number(line.toLowerCase().includes(term)), 0) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const selected: number[] = [];
    let cost = 0;
    for (const item of ranked) {
      const next = bytes(item.line) - 2;
      if (cost + next <= limit) { selected.push(item.index); cost += next; }
    }
    selected.sort((a, b) => a - b);
    const excerpt = selected.map(index => lines[index]!).join("");
    const sourceBytes = Buffer.byteLength(candidate.excerpt), excerptBytes = Buffer.byteLength(excerpt);
    return { candidate: { ...candidate, excerpt }, coverage: { id: candidate.id, sourceBytes, excerptBytes,
      omittedBytes: sourceBytes - excerptBytes, lines: selected.map(index => index + 1) } };
  };
  const first = request.candidates.map(candidate => clip(candidate, allowance));
  const kept = first.flatMap((entry, index) => entry.candidate.excerpt.trim() ? [index] : []);
  if (!kept.length) return null;
  // Reallocate the discarded candidates' share once, using their peers' original text.
  const keptSources = kept.map(index => request.candidates[index]!);
  const keptHeaders = { ...request, candidates: keptSources.map(candidate => ({ ...candidate, excerpt: "" })) };
  const finalAllowance = Math.floor((maximumBytes - bytes(keptHeaders)) / kept.length);
  const final = kept.length === request.candidates.length ? first : keptSources.map((candidate, index) => {
    const expanded = clip(candidate, finalAllowance);
    // A larger greedy window can choose a long blank line and crowd out useful text.
    return expanded.candidate.excerpt.trim() ? expanded : first[kept[index]!]!;
  });
  const coverage: ExcerptCoverage[] = request.candidates.map(candidate => ({ id: candidate.id,
    sourceBytes: Buffer.byteLength(candidate.excerpt), excerptBytes: 0,
    omittedBytes: Buffer.byteLength(candidate.excerpt), lines: [] }));
  for (const [index, sourceIndex] of kept.entries()) coverage[sourceIndex] = final[index]!.coverage;
  // An indivisible line makes only its own candidate unassessable. Keep its baseline
  // delivery slot in the caller, but do not let it suppress advice for its peers.
  const assessable = final.map(entry => entry.candidate);
  const bounded = { ...request, candidates: assessable };
  if (!assessable.length || bytes(bounded) > maximumBytes) return null;
  return { request: bounded, coverage };
}
