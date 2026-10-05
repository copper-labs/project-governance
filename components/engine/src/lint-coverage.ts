import { extname } from "node:path";
import type { ChangeScope, ValidationSubject } from "./change-subject.ts";
import type { Packs } from "./pack-configuration.ts";
import { commandApplies, matchesPackPath } from "./planning.ts";
import { commandExecutable } from "./native-check-command.ts";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCommandArgv } from "./command-argv.ts";
import { insideLintRoot, lintProfile, lintProfileComparison, LINT_EXTENSIONS, LINT_PROFILE_PATH, parseLintDeclaration, type LintDeclaration } from "./lint-configuration.ts";
import { validateLintConfigClosure } from "./lint-inputs.ts";

const SKIP = new Set([".git", ".governance", ".venv", "node_modules", "vendor", "generated", "build", "dist", "__pycache__"]);
const LANGUAGES: Record<string, string> = { ".py": "python", ".pyi": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript", ".kt": "kotlin", ".kts": "kotlin", ".swift": "swift", ".go": "go", ".rs": "rust", ".c": "c", ".cpp": "cpp", ".h": "c", ".dart": "dart", ".java": "java", ".cs": "csharp" };
export function lintSourcePaths(subject: ValidationSubject): string[] { return subject.paths().filter(path => !!LANGUAGES[extname(path)] && !path.split("/").some(part => SKIP.has(part))); }
export function lintSourceLanguage(path: string): string | null { return LANGUAGES[extname(path)] ?? null; }

/** Coverage is passive declared readiness; it never substitutes for a fresh executed lint result. */
export function lintCoverage(subject: ValidationSubject, packs: Packs) {
  const findings: Array<Record<string, unknown>> = [], roots: Array<Record<string, unknown>> = [];
  let profile;
  try { profile = lintProfile(subject); } catch (error) { return { status: "needs-setup", roots, findings: [{ code: "lint-profile-invalid", message: error instanceof Error ? error.message : "Invalid lint profile" }], execution: "not-performed" }; }
  const paths = lintSourcePaths(subject);
  if (!profile) return { status: "not-adopted", roots, findings, execution: "not-performed", detected_languages: [...new Set(paths.map(lintSourceLanguage))].sort() };
  for (const requirement of profile.requirements) {
    const pack = packs[requirement.pack_id], gaps: string[] = [];
    if (!pack || (pack.implementation_status ?? "active") !== "active" || pack.enforcement !== "blocking") gaps.push("required blocking pack is missing or inactive");
    if (pack) for (const stage of requirement.stages) if (!pack.stages.includes(stage) || !pack.commands.some(command => commandApplies(command, stage))) gaps.push(`required stage ${stage} has no command`);
    let backend = "project-owned", version: string | null = null, declaration: LintDeclaration | null = null;
    if (pack?.lint !== undefined) {
      try {
        declaration = parseLintDeclaration(pack.lint); backend = declaration.backend; version = declaration.tool.version;
        const declaredRoots = declaration.roots;
        if (requirement.roots.some(root => !declaredRoots.includes(root))) gaps.push("pack does not declare every required root");
        for (const path of [declaration.config, ...declaration.inputs]) if (subject.source(path)?.file_type !== "regular") gaps.push(`required input ${path} is missing`);
        commandExecutable(declaration.tool.argv[0]!, subject.root);
        if (declaration.backend === "ruff" && declaration.tool.version !== "0.15.14" || declaration.backend === "eslint" && declaration.tool.version !== "9.39.1") gaps.push("declared tool version is outside the qualified backend contract");
        if (declaration.backend === "eslint" && declaration.tool.argv[1] && !declaration.tool.argv[1].startsWith("-") && !lstatSync(resolve(subject.root, declaration.tool.argv[1])).isFile()) gaps.push("ESLint tool script is missing");
        for (const path of declaration.dependency_roots) if (!lstatSync(resolve(subject.root, path)).isDirectory()) gaps.push(`installed dependency root ${path} is missing`);
        if (declaration.backend === "eslint" && declaration.dependency_roots.length && !declaration.inputs.some(path => /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/u.test(path))) gaps.push("installed lint dependencies need a declared lock input");
        const texts = new Map([declaration.config, ...declaration.inputs].filter(path => subject.source(path)?.file_type === "regular").map(path => [path, subject.read(path, 4 * 1024 * 1024).toString("utf8")]));
        validateLintConfigClosure(declaration, texts);
      } catch (error) { gaps.push(error instanceof Error ? error.message : "invalid lint configuration"); }
    } else if (pack) {
      if (pack.change_packet_contract !== 1) gaps.push("project-owned adapter must declare captured packet contract 1");
      try { for (const command of pack.commands) { const argv = resolveCommandArgv(command, { stage: "batch" }); commandExecutable(argv[0]!, subject.root); } } catch { gaps.push("project-owned lint command is unavailable"); }
    }
    if (pack) for (const path of paths.filter(path => requirement.roots.some(root => insideLintRoot(path, root)))) {
      if (profile.exclusions.some(exclusion => insideLintRoot(path, exclusion.root))) continue;
      if (declaration && !LINT_EXTENSIONS[declaration.backend].has(extname(path))) continue;
      if (declaration && matchesPackPath(path, declaration.excludes)) gaps.push(`source ${path} needs a profile exclusion with a reason`);
      if (!matchesPackPath(path, pack.path_globs)) gaps.push(`required source ${path} is not selected by its pack`);
    }
    roots.push({ pack_id: requirement.pack_id, roots: requirement.roots, stages: requirement.stages, backend, version, state: gaps.length ? "needs-setup" : "ready", gaps });
    if (gaps.length) findings.push({ code: "lint-required-coverage-missing", pack_id: requirement.pack_id, message: [...new Set(gaps)].join("; ") });
  }
  for (const exclusion of profile.exclusions) roots.push({ root: exclusion.root, state: "explicitly-excluded", reason: exclusion.reason });
  if (profile.require_first_source) for (const path of paths) {
    if (profile.exclusions.some(exclusion => insideLintRoot(path, exclusion.root))) continue;
    const covered = profile.requirements.some(requirement => {
      if (!requirement.roots.some(root => insideLintRoot(path, root))) return false;
      const pack = packs[requirement.pack_id];
      if (!pack || !matchesPackPath(path, pack.path_globs)) return false;
      if (pack.lint === undefined) return true;
      try { const declaration = parseLintDeclaration(pack.lint); return LINT_EXTENSIONS[declaration.backend].has(extname(path)) && !matchesPackPath(path, declaration.excludes); } catch { return false; }
    });
    if (!covered) findings.push({ code: "lint-first-source-uncovered", path, language: LANGUAGES[extname(path)], message: "Source requires adopted lint coverage or an explicit exclusion." });
  }
  return { status: findings.length ? "needs-setup" : paths.length ? "ready" : "empty", roots, findings, execution: "not-performed", version_validation: "installed-version-checked-on-execution" };
}

/** The ordinary planner consumes captured obligations, so removing a pack cannot silently remove its gate. */
export function lintPlanBlockers(subject: ValidationSubject, packs: Packs, stage: string | null, changedPaths: string[], selectedPackIds?: string[], allMode = false, scope?: ChangeScope) {
  if (stage === "commit-msg" || stage === null) return [];
  const comparison = scope ? lintProfileComparison(subject, scope) : null;
  const profile = comparison?.after ?? lintProfile(subject), previous = comparison?.before, retained: Array<Record<string, unknown>> = [];
  for (const requirement of previous?.requirements ?? []) if (requirement.stages.includes(stage)) for (const root of requirement.roots) {
    const excluded = profile?.exclusions.some(exclusion => insideLintRoot(root, exclusion.root));
    const replaced = profile?.requirements.some(owner => owner.roots.some(target => insideLintRoot(root, target)) && requirement.stages.every(requiredStage => owner.stages.includes(requiredStage)));
    if (!excluded && !replaced) retained.push({ code: "lint-required-obligation-removed", pack_id: requirement.pack_id, root, message: "Retain this required root and stage coverage, replace its owner, or record an explicit exclusion reason." });
  }
  if (previous?.require_first_source && !profile?.require_first_source && !profile?.exclusions.some(exclusion => exclusion.root === ".")) retained.push({ code: "lint-first-source-obligation-removed", message: "Retain first-source coverage or record an explicit whole-project exclusion reason." });
  if (!profile) return retained;
  const coverage = lintCoverage(subject, packs);
  const findings: Array<Record<string, unknown>> = coverage.findings.filter(finding => {
    const requirement = profile.requirements.find(item => item.pack_id === finding.pack_id);
    if (requirement && !requirement.stages.includes(stage)) return false;
    return !finding.path || allMode || comparison?.changed || changedPaths.includes(String(finding.path)) || stage === "release";
  });
  if (selectedPackIds) for (const requirement of profile.requirements) {
    if (!requirement.stages.includes(stage) || selectedPackIds.includes(requirement.pack_id)) continue;
    const pack = packs[requirement.pack_id], declaration = pack?.lint === undefined ? null : parseLintDeclaration(pack.lint);
    const inputs = [...(comparison?.changed || !scope ? [LINT_PROFILE_PATH] : []), pack?._source ?? `config/validation/packs/${requirement.pack_id}.yaml`, ...(declaration ? [declaration.config, ...declaration.inputs.filter(path => path !== LINT_PROFILE_PATH || comparison?.changed || !scope)] : [])];
    const sourceChanged = (path: string) => (declaration ? LINT_EXTENSIONS[declaration.backend].has(extname(path)) : lintSourceLanguage(path) !== null) && requirement.roots.some(root => insideLintRoot(path, root)) && !profile.exclusions.some(exclusion => insideLintRoot(path, exclusion.root));
    if (allMode && lintSourcePaths(subject).some(sourceChanged) || changedPaths.some(path => inputs.includes(path) || sourceChanged(path))) findings.push({ code: "lint-required-owner-omitted", pack_id: requirement.pack_id, message: "The selected check omits required lint coverage for this candidate." });
  }
  return [...retained, ...findings];
}

/** Ignore only lint owners' shared-profile match when their canonical declaration did not change. */
export function lintIgnoredPathMatches(subject: ValidationSubject, scope: ChangeScope, packs: Packs): Record<string, string[]> {
  if (!scope.records.some(record => record.path === LINT_PROFILE_PATH || record.previous_path === LINT_PROFILE_PATH)) return {};
  const comparison = lintProfileComparison(subject, scope); if (comparison.changed) return {};
  const owners = new Set([...(comparison.after?.requirements ?? []).map(requirement => requirement.pack_id), ...Object.values(packs).filter(pack => pack.lint !== undefined).map(pack => pack.id)]);
  return Object.fromEntries([...owners].map(id => [id, [LINT_PROFILE_PATH]]));
}
