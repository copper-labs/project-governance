import type { AnySchema } from "ajv";
import { posix } from "node:path";
import { schemaErrors, isoDate } from "../schema-validation.ts";
import { safeSubjectPath } from "../change-subject.ts";
import type { Finding } from "../checker-results.ts";

export type Disposition = Record<string, unknown>;
export interface DispositionConfig { version: number; owner: string; dispositions: Disposition[] }
const key = (item: Disposition) => [item["finding"], item["path"], item["symbol"]].map(v => String(v ?? "")).join("|");
const nonempty = (item: Disposition, fields: string[]) => fields.every(field => String(item[field] ?? "").trim());
const blocker = (rule_id: string, path: string, symbol: string, actual: number, message: string): Finding => ({ rule_id, path, line: 1, symbol, actual, threshold: 0, severity: "blocking", message });

/** Stable review decisions survive ordinary edits; temporary exceptions remain byte- and metric-exact. */
export function dispositionFor(rule: string, path: string, symbol: string, actual: number, sha: string, config: DispositionConfig, today: string): [boolean, string] {
  const item = config.dispositions.find(v => v["finding"] === rule && v["path"] === path && v["symbol"] === symbol);
  if (!item) return [false, "architectural review is required"];
  if (item["disposition"] === "cohesion-accepted") return [true, "cohesion and readability accepted after explicit review"];
  if (item["disposition"] === "waiver-resolved") return [false, "a prior waiver resolution does not authorize a current finding"];
  if (item["disposition"] === "refactor-required") return [false, "the recorded disposition requires refactoring"];
  if (item["disposition"] !== "temporary-waiver") return [false, "the matching disposition has an unknown value"];
  const expires = String(item["expires"] ?? "");
  if (!isoDate(expires)) return [false, "temporary waiver has no valid expiry date"];
  if (item["current_value"] !== actual || item["source_fingerprint"] !== `sha256:${sha}`) return [false, "temporary waiver is stale because the governed source changed"];
  if (String(item["remediation_plan"] ?? "").trim().length < 40) return [false, "temporary waiver has no meaningful remediation plan"];
  return expires >= today ? [true, "temporary waiver is active"] : [false, "temporary waiver expired"];
}

export function validateDispositions(raw: Record<string, unknown>, schema: AnySchema, path: string): { config: DispositionConfig; findings: Finding[] } {
  const records = Array.isArray(raw["dispositions"]) ? raw["dispositions"].filter(v => v && typeof v === "object" && !Array.isArray(v)) as Disposition[] : [];
  const empty = { version: 2, owner: "invalid", dispositions: [] };
  if (raw["version"] === 1) {
    const keys = records.map(v => ["finding", "path", "symbol", "disposition"].map(k => String(v[k] ?? "?")).join("|")).sort();
    return { config: { ...empty, owner: "migration-required" }, findings: [blocker("quality.disposition-migration-required", path, "version-1", keys.length,
      `Version-1 dispositions cannot authorize a pass; migrate exact records: ${keys.join(", ") || "<none>"}`)] };
  }
  const findings = schemaErrors(schema, raw).map(message => blocker("quality.disposition-schema", path, posix.basename(path), 0, `${path}${message}`));
  const keys = new Map<string, number>(), invalid = new Set<string>();
  for (const record of records) {
    if (![record["finding"], record["path"], record["symbol"]].every(v => typeof v === "string")) continue;
    const path = String(record["path"]);
    try { safeSubjectPath(path); } catch { invalid.add(path); }
    const identity = key(record); keys.set(identity, (keys.get(identity) ?? 0) + 1);
  }
  const details = [...[...keys].filter(([, count]) => count > 1).map(([key]) => `duplicate:${key}`).sort(), ...[...invalid].sort().map(path => `nonnormalized:${path}`)];
  if (details.length) findings.push(blocker("quality.disposition-identity", path, "stable-keys", details.length, `Disposition keys must be unique normalized repository identities: ${details.join(", ")}`));
  // A malformed registry cannot grant acceptance while its blocking diagnostics are reported.
  return { config: findings.length ? empty : raw as unknown as DispositionConfig, findings };
}

