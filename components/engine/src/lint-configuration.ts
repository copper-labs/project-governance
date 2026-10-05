import { parse } from "yaml";
import { readSubjectSource, safeSubjectPath, type ChangeScope, type ValidationSubject } from "./change-subject.ts";
import { digest, object, text } from "./core.ts";

export interface LintDeclaration {
  version: 1; backend: "ruff" | "eslint"; roots: string[]; config: string; inputs: string[]; excludes: string[];
  tool: { argv: string[]; version: string }; dependency_roots: string[];
}
export interface LintRequirement { pack_id: string; roots: string[]; stages: string[] }
export interface LintProfile { version: 1; require_first_source: boolean; requirements: LintRequirement[]; exclusions: Array<{ root: string; reason: string }> }
export const LINT_PROFILE_PATH = "config/governance/profile.yaml";
export const LINT_EXTENSIONS = {
  ruff: new Set([".py", ".pyi"]),
  eslint: new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]),
};
export function lintRoot(value: unknown): string { const root = text(value, "lint root"); return root === "." ? root : safeSubjectPath(root); }
export function insideLintRoot(path: string, root: string): boolean { return root === "." || path === root || path.startsWith(`${root}/`); }
function strings(value: unknown, label: string, empty = true): string[] {
  if (!Array.isArray(value) || value.length > 128 || (!empty && !value.length)) throw new Error(`${label} must be a bounded list`);
  const values = value.map(v => text(v, label));
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
  return values;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} contains unknown fields`);
}
/** Tool and rule choices are explicit project declarations; parsing never installs or probes them. */
export function parseLintDeclaration(value: unknown): LintDeclaration {
  const record = object(value, "lint declaration");
  keys(record, ["version", "backend", "roots", "config", "inputs", "excludes", "tool", "dependency_roots"], "lint declaration");
  if (record.version !== 1 || !["ruff", "eslint"].includes(String(record.backend))) throw new Error("Unsupported lint declaration");
  const roots = strings(record.roots, "lint roots", false).map(lintRoot), config = safeSubjectPath(text(record.config, "lint config"));
  const inputs = strings(record.inputs ?? [], "lint inputs").map(safeSubjectPath);
  const excludes = strings(record.excludes ?? [], "lint excludes");
  if (excludes.some(path => path.startsWith("/") || path.split("/").includes(".."))) throw new Error("Unsafe lint exclusion");
  const tool = object(record.tool, "lint tool"); keys(tool, ["argv", "version"], "lint tool");
  const argv = strings(tool.argv, "lint tool argv", false), version = text(tool.version, "lint tool version", 80);
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) throw new Error("Lint tool version must be exact");
  if (argv.some(token => /^(?:npx|uvx|pip|pip3|npm|pnpm|yarn|bun|uv|sh|bash|zsh)$/u.test(token.split("/").at(-1)!))) throw new Error("Fetching or shell lint launchers are unsupported");
  if (record.backend === "ruff" && argv.length !== 1 || record.backend === "eslint" && (argv.length > 2 || argv.length === 2 && argv[1]!.startsWith("-"))) throw new Error("Lint backends require direct tool argv");
  const dependency_roots = strings(record.dependency_roots ?? [], "lint dependencies").map(safeSubjectPath);
  if (dependency_roots.some(path => path.split("/").at(-1) !== "node_modules")) throw new Error("Only declared installed node_modules roots may be linked");
  return { version: 1, backend: record.backend as LintDeclaration["backend"], roots, config, inputs, excludes, tool: { argv, version }, dependency_roots };
}
/** An absent lint section preserves existing owners; an adopted section never falls back after corruption. */
export function lintProfile(subject: ValidationSubject): LintProfile | null {
  if (!subject.source(LINT_PROFILE_PATH)) return null;
  const profile = object(parse(subject.read(LINT_PROFILE_PATH, 1024 * 1024).toString("utf8")), "project profile");
  return parsedLintProfile(profile);
}
function parsedLintProfile(profile: Record<string, unknown>): LintProfile | null {
  if (profile.lint === undefined) return null;
  const record = object(profile.lint, "lint profile"); keys(record, ["version", "require_first_source", "requirements", "exclusions"], "lint profile");
  if (record.version !== 1 || typeof record.require_first_source !== "boolean" || !Array.isArray(record.requirements) || !Array.isArray(record.exclusions)) throw new Error("Invalid lint profile");
  const requirements = record.requirements.map(raw => {
    const item = object(raw, "lint requirement"); keys(item, ["pack_id", "roots", "stages"], "lint requirement");
    const pack_id = text(item.pack_id, "lint pack id", 128), roots = strings(item.roots, "required lint roots", false).map(lintRoot);
    const stages = strings(item.stages, "required lint stages", false);
    if (!stages.includes("batch") || !stages.includes("pre-commit")) throw new Error("Required lint stages include batch and pre-commit");
    return { pack_id, roots, stages };
  });
  if (new Set(requirements.map(item => item.pack_id)).size !== requirements.length) throw new Error("Duplicate required lint owner");
  const exclusions = record.exclusions.map(raw => { const item = object(raw, "lint exclusion"); keys(item, ["root", "reason"], "lint exclusion"); return { root: lintRoot(item.root), reason: text(item.reason, "lint exclusion reason", 1000) }; });
  return { version: 1, require_first_source: record.require_first_source, requirements, exclusions };
}

/** Compare only captured images of the shared profile; unrelated budgets do not invalidate lint. */
export function lintProfileComparison(subject: ValidationSubject, scope: ChangeScope) {
  const after = subject.source(LINT_PROFILE_PATH) ? object(parse(subject.read(LINT_PROFILE_PATH, 1024 * 1024).toString("utf8")), "candidate profile") : {};
  const record = scope.records.find(record => record.path === LINT_PROFILE_PATH || record.previous_path === LINT_PROFILE_PATH);
  let before = after;
  if (record) {
    const source = record.previous_path === LINT_PROFILE_PATH || record.path === LINT_PROFILE_PATH && record.previous_path === null ? record.before : null;
    before = source ? object(parse(readSubjectSource(subject.root, source, 1024 * 1024).toString("utf8")), "base profile") : {};
  }
  return { changed: digest(before.lint ?? null) !== digest(after.lint ?? null), before: parsedLintProfile(before), after: parsedLintProfile(after) };
}
