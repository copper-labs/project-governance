import { createHash } from "node:crypto";
import type { Finding } from "../checker-results.ts";
import type { DispositionConfig } from "./quality-dispositions.ts";
import { sourceUnitFindings, type StructuralAnalysis, type UnitSelection } from "./source-units.ts";
import { SourceSyntaxError } from "./typescript-analysis.ts";

export interface NativeAnalysis extends StructuralAnalysis { adapter: string }
export type SourceAnalyzer = (path: string, source: string) => NativeAnalysis | null | Promise<NativeAnalysis | null>;
export interface SourceAnalysisResult { findings: Finding[]; symbols: Set<string>; coverage: Record<string, number>; sha256: string }

/** Preserve exact-byte identity while matching the existing replacement-decoding and physical line policy. */
export async function analyzeSource(selection: UnitSelection, bytes: Uint8Array, analyzer: SourceAnalyzer,
  thresholds: Record<string, number>, sourceLimit: number, config: DispositionConfig, today: string): Promise<SourceAnalysisResult> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const source = Buffer.from(bytes).toString("utf8");
  const coverage: Record<string, number> = {};
  let parsed: NativeAnalysis | null;
  try {
    parsed = await analyzer(selection.path, source);
  } catch (error) {
    const syntax = error instanceof SourceSyntaxError;
    if (!syntax) coverage["engine-failed"] = 1;
    // Native diagnostic text can contain source literals. Keep it out of shared findings.
    const findings: Finding[] = [{ rule_id: syntax ? "quality.parse-failed" : "quality.engine-failed",
      path: selection.path, line: syntax ? error.line : 1, symbol: "<file>", actual: syntax ? 0 : 1,
      threshold: 0, severity: "blocking", message: syntax ? "Maintainability adapter could not parse this file." : "Structural analysis infrastructure failed." }];
    return { findings, symbols: new Set(), coverage, sha256 };
  }
  coverage[parsed?.adapter ?? "unenriched"] = 1;
  const lines = source.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u);
  if (lines.at(-1) === "") lines.pop();
  return { findings: sourceUnitFindings(selection, parsed, lines.length, sourceLimit, thresholds, sha256, config, today),
    symbols: new Set(["<file>", ...(parsed?.extents.map(extent => extent.name) ?? [])]), coverage, sha256 };
}
