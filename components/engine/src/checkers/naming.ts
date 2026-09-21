import { posix } from "node:path";
import { glob } from "../planning.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { object } from "../core.ts";
import { safeSubjectPath } from "../change-subject.ts";

const SOURCE_SUFFIXES = new Set([".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".js", ".jsx", ".kt", ".kts", ".m", ".mm", ".php", ".py", ".rb", ".rs", ".scala", ".swift", ".ts", ".tsx"]);
const WAIVABLE = new Set(["naming.adjacent-duplicate", "naming.file-name-blocking-length", "naming.file-name-preferred-length", "naming.forbidden-term", "naming.package-repetition", "naming.vague-role"]);
const WAIVERS = "config/policies/code-quality-waivers.yaml";
const words = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").split(/[^A-Za-z0-9]+/).filter(Boolean).map(v => v.toLowerCase());
function list(value: unknown, fallback: string[] = []): string[] {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) throw new Error("naming policy list must be an array");
  return value.map(String);
}
function stem(path: string): string { const name = posix.basename(path), suffix = posix.extname(name); return suffix ? name.slice(0, -suffix.length) : name; }
function naming(policy: Record<string, unknown>): Record<string, unknown> {
  const value = policy["naming"];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** New or renamed names block; unchanged naming debt remains advisory under the existing ratchet. */
export function namingFindings(path: string, isNew: boolean, policy: Record<string, unknown>): Finding[] {
  safeSubjectPath(path);
  if (!SOURCE_SUFFIXES.has(posix.extname(path).toLowerCase())) return [];
  const rules = naming(policy);
  if (list(rules["ignore_paths"]).some(pattern => glob(path, pattern))) return [];
  const name = stem(path), tokens = words(name), findings: Finding[] = [];
  const add = (rule: string, message: string, blocking = true) => findings.push({ rule_id: `naming.${rule}`, path, name,
    severity: blocking && isNew ? "blocking" : "advisory", classification: isNew ? "new-or-renamed" : "existing-debt", message });
  const forbidden = [...new Set(list(rules["forbidden_terms"]).map(v => v.toLowerCase()))].filter(v => tokens.includes(v)).sort();
  if (forbidden.length) add("forbidden-term", `contains forbidden term(s): ${forbidden.join(", ")}`);
  if (tokens.some((v, i) => i > 0 && v === tokens[i - 1])) add("adjacent-duplicate", "contains adjacent duplicate words");
  const last = tokens.at(-1);
  if (last && list(rules["vague_terms"]).map(v => v.toLowerCase()).includes(last)) add("vague-role", `ends in vague role term '${last}'`);
  const parts = path.split("/"), roots = list(rules["package_roots"], ["packages", "services"]);
  let packageWords: string[] = [];
  for (let i = 0; i < parts.length - 2; i++) if (roots.includes(parts[i]!)) { packageWords = words(parts[i + 1]!); break; }
  const conventional = list(rules["conventional_stems"]).map(v => v.toLowerCase());
  if (packageWords.length && !["index", "main", "app"].includes(tokens.join(" ")) && !conventional.includes(name.toLowerCase()) && packageWords.every((v, i) => tokens[i] === v)) add("package-repetition", "repeats the containing package name");
  const preferred = Number(rules["preferred_file_name_length"] ?? 48), blocking = Number(rules["blocking_file_name_length"] ?? 72), length = [...name].length;
  if (!Number.isInteger(preferred) || !Number.isInteger(blocking)) throw new Error("naming length limits must be integers");
  if (length > blocking) add("file-name-blocking-length", `file stem length ${length} exceeds blocking limit ${blocking}`);
  else if (length > preferred) add("file-name-preferred-length", `file stem length ${length} exceeds preferred limit ${preferred}`, false);
  return findings;
}

/** Waivers are exact, attributable and time-bounded; invalid policy never silently removes findings. */
export function checkNaming(candidates: Array<{ path: string; isNewOrRenamed: boolean }>, policy: Record<string, unknown>, waiverData: Record<string, unknown>, today: string) {
  try {
    const findings: Finding[] = [], valid: Array<Record<string, unknown>> = [];
    const waivers = waiverData["waivers"] ?? [];
    if (!Array.isArray(waivers)) throw new Error("waivers must be a list");
    for (const [index, raw] of waivers.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) { findings.push({ rule_id: "naming.waiver-invalid", path: WAIVERS, name: String(index + 1), severity: "blocking", message: "waiver must be a mapping" }); continue; }
      const waiver = object(raw), rule = String(waiver["rule_id"] ?? "").trim(), path = String(waiver["path"] ?? "").trim(), expiry = String(waiver["expires"] ?? "");
      let exact = false;
      try { exact = safeSubjectPath(path) === path && !/[\\*?\[]/.test(path); } catch { /* Broad and unsafe paths cannot grant exemptions. */ }
      const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) && Number.isFinite(Date.parse(expiry)) && new Date(expiry).toISOString().slice(0, 10) === expiry;
      if (["rule_id", "path", "owner", "expires", "rationale"].some(key => !String(waiver[key] ?? "").trim()) || !expiryDate || String(waiver["rationale"]).trim().length < 20 || !WAIVABLE.has(rule) || !exact) {
        findings.push({ rule_id: "naming.waiver-invalid", path: WAIVERS, name: String(index + 1), severity: "blocking", message: "waiver requires an exact waivable rule_id, an exact normalized repo-relative file path, owner, ISO expiry, and specific rationale" }); continue;
      }
      if (expiry < today) { findings.push({ rule_id: "naming.waiver-expired", path, name: String(waiver["name"] ?? "*"), severity: "blocking", message: `waiver expired on ${expiry}` }); continue; }
      valid.push({ ...waiver, rule_id: rule, path });
    }
    for (const candidate of candidates) findings.push(...namingFindings(candidate.path, candidate.isNewOrRenamed, policy));
    for (const finding of findings) if (!finding.rule_id.startsWith("naming.waiver-") && valid.some(waiver => waiver["rule_id"] === finding.rule_id && waiver["path"] === finding["path"] && (!waiver["name"] || waiver["name"] === finding["name"]))) {
      finding["waived"] = true; finding.severity = "waived";
    }
    findings.sort((a, b) => {
      for (const field of ["path", "rule_id", "name"]) { const left = String(a[field]), right = String(b[field]); if (left !== right) return left < right ? -1 : 1; }
      return 0;
    });
    return { version: 1, kind: "governance-check-result", ...findingSummary(findings), findings };
  } catch (error) {
    return { version: 1, kind: "governance-check-result", status: "failed", finding_count: 1, findings: [{ rule_id: "naming.policy-invalid", severity: "blocking" as const, message: error instanceof Error ? error.message : String(error) }] };
  }
}
