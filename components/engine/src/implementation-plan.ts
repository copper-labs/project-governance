import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import { object, text } from "./core.ts";
import { safeSubjectPath, type ValidationSubject } from "./change-subject.ts";
import { commandApplies } from "./planning.ts";
import type { Packs } from "./pack-configuration.ts";
import type { Finding } from "./checker-results.ts";
import { validateSpecificationReferences } from "./specification-contract.ts";
import { normalizedDeliveryNotes } from "./delivery-notes.ts";

export interface PlanItem {
  id: string; kind: "implementation" | "verification" | "closeout"; requires: string[];
  criteria?: Array<{ path: string; id: string }>;
  check?: { stage: string; packs: string[]; task_id?: string; task_revision?: string };
}
export interface PlanDeclaration {
  version: 1; specifications: Array<{ path: string; digest: string; criteria: string[] }>;
  batches: Array<{ id: string; depends_on: string[]; items: PlanItem[] }>;
}
export interface PlanSlot { item: PlanItem; completed: boolean; evidence: unknown[]; stateOffset: number; evidenceStart: number; evidenceEnd: number }
export interface ParsedImplementationPlan { path: string; content: string; digest: string; declaration: PlanDeclaration; slots: Map<string, PlanSlot> }
export const planBytesDigest = (bytes: string | Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const decodePlanBytes = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
const identifier = (value: unknown) => {
  const result = text(value, "plan identifier", 100);
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/u.test(result)) throw new Error("Invalid plan identifier");
  return result;
};
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error("Unknown plan declaration field");
}
function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > 4096) throw new Error(`Invalid ${label}`);
  return value;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw new Error("Duplicate plan reference");
  return values;
}

interface MarkdownFence { start: number; end: number; info: string; body: string; closed: boolean }
/** Keep source offsets while excluding fenced examples from declaration and progress ownership. */
function markdownFences(content: string): MarkdownFence[] {
  const fences: MarkdownFence[] = [];
  let open: { start: number; body: number; marker: string; length: number; info: string } | null = null;
  for (const line of content.matchAll(/([^\r\n]*)(?:\r\n|\n|\r|$)/gu)) {
    const source = line[1]!, start = line.index!, end = start + line[0].length;
    if (open) {
      const closing = /^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/u.exec(source);
      if (closing && closing[1]![0] === open.marker && closing[1]!.length >= open.length) {
        fences.push({ start: open.start, end, info: open.info, body: content.slice(open.body, start), closed: true });
        open = null;
      }
    } else {
      const opening = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u.exec(start === 0 ? source.replace(/^\ufeff/u, "") : source);
      if (opening) open = { start, body: end, marker: opening[1]![0]!, length: opening[1]!.length, info: opening[2]!.trim() };
    }
  }
  if (open) fences.push({ start: open.start, end: content.length, info: open.info, body: content.slice(open.body), closed: false });
  return fences;
}
export function hasImplementationPlanDeclaration(content: string): boolean {
  return markdownFences(content).some(fence => /^governance-plan(?:\s|$)/u.test(fence.info));
}

