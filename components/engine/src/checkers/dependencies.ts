import { npmRegistryBases, type NpmRegistries } from "./dependency-registry.ts";
import { posix } from "node:path";
import { parse } from "yaml";
import { canonical } from "../core.ts";
import { ValidationSubject, readSubjectSource, type ChangeScope } from "../change-subject.ts";
import { SOURCE_CAPTURE_MAX_BYTES, SOURCE_CAPTURE_BATCH_MAX_BYTES } from "../source-capture-limits.ts";
import { findingSummary, type Finding } from "../checker-results.ts";
import { glob } from "../planning.ts";
import { parsePackageManifest, parseRequirements, objectValue } from "./dependency-manifests.ts";
import { parseMavenPom } from "./dependency-maven.ts";
import { parsePackageLock } from "./dependency-lock.ts";
import { parsePnpmWorkspace } from "./dependency-pnpm.ts";
import { parseWorkflowDependencies } from "./dependency-workflows.ts";
import { validateNpmrc, validateYarnrc } from "./dependency-config.ts";
import { validateDependencyPolicy } from "./dependency-policy.ts";
import { indexDependencyEvidence, registryCoordinateKey } from "./dependency-evidence.ts";
import { npmSelectionInput, readNpmRangeSelections, resolveNpmRanges } from "./dependency-range-selections.ts";
import { admitSourceRanges, readSourceRangeProjection, verifySourceRangeInputs } from "./dependency-source-ranges.ts";
import { retainedArchiveIntegrities, verifySignedLock } from "./dependency-signed-lock.ts";
import { indexDependencyOverrides } from "./dependency-overrides.ts";
import { dependencyMoment } from "./dependency-time.ts";
import { localWorkspaceCoordinates } from "./dependency-workspaces.ts";
import { dependencyChange, evaluateDependencyChanges, type DependencyImage, type DependencyChange } from "./dependency-changes.ts";
const governedPatterns = ["package.json", "**/package.json", "package-lock.json", "**/package-lock.json", "pnpm-workspace.yaml", "**/pnpm-workspace.yaml", "requirements*.txt", "**/requirements*.txt", "pom.xml", "**/pom.xml", ".npmrc", "**/.npmrc", ".yarnrc.yml", "**/.yarnrc.yml", ".github/workflows/*.yml", ".github/workflows/*.yaml"];
export const governedDependencyPath = (path: string) => governedPatterns.some(pattern => glob(path, pattern));
export function extractDependencyImage(path: string, source: string, registries: NpmRegistries, signedIntegrities?: ReadonlyMap<string, string>): DependencyImage {
  const name = posix.basename(path);
  if (name === "package.json") return parsePackageManifest(path, source);
  if (name === "package-lock.json") return parsePackageLock(path, source, registries, signedIntegrities);
  if (path.startsWith(".github/workflows/") && /\.ya?ml$/u.test(path)) return parseWorkflowDependencies(path, source);
  if (name === "pom.xml") return { values: parseMavenPom(path, source), defects: [] };
  if (name === "pnpm-workspace.yaml") return { values: parsePnpmWorkspace(path, source), defects: [] };
  if (glob(name, "requirements*.txt")) return { values: parseRequirements(path, source), defects: [] };
  if (name === ".npmrc") { validateNpmrc(path, source, registries); return { values: [], defects: [] }; }
  if (name === ".yarnrc.yml") { validateYarnrc(path, source); return { values: [], defects: [] }; }
  throw new Error("Governed dependency format has no native parser yet");
}
export interface DependencyCheckOptions { policyPath: string; evidencePath: string; overridesPath: string; asOf: string; defaultPolicy?: Record<string, unknown>; archivesDirectory?: string }

type AddFinding = (rule: string, path: string, message: string) => void;
type DependencyRecord = Pick<ChangeScope["records"][number], "path" | "before" | "after">;

