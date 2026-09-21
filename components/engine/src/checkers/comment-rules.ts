import type { Finding } from "../checker-results.ts";
import { glob } from "../planning.ts";
export interface CommentPolicy { boundary_globs?: string[]; require_overview_labels?: boolean; minimum_overview_words?: number }
interface Location { path: string; line: number; adapter: string; declaration: string }
const words = (text: string) => (text.match(/[A-Za-z][A-Za-z'-]+/gu) ?? []).length;
const paragraphs = (text: string) => text.split(/\n\s*\n/u).filter(part => part.trim());
function add(findings: Finding[], location: Location, rule_id: string, message: string, blocking: boolean): void {
  findings.push({ rule_id, path: location.path, line: location.line, severity: blocking ? "blocking" : "advisory", message,
    ...(location.adapter ? { adapter_id: location.adapter } : {}), ...(location.declaration ? { declaration: location.declaration } : {}) });
}
function prose(findings: Finding[], location: Location, comment: string): void {
  if (/^(?:this class |this method |this function |this file |this module )/u.test(comment.toLowerCase().trim()) ||
      /\b(?:handles|manages|processes)\b/iu.test(comment) || comment.split(/[.!?]+/u).some(sentence => words(sentence) > 35))
    add(findings, location, "SC011", "Use direct, concrete language and explain the owned decision or outcome.", false);
}
export function normalizedComment(raw: string): string {
  return raw.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/u).map(line => line.replace(/^\s*(?:\/\*\*?|\*\/|\/\/\/?|\/\/!|#)\s?/u, "").replace(/^\s*\*\s?/u, "").trimEnd()).join("\n").trim();
}
export function commentBefore(lines: string[], lineNumber: number): string {
  let index = lineNumber - 2;
  while (index >= 0 && !lines[index]!.trim()) index--;
  if (index < 0) return "";
  const collected: string[] = [];
  if (/^\s*(?:\/\/|#)/u.test(lines[index]!)) {
    while (index >= 0 && /^\s*(?:\/\/|#)/u.test(lines[index]!)) collected.unshift(lines[index--]!);
  } else if (lines[index]!.includes("*/")) {
    while (index >= 0) { const line = lines[index--]!; collected.unshift(line); if (line.includes("/*")) break; }
  }
  return normalizedComment(collected.join("\n"));
}
export function overviewFindings(comment: string, path: string, policy: CommentPolicy, adapter: string, blocking: boolean): Finding[] {
  const findings: Finding[] = [], location = { path, line: 1, adapter, declaration: "<file>" };
  const boundary = (policy.boundary_globs ?? []).some(pattern => glob(path, pattern));
  if (!comment) {
    add(findings, location, "SC002", "Add a file overview that states this file's responsibility.", blocking);
    add(findings, location, "SC003", "Add the workflow or relationship context a new reader needs.", blocking);
    if (boundary) add(findings, location, "SC004", "Add the boundary, invariant, or tradeoff this file must preserve.", blocking);
    return findings;
  }
  const lowered = comment.toLowerCase();
  if (policy.require_overview_labels ?? true) {
    if (!lowered.includes("responsibility:")) add(findings, location, "SC002", "The file overview must include a plain-language 'Responsibility:' statement.", blocking);
    if (!lowered.includes("context:")) add(findings, location, "SC003", "The file overview must include 'Context:' with the insight a new reader needs.", blocking);
  }
  if (boundary) {
    const value = /\bboundary:\s*([^\n]+)/iu.exec(comment)?.[1]?.trim().toLowerCase() ?? "";
    if (["", "none", "n/a", "na", "not applicable"].includes(value)) add(findings, location, "SC004", "State the boundary, invariant, or tradeoff instead of using a placeholder.", blocking);
  }
  if (words(comment) < (policy.minimum_overview_words ?? 16)) add(findings, location, "SC011", "The file overview may be too brief to explain responsibility and context.", false);
  prose(findings, location, comment);
  return findings;
}
export function declarationFindings(comment: string, location: Location, kind: string, name: string, typeDetail: boolean, blocking: boolean, requireTypeContext: boolean): Finding[] {
  const findings: Finding[] = [];
  if (!comment) { add(findings, location, "SC005", `Document public ${kind} '${name}' in simple language.`, blocking); return findings; }
  if (words(comment) < 5) add(findings, location, "SC011", `The comment for '${name}' may be too brief to explain its responsibility.`, false);
  if (typeDetail && requireTypeContext && paragraphs(comment).length < 2) add(findings, location, "SC006", `Give '${name}' a summary paragraph and a context/relationship paragraph.`, blocking);
  const nameWords = name.replace(/(?<!^)(?=[A-Z])|_/gu, " ").toLowerCase().split(/\s+/u).filter(Boolean);
  const commentWords = new Set(comment.toLowerCase().match(/[a-z]+/gu) ?? []);
  if (nameWords.length && nameWords.every(word => commentWords.has(word)) && words(comment) <= nameWords.length + 3)
    add(findings, location, "SC007", `The comment for '${name}' mainly restates its name.`, blocking);
  prose(findings, location, comment);
  return findings;
}