/** Only a deliberately adopted fence and marked slots are machine owned; other Markdown stays opaque. */
export function parseImplementationPlan(path: string, content: string): ParsedImplementationPlan {
  safeSubjectPath(path);
  normalizedDeliveryNotes(content); // Refuse ambiguous notes before adopting any machine-owned slots.
  if (!/^docs\/exec-plans\/.+\.md$/u.test(path)) throw new Error("Implementation plan must live under docs/exec-plans");
  const fences = markdownFences(content), declarations = fences.filter(fence => /^governance-plan(?:\s|$)/u.test(fence.info));
  if (declarations.length !== 1 || declarations[0]!.info !== "governance-plan" || !declarations[0]!.closed) throw new Error("Exactly one closed governance-plan declaration without attributes is required");
  const raw = declarations[0]!.body, parsed = parseDocument(raw, { schema: "json", uniqueKeys: true });
  if (parsed.errors.length) throw new Error("Ambiguous plan declaration");
  const value = object(JSON.parse(raw)); keys(value, ["version", "specifications", "batches"]);
  if (value.version !== 1) throw new Error("Unsupported plan format");
  const specifications = list(value.specifications ?? [], "specifications").map(entry => {
    const spec = object(entry); keys(spec, ["path", "digest", "criteria"]);
    const path = safeSubjectPath(text(spec.path, "specification path")), digest = text(spec.digest, "specification digest");
    if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error("Invalid specification digest");
    return { path, digest, criteria: unique(list(spec.criteria, "criteria").map(identifier)) };
  });
  const batchIds = new Set<string>(), itemIds = new Set<string>();
  const batches = list(value.batches, "batches").map(entry => {
    const batch = object(entry); keys(batch, ["id", "depends_on", "items"]);
    const id = identifier(batch.id);
    if (batchIds.has(id)) throw new Error("Duplicate batch identifier"); batchIds.add(id);
    const items = list(batch.items, "items").map(entry => {
      const raw = object(entry); keys(raw, ["id", "kind", "requires", "criteria", "check"]);
      const id = identifier(raw.id), kind = raw.kind;
      if (itemIds.has(id) || typeof kind !== "string" || !["implementation", "verification", "closeout"].includes(kind)) throw new Error("Invalid or duplicate item"); itemIds.add(id);
      const item: PlanItem = { id, kind: kind as PlanItem["kind"], requires: unique(list(raw.requires ?? [], "prerequisites").map(identifier)) };
      if (raw.criteria !== undefined) item.criteria = list(raw.criteria, "item criteria").map(entry => {
        const criterion = object(entry); keys(criterion, ["path", "id"]);
        return { path: safeSubjectPath(text(criterion.path, "specification path")), id: identifier(criterion.id) };
      });
      if (kind === "verification") {
        const check = object(raw.check); keys(check, ["stage", "packs", "task_id", "task_revision"]);
        item.check = { stage: text(check.stage, "check stage", 100), packs: unique(list(check.packs, "check packs").map(identifier)) };
        if (!item.check.packs.length) throw new Error("Verification requires packs");
        if ((check.task_id === undefined) !== (check.task_revision === undefined)) throw new Error("Task identity requires its revision");
        if (check.task_id !== undefined) { item.check.task_id = text(check.task_id, "task identity", 200); item.check.task_revision = text(check.task_revision, "task revision", 100); }
      } else if (raw.check !== undefined) throw new Error("Only verification items declare checks");
      return item;
    });
    if (!items.length) throw new Error("Empty implementation batch");
    return { id, depends_on: unique(list(batch.depends_on ?? [], "batch dependencies").map(identifier)), items };
  });
  if (!batches.length) throw new Error("Empty implementation plan");
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Plan dependency cycle"); if (visited.has(id)) return;
    const batch = batches.find(batch => batch.id === id); if (!batch) throw new Error("Unknown batch dependency");
    visiting.add(id); batch.depends_on.forEach(visit); visiting.delete(id); visited.add(id);
  }
  batches.forEach(batch => { visit(batch.id); for (const item of batch.items) if (item.requires.some(id => id === item.id || !itemIds.has(id))) throw new Error("Unresolved item prerequisite"); });
  visiting.clear(); visited.clear();
  const itemMap = new Map(batches.flatMap(batch => batch.items).map(item => [item.id, item]));
  const visitItem = (id: string) => {
    if (visiting.has(id)) throw new Error("Item prerequisite cycle"); if (visited.has(id)) return;
    visiting.add(id); itemMap.get(id)!.requires.forEach(visitItem); visiting.delete(id); visited.add(id);
  };
  [...itemIds].forEach(visitItem);
  const slots = new Map<string, PlanSlot>();
  const outsideFence = (start: number, length: number) => !fences.some(fence => start < fence.end && start + length > fence.start);
  const markers = [...content.matchAll(/^<!-- governance:item ([A-Za-z][A-Za-z0-9._-]*) -->\r?\n- \[([ x])\][^\r\n]*\r?\n<!-- governance:evidence \1 -->([^\r\n]*?)<!-- \/governance:evidence -->[ \t]*\r?$/gmu)]
    .filter(match => outsideFence(match.index!, match[0].length));
  for (const match of markers) {
    const item = batches.flatMap(batch => batch.items).find(item => item.id === match[1]);
    if (!item || slots.has(item.id)) throw new Error("Unknown or duplicated progress slot");
    const evidence = JSON.parse(match[3]!); if (!Array.isArray(evidence)) throw new Error("Invalid progress evidence");
    const stateOffset = match.index! + match[0].indexOf("- [") + 3;
    const evidenceStart = match.index! + match[0].indexOf(`<!-- governance:evidence ${item.id} -->`) + `<!-- governance:evidence ${item.id} -->`.length;
    slots.set(item.id, { item, completed: match[2] === "x", evidence, stateOffset, evidenceStart, evidenceEnd: evidenceStart + match[3]!.length });
  }
  const ownerMarkers = (expression: RegExp) => [...content.matchAll(expression)].filter(match => outsideFence(match.index!, match[0].length)).length;
  if (slots.size !== itemIds.size || ownerMarkers(/^<!-- governance:item /gmu) !== slots.size || ownerMarkers(/^<!-- governance:evidence /gmu) !== slots.size) throw new Error("Missing, ambiguous or malformed progress slots");
  return { path, content, digest: planBytesDigest(content), declaration: { version: 1, specifications, batches }, slots };
}

/** Erase explicit commentary and parsed progress only; requirements and check declarations retain their identity. */
export function normalizedPlanContent(plan: ParsedImplementationPlan): string {
  const replacements = [...plan.slots.values()].flatMap(slot => [{ start: slot.stateOffset, end: slot.stateOffset + 1, text: " " }, { start: slot.evidenceStart, end: slot.evidenceEnd, text: "[]" }]).sort((a, b) => b.start - a.start);
  return normalizedDeliveryNotes(replacements.reduce((text, replacement) => text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end), plan.content));
}
export function implementationPlanFindings(subject: ValidationSubject, path: string, packs: Packs): Finding[] {
  try {
    const plan = parseImplementationPlan(path, decodePlanBytes(subject.read(path)));
    const findings = validateSpecificationReferences(subject, plan.declaration);
    for (const batch of plan.declaration.batches) for (const item of batch.items) if (item.check) for (const id of item.check.packs) {
      const pack = packs[id];
      if (!pack || (pack.implementation_status ?? "active") !== "active" || !pack.stages.includes(item.check.stage) || !pack.commands.some(command => commandApplies(command, item.check!.stage))) findings.push({ rule_id: "implementation-plan.check-unavailable", severity: "blocking", path, item_id: item.id, pack_id: id, message: "Declared verification needs an available pack at its declared stage." });
    }
    return findings;
  } catch { return [{ rule_id: "implementation-plan.invalid", severity: "blocking", path, message: "Structured plan declaration, references or progress slots are invalid; ordinary legacy plans remain exempt." }]; }
}