/** Load accepted producer and signed admission authority from the comparison base. */
function loadRangeProofs(subject: ValidationSubject, scope: ChangeScope, options: DependencyCheckOptions,
  policy: ReturnType<typeof validateDependencyPolicy>, registries: NpmRegistries, add: AddFinding) {
  // The candidate may prepare future approval. Only the comparison base can authorize this check.
  const rangePath = posix.join(posix.dirname(options.policyPath), "dependency-range-selections.yaml");
  const sourceRangePath = posix.join(posix.dirname(options.policyPath), "dependency-source-ranges.yaml");
  const changedPaths = new Set(scope.records.flatMap(record => record.previous_path ? [record.path, record.previous_path] : [record.path]));
  const rangePolicyTouched = [options.policyPath, rangePath, options.evidencePath, options.overridesPath].some(path => changedPaths.has(path));
  let ranges: ReturnType<typeof readNpmRangeSelections> | undefined;
  let signedAuthority: ReturnType<typeof validateDependencyPolicy>["signedLockTargets"] = null;
  const trustedRegistries: NpmRegistries = {};
  let baseAuthority: ReturnType<typeof validateDependencyPolicy> | undefined;
  if ((scope.mode === "staged" || scope.candidate_ref) &&
      (policy.rangeSelectionsDigest || policy.sourceRanges || changedPaths.has(options.policyPath))) {
    try {
      const base = subject.baseSource(options.policyPath);
      if (base?.file_type === "regular") {
        const document: unknown = parse(readSubjectSource(subject.root, base, 4 * 1024 * 1024).toString("utf8"));
        if (objectValue(document)) baseAuthority = validateDependencyPolicy(document, options.policyPath, options.evidencePath);
      }
    } catch { /* Invalid historical policy never establishes range authority. */ }
  }
  if (baseAuthority?.rangeTargets) {
    try {
      const authority = baseAuthority;
      const receipt = subject.baseSource(rangePath);
      if (!authority.rangeSelectionsDigest || !authority.rangeTargets || receipt?.file_type !== "regular" ||
          !policy.rangeSelectionsDigest || !policy.rangeTargets)
        throw new Error("Missing valid comparison-base npm range selection authority");
      for (const name of Object.keys(authority.registries)) {
        if (!Object.hasOwn(registries, name)) continue;
        const current = new Set(npmRegistryBases(name, registries));
        const common = npmRegistryBases(name, authority.registries).filter(base => current.has(base));
        if (common.length) trustedRegistries[name] = common;
      }
      if (authority.signedLockTargets && !policy.signedLockTargets) throw new Error("Signed lock authority removed");
      ranges = readNpmRangeSelections(readSubjectSource(subject.root, receipt, 4 * 1024 * 1024),
        authority.rangeSelectionsDigest, trustedRegistries, authority.rangeTargets);
      if (changedPaths.has(rangePath) || changedPaths.has(options.policyPath)) {
        const future = subject.source(rangePath);
        if (future?.file_type !== "regular" || future.kind === "worktree") throw new Error("Missing captured range proof");
        readNpmRangeSelections(readSubjectSource(subject.root, future, 4 * 1024 * 1024),
          policy.rangeSelectionsDigest, registries, policy.rangeTargets);
      }
      signedAuthority = authority.signedLockTargets;
    } catch {
      ranges = undefined;
      add("dependency.range-evidence-invalid", rangePath, "Npm range proof does not match the accepted target set, receipt or scoped registry.");
    }
  }
  let sourceRanges: ReturnType<typeof readSourceRangeProjection> | undefined;
  let recheckSourceRanges = false;
  if (baseAuthority?.sourceRanges) {
    try {
      const projection = subject.baseSource(sourceRangePath);
      if (baseAuthority.findings.length || policy.findings.length || !policy.sourceRanges || projection?.file_type !== "regular")
        throw new Error("Missing valid comparison-base source range authority");
      const source = readSourceRangeProjection(readSubjectSource(subject.root, projection, 4 * 1024 * 1024), baseAuthority.sourceRanges);
      const authorityChanged = changedPaths.has(sourceRangePath) || changedPaths.has(options.policyPath);
      recheckSourceRanges = authorityChanged || [...source.inputs.keys()].some(path => changedPaths.has(path));
      if (authorityChanged) {
        const future = subject.source(sourceRangePath);
        if (future?.file_type !== "regular" || future.kind === "worktree") throw new Error("Missing captured source range projection");
        readSourceRangeProjection(readSubjectSource(subject.root, future, 4 * 1024 * 1024), policy.sourceRanges);
      }
      if (recheckSourceRanges || [...source.byPath.keys()].some(path => changedPaths.has(path))) {
        let remaining = SOURCE_CAPTURE_BATCH_MAX_BYTES;
        verifySourceRangeInputs(source, path => {
          const input = subject.source(path);
          if (input?.file_type !== "regular" || input.kind === "worktree" || remaining < 1)
            throw new Error("Source range proof requires bounded immutable producer inputs");
          const bytes = readSubjectSource(subject.root, input, Math.min(SOURCE_CAPTURE_MAX_BYTES, remaining));
          remaining -= bytes.length;
          return bytes;
        });
        sourceRanges = source;
      }
    } catch {
      add("dependency.source-range-invalid", sourceRangePath, "Source range proof differs from the accepted targets or captured producer inputs.");
    }
  }
  return { ranges, signedAuthority, trustedRegistries, sourceRanges, recheckSourceRanges, changedPaths, rangePolicyTouched };
}

