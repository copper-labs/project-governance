import { contextTerms } from "./context-terms.ts";
import { createHash } from "node:crypto";
import type { Candidate } from "./decisions.ts";

/** Preserve independent sections when one contiguous excerpt would hide part of the request. */
export function contextExcerpt(candidate: Candidate, purpose: string, maximumBytes: number, spans: Array<{ name: string; start: number; end: number }> = []): Candidate {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 128 || maximumBytes > 65536) throw new Error("Optional excerpt budget must be 128 to 65536 bytes");
  if (candidate.sourceRange || candidate.sourceRanges) throw new Error("Cannot excerpt an already ranged candidate");
  if (Buffer.byteLength(candidate.excerpt) <= maximumBytes) return candidate;
  const terms = new Set(words(purpose)), lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const matches = spans.filter(span => Number.isSafeInteger(span.start) && span.start > 0 && span.start <= lines.length)
    .map(span => ({ span, terms: new Set(words(span.name).filter(term => terms.has(term))) }))
    .filter(item => item.terms.size > 0).sort((a, b) => b.terms.size - a.terms.size || a.span.start - b.span.start);
  const first = matches[0], second = first && matches.find(item => [...item.terms].some(term => !first.terms.has(term)));
  const allowance = Math.floor((maximumBytes - 128) / 2);
  if (first && second && allowance >= 128) {
    const parts = [first, second].map(item => contiguousExcerpt(candidate, purpose, allowance, [item.span]))
      .filter(item => item.sourceRange).sort((a, b) => a.sourceRange!.firstLine - b.sourceRange!.firstLine);
    if (parts.length === 2 && parts[0]!.sourceRange!.lastLine < parts[1]!.sourceRange!.firstLine) {
      const excerpt = parts.map(item => `[source lines ${item.sourceRange!.firstLine}-${item.sourceRange!.lastLine}]\n${item.excerpt}`).join("\n");
      if (Buffer.byteLength(excerpt) <= maximumBytes) return { ...candidate, excerpt, sourceRanges: parts.map(item => item.sourceRange!) };
    }
  }
  return contiguousExcerpt(candidate, purpose, maximumBytes, spans);
}

const words = (value: string) => [...contextTerms(value)];
/** Each range is exact original whole lines; synthetic section labels are outside its digest. */
function contiguousExcerpt(candidate: Candidate, purpose: string, maximumBytes: number, spans: Array<{ name: string; start: number; end: number }>): Candidate {
  const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const terms = new Set(words(purpose));
  const sizes = lines.map(line => Buffer.byteLength(line));
  const score = (value: string) => [...new Set(words(value))].filter(term => terms.has(term)).length;
  const scores = lines.map(score);
  const anchors = spans.filter(span => Number.isSafeInteger(span.start) && span.start > 0 && span.start <= lines.length)
    .map(span => ({ ...span, score: score(span.name) }))
    .sort((a, b) => b.score - a.score || a.start - b.start);
  if (anchors[0]?.score) scores[anchors[0].start - 1]! += terms.size + 1;
  const informative = lines.map(line => Number(Boolean(line.trim())));
  let start = 0, bytes = 0, windowScore = 0, contentLines = 0;
  let bestStart = 0, bestEnd = 0, bestScore = -1, bestContentLines = -1, bestBytes = -1;
  for (let end = 0; end < lines.length; end++) {
    bytes += sizes[end]!; windowScore += scores[end]!; contentLines += informative[end]!;
    while (bytes > maximumBytes && start <= end) {
      bytes -= sizes[start]!; windowScore -= scores[start]!; contentLines -= informative[start]!; start++;
    }
    if (start <= end && (windowScore > bestScore || (windowScore === bestScore &&
      (contentLines > bestContentLines || (contentLines === bestContentLines && bytes > bestBytes))))) {
      bestScore = windowScore; bestContentLines = contentLines; bestBytes = bytes; bestStart = start; bestEnd = end + 1;
    }
  }
  // A single oversized line cannot be represented faithfully as a whole-line excerpt.
  if (!bestEnd) return candidate;
  const excerpt = lines.slice(bestStart, bestEnd).join("");
  return { ...candidate, excerpt, sourceRange: { firstLine: bestStart + 1, lastLine: bestEnd, totalLines: lines.length,
    excerptDigest: `sha256:${createHash("sha256").update(excerpt).digest("hex")}`, complete: false } };
}
