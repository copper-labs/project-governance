import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { safeSubjectPath, type ValidationSubject } from "./change-subject.ts";
import type { Finding } from "./checker-results.ts";

export interface SpecificationCriterion {
  id: string;
  claim: string;
  verification: "mechanical" | "semantic";
}
export interface SpecificationDeclaration { version: 1; criteria: SpecificationCriterion[] }
export interface SpecificationReferences {
  specifications: readonly { path: string; digest: string; criteria: readonly string[] }[];
  batches: readonly { id: string; items: readonly { id: string; criteria?: readonly { path: string; id: string }[] }[] }[];
}

const stableId = (id: string) => /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(id);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sha256 = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export function safeSpecificationPath(path: string): string {
  safeSubjectPath(path);
  if (!/^docs\/.+\.md$/u.test(path) || path.split("/").some(part => [".git", ".governance", ".agents", ".codex"].includes(part)))
    throw new Error("specification path must name a Markdown file under docs without control metadata");
  return path;
}

/** Ignore declaration examples nested inside another fenced block. */
export function parseSpecificationDeclaration(bytes: Buffer | string): SpecificationDeclaration | null {
  const source = typeof bytes === "string" ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let fence: { marker: string; length: number; specification: boolean; body: string[] } | null = null;
  const declarations: string[] = [];
  for (const line of source.split(/\r\n|\n|\r/u)) {
    if (fence) {
      const close = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/u.exec(line);
      if (close && close[1]![0] === fence.marker && close[1]!.length >= fence.length) {
        if (fence.specification) declarations.push(fence.body.join("\n"));
        fence = null;
      } else if (fence.specification) fence.body.push(line);
      continue;
    }
    const open = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!open) continue;
    const info = open[2]!.trim(), specification = /^governance-spec(?:\s|$)/u.test(info);
    if (specification && info !== "governance-spec") throw new Error("governance-spec fence must have no extra attributes");
    fence = { marker: open[1]![0]!, length: open[1]!.length, specification, body: [] };
  }
  if (fence?.specification) throw new Error("governance-spec fence is not closed");
  if (!declarations.length) return null;
  if (declarations.length !== 1) throw new Error("specification must contain exactly one governance-spec declaration");
  if (parseDocument(declarations[0]!, { schema: "json", uniqueKeys: true }).errors.length) throw new Error("ambiguous specification declaration");
  let raw: unknown;
  try { raw = JSON.parse(declarations[0]!); } catch { throw new Error("governance-spec declaration must contain valid JSON"); }
  if (!record(raw) || raw["version"] !== 1 || Object.keys(raw).some(key => !["version", "criteria"].includes(key)) ||
      !Array.isArray(raw["criteria"]) || !raw["criteria"].length) throw new Error("governance-spec requires version 1 and a nonempty criteria array");
  const ids = new Set<string>(), criteria: SpecificationCriterion[] = [];
  for (const entry of raw["criteria"]) {
    if (!record(entry) || Object.keys(entry).some(key => !["id", "claim", "verification"].includes(key)) ||
        typeof entry["id"] !== "string" || !stableId(entry["id"]) || typeof entry["claim"] !== "string" ||
        !entry["claim"].trim() || entry["claim"].includes("\0") || (entry["verification"] !== "mechanical" && entry["verification"] !== "semantic"))
      throw new Error("each specification criterion requires a stable id, a nonempty claim and mechanical or semantic verification");
    const id = entry["id"];
    if (ids.has(id)) throw new Error(`duplicate specification criterion ID: ${id}`);
    ids.add(id);
    criteria.push({ id, claim: entry["claim"], verification: entry["verification"] as SpecificationCriterion["verification"] });
  }
  return { version: 1, criteria };
}

