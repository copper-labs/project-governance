import { extname } from "node:path";
import { ValidationSubject, safeSubjectPath, type ChangeScope, type SubjectSource } from "../change-subject.ts";
import { glob } from "../planning.ts";
import { sourceFamilies } from "./comment-registry.ts";
import type { CommentSelection } from "./python-comments.ts";
export interface SelectedCommentSource extends CommentSelection { path: string; before: SubjectSource | null; advisoryOnly: boolean }
function strings(value: unknown, label: string, fallback: string[] = []): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new Error(`${label} must be a list of strings`);
  return value;
}
/** A full inventory is not permission to turn existing documentation debt into blocking findings. */
export function selectCommentSources(subject: ValidationSubject, scope: ChangeScope, policy: Record<string, unknown>, managed = new Set<string>()): SelectedCommentSource[] {
  const roots = strings(policy["source_roots"], "source_roots", ["."]).map(root => root.trim().replace(/^\/+|\/+$/gu, ""));
  for (const root of roots) if (root && root !== ".") safeSubjectPath(root);
  const enforceAll = ["enforce-all", "enforce_all"].includes(String(policy["mode"]));
  if (enforceAll && scope.mode !== "all" && scope.mode !== "explicit") throw new Error("Enforce-all comment policy requires an all-mode subject");
  const paths = subject.paths();
  for (const root of roots) if (root && root !== "." && !paths.some(path => path.startsWith(`${root}/`))) throw new Error(`Configured source root has no captured files: ${root}`);
  const ignores = strings(policy["ignore_paths"], "ignore_paths"), tests = strings(policy["test_globs"], "test_globs");
  const testScope = policy["test_scope"] ?? "excluded";
  if (!["excluded", "advisory", "enforced"].includes(String(testScope))) throw new Error("Unsupported comment test_scope");
  const records = new Map(scope.records.map(record => [record.path, record]));
  const selected = scope.mode === "all" ? paths : scope.records.filter(record => record.after).map(record => record.path);
  return selected.filter(path => (scope.mode === "explicit" || !managed.has(path)) && sourceFamilies[extname(path).toLowerCase()] &&
    roots.some(root => !root || root === "." || path === root || path.startsWith(`${root}/`)) && !ignores.some(pattern => glob(path, pattern)) &&
    subject.source(path)?.file_type === "regular").flatMap(path => {
      const isTest = tests.some(pattern => glob(path, pattern));
      if (isTest && testScope === "excluded") return [];
      const record = records.get(path), force = enforceAll || scope.mode === "explicit" || record?.status === "added";
      return [{ path, before: record?.before ?? null, ranges: record?.changed_ranges.map(range => [range.start, range.end] as const) ?? [],
        enforceAll: force, overviewBlocking: force, advisoryOnly: isTest && testScope === "advisory" }];
    }).sort((a, b) => a.path.localeCompare(b.path));
}
