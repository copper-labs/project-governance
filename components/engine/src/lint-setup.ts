import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { stringify, parse } from "yaml";
import { createHash } from "node:crypto";
import { resolveChangeScope, ValidationSubject } from "./change-subject.ts";
import { commandExecutable } from "./native-check-command.ts";
import { lintSourceLanguage, lintSourcePaths } from "./lint-coverage.ts";
import { insideLintRoot, lintRoot, lintProfile, parseLintDeclaration, type LintDeclaration, type LintProfile } from "./lint-configuration.ts";

export const RUFF_STARTER_VERSION = "0.15.14";
export const ESLINT_STARTER_VERSION = "9.39.1";
export const TYPESCRIPT_ESLINT_STARTER_VERSION = "8.46.4";
export const RUFF_STARTER = '[lint]\nselect = ["E9", "F63", "F7", "F82"]\n';
export const ESLINT_RULES = { "no-dupe-keys": "error", "no-unreachable": "error", "no-unsafe-finally": "error", "valid-typeof": "error" };
export function eslintStarter(typescript: boolean): string {
  return `${typescript ? 'import parser from "@typescript-eslint/parser";\n' : ""}export default [{ files: ["**/*.{js,jsx,mjs,cjs${typescript ? ",ts,tsx,mts,cts" : ""}}"], languageOptions: { ecmaVersion: "latest", sourceType: "module"${typescript ? ", parser" : ""} }, rules: ${JSON.stringify(ESLINT_RULES)} }];\n`;
}
export interface LintSetupOptions { roots?: string[]; stages?: string[]; launcher?: string; includeProjectManifest?: boolean; planNpmLock?: boolean; tools?: Partial<Record<"ruff" | "eslint", { argv: string[]; version: string }>> }
export interface LintSetupFile { path: string; before_sha256: string | null; content: string }