function active(config: DispositionConfig, today: string): Disposition[] {
  return config.dispositions.filter(item => item["disposition"] === "refactor-required" ||
    (item["disposition"] === "temporary-waiver" && (!isoDate(String(item["expires"] ?? "")) || String(item["expires"]) >= today)));
}
function validTransition(old: Disposition, current: Disposition): boolean {
  const next = current["disposition"];
  if (old["disposition"] === "temporary-waiver") {
    if (next === "temporary-waiver" && current["current_value"] === (old["current_value"] ?? old["current_lines"]) &&
        ["source_fingerprint", "supersedes_source_fingerprint", "expires", "remediation_plan"].every(field => current[field] === old[field])) return true;
    const reviewed = String(current["approved_on"] ?? ""), prior = String(old["approved_on"] ?? "");
    if (!isoDate(reviewed) || !isoDate(prior)) return false;
    const replacement = current["supersedes_source_fingerprint"] === old["source_fingerprint"] && current["responsibility"] === old["responsibility"] && reviewed >= prior && nonempty(current, ["reviewer", "approved_on", "rationale"]);
    return Boolean(replacement && (next === "waiver-resolved" || (next === "temporary-waiver" && current["source_fingerprint"] !== old["source_fingerprint"] && nonempty(current, ["expires", "remediation_plan"]))));
  }
  if (old["disposition"] !== "refactor-required") return true;
  const sameResponsibility = !old["responsibility"] || current["responsibility"] === old["responsibility"];
  return Boolean(sameResponsibility && (next === "refactor-required" || (next === "cohesion-accepted" && nonempty(current, ["reviewer", "approved_on", "rationale"]))));
}

export interface DispositionEvidence {
  prior: DispositionConfig | null; historyError: string; renamed: Map<string, string>; removed: Set<string>;
  symbols: Map<string, Set<string>>; sourceFingerprints: Map<string, string>; observed: Set<string>;
  mode: string; exists: (path: string) => boolean; today: string;
}

/** Renames or registry edits cannot silently discard an active refactoring decision or waiver. */
export function dispositionIntegrity(config: DispositionConfig, path: string, evidence: DispositionEvidence): Finding[] {
  const findings: Finding[] = [], invalid: string[] = [];
  if (evidence.historyError) findings.push(blocker("quality.disposition-history-unreadable", path, "before-image", 1, `Cannot validate the previous disposition registry: ${evidence.historyError}`));
  else if (evidence.prior) for (const old of active(evidence.prior, evidence.today)) {
    const expectedPath = evidence.renamed.get(String(old["path"])) ?? old["path"], responsibility = String(old["responsibility"] ?? "");
    const candidates = config.dispositions.filter(item => item["finding"] === old["finding"] &&
      ((item["path"] === expectedPath && item["symbol"] === old["symbol"]) || (responsibility && item["responsibility"] === responsibility)));
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    const needsSource = candidate && (candidate["disposition"] === "waiver-resolved" || (candidate["disposition"] === "temporary-waiver" && candidate["source_fingerprint"] !== old["source_fingerprint"]));
    if (!candidate || !validTransition(old, candidate) || (needsSource && !evidence.sourceFingerprints.has(String(candidate["path"]))) ||
        (candidate["disposition"] === "waiver-resolved" && evidence.observed.has(key(candidate)))) invalid.push(key(old));
  }
  if (invalid.length) findings.push(blocker("quality.disposition-transition-required", path, "before-to-after", invalid.length, `Preserve or explicitly resolve prior active decisions: ${invalid.sort().join(", ")}`));
  const orphaned: string[] = [], unresolved: string[] = [], waivers: string[] = [];
  for (const item of active(config, evidence.today)) {
    const source = String(item["path"] ?? ""), symbol = String(item["symbol"] ?? ""), identity = key(item);
    if (evidence.removed.has(source) || (evidence.mode === "all" && !evidence.exists(source)) || (evidence.symbols.has(source) && !evidence.symbols.get(source)!.has(symbol))) { orphaned.push(identity); continue; }
    if (item["disposition"] === "refactor-required" && evidence.symbols.has(source) && !evidence.observed.has(identity)) unresolved.push(identity);
    if (item["disposition"] === "temporary-waiver" && evidence.sourceFingerprints.has(source) && !evidence.observed.has(identity)) waivers.push(identity);
  }
  for (const [items, rule, symbol, message] of [[orphaned, "quality.disposition-relocation-required", "relocation", "Move or supersede active disposition records"],
    [unresolved, "quality.refactor-required", "active-records", "Reviewed responsibility findings remain unresolved"],
    [waivers, "quality.temporary-waiver-invalid", "active-records", "Temporary waivers changed, expired, or no longer match a finding"]] as const) {
    if (items.length) findings.push(blocker(rule, path, symbol, items.length, `${message}: ${items.sort().join(", ")}`));
  }
  return findings;
}
