import { createHash } from "node:crypto";
import type { Candidate } from "./decisions.ts";

/** Select one contiguous whole-line window; retain full-source identity and make omitted context explicit. */
export function contextExcerpt(candidate: Candidate, purpose: string, maximumBytes: number, spans: Array<{ name: string; start: number; end: number }> = []): Candidate {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 128 || maximumBytes > 65536) throw new Error("Optional excerpt budget must be 128 to 65536 bytes");
  if (candidate.sourceRange) throw new Error("Cannot excerpt an already ranged candidate");
  if (Buffer.byteLength(candidate.excerpt) <= maximumBytes) return candidate;
  const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const terms = [...new Set(purpose.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? [])];
  const sizes = lines.map(line => Buffer.byteLength(line));
  const scores = lines.map(line => terms.reduce((sum, term) => sum + Number(line.toLowerCase().includes(term)), 0));
  const anchors = spans.filter(span => Number.isSafeInteger(span.start) && span.start > 0 && span.start <= lines.length)
    .map(span => ({ ...span, score: terms.reduce((sum, term) => sum + Number(span.name.toLowerCase().includes(term)), 0) }))
    .sort((a, b) => b.score - a.score || a.start - b.start);
  if (anchors[0]?.score) scores[anchors[0].start - 1]! += terms.length + 1;
  const informative = lines.map(line => Number(Boolean(line.trim())));
  let start = 0, bytes = 0, score = 0, contentLines = 0;
  let bestStart = 0, bestEnd = 0, bestScore = -1, bestContentLines = -1, bestBytes = -1;
  for (let end = 0; end < lines.length; end++) {
    bytes += sizes[end]!; score += scores[end]!; contentLines += informative[end]!;
    while (bytes > maximumBytes && start <= end) {
      bytes -= sizes[start]!; score -= scores[start]!; contentLines -= informative[start]!; start++;
    }
    if (start <= end && (score > bestScore || (score === bestScore &&
      (contentLines > bestContentLines || (contentLines === bestContentLines && bytes > bestBytes))))) {
      bestScore = score; bestContentLines = contentLines; bestBytes = bytes; bestStart = start; bestEnd = end + 1;
    }
  }
  // A single oversized line cannot be represented faithfully as a whole-line excerpt.
  if (!bestEnd) return candidate;
  const excerpt = lines.slice(bestStart, bestEnd).join("");
  return { ...candidate, excerpt, sourceRange: { firstLine: bestStart + 1, lastLine: bestEnd, totalLines: lines.length,
    excerptDigest: `sha256:${createHash("sha256").update(excerpt).digest("hex")}`, complete: false } };
}
