import { contextTerms } from "./context-terms.ts";
import { createHash } from "node:crypto";
import type { Candidate, SourceRange, SourceUnit } from "./decisions.ts";

export type Span = { kind?: string; name: string; start: number; end: number; members?: Span[]; context?: Span[] };
const words = (value: string) => [...contextTerms(value)];
const sourceLines = (value: string) => value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
const range = (lines: string[], firstLine: number, lastLine: number): SourceRange => ({
  firstLine, lastLine, totalLines: lines.length,
  excerptDigest: `sha256:${createHash("sha256").update(lines.slice(firstLine - 1, lastLine).join("")).digest("hex")}`,
  complete: false,
});
const unit = (span: Span, complete: boolean): SourceUnit => ({ kind: span.kind ?? "section", name: span.name,
  firstLine: span.start, lastLine: span.end, complete });
const units = (span: Span, complete: boolean): SourceUnit[] => (span.members ?? [span]).map(item => unit(item, complete));
const adjacent = (lines: string[], left: Span, right: Span) => right.start > left.end &&
  right.start - left.end <= 3 && lines.slice(left.end, right.start - 1)
    .every(line => /^\s*(?:(?:\/\/|\*|#).*)?$/u.test(line));

/** Group consecutive small declarations so one passage can express a local behavior, not one label. */
export function contextSourceClusters(candidate: Candidate, spans: Span[], maximumBytes = 3072): Span[] {
  const lines = sourceLines(candidate.excerpt);
  const sorted = spans.filter(span => span.start > 0 && span.end >= span.start && span.end <= lines.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters: Span[] = [];
  let current: Span | null = null;
  const flush = () => { if (current) clusters.push(current); current = null; };
  for (const span of sorted) {
    const canJoin = current && !current.context && !span.context && current.kind === span.kind && current.kind !== "heading" &&
      adjacent(lines, current, span) &&
      (current.members?.length ?? 1) < 6 &&
      Buffer.byteLength(lines.slice(current.start - 1, span.end).join("")) <= maximumBytes;
    if (!canJoin) { flush(); current = { ...span }; }
    else current = { ...current!, name: `${current!.name} ${span.name}`, end: span.end,
      members: [...(current!.members ?? [current!]), span] };
  }
  flush();
  return clusters;
}

/** Rank source-owned units without pretending that a name or setup proves the requested behavior. */
export function contextSpanChoices(candidate: Candidate, purpose: string, spans: Span[], includeUnmatched = false) {
  const lines = sourceLines(candidate.excerpt), terms = new Set(words(purpose));
  return spans.filter(span => Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end) &&
    span.start > 0 && span.end >= span.start && span.start <= lines.length)
    .map(span => ({ ...span, end: Math.min(span.end, lines.length) }))
    .map(span => {
      const named = new Set(words(span.name).filter(term => terms.has(term)));
      const body = new Set(words(lines.slice(span.start - 1, span.end).join("")).filter(term => terms.has(term)));
      const excerpt = lines.slice(span.start - 1, span.end).join("");
      return { span, named, body, excerpt, bytes: Buffer.byteLength(excerpt), score: named.size * 4 + body.size };
    }).filter(item => includeUnmatched || item.score > 0).sort((a, b) => b.score - a.score || b.named.size - a.named.size ||
      a.bytes - b.bytes || a.span.start - b.span.start);
}

/** Prefer an intact authored unit. A line window is explicitly partial when its unit cannot fit. */
export function contextExcerpt(candidate: Candidate, purpose: string, maximumBytes: number, spans: Span[] = [], preferred: Span[] = []): Candidate {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 128 || maximumBytes > 65536) throw new Error("Optional excerpt budget must be 128 to 65536 bytes");
  if (candidate.sourceRange || candidate.sourceRanges) throw new Error("Cannot excerpt an already ranged candidate");
  if (!preferred.length && Buffer.byteLength(candidate.excerpt) <= maximumBytes) return candidate;
  const lines = sourceLines(candidate.excerpt);
  const valid = spans.filter(span => Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end) &&
    span.start > 0 && span.end >= span.start && span.start <= lines.length)
    .map(span => ({ ...span, end: Math.min(span.end, lines.length) }));
  if (preferred.length) {
    const clusters = contextSourceClusters(candidate, valid);
    const chosen = preferred.slice(0, 4).flatMap(wanted => {
      const span = [...valid, ...clusters].find(item => item.start === wanted.start &&
        item.end === Math.min(wanted.end, lines.length) && item.name === wanted.name);
      return span ? [span] : [];
    });
    if (chosen.length) {
      const combine = (parts: Candidate[]) => {
        const joined: Candidate[] = [];
        for (const part of [...parts].sort((a, b) => a.sourceRange!.firstLine - b.sourceRange!.firstLine)) {
          const last = joined.at(-1), kind = last?.sourceUnits?.[0]?.kind;
          const left = last?.sourceRange, right = part.sourceRange!;
          const contiguousTable = last && left && right.firstLine === left.lastLine + 1 &&
            last.sourceUnits?.every(item => item.kind === "table-columns" || item.kind === "table-row") &&
            part.sourceUnits?.every(item => item.kind === "table-row");
          if (last && left && (contiguousTable || kind && kind !== "heading" &&
            last.sourceUnits?.every(item => item.kind === kind) && part.sourceUnits?.every(item => item.kind === kind) &&
            adjacent(lines, { name: "", start: left.firstLine, end: left.lastLine }, { name: "", start: right.firstLine, end: right.lastLine }))) {
            const excerpt = lines.slice(left.firstLine - 1, right.lastLine).join("");
            joined[joined.length - 1] = { ...last, excerpt, sourceRange: range(lines, left.firstLine, right.lastLine),
              sourceUnits: [...last.sourceUnits!, ...part.sourceUnits!] };
          } else joined.push(part);
        }
        return joined;
      };
      const content = (parts: Candidate[]) => parts.length === 1 ? parts[0]!.excerpt :
        parts.map(item => `[source lines ${item.sourceRange!.firstLine}-${item.sourceRange!.lastLine}]\n${item.excerpt}`).join("\n");
      let parts: Candidate[] = [];
      // Admit in judgment order first. A later neighbor cannot evict an already admitted passage.
      for (const span of chosen) {
        if (span.context?.length) {
          // Table columns and their row enter together. Dropping either loses the meaning.
          const required = [...span.context, span].sort((left, right) => left.start - right.start);
          const added: Candidate[] = [];
          for (const part of required) {
            if (parts.some(existing => existing.sourceRange!.firstLine <= part.start && existing.sourceRange!.lastLine >= part.end)) continue;
            if (parts.some(existing => existing.sourceRange!.firstLine <= part.end && existing.sourceRange!.lastLine >= part.start)) continue;
            const body = lines.slice(part.start - 1, part.end).join("");
            added.push({ ...candidate, excerpt: body, sourceRange: range(lines, part.start, part.end), sourceUnits: units(part, true) });
          }
          const trial = combine([...parts, ...added]);
          if (required.every(required => trial.some(part => part.sourceRange!.firstLine <= required.start && part.sourceRange!.lastLine >= required.end)) &&
              Buffer.byteLength(content(trial)) <= maximumBytes) parts = trial;
          continue;
        }
        const body = lines.slice(span.start - 1, span.end).join("");
        const marker = (first: number, last: number) => Buffer.byteLength(`[source lines ${first}-${last}]\n`);
        const framing = parts.length ? 1 + marker(span.start, span.end) + (parts.length === 1
          ? marker(parts[0]!.sourceRange!.firstLine, parts[0]!.sourceRange!.lastLine) : 0) : 0;
        const remaining = maximumBytes - Buffer.byteLength(content(parts)) - framing;
        if (remaining < 128) continue;
        const part: Candidate = Buffer.byteLength(body) <= remaining
          ? { ...candidate, excerpt: body, sourceRange: range(lines, span.start, span.end), sourceUnits: units(span, true) }
          : contiguousExcerpt(candidate, purpose, remaining, [span], span);
        if (!part.sourceRange || parts.some(other => other.sourceRange &&
          !(part.sourceRange!.lastLine < other.sourceRange.firstLine || part.sourceRange!.firstLine > other.sourceRange.lastLine))) continue;
        const trial = combine([...parts, part]);
        if (Buffer.byteLength(content(trial)) <= maximumBytes) parts = trial;
      }
      if (parts.length > 1) {
        return { ...candidate, excerpt: content(parts),
          sourceRanges: parts.map(item => item.sourceRange!), sourceUnits: parts.flatMap(item => item.sourceUnits ?? []) };
      }
      if (parts.length) return parts[0]!;
    }
  }
  const matches = contextSpanChoices(candidate, purpose, valid);
  const tableRow = matches.find(item => item.span.context?.length && item.score > 0);
  if (tableRow && tableRow === matches[0] && !preferred.length) {
    // Atomic columns preserve a winning row's meaning; they cannot promote a weaker match.
    const excerpt = contextExcerpt(candidate, purpose, maximumBytes, valid, [tableRow.span]);
    if (excerpt.sourceUnits?.some(item => item.kind === "table-row" && item.complete)) return excerpt;
  }
  const complete = matches.filter(item => !item.span.context?.length && item.bytes <= maximumBytes);
  if (complete.length) {
    const first = complete[0]!;
    const second = complete.find(item => item !== first && (item.span.start > first.span.end || item.span.end < first.span.start) &&
      [...item.named].filter(term => !first.named.has(term)).length >= (first.span.kind === "heading" && item.span.kind === "heading" ? 1 : 2));
    if (second) {
      const parts = [first, second].sort((a, b) => a.span.start - b.span.start);
      const excerpt = parts.map(item => `[source lines ${item.span.start}-${item.span.end}]\n${item.excerpt}`).join("\n");
      if (Buffer.byteLength(excerpt) <= maximumBytes) return { ...candidate, excerpt,
        sourceRanges: parts.map(item => range(lines, item.span.start, item.span.end)),
        sourceUnits: parts.flatMap(item => units(item.span, true)) };
    }
    return { ...candidate, excerpt: first.excerpt, sourceRange: range(lines, first.span.start, first.span.end),
      sourceUnits: units(first.span, true) };
  }
  const first = matches[0], second = first && matches.find(item => item !== first &&
    [...item.named].some(term => !first.named.has(term)));
  const allowance = Math.floor((maximumBytes - 128) / 2);
  if (first && second && allowance >= 128) {
    const parts = [first, second].map(item => contiguousExcerpt(candidate, purpose, allowance, [item.span], item.span));
    if (parts.every(item => item.sourceRange) && parts[0]!.sourceRange!.lastLine < parts[1]!.sourceRange!.firstLine ||
      parts.every(item => item.sourceRange) && parts[1]!.sourceRange!.lastLine < parts[0]!.sourceRange!.firstLine) {
      parts.sort((a, b) => a.sourceRange!.firstLine - b.sourceRange!.firstLine);
      const excerpt = parts.map(item => `[source lines ${item.sourceRange!.firstLine}-${item.sourceRange!.lastLine}]\n${item.excerpt}`).join("\n");
      if (Buffer.byteLength(excerpt) <= maximumBytes) return { ...candidate, excerpt,
        sourceRanges: parts.map(item => item.sourceRange!), sourceUnits: parts.flatMap(item => item.sourceUnits ?? []) };
    }
  }
  // A partial unit has weaker proof value than a complete one; bound its packet cost separately.
  return contiguousExcerpt(candidate, purpose, Math.min(maximumBytes, 2048), valid);
}

/** Each range is exact original whole lines; synthetic section labels are outside its digest. */
function contiguousExcerpt(candidate: Candidate, purpose: string, maximumBytes: number, spans: Span[], boundary?: Span): Candidate {
  const lines = sourceLines(candidate.excerpt), terms = new Set(words(purpose));
  const sizes = lines.map(line => Buffer.byteLength(line));
  const score = (value: string) => [...new Set(words(value))].filter(term => terms.has(term)).length;
  const scores = lines.map(score);
  const anchors = spans.map(span => ({ ...span, score: score(span.name) }))
    .sort((a, b) => b.score - a.score || a.start - b.start);
  if (anchors[0]?.score) scores[anchors[0].start - 1]! += terms.size + 1;
  const informative = lines.map(line => Number(Boolean(line.trim())));
  let start = boundary ? boundary.start - 1 : 0, bytes = 0, windowScore = 0, contentLines = 0;
  let bestStart = 0, bestEnd = 0, bestScore = -1, bestContentLines = -1, bestBytes = -1;
  for (let end = start; end < (boundary ? boundary.end : lines.length); end++) {
    bytes += sizes[end]!; windowScore += scores[end]!; contentLines += informative[end]!;
    while (bytes > maximumBytes && start <= end) {
      bytes -= sizes[start]!; windowScore -= scores[start]!; contentLines -= informative[start]!; start++;
    }
    if (start <= end && (windowScore > bestScore || (windowScore === bestScore &&
      (contentLines > bestContentLines || (contentLines === bestContentLines && bytes > bestBytes))))) {
      bestScore = windowScore; bestContentLines = contentLines; bestBytes = bytes; bestStart = start; bestEnd = end + 1;
    }
  }
  if (!bestEnd) return candidate;
  const excerpt = lines.slice(bestStart, bestEnd).join("");
  const intersecting = spans.filter(span => span.start <= bestEnd && span.end >= bestStart + 1)
    .sort((a, b) => Number(b.start >= bestStart + 1 && b.end <= bestEnd) - Number(a.start >= bestStart + 1 && a.end <= bestEnd));
  return { ...candidate, excerpt, sourceRange: range(lines, bestStart + 1, bestEnd),
    ...(intersecting.length ? { sourceUnits: (intersecting[0]!.members ?? [intersecting[0]!])
      .filter(item => item.start <= bestEnd && item.end >= bestStart + 1)
      .map(item => unit(item, item.start >= bestStart + 1 && item.end <= bestEnd &&
        (item.context ?? []).every(context => context.start >= bestStart + 1 && context.end <= bestEnd))) } : {}) };
}
