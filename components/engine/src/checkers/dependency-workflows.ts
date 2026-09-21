import { parse } from "yaml";
import { dependency, objectValue, type DependencyCoordinate, type DependencyDefect } from "./dependency-manifests.ts";

/** Inspect workflow declarations without executing expressions, actions, or remote requests. */
export function parseWorkflowDependencies(path: string, source: string): { values: DependencyCoordinate[]; defects: DependencyDefect[] } {
  let document: unknown;
  try { document = parse(source); } catch { throw new Error(`${path}: invalid workflow YAML`); }
  if (!objectValue(document) || !objectValue(document["jobs"])) throw new Error(`${path}: workflow jobs must be a mapping`);
  const uses: string[] = [];
  const collect = (record: Record<string, unknown>) => {
    if (!Object.hasOwn(record, "uses")) return;
    if (typeof record["uses"] !== "string") throw new Error(`${path}: workflow uses must be a string`);
    uses.push(record["uses"]);
  };
  for (const [, job] of Object.entries(document["jobs"]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!objectValue(job)) throw new Error(`${path}: workflow job must be a mapping`);
    if (["container", "services"].some(field => Object.hasOwn(job, field))) throw new Error(`${path}: remote workflow images require a supported immutable evidence parser`);
    collect(job);
    const steps = job["steps"] ?? [];
    if (!Array.isArray(steps)) throw new Error(`${path}: workflow steps must be a list`);
    for (const step of steps) { if (!objectValue(step)) throw new Error(`${path}: workflow step must be a mapping`); collect(step); }
  }
  const values: DependencyCoordinate[] = [], defects: DependencyDefect[] = [];
  for (const reference of uses) {
    if (reference.startsWith("./")) continue;
    if (reference.startsWith("docker://")) throw new Error(`${path}: docker action references require a file-digest override`);
    const separator = reference.lastIndexOf("@"), name = separator < 0 ? "" : reference.slice(0, separator), revision = separator < 0 ? reference : reference.slice(separator + 1);
    if (!name || !/^[a-fA-F0-9]{40}$/u.test(revision)) defects.push({ identity: ["workflow-action", reference], repair_key: ["workflow-action", name || reference],
      message: `${path}: action must be pinned to a 40-character commit SHA` });
    else values.push(dependency(name, "github-actions", revision.toLowerCase(), "ci"));
  }
  return { values, defects };
}
