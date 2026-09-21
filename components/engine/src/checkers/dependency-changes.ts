import type { Finding } from "../checker-results.ts";
import { coordinateKey } from "./dependency-evidence.ts";
import type { DependencyCoordinate, DependencyDefect } from "./dependency-manifests.ts";
export interface DependencyImage { values: DependencyCoordinate[]; defects: DependencyDefect[] }
export interface DependencyChange { path: string; after: DependencyCoordinate[]; changed: Map<string, DependencyCoordinate>; local: Set<string>; removed: boolean }
const fields: Record<string, string[]> = { direct: ["dependencies"], development: ["devDependencies"], optional: ["optionalDependencies"], peer: ["peerDependencies"], override: ["overrides", "resolutions", "pnpm.overrides"], toolchain: ["packageManager"] };
function repairKeys(path: string, coordinate: DependencyCoordinate): string[] {
  if (coordinate.ecosystem !== "npm") return [];
  if (path.endsWith("package.json")) return (fields[coordinate.artifact_type] ?? []).map(field => JSON.stringify(["manifest", field, coordinate.name]));
  return path.endsWith("package-lock.json") ? [JSON.stringify(["lock", coordinate.name])] : [];
}
/** Preserve the existing repair exemption: fixing an entry defect alone does not create a new age obligation. */
export function dependencyChange(path: string, before: DependencyImage, after: DependencyImage | null,
  workspace: { consumers: Set<string>; versions: Map<string, string> }) {
  const findings: Finding[] = [], changed = new Map<string, DependencyCoordinate>(), local = new Set<string>();
  if (!after) return { change: { path, after: [], changed, local, removed: true } satisfies DependencyChange, findings };
  const previous = new Set(before.values.map(coordinateKey)), remainingRepairs = new Set(after.defects.map(defect => JSON.stringify(defect.repair_key)));
  const repaired = new Set(before.defects.map(defect => JSON.stringify(defect.repair_key)).filter(key => !remainingRepairs.has(key)));
  for (const coordinate of after.values) {
    const key = coordinateKey(coordinate);
    if (!previous.has(key) && !repairKeys(path, coordinate).some(key => repaired.has(key))) changed.set(key, coordinate);
  }
  const priorDefects = new Set(before.defects.map(defect => JSON.stringify(defect.identity)));
  for (const defect of after.defects) if (!priorDefects.has(JSON.stringify(defect.identity))) findings.push({ rule_id: "dependency.unsupported-format", path, severity: "blocking", message: defect.message });
  for (const [key, coordinate] of changed) if (workspace.consumers.has(path) && coordinate.ecosystem === "npm" &&
    ["direct", "development", "optional", "peer"].includes(coordinate.artifact_type) && workspace.versions.get(coordinate.name) === coordinate.version) local.add(key);
  return { change: { path, after: after.values, changed, local, removed: false } satisfies DependencyChange, findings };
}
export function evaluateDependencyChanges(changes: DependencyChange[], evidence: Map<string, unknown>, evidenceMatches: Set<string>, overrides: Map<string, unknown>, overrideMatches: Set<string>) {
  const checked: Record<string, unknown>[] = [], findings: Finding[] = [], uncovered = new Map<string, string>();
  for (const change of changes) {
    if (change.removed) { checked.push({ path: change.path, status: "removed", changed_dependency_count: 0 }); continue; }
    const external = [...change.changed.keys()].filter(key => !change.local.has(key)), missing = external.filter(key => !evidenceMatches.has(key) && !overrideMatches.has(key));
    for (const key of missing) if (!uncovered.has(key)) uncovered.set(key, change.path);
    let status = "no-coordinate-changes";
    if (change.changed.size) status = missing.length ? "evidence-missing" : external.some(key => !evidence.has(key) && !overrides.has(key)) ? "evidence-invalid" : !external.length ? "local-workspace" :
      external.some(key => overrides.has(key)) && !external.some(key => evidence.has(key)) ? "operator-override" : "evidence-verified";
    checked.push({ path: change.path, status, dependency_count: change.after.length, changed_dependency_count: change.changed.size,
      local_workspace_dependency_count: change.local.size, changed_dependencies: [...change.changed].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, coordinate]) => coordinate) });
  }
  for (const [key, path] of uncovered) findings.push({ rule_id: "dependency.evidence-missing", path, severity: "blocking", message: `Introduced or updated dependency lacks exact freshness evidence or override: ${key}` });
  return { checked, findings };
}
