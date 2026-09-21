import type { AnySchema } from "ajv";
import type { Finding } from "../checker-results.ts";
import { schemaErrors, isoDate } from "../schema-validation.ts";
import { safeSubjectPath } from "../change-subject.ts";
export const sourceFamilies: Readonly<Record<string, string>> = {
  ".py": "python", ".kt": "kotlin", ".kts": "kotlin", ".java": "java", ".swift": "swift", ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript", ".cs": "csharp", ".dart": "dart", ".go": "go", ".rs": "rust", ".c": "c-family", ".h": "c-family", ".cpp": "c-family", ".hpp": "c-family",
};
const mapping = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const blocker = (path: string, message: string): Finding => ({ rule_id: "SC010", path, line: 1, severity: "blocking", message });

/** Only exact current declaration-qualified waivers can suppress source findings. Integrity failures remain blocking. */
export function applyCommentWaivers(findings: Finding[], registry: Record<string, unknown>, today: string): Finding[] {
  if (!isoDate(today)) throw new Error("Invalid waiver evaluation date");
  const waivers = list(registry["waivers"]).filter(mapping);
  return findings.map(finding => {
    if (["SC001", "SC010"].includes(finding.rule_id)) return { ...finding };
    const matches = waivers.some(waiver => {
      try { safeSubjectPath(String(waiver["path"] ?? "")); } catch { return false; }
      return waiver["rule_id"] === finding.rule_id && waiver["path"] === finding["path"] &&
        !!waiver["declaration"] && waiver["declaration"] === finding["declaration"] &&
        (!waiver["adapter_id"] || waiver["adapter_id"] === finding["adapter_id"]) &&
        isoDate(String(waiver["expires"] ?? "")) && String(waiver["expires"]) >= today &&
        typeof waiver["owner"] === "string" && !!waiver["owner"].trim() && typeof waiver["rationale"] === "string" && !!waiver["rationale"].trim();
    });
    return matches ? { ...finding, severity: "waived" } : { ...finding };
  });
}
export interface CommentRegistryDocument { value: Record<string, unknown>; schema: AnySchema; path: string }
export interface CommentAdapterProof {
  versionSupported: (family: string, analyzer: string, version: unknown) => boolean;
  fixtureExists: (path: string) => boolean;
}
/** Adapter implementation and fixture availability are supplied by the packaged analyzer owner. */
export function validateCommentRegistry(policy: CommentRegistryDocument, registry: CommentRegistryDocument,
  waivers: CommentRegistryDocument, proof: CommentAdapterProof, today: string) {
  if (!isoDate(today)) throw new Error("Invalid registry evaluation date");
  const findings: Finding[] = [];
  for (const document of [policy, registry, waivers]) findings.push(...schemaErrors(document.schema, document.value).map(message => blocker(document.path, message)));
  list(waivers.value["waivers"]).forEach((value, index) => {
    if (mapping(value) && isoDate(String(value["expires"] ?? "")) && String(value["expires"]) < today)
      findings.push(blocker(waivers.path, `Source-comment waiver ${index + 1} expired on ${String(value["expires"])}.`));
  });
  const entries = list(registry.value["adapters"]).filter(mapping).filter(entry => typeof entry["language"] === "string" && entry["language"]);
  const adapters = new Map(entries.map(entry => [String(entry["language"]), entry]));
  if (adapters.size !== entries.length) findings.push(blocker(registry.path, "Adapter registry contains duplicate language entries."));
  for (const family of [...new Set(Object.values(sourceFamilies))].sort()) if (!adapters.has(family)) findings.push(blocker(registry.path, `Adapter registry is missing managed language '${family}'.`));
  for (const [family, adapter] of [...adapters].sort(([a], [b]) => a.localeCompare(b))) {
    const cases = list(adapter["fixture_cases"]).filter(mapping);
    if (adapter["status"] === "active" && (!adapter["analyzer"] || adapter["analyzer"] === "none" || !list(adapter["capabilities"]).length ||
        !cases.length || cases.some(item => typeof item["path"] !== "string" || !proof.fixtureExists(item["path"])) ||
        !proof.versionSupported(family, String(adapter["analyzer"]), adapter["analyzer_version"])))
      findings.push(blocker(registry.path, `Active adapter '${family}' lacks analyzer, capability, or fixture evidence.`));
    const expected = Object.keys(sourceFamilies).filter(suffix => sourceFamilies[suffix] === family), extensions = new Set(list(adapter["extensions"]));
    if (extensions.size !== expected.length || expected.some(suffix => !extensions.has(suffix))) findings.push(blocker(registry.path, `Adapter '${family}' extensions disagree with the managed source-family registry.`));
  }
  const active = new Set([...adapters].filter(([, entry]) => entry["status"] === "active").map(([family]) => family));
  const declared = new Set(list(policy.value["active_adapters"]));
  if (active.size !== declared.size || [...active].some(family => !declared.has(family))) findings.push(blocker(policy.path, "Active adapter policy and adapter registry disagree."));
  return { findings, adapters };
}
