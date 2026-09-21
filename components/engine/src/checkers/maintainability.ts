import { extname } from "node:path";
import type { AnySchema } from "ajv";
import { ValidationSubject, type ChangeScope } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { glob } from "../planning.ts";
import { analysisPolicy } from "./analysis-policy.ts";
import { analyzeNativeSource, adapterCapabilities } from "./native-analysis.ts";
import { analyzeSource, type SourceAnalyzer } from "./source-analysis.ts";
import { sourceSizePolicy, type UnitSelection } from "./source-units.ts";
import { validateDispositions, dispositionIntegrity, type DispositionConfig } from "./quality-dispositions.ts";

const suffixes = new Set(".astro .c .cc .cjs .clj .cljc .cljs .cpp .cs .cts .cxx .dart .erl .ex .exs .fs .fsx .go .gradle .groovy .h .hpp .hrl .hxx .java .js .jsx .kt .kts .lua .m .mjs .mm .mts .php .py .rb .rs .scala .sh .sql .svelte .swift .ts .tsx .vue".split(" "));
const mapping = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export interface MaintainabilityOptions {
  policy: Record<string, unknown>; dispositions: Record<string, unknown>; dispositionSchema: AnySchema;
  prior: DispositionConfig | null; historyError: string; today: string;
  policyPath?: string; dispositionsPath?: string; managedPaths?: Set<string>; selectedPaths?: Set<string>; analyzer?: SourceAnalyzer;
}

/** Select exact after-images; pure renames govern architecture without widening function checks. */
export function maintainabilitySelections(subject: ValidationSubject, scope: ChangeScope, options: MaintainabilityOptions): UnitSelection[] {
  const maintainability = mapping(options.policy["maintainability"]), naming = mapping(options.policy["naming"]);
  const ignored = maintainability["ignore_paths"] ?? naming["ignore_paths"] ?? [];
  if (!Array.isArray(ignored) || ignored.some(value => typeof value !== "string")) throw new Error("Maintainability ignore_paths must contain strings");
  const candidates: UnitSelection[] = scope.scope === "all" ? subject.paths().map(path => ({ path, isNew: false, explicit: true, renamed: false, ranges: [] })) :
    scope.records.filter(record => record.after !== null).map(record => ({ path: record.path, isNew: record.status === "added", explicit: scope.mode === "explicit",
      renamed: record.status === "renamed", ranges: record.changed_ranges.map(range => [range.start, range.end]) }));
  return candidates.filter(selection => (!options.selectedPaths || options.selectedPaths.has(selection.path)) &&
    !(scope.mode !== "explicit" && options.managedPaths?.has(selection.path)) && suffixes.has(extname(selection.path).toLowerCase()) &&
    !ignored.some(pattern => glob(selection.path, pattern)) && subject.source(selection.path)?.file_type === "regular").sort((a, b) => a.path.localeCompare(b.path));
}

/** Join measurement and review history so a registry edit cannot erase unresolved work. */
export async function checkMaintainability(subject: ValidationSubject, scope: ChangeScope, options: MaintainabilityOptions) {
  const policyPath = options.policyPath ?? "config/policies/code-quality.yaml", dispositionsPath = options.dispositionsPath ?? "config/policies/code-quality-dispositions.yaml";
  const rawThresholds = mapping(mapping(options.policy["maintainability"])["thresholds"]);
  const thresholds: Record<string, number> = {};
  const findings: Finding[] = analysisPolicy(policyPath, options.policy);
  for (const key of ["file_lines_blocking", "type_lines_blocking", "function_lines_blocking", "cyclomatic_complexity_blocking", "cognitive_complexity_blocking", "nesting_depth_blocking"]) {
    const value = rawThresholds[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) findings.push({ rule_id: "quality.threshold-invalid", severity: "blocking", path: policyPath, symbol: key, message: "Maintainability thresholds must be positive integers." });
    else thresholds[key] = value;
  }
  const size = sourceSizePolicy(policyPath, thresholds["file_lines_blocking"] ?? 500, thresholds["type_lines_blocking"] ?? 500);
  findings.push(...size.findings);
  const validated = validateDispositions(options.dispositions, options.dispositionSchema, dispositionsPath);
  findings.push(...validated.findings);
  const coverage: Record<string, number> = Object.fromEntries([...Object.keys(adapterCapabilities), "unenriched", "engine-failed"].map(name => [name, 0]));
  const symbols = new Map<string, Set<string>>(), fingerprints = new Map<string, string>();
  const selected = maintainabilitySelections(subject, scope, options);
  for (const selection of selected) {
    if (!selection.isNew && !selection.explicit && !selection.renamed && !selection.ranges.length) continue;
    const result = await analyzeSource(selection, subject.read(selection.path), options.analyzer ?? analyzeNativeSource, thresholds, size.limit, validated.config, options.today);
    findings.push(...result.findings);
    symbols.set(selection.path, result.symbols); fingerprints.set(selection.path, result.sha256);
    for (const [adapter, count] of Object.entries(result.coverage)) coverage[adapter] = (coverage[adapter] ?? 0) + count;
  }
  findings.push(...dispositionIntegrity(validated.config, dispositionsPath, { prior: options.prior, historyError: options.historyError,
    renamed: new Map(scope.records.filter(r => r.status === "renamed" && r.previous_path).map(r => [r.previous_path!, r.path])),
    removed: new Set(scope.records.filter(r => r.status === "deleted").map(r => r.path)), symbols, sourceFingerprints: fingerprints,
    observed: new Set(findings.map(f => [f.rule_id, f["path"], f["symbol"]].map(v => String(v ?? "")).join("|"))),
    mode: scope.mode, exists: path => subject.source(path) !== null, today: options.today }));
  return { version: 1, check: "code-smell", ...findingSummary(findings), adapter_capabilities: adapterCapabilities, coverage, findings };
}
