import type { Finding } from "../checker-results.ts";
import { adapterCapabilities } from "./native-analysis.ts";

/** Configuration cannot remove the parser-free fallback or advertise unshipped analyzers. */
export function analysisPolicy(path: string, policy: unknown): Finding[] {
  const record = policy && typeof policy === "object" && !Array.isArray(policy) ? policy as Record<string, unknown> : {};
  const raw = record["maintainability"];
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const findings: Finding[] = [];
  const add = (symbol: string, actual: number, threshold: number, message: string) => findings.push({
    rule_id: "quality.analysis-policy", path, line: 1, symbol, actual, threshold, severity: "blocking", message,
  });
  const neutral = config["language_neutral_checks"];
  if (!Array.isArray(neutral) || !neutral.includes("physical-file-size")) add("language_neutral_checks", 0, 1,
    "Maintainability policy must retain physical-file-size as the parser-free fallback.");
  const active = config["active_adapters"], shipped = Object.keys(adapterCapabilities);
  if (!Array.isArray(active) || active.some(value => typeof value !== "string") || new Set(active).size !== active.length ||
      active.length !== shipped.length || shipped.some(name => !active.includes(name))) add("active_adapters", Array.isArray(active) ? active.length : 0, shipped.length,
    "Policy active_adapters must exactly match the analyzers shipped by this checker.");
  if (config["declaration_enrichment"] !== "optional-native") add("declaration_enrichment", 0, 1,
    "Declaration enrichment must remain optional and use registered native parsers.");
  return findings;
}
