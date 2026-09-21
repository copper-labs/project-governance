import { ValidationSubject, type ChangeScope } from "./change-subject.ts";
import { findingSummary, type Finding } from "./checker-results.ts";
import { documentationConfig, documentationCatalog, documentationCatalogIssues } from "./checkers/document-catalog.ts";
import { documentLinkIssues } from "./checkers/document-links.ts";

/** Exact catalog lookup avoids speculative routing and unnecessary document reads. */
export function routeDocumentation(subject: ValidationSubject, query: { capability: string } | { symbol: string }) {
  const kind = "capability" in query ? "capability" : "symbol";
  const value = "capability" in query ? query.capability : query.symbol;
  const envelope = { kind: "project-governance-documentation-route", version: 1, query_kind: kind };
  try {
    const config = documentationConfig(subject);
    if (!config) return { ...envelope, status: "disabled", match_count: 0 };
    const configured = { ...envelope, research: config.research };
    if (!config.enabled) return { ...configured, status: "disabled", match_count: 0 };
    const records = documentationCatalog(subject, config, false);
    const matches = records.filter(record => kind === "capability" ? record.id === value || record.aliases.includes(value) : record.symbols.includes(value));
    if (!matches.length) return { ...configured, status: "not-found", match_count: 0 };
    if (matches.length > 1) return { ...configured, status: "ambiguous", match_count: matches.length };
    const record = matches[0]!;
    return { ...configured, status: "matched", match_count: 1, capability: record, context_paths: [...new Set([record.reference, ...record.guides, ...record.sources])] };
  } catch { return { ...envelope, status: "invalid", match_count: 0, error: "Documentation configuration or catalog is invalid or unavailable." }; }
}
export function checkDocumentation(subject: ValidationSubject, scope: ChangeScope) {
  const issues = [...documentLinkIssues(subject, scope), ...documentationCatalogIssues(subject)].sort();
  const findings: Finding[] = issues.map(message => ({ rule_id: "documentation.governance", severity: "blocking", message }));
  return { version: 1, kind: "governance-check-result", ...findingSummary(findings), findings };
}
