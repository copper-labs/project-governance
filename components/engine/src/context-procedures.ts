import { digest } from "./core.ts";
import { markdownSections } from "./context-source-facts.ts";
import type { Candidate } from "./decisions.ts";
import { contextExcerpt, type Span } from "./context-excerpts.ts";

/** Partition procedure bodies; child headings belong to their complete parent section. */
export function procedureUnits(candidate: Candidate) {
  const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const headings = markdownSections(candidate.excerpt);
  const roots = headings.filter(span => span.level === 1);
  const sections = roots.length === 1 && headings.some(span => span.level === 2)
    ? headings.filter(span => span.level === 2) : roots.length ? roots : headings.filter(span => span.level === Math.min(...headings.map(item => item.level!)));
  const units = sections.map(span => ({ ...span, end: Math.min(span.end, lines.length) }));
  const first = units[0];
  if (!first) return candidate.excerpt.trim() ? [{ kind: "procedure", name: "Document", start: 1, end: lines.length, ancestry: [] }] : [];
  if (first.start > 1 && lines.slice(0, first.start - 1).join("").trim())
    units.unshift({ kind: "heading", name: "Document introduction", signature: "", start: 1, end: first.start - 1, ancestry: [] });
  return units;
}

/** Preserve exact original ranges; framing names source context without inventing instructions. */
export function procedureExcerpt(candidate: Candidate, spans: Span[], maximumBytes: number): Candidate | null {
  const lines = candidate.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const units = procedureUnits(candidate);
  if (!spans.length || spans.some(span => !units.some(unit => unit.start === span.start && unit.end === span.end && unit.name === span.name))) return null;
  const selected = units.filter(unit => spans.some(span => unit.start === span.start && unit.end === span.end));
  // The document prelude may state prerequisites applying to every section.
  const introduction = units.find(unit => unit.name === "Document introduction");
  if (introduction && !selected.includes(introduction)) selected.unshift(introduction);
  const ranges = selected.map(span => ({ firstLine: span.start, lastLine: span.end, totalLines: lines.length,
    excerptDigest: digest(lines.slice(span.start - 1, span.end).join("")), complete: false as const }));
  const excerpt = selected.map((span, index) => `${selected.length > 1 ? `[source lines ${span.start}-${span.end}]\n` : ""}${lines.slice(span.start - 1, span.end).join("")}`).join("\n");
  if (!selected.length || Buffer.byteLength(excerpt) > maximumBytes) return null;
  return { ...candidate, excerpt, ...(ranges.length === 1 ? { sourceRange: ranges[0]! } : { sourceRanges: ranges }),
    sourceUnits: selected.map(span => ({ kind: span.name === "Document introduction" ? "heading" : "procedure", name: span.name, firstLine: span.start, lastLine: span.end, complete: true })) };
}

/** Keep the strongest answered section. A smaller substitute is not equivalent evidence. */
export function procedureAdvisoryExcerpt(candidate: Candidate, purpose: string, spans: Span[], maximumBytes: number): Candidate | null {
  const first = spans[0];
  if (!first || !procedureUnits(candidate).some(unit => unit.start === first.start && unit.end === first.end && unit.name === first.name)) return null;
  let chosen = [first], excerpt = procedureExcerpt(candidate, chosen, maximumBytes);
  if (!excerpt) {
    const partial = contextExcerpt(candidate, purpose, maximumBytes, procedureUnits(candidate), [first]);
    if (Buffer.byteLength(partial.excerpt) > maximumBytes) return null;
    return { ...partial, sourceUnits: (partial.sourceUnits ?? []).map(unit => ({ ...unit, kind: unit.name === "Document introduction" ? "heading" : "procedure", complete: false })) };
  }
  for (const span of spans.slice(1)) {
    const trial = procedureExcerpt(candidate, [...chosen, span], maximumBytes);
    if (trial) { chosen.push(span); excerpt = trial; }
    else {
      const previous = excerpt.sourceRanges ?? (excerpt.sourceRange ? [excerpt.sourceRange] : []);
      if (!previous.length) continue;
      const body = previous.length === 1 ? `[source lines ${previous[0]!.firstLine}-${previous[0]!.lastLine}]\n${excerpt.excerpt}` : excerpt.excerpt;
      const available = maximumBytes - Buffer.byteLength(body) - 1 - Buffer.byteLength(`[source lines ${span.start}-${span.end}]\n`);
      if (available < 128) continue;
      const partial = contextExcerpt(candidate, purpose, available, procedureUnits(candidate), [span]);
      const range = partial.sourceRange;
      if (!range) continue;
      const combined = `${body}\n[source lines ${range.firstLine}-${range.lastLine}]\n${partial.excerpt}`;
      if (Buffer.byteLength(combined) > maximumBytes) continue;
      const { sourceRange: _range, sourceRanges: _ranges, ...original } = excerpt;
      // Keep the strongest complete section and its prelude; a useful later section may be partial.
      excerpt = { ...original, excerpt: combined, sourceRanges: [...previous, range],
        sourceUnits: [...(excerpt.sourceUnits ?? []), ...(partial.sourceUnits ?? []).map(unit => ({ ...unit,
          kind: unit.name === "Document introduction" ? "heading" : "procedure" }))] };
      // Further whole-section rebuilding could erase this already delivered partial range.
      break;
    }
  }
  return excerpt;
}
