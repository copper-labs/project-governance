import { parse } from "yaml";
import { isoDate } from "../schema-validation.ts";
import { objectValue } from "./dependency-manifests.ts";
const required = ["id", "title", "status", "owner", "created", "updated", "summary"];
const statuses = new Set(["active", "approved", "archived", "completed", "current", "deferred", "draft", "superseded"]);
/** Validate authored document identity and lifecycle independently of filesystem traversal. */
export function documentMetadata(path: string, source: string, seen: Map<string, string>, enforceDescriptions = true) {
  const errors: string[] = []; let data: Record<string, unknown> = {};
  const normalized = source.replace(/\r\n|\r/gu, "\n");
  if (!normalized.startsWith("---\n")) errors.push(`${path}: missing YAML frontmatter`);
  else {
    const end = normalized.indexOf("\n---\n", 4);
    if (end < 0) errors.push(`${path}: frontmatter is not closed`);
    else try {
      const value: unknown = parse(normalized.slice(4, end)) ?? {};
      if (!objectValue(value)) errors.push(`${path}: frontmatter must be a mapping`); else data = value;
    } catch { errors.push(`${path}: invalid frontmatter YAML`); }
  }
  const missing = required.filter(key => !Object.hasOwn(data, key)).sort();
  const type = data["type"] ?? data["doc_type"];
  if (type === undefined || type === null) missing.push("type or doc_type");
  if (missing.length) errors.push(`${path}: missing frontmatter keys: ${missing.join(", ")}`);
  for (const field of ["title", "summary"]) if (enforceDescriptions && Object.hasOwn(data, field) && (typeof data[field] !== "string" || !data[field].trim()))
    errors.push(`${path}: ${field} must be a non-empty string`);
  const id = String(data["id"] ?? "").trim();
  if (id && seen.has(id)) errors.push(`${path}: duplicate frontmatter id ${id} also used by ${seen.get(id)}`);
  if (id) seen.set(id, path);
  if (data["type"] && data["doc_type"] && data["type"] !== data["doc_type"]) errors.push(`${path}: type and doc_type must agree when both are present`);
  if (data["status"] && !statuses.has(String(data["status"]))) errors.push(`${path}: unknown document status`);
  for (const field of ["created", "updated"]) if (Object.hasOwn(data, field) && (typeof data[field] !== "string" || !isoDate(data[field]))) errors.push(`${path}: ${field} must be an ISO date in YYYY-MM-DD format`);
  if (typeof data["created"] === "string" && typeof data["updated"] === "string" && isoDate(data["created"]) && isoDate(data["updated"]) && data["updated"] < data["created"]) errors.push(`${path}: updated must be on or after created`);
  if (type === "lesson") {
    const lessonRequired = ["stage", "context", "evidence_links", "confidence", "refresh_by", "promotion_state", "provenance"];
    const missingLesson = lessonRequired.filter(key => !Object.hasOwn(data, key)).sort();
    if (missingLesson.length) errors.push(`${path}: missing lesson frontmatter keys: ${missingLesson.join(", ")}`);
    const vocab: Record<string, string[]> = { status: ["archived", "current", "draft"], stage: ["Frame", "Plan", "Work", "Review", "Capture"], confidence: ["low", "medium", "high"], promotion_state: ["note", "pattern", "policy", "check", "skill", "route", "retired"] };
    for (const [field, values] of Object.entries(vocab)) if (!values.includes(String(data[field]))) errors.push(`${path}: lesson ${field} must be one of: ${values.sort().join(", ")}`);
    for (const field of ["context", "provenance"]) if (typeof data[field] !== "string" || !data[field].trim()) errors.push(`${path}: lesson ${field} must be a non-empty string`);
    const links = data["evidence_links"];
    if (!Array.isArray(links) || !links.length || links.some(link => typeof link !== "string" || !link.trim())) errors.push(`${path}: lesson evidence_links must be a non-empty string list`);
    if (typeof data["refresh_by"] !== "string" || !isoDate(data["refresh_by"])) errors.push(`${path}: refresh_by must be an ISO date in YYYY-MM-DD format`);
  }
  return { data, errors };
}