/** Deterministic inspection creates a reviewable proposal; the existing setup writer owns all application. */
export function inspectLintSetup(workspace: string, options: LintSetupOptions = {}) {
  const subject = new ValidationSubject(workspace, resolveChangeScope(workspace, { all: true }));
  const paths = lintSourcePaths(subject), roots = (options.roots ?? ["."]).map(lintRoot);
  const projectManifestPlanned = options.includeProjectManifest === true && paths.some(path => roots.some(root => insideLintRoot(path, root)) && ["javascript", "typescript"].includes(lintSourceLanguage(path) ?? ""));
  const stages = options.stages ?? ["batch", "pre-commit", "pre-push", "ci-pr"];
  if (!stages.includes("batch") || !stages.includes("pre-commit")) throw new Error("Lint setup needs batch and pre-commit stages");
  const files: LintSetupFile[] = [], findings: Array<Record<string, unknown>> = [], owners: Array<Record<string, unknown>> = [];
  const profile: LintProfile = { version: 1, require_first_source: true, requirements: [], exclusions: [] };
  const declarations: Record<string, LintDeclaration> = {};
  const propose = (path: string, content: string, preserve = false) => {
    const current = subject.source(path) ? subject.read(path).toString("utf8") : null;
    if (current === content || preserve && current !== null) return;
    if (current !== null && !preserve) { findings.push({ code: "lint-setup-conflict", path, message: "Existing owned file requires explicit reconciliation." }); return; }
    files.push({ path, before_sha256: current === null ? null : createHash("sha256").update(current).digest("hex"), content });
  };
  for (const root of roots) {
    const selected = paths.filter(path => insideLintRoot(path, root)), languages = [...new Set(selected.map(path => lintSourceLanguage(path)))];
    for (const backend of ["ruff", "eslint"] as const) {
      const owned = selected.filter(path => backend === "ruff" ? [".py", ".pyi"].includes(extname(path)) : ["javascript", "typescript"].includes(lintSourceLanguage(path) ?? ""));
      if (!owned.length) continue;
      const prefix = root === "." ? "" : `${root}/`, packId = `lint-${backend}-${root === "." ? "root" : root.replace(/[^A-Za-z0-9]+/gu, "-")}`;
      const configNames = backend === "ruff" ? ["ruff.toml", ".ruff.toml", "pyproject.toml"] : ["eslint.config.mjs", "eslint.config.js", "eslint.config.cjs", "eslint.config.ts"];
      const configs = configNames.map(name => prefix + name).filter(path => subject.source(path) && (backend !== "ruff" || !path.endsWith("pyproject.toml") || /\[tool\.ruff(?:\]|\.)/u.test(subject.read(path).toString("utf8"))));
      if (configs.length > 1) { findings.push({ code: "lint-setup-ambiguous", root, backend, paths: configs, message: "Choose the existing configuration owner explicitly." }); continue; }
      const config = configs[0] ?? prefix + (backend === "ruff" ? "ruff.toml" : "eslint.config.mjs");
      const typescript = owned.some(path => lintSourceLanguage(path) === "typescript");
      const tool = options.tools?.[backend] ?? (backend === "ruff" ? { argv: ["ruff"], version: RUFF_STARTER_VERSION } : { argv: ["node", "node_modules/eslint/bin/eslint.js"], version: ESLINT_STARTER_VERSION });
      const packPath = `config/validation/packs/${packId}.yaml`;
      const candidates = [...new Set([prefix + "package.json", prefix + "package-lock.json", prefix + "pnpm-lock.yaml", prefix + "yarn.lock", prefix + ".gitignore", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"])];
      const lockPaths = candidates.filter(path => /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/u.test(path));
      const existingPack = subject.source(packPath) ? parse(subject.read(packPath, 1024 * 1024).toString("utf8")) : null;
      // An adopted pending lock remains an input until acquisition produces it or the owner changes it.
      const retainedLocks = new Set<string>(Array.isArray(existingPack?.lint?.inputs) ? existingPack.lint.inputs.filter((path: unknown) => typeof path === "string" && lockPaths.includes(path)) : []);
      const manifest = subject.source("package.json") ? JSON.parse(subject.read("package.json", 1024 * 1024).toString("utf8")) : {};
      const npmProject = manifest.packageManager === undefined || typeof manifest.packageManager === "string" && manifest.packageManager.startsWith("npm@");
      if (options.planNpmLock === true && projectManifestPlanned && npmProject && !lockPaths.some(path => subject.source(path)) && !retainedLocks.size) retainedLocks.add("package-lock.json");
      const inputPaths = candidates.filter(path => subject.source(path) || path === "package.json" && projectManifestPlanned || retainedLocks.has(path));
      const declaration = parseLintDeclaration({ version: 1, backend, roots: [root], config, inputs: inputPaths, excludes: ["**/generated/**", "**/vendor/**", "**/build/**", "**/node_modules/**"], tool,
        dependency_roots: backend === "eslint" ? ["node_modules"] : [] });
      declarations[packId] = declaration;
      profile.requirements.push({ pack_id: packId, roots: [root], stages });
      const sourceGlobs = (backend === "ruff" ? ["py", "pyi"] : ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"]).map(suffix => `${prefix}*.${suffix}`);
      const pack = { id: packId, label: `${backend} lint`, implementation_status: "active", enforcement: "blocking", stages, run_when: "matched", path_globs: [...sourceGlobs, config, ...inputPaths, packPath, "config/governance/profile.yaml"], depends_on: [], change_packet_contract: 1, lint: declaration,
        commands: [{ run: [options.launcher ?? ".governance/runtime/bin/project-governance", "lint-adapter", "--pack", packId] }] };
      propose(packPath, stringify(pack));
      if (!configs.length) propose(config, backend === "ruff" ? RUFF_STARTER : eslintStarter(typescript));
      let available = true; try { commandExecutable(tool.argv[0]!, workspace); if (backend === "eslint" && tool.argv[1] && !existsSync(resolve(workspace, tool.argv[1]))) available = false; } catch { available = false; }
      const missingLocks = inputPaths.filter(path => lockPaths.includes(path) && !subject.source(path));
      owners.push({ root, backend, pack_id: packId, config, existing_rules: configs.length > 0, tool, state: available && !missingLocks.length ? "needs-adoption" : "needs-setup", missing_inputs: missingLocks,
        dependencies: backend === "eslint" ? { eslint: tool.version, ...(typescript ? { "@typescript-eslint/parser": TYPESCRIPT_ESLINT_STARTER_VERSION } : {}) } : { ruff: tool.version } });
    }
    for (const language of languages.filter(value => !["python", "javascript", "typescript"].includes(value ?? ""))) findings.push({ code: "lint-unsupported-starter", root, language, message: "Adopt a project-owned pack or declare an exclusion." });
  }
  let previousLint: LintProfile | null = null;
  try { previousLint = lintProfile(subject); } catch (error) { findings.push({ code: "lint-profile-invalid", message: error instanceof Error ? error.message : "Invalid lint profile" }); }
  if (previousLint) {
    const requirements = [...previousLint.requirements];
    for (const requirement of profile.requirements) {
      const previous = requirements.find(item => item.pack_id === requirement.pack_id);
      if (!previous) requirements.push(requirement);
      else if (JSON.stringify(previous) !== JSON.stringify(requirement)) findings.push({ code: "lint-setup-conflict", pack_id: requirement.pack_id, message: "Existing required lint owner needs explicit reconciliation." });
    }
    profile.requirements = requirements; profile.exclusions = previousLint.exclusions; profile.require_first_source = previousLint.require_first_source;
  }
  return { version: 1, status: findings.length ? "needs-setup" : paths.length ? "proposed" : "empty", files, profile, declarations, owners, findings,
    mutations: "none", acquisition: "explicit-project-package-manager-operation", publication: "not-requested" };
}
