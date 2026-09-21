import type { Finding } from "../checker-results.ts";
import { dispositionFor, type DispositionConfig } from "./quality-dispositions.ts";

export type Interval = readonly [number, number];
export interface SourceExtent { kind: "type" | "function"; name: string; start: number; end: number }
export interface UnitSelection { path: string; isNew: boolean; explicit: boolean; renamed: boolean; ranges: Interval[] }
export interface StructuralAnalysis { extents: SourceExtent[]; metrics: Map<string, readonly [number, number, number]>; capabilities: Set<string> }
const metricKey = (name: string, start: number) => JSON.stringify([name, start]);
export { metricKey };

/** Subtract nested declarations so enclosing units do not inherit their line counts or touched status. */
export function exclusiveSegments(start: number, end: number, excluded: Interval[]): Interval[] {
  const merged: Array<[number, number]> = [];
  for (const [left, right] of [...excluded].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const prior = merged.at(-1);
    if (!prior || left > prior[1] + 1) merged.push([left, right]);
    else prior[1] = Math.max(prior[1], right);
  }
  let cursor = start; const segments: Interval[] = [];
  for (const [left, right] of merged) {
    if (right < cursor || left > end) continue;
    if (left > cursor) segments.push([cursor, Math.min(left - 1, end)]);
    cursor = Math.max(cursor, right + 1);
  }
  if (cursor <= end) segments.push([cursor, end]);
  return segments;
}
function direct(selection: UnitSelection, segments: Interval[], architecture = false): boolean {
  return ((selection.isNew || selection.explicit || (architecture && selection.renamed)) && segments.length > 0) ||
    segments.some(([left, right]) => selection.ranges.some(([start, end]) => left <= end && start <= right));
}
const size = (segments: Interval[]) => segments.reduce((total, [left, right]) => total + right - left + 1, 0);

/** Preserve the shared file/type review point; policy may trigger review earlier, never later than 500 lines. */
export function sourceSizePolicy(path: string, file: number, type: number) {
  const findings: Finding[] = [];
  const add = (symbol: string, actual: number, threshold: number, message: string) => findings.push({ rule_id: "quality.source-size-policy", path, line: 1, symbol, actual, threshold, severity: "blocking", message });
  for (const [name, value] of [["file_lines_blocking", file], ["type_lines_blocking", type]] as const) if (!Number.isInteger(value) || value <= 0) add(name, value, 1, "Source-size thresholds must be positive integers.");
  if (file !== type) add("file/type blocking thresholds", file, type, "Parser-free files and parser-recognized architectural units use one line limit.");
  if (Math.max(file, type) > 500) add("shared source-size review trigger", Math.max(file, type), 500, "The shared review trigger may run earlier but cannot run later than 500 lines.");
  return { limit: Number.isFinite(file) && Number.isFinite(type) ? Math.max(1, Math.min(file, type, 500)) : 500, findings };
}

/** Only direct architectural units and adapter-supported function metrics can produce review obligations. */
export function sourceUnitFindings(selection: UnitSelection, analysis: StructuralAnalysis | null, lineCount: number,
  sourceLimit: number, thresholds: Record<string, number>, sha: string, config: DispositionConfig, today: string): Finding[] {
  const extents = analysis?.extents ?? [], types = extents.filter(e => e.kind === "type"), findings: Finding[] = [];
  const add = (rule: string, line: number, symbol: string, actual: number, threshold: number, message: string) => {
    const [accepted, reason] = dispositionFor(rule, selection.path, symbol, actual, sha, config, today);
    findings.push({ rule_id: rule, path: selection.path, line, symbol, actual, threshold, severity: accepted ? "accepted" : "blocking", message: `${message} ${reason}` });
  };
  const topFunctions = extents.filter(e => e.kind === "function" && !types.some(t => t.start <= e.start && e.end <= t.end));
  const fileSegments = exclusiveSegments(1, Math.max(lineCount, 1), [...types, ...topFunctions].map(e => [e.start, e.end]));
  const fileSize = extents.length ? size(fileSegments) : lineCount;
  if (fileSize > sourceLimit && direct(selection, fileSegments, true)) add("quality.large-file", 1, "<file>", fileSize, sourceLimit, "File-level or parser-free code exceeds the architectural review trigger.");
  for (const extent of types) {
    const segments = exclusiveSegments(extent.start, extent.end, types.filter(t => extent.start <= t.start && t.end <= extent.end && (extent.start !== t.start || extent.end !== t.end)).map(t => [t.start, t.end]));
    const actual = size(segments);
    if (actual > sourceLimit && direct(selection, segments, true)) add("quality.large-type", extent.start, extent.name, actual, sourceLimit, "Changed type exceeds the architectural review trigger.");
  }
  for (const extent of extents.filter(e => e.kind === "function")) {
    if (!direct(selection, [[extent.start, extent.end]])) continue;
    const actual = extent.end - extent.start + 1, limit = thresholds["function_lines_blocking"] ?? 100;
    if (actual > limit) add("quality.large-function", extent.start, extent.name, actual, limit, "Changed function exceeds the readable length trigger.");
    const [cyclomatic, cognitive, nesting] = analysis?.metrics.get(metricKey(extent.name, extent.start)) ?? [1, 0, 0];
    const metrics = [
      ["cyclomatic-complexity", "quality.high-cyclomatic", cyclomatic, thresholds["cyclomatic_complexity_blocking"] ?? 15, "Function has too many independent decision paths; simplify or split by responsibility."],
      ["cognitive-complexity", "quality.high-cognitive", cognitive, thresholds["cognitive_complexity_blocking"] ?? 25, "Function control flow is difficult to follow in one reading."],
      ["nesting-depth", "quality.deep-nesting", nesting, thresholds["nesting_depth_blocking"] ?? 5, "Function nesting exceeds the readable control-flow limit."],
    ] as const;
    for (const [capability, rule, value, threshold, message] of metrics) if (analysis?.capabilities.has(capability) && value > threshold) add(rule, extent.start, extent.name, value, threshold, message);
  }
  return findings;
}
