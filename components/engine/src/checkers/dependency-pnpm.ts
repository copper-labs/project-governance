import { parse } from "yaml";
import { dependency, objectValue, npmExact, npmName, type DependencyCoordinate } from "./dependency-manifests.ts";

/** Catalogs and overrides are dependency declarations even when absent from package.json. */
export function parsePnpmWorkspace(path: string, source: string): DependencyCoordinate[] {
  let document: unknown;
  try { document = parse(source) ?? {}; } catch { throw new Error(`${path}: invalid pnpm workspace YAML`); }
  if (!objectValue(document)) throw new Error(`${path}: pnpm workspace must contain a mapping`);
  const values: DependencyCoordinate[] = [];
  const append = (raw: unknown, field: string, artifact: string) => {
    if (raw === null || raw === undefined) return;
    if (!objectValue(raw)) throw new Error(`${path}: ${field} must be an object`);
    for (const [name, version] of Object.entries(raw).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (!npmName.test(name)) throw new Error(`${path}: ${field} requires exact npm names without selectors or globs`);
      if (typeof version !== "string" || !npmExact.test(version)) throw new Error(`${path}: ${field} requires exact registry versions without nested or reference syntax`);
      values.push(dependency(name, "npm", version, artifact));
    }
  };
  append(document["catalog"], "catalog", "catalog");
  const catalogs = document["catalogs"];
  if (catalogs !== null && catalogs !== undefined) {
    if (!objectValue(catalogs)) throw new Error(`${path}: catalogs must be an object`);
    for (const [name, entries] of Object.entries(catalogs).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (!name) throw new Error(`${path}: catalog names must be non-empty`);
      append(entries, "catalogs", "catalog");
    }
  }
  append(document["overrides"], "overrides", "override");
  if (["packageExtensions", "patchedDependencies"].some(field => Object.hasOwn(document, field))) throw new Error(`${path}: unsupported dependency-bearing pnpm workspace fields`);
  return values;
}
