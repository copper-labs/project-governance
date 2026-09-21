import { posix } from "node:path";
import { parse } from "yaml";
import { ValidationSubject, readSubjectSource, type ChangeScope } from "../change-subject.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { glob } from "../planning.ts";
import { parsePackageManifest, parseRequirements, objectValue } from "./dependency-manifests.ts";
import { parseMavenPom } from "./dependency-maven.ts";
import { parsePackageLock } from "./dependency-lock.ts";
import { parsePnpmWorkspace } from "./dependency-pnpm.ts";
import { parseWorkflowDependencies } from "./dependency-workflows.ts";
import { validateNpmrc, validateYarnrc } from "./dependency-config.ts";
import { validateDependencyPolicy } from "./dependency-policy.ts";
import { indexDependencyEvidence } from "./dependency-evidence.ts";
import { indexDependencyOverrides } from "./dependency-overrides.ts";
import { dependencyMoment } from "./dependency-time.ts";
import { localWorkspaceCoordinates } from "./dependency-workspaces.ts";
import { dependencyChange, evaluateDependencyChanges, type DependencyImage, type DependencyChange } from "./dependency-changes.ts";
const governedPatterns = ["package.json", "**/package.json", "package-lock.json", "**/package-lock.json", "pnpm-workspace.yaml", "**/pnpm-workspace.yaml", "requirements*.txt", "**/requirements*.txt", "pom.xml", "**/pom.xml", ".npmrc", "**/.npmrc", ".yarnrc.yml", "**/.yarnrc.yml", ".github/workflows/*.yml", ".github/workflows/*.yaml"];
export const governedDependencyPath = (path: string) => governedPatterns.some(pattern => glob(path, pattern));
export function extractDependencyImage(path: string, source: string, registries: Record<string, string>): DependencyImage {
  const name = posix.basename(path);
  if (name === "package.json") return parsePackageManifest(path, source);
  if (name === "package-lock.json") return parsePackageLock(path, source, registries);
  if (path.startsWith(".github/workflows/") && /\.ya?ml$/u.test(path)) return parseWorkflowDependencies(path, source);
  if (name === "pom.xml") return { values: parseMavenPom(path, source), defects: [] };
  if (name === "pnpm-workspace.yaml") return { values: parsePnpmWorkspace(path, source), defects: [] };
  if (glob(name, "requirements*.txt")) return { values: parseRequirements(path, source), defects: [] };
  if (name === ".npmrc") { validateNpmrc(path, source, registries); return { values: [], defects: [] }; }
  if (name === ".yarnrc.yml") { validateYarnrc(path, source); return { values: [], defects: [] }; }
  throw new Error("Governed dependency format has no native parser yet");
}
export interface DependencyCheckOptions { policyPath: string; evidencePath: string; overridesPath: string; asOf: string; defaultPolicy?: Record<string, unknown> }
/** Every source and policy read belongs to the same captured validation graph. */
export function checkDependencies(subject: ValidationSubject, scope: ChangeScope, options: DependencyCheckOptions) {
  const findings: Finding[] = [];
  const add = (rule_id: string, path: string, message: string) => findings.push({ rule_id, path, severity: "blocking", message });
  const load = (path: string, required: boolean, rule: string): Record<string, unknown> | null => {
    try {
      if (!subject.source(path)) {
        const removed = scope.records.some(record => record.path === path || record.previous_path === path);
        if (required && !removed && options.defaultPolicy && path === options.policyPath) return options.defaultPolicy;
        if (required) add(rule, path, removed ? "Required dependency configuration was removed." : "Required dependency configuration is missing.");
        return null;
      }
      const value: unknown = parse(subject.read(path, 4 * 1024 * 1024).toString("utf8"));
      if (!objectValue(value)) throw new Error("Invalid mapping");
      return value;
    } catch { add(rule, path, "Dependency configuration cannot be read as a captured YAML mapping."); return null; }
  };
  const policy = validateDependencyPolicy(load(options.policyPath, true, "dependency.policy-invalid") ?? {}, options.policyPath, options.evidencePath);
  findings.push(...policy.findings);
  const registries = policy.findings.length ? {} : policy.registries;
  const asOf = dependencyMoment(options.asOf, "as_of"), workspace = localWorkspaceCoordinates(subject);
  const changes: DependencyChange[] = [], relevant = new Set<string>();
  const records = scope.mode === "all" ? subject.paths().filter(governedDependencyPath).map(path => ({ path, before: null, after: subject.source(path) })) : scope.records;
  for (const record of records) {
    if (!governedDependencyPath(record.path)) {
      if (scope.mode === "explicit") add("dependency.unsupported-format", record.path, "Explicit dependency path is outside the supported governed surface.");
      continue;
    }
    if (!record.after) { changes.push({ path: record.path, after: [], changed: new Map(), local: new Set(), removed: true }); continue; }
    try {
      const read = (source: NonNullable<typeof record.after>) => {
        if (source.file_type !== "regular") throw new Error("Dependency input must be regular");
        return extractDependencyImage(record.path, readSubjectSource(subject.root, source).toString("utf8"), registries);
      };
      const before = record.before ? read(record.before) : { values: [], defects: [] };
      const result = dependencyChange(record.path, before, record.after ? read(record.after) : null, workspace);
      changes.push(result.change); findings.push(...result.findings);
      for (const key of result.change.changed.keys()) if (!result.change.local.has(key)) relevant.add(key);
    } catch { add("dependency.unsupported-format", record.path, "Captured dependency source is unreadable or uses unsupported governed syntax."); }
  }
  const evidenceDocument = load(options.evidencePath, false, "dependency.evidence-invalid"), overrideDocument = load(options.overridesPath, false, "dependency.override-invalid");
  const emptyIndex = () => ({ indexed: new Map<string, Record<string, unknown>>(), matched: new Set<string>(), errors: [] as string[] });
  const evidence = evidenceDocument ? indexDependencyEvidence(evidenceDocument, policy.minimumAgeDays, asOf, relevant, registries) : emptyIndex();
  const overrides = overrideDocument ? indexDependencyOverrides(overrideDocument, policy.maximumOverrideDays, asOf, relevant, registries) : emptyIndex();
  evidence.errors.forEach(error => add("dependency.evidence-invalid", options.evidencePath, error));
  overrides.errors.forEach(error => add("dependency.override-invalid", options.overridesPath, error));
  const evaluated = evaluateDependencyChanges(changes, evidence.indexed, evidence.matched, overrides.indexed, overrides.matched);
  findings.push(...evaluated.findings);
  return { version: 1, check: "dependency-freshness", ...findingSummary(findings), minimum_age_days: policy.minimumAgeDays, evaluated_at: options.asOf, checked: evaluated.checked, findings };
}
