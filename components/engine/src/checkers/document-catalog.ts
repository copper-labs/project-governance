import { parse } from "yaml";
import { ValidationSubject, safeSubjectPath } from "../change-subject.ts";
import { objectValue } from "./dependency-manifests.ts";
export interface DocumentationConfig { enabled: boolean; root: string; research: "allowed" | "disabled" }
export interface DocumentationCapability extends Record<string, unknown> { id: string; title: string; reference: string; aliases: string[]; tasks: string[]; symbols: string[]; guides: string[]; sources: string[] }
function mapping(subject: ValidationSubject, path: string): Record<string, unknown> {
  const value: unknown = parse(new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path, 4 * 1024 * 1024))) ?? {};
  if (!objectValue(value)) throw new Error(`${path}: expected a YAML mapping`);
  return value;
}
export function documentationConfig(subject: ValidationSubject): DocumentationConfig | null {
  const path = "config/governance/profile.yaml";
  if (!subject.source(path)) return null;
  const value = mapping(subject, path)["documentation"]; if (value === undefined || value === null) return null;
  if (!objectValue(value)) throw new Error("Profile documentation must be a mapping");
  const enabled = value["enabled"] ?? true, root = value["root"] ?? "docs/developer", research = value["research"] ?? "allowed";
  if (typeof enabled !== "boolean" || typeof root !== "string" || !["allowed", "disabled"].includes(String(research))) throw new Error("Invalid documentation profile configuration");
  safeSubjectPath(root); if (root === ".") throw new Error("Documentation root must not be the repository root");
  return { enabled, root, research: research as "allowed" | "disabled" };
}
export function documentationCatalog(subject: ValidationSubject, config: DocumentationConfig, validatePaths = true): DocumentationCapability[] {
  const path = `${config.root}/catalog.yaml`, value = mapping(subject, path);
  if (value["version"] !== 1 || !Array.isArray(value["capabilities"])) throw new Error(`${path}: expected version 1 and a capabilities list`);
  return value["capabilities"].map((record: unknown, index: number) => {
    const label = `${path}: capabilities[${index}]`;
    if (!objectValue(record)) throw new Error(`${label}: expected a mapping`);
    const normalized = { ...record } as DocumentationCapability;
    for (const field of ["id", "title", "reference"] as const) {
      if (typeof record[field] !== "string" || !record[field].trim()) throw new Error(`${label}.${field}: expected a nonempty string`);
      normalized[field] = record[field].trim();
    }
    for (const field of ["aliases", "tasks", "symbols", "guides", "sources"] as const) {
      const values = record[field] ?? [];
      if (!Array.isArray(values) || values.some(item => typeof item !== "string" || !item.trim())) throw new Error(`${label}.${field}: expected a string list`);
      normalized[field] = values.map(item => (item as string).trim());
    }
    for (const target of [normalized.reference, ...normalized.guides, ...normalized.sources]) {
      safeSubjectPath(target);
      if (validatePaths && subject.source(target)?.file_type !== "regular") throw new Error(`${label}: target is missing or not a regular file: ${target}`);
    }
    return normalized;
  });
}
export function documentationCatalogIssues(subject: ValidationSubject): string[] {
  const issues: string[] = [];
  try {
    const config = documentationConfig(subject); if (!config?.enabled) return [];
    if (subject.source(`${config.root}/index.md`)?.file_type !== "regular") issues.push(`${config.root}/index.md: human entry point is missing`);
    const records = documentationCatalog(subject, config), routes = new Map<string, string>(), symbols = new Map<string, string>();
    for (const record of records) for (const [kind, keys, owners] of [["capability", [record.id, ...record.aliases], routes], ["symbol", record.symbols, symbols]] as const) {
      for (const key of keys) {
        if (owners.has(key)) issues.push(`Documentation catalog: exact ${kind} route ${key} is owned by both ${owners.get(key)} and ${record.id}`);
        else owners.set(key, record.id);
      }
    }
  } catch { issues.push("Documentation profile or catalog is invalid, unreadable, or references unavailable captured files."); }
  return [...new Set(issues)].sort();
}
