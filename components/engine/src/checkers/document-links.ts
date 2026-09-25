import { posix } from "node:path";
import { ValidationSubject, type ChangeScope } from "../change-subject.ts";
import { documentMetadata } from "./document-metadata.ts";
const links = (source: string) => [...source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu)].map(match => match[1]!.trim());
const local = (target: string) => !target.startsWith("#") && !target.startsWith("mailto:") && !target.includes("://");
/** Literal local links with source ranges, shared by validation and the disposable context index. */
export function localDocumentLinks(source: string) {
  return [...source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu)].flatMap(match => {
    const target = match[1]!.trim();
    return local(target) ? [{ target: target.split("#")[0]!, line: source.slice(0, match.index).split("\n").length }] : [];
  });
}
const activePrefix = "docs/exec-plans/active/", indexPath = "docs/exec-plans/README.md";

/** Validate selected Markdown using captured source and targets from the same candidate graph. */
export function documentLinkIssues(subject: ValidationSubject, scope: ChangeScope): string[] {
  const errors: string[] = [], seen = new Map<string, string>(), paths = subject.paths(), pathSet = new Set(paths);
  const selected = scope.mode === "all" ? paths : scope.records.filter(record => record.after).map(record => record.path);
  let indexTargets: Set<string> | null = null;
  const read = (path: string) => new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path));
  const targets = () => {
    if (indexTargets) return indexTargets;
    indexTargets = new Set();
    try {
      for (const target of links(read(indexPath))) if (local(target)) indexTargets.add(posix.normalize(target.split("#")[0]!));
    } catch { errors.push(`${indexPath}: active-plan index is missing or unreadable`); }
    return indexTargets;
  };
  for (const path of [...new Set(selected)].sort()) {
    if (!path.toLowerCase().endsWith(".md")) continue;
    let source: string;
    try { source = read(path); } catch { errors.push(`${path}: selected Markdown must be readable regular UTF-8 source`); continue; }
    if (path.startsWith("docs/")) {
      // A whole inventory has no change provenance. New retrieval fields must not turn old debt into a blocker.
      const metadata = documentMetadata(path, source, seen, scope.mode !== "all"); errors.push(...metadata.errors);
      if (path.startsWith(activePrefix)) {
        if ((metadata.data["type"] ?? metadata.data["doc_type"]) !== "exec-plan") errors.push(`${path}: active execution plan type must be exec-plan`);
        if (metadata.data["status"] !== "active") errors.push(`${path}: active execution plan status must be active`);
        if (!targets().has(posix.relative("docs/exec-plans", path))) errors.push(`${path}: active execution plan is not linked from ${indexPath}`);
      }
      if (path === indexPath) for (const active of paths.filter(candidate => candidate.startsWith(activePrefix) && candidate.endsWith(".md") && !candidate.slice(activePrefix.length).includes("/"))) {
        const target = posix.relative("docs/exec-plans", active);
        if (!targets().has(target)) errors.push(`${indexPath}: active plan is not indexed: ${target}`);
      }
    }
    for (const target of links(source)) {
      const value = target.split("#")[0]!; if (!value || !local(target)) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(path), value));
      if (value.startsWith("/") || resolved === ".." || resolved.startsWith("../") || value.includes("\\")) { errors.push(`${path}: link escapes repository: ${target}`); continue; }
      if (resolved === ".") continue;
      // A symlink is not proof of a local target; the graph intentionally never follows one.
      if (pathSet.has(resolved)) {
        try { if (subject.source(resolved)?.file_type !== "regular") errors.push(`${path}: link target is not a regular captured file: ${target}`); }
        catch { errors.push(`${path}: link target cannot be read: ${target}`); }
      } else if (!paths.some(candidate => candidate.startsWith(`${resolved}/`))) errors.push(`${path}: link target does not exist: ${target}`);
    }
  }
  return errors.sort();
}