/** Structural traceability is not a judgment that a mapped check proves the criterion. */
export function validateSpecificationReferences(subject: ValidationSubject, declaration: SpecificationReferences): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, path: string, message: string, detail: Record<string, unknown> = {}) =>
    findings.push({ rule_id: `specification.${rule}`, severity: "blocking", path, message, ...detail });
  const specifications = new Map<string, { scope: Set<string>; ids: Set<string> | null; covered: Set<string> }>();
  for (const reference of declaration.specifications) {
    const path = reference.path;
    try { safeSpecificationPath(path); }
    catch { add("path-unsafe", path, "specification path must be a safe Markdown file under docs"); continue; }
    if (specifications.has(path)) { add("reference-duplicate", path, "specification path is declared more than once"); continue; }
    const scoped = { scope: new Set<string>(), ids: null as Set<string> | null, covered: new Set<string>() };
    specifications.set(path, scoped);
    for (const id of reference.criteria) {
      if (!stableId(id)) add("scope-invalid", path, `invalid in-scope criterion ID: ${id}`, { criterion_id: id });
      else if (scoped.scope.has(id)) add("scope-duplicate", path, `in-scope criterion is declared more than once: ${id}`, { criterion_id: id });
      else scoped.scope.add(id);
    }
    if (!reference.criteria.length) add("scope-invalid", path, "specification reference must declare its in-scope criteria");
    if (!/^sha256:[a-f0-9]{64}$/u.test(reference.digest)) add("digest-invalid", path, "specification digest must be an exact sha256 digest");
    let bytes: Buffer;
    try {
      if (subject.source(path)?.file_type !== "regular") throw new Error("specification is missing or is not a regular captured file");
      bytes = subject.read(path);
    } catch (error) {
      add("source-unavailable", path, `cannot read captured specification: ${(error as Error).message}`);
      continue;
    }
    const actual = sha256(bytes);
    if (reference.digest !== actual) add("digest-mismatch", path, "captured specification contents differ from the plan's bound digest", { expected_digest: reference.digest, actual_digest: actual });
    let parsed: SpecificationDeclaration | null;
    try { parsed = parseSpecificationDeclaration(bytes); }
    catch (error) { add("declaration-invalid", path, (error as Error).message); continue; }
    if (!parsed) { add("declaration-missing", path, "explicitly referenced specification must contain a governance-spec declaration"); continue; }
    scoped.ids = new Set(parsed.criteria.map(criterion => criterion.id));
    for (const id of scoped.scope) if (!scoped.ids.has(id))
      add("criterion-unresolved", path, `declared in-scope criterion does not exist: ${id}`, { criterion_id: id });
  }
  for (const batch of declaration.batches) for (const item of batch.items) {
    const seen = new Set<string>();
    for (const reference of item.criteria ?? []) {
      const detail = { batch_id: batch.id, item_id: item.id, criterion_id: reference.id };
      try { safeSpecificationPath(reference.path); }
      catch { add("path-unsafe", reference.path, "criterion reference path must be a safe Markdown file under docs", detail); continue; }
      const key = JSON.stringify([reference.path, reference.id]);
      if (seen.has(key)) { add("criterion-reference-duplicate", reference.path, "criterion is referenced more than once on the same plan item", detail); continue; }
      seen.add(key);
      const specification = specifications.get(reference.path);
      if (!specification) { add("reference-undeclared", reference.path, "plan item references a specification absent from the bound specifications list", detail); continue; }
      if (!stableId(reference.id)) { add("criterion-unresolved", reference.path, "plan item has an invalid criterion ID", detail); continue; }
      if (specification.ids && !specification.ids.has(reference.id)) {
        add("criterion-unresolved", reference.path, "plan item references a criterion absent from the captured specification", detail); continue;
      }
      if (!specification.scope.has(reference.id)) {
        add("criterion-out-of-scope", reference.path, "plan item references a criterion outside the declared specification scope", detail); continue;
      }
      specification.covered.add(reference.id);
    }
  }
  for (const [path, specification] of specifications) for (const id of specification.scope)
    if (!specification.covered.has(id)) add("criterion-uncovered", path, `in-scope criterion has no plan item mapping: ${id}`, { criterion_id: id });
  return findings;
}