/** Expand the check to affected immutable inputs and verify the exact signed locks it consumes. */
function prepareRangeInputs(subject: ValidationSubject, scope: ChangeScope, options: DependencyCheckOptions,
  proofs: ReturnType<typeof loadRangeProofs>, asOf: bigint, add: AddFinding) {
  const { ranges, signedAuthority, trustedRegistries, sourceRanges, recheckSourceRanges, changedPaths, rangePolicyTouched } = proofs;
  const inputs = new Map<string, ReturnType<typeof npmSelectionInput>>();
  let remainingInputBytes = SOURCE_CAPTURE_BATCH_MAX_BYTES;
  const loadSelectionInput = (path: string) => {
    const cached = inputs.get(path);
    if (cached) return cached;
    const source = subject.source(path);
    if (source?.file_type !== "regular" || source.kind === "worktree") throw new Error("Npm range needs immutable consumer inputs");
    if (remainingInputBytes < 1) throw new Error("Npm range proof exceeded the consumer input budget");
    const bytes = readSubjectSource(subject.root, source, Math.min(SOURCE_CAPTURE_MAX_BYTES, remainingInputBytes));
    remainingInputBytes -= bytes.length;
    const input = npmSelectionInput(bytes);
    inputs.set(path, input);
    return input;
  };
  const records: DependencyRecord[] = scope.mode === "all" ? subject.paths().filter(governedDependencyPath).map(path => ({ path, before: null, after: subject.source(path) })) : [...scope.records];
  if (recheckSourceRanges) for (const path of sourceRanges?.byPath.keys() ?? []) {
    if (changedPaths.has(path) || ranges?.has(path)) continue;
    const source = subject.source(path);
    if (source) records.push({ path, before: source, after: source });
  }
  const usedLocks = new Set<string>();
  for (const [path, selections] of ranges ?? []) {
    if (!rangePolicyTouched && !changedPaths.has(path) &&
        !selections.some(row => changedPaths.has(row.lock.path) || changedPaths.has(row.consumer.path))) continue;
    const source = subject.source(path);
    if (!source) continue;
    if (!changedPaths.has(path)) records.push({ path, before: source, after: source });
    for (const row of selections) usedLocks.add(row.lock.path);
  }
  const signedLocks = new Map<string, ReturnType<typeof verifySignedLock>>();
  const archiveIntegrity = retainedArchiveIntegrities(options.archivesDirectory);
  for (const [path, target] of signedAuthority ?? []) {
    if (!usedLocks.has(path) && !rangePolicyTouched && !changedPaths.has(target.consumer) && !changedPaths.has(path)) continue;
    try {
      const proof = verifySignedLock(target, trustedRegistries, asOf, loadSelectionInput, archiveIntegrity);
      signedLocks.set(path, proof);
      if (!changedPaths.has(path)) {
        const source = subject.source(path);
        if (source) records.push({ path, before: source, after: source });
      }
    } catch {
      add("dependency.signed-lock-invalid", path, "Signed lock proof expired or differs from its selection, consumer, lock or retained archive bytes.");
    }
  }
  return { records, signedLocks, loadSelectionInput };
}

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
  const proofs = loadRangeProofs(subject, scope, options, policy, registries, add);
  const { ranges, sourceRanges } = proofs;
  const { records, signedLocks, loadSelectionInput } = prepareRangeInputs(subject, scope, options, proofs, asOf, add);
  const changes: DependencyChange[] = [], relevant = new Set<string>();
  const sourceAdmissions: ReturnType<typeof admitSourceRanges>["rows"] = [];
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
      if (record.after.file_type !== "regular") throw new Error("Dependency input must be regular");
      const bytes = readSubjectSource(subject.root, record.after);
      const signedLock = signedLocks.get(record.path);
      const after = extractDependencyImage(record.path, bytes.toString("utf8"), registries, signedLock?.integrities);
      const selections = ranges?.get(record.path);
      let resolution: ReturnType<typeof resolveNpmRanges> | undefined;
      if (selections) {
        try {
          if (record.after.kind === "worktree") throw new Error("Npm range needs immutable manifest bytes");
          const admitted = resolveNpmRanges(selections, bytes, after.defects, asOf, loadSelectionInput,
            (path, name) => signedLocks.get(path)?.integrities.get(`node_modules/${name}`));
          after.defects = after.defects.filter(defect => !admitted.admitted.has(canonical(defect.identity)));
          resolution = admitted;
        } catch {
          add("dependency.range-evidence-invalid", record.path, "Npm range proof expired or does not cover the captured manifest and consumer lock.");
        }
      }
      const sourceBindings = sourceRanges?.byPath.get(record.path);
      if (!selections && sourceBindings && record.after.kind !== "worktree") {
        const admitted = admitSourceRanges(sourceBindings, after.defects);
        after.defects = after.defects.filter(defect => !admitted.admitted.has(canonical(defect.identity)));
        sourceAdmissions.push(...admitted.rows);
      }
      const result = dependencyChange(record.path, before, after, workspace);
      // Every admitted range remains an external exact coordinate, even when a local workspace happens to match.
      for (const { coordinate, registry } of [...(resolution?.coordinates ?? []), ...(signedLock?.coordinates ?? [])]) {
        const key = registryCoordinateKey(coordinate, registry);
        result.change.changed.set(key, coordinate);
        result.change.local.delete(key);
      }
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
  return { version: 1, check: "dependency-freshness", ...findingSummary(findings), minimum_age_days: policy.minimumAgeDays, evaluated_at: options.asOf, checked: evaluated.checked, findings,
    ...(sourceAdmissions.length ? { source_range_admissions: sourceAdmissions } : {}),
    ...(signedLocks.size ? { signed_lock_admissions: [...signedLocks.values()].map(proof => proof.admission) } : {}) };
}
