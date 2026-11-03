import { dependency, npmExact, npmDefect, objectValue, type DependencyCoordinate, type DependencyDefect } from "./dependency-manifests.ts";
import { npmUrlMatches } from "./dependency-registry.ts";
export function validSha512Integrity(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("sha512-")) return false;
  const encoded = value.slice(7);
  return /^[A-Za-z0-9+/]{86}==$/u.test(encoded) && Buffer.from(encoded, "base64").length === 64;
}
/** Bundled bytes inherit the enclosing registry tarball integrity, never an invented child URL. */
function bundledEntries(rows: Array<[string, unknown]>, registries: Record<string, string>): Set<string> {
  const entries = new Map(rows), covered = new Set<string>();
  for (const [ownerPath, owner] of rows) {
    if (!objectValue(owner) || owner["link"] === true || !Array.isArray(owner["bundleDependencies"]) || !ownerPath.includes("node_modules/")) continue;
    const name = owner["name"] ? String(owner["name"]) : ownerPath.slice(ownerPath.lastIndexOf("node_modules/") + 13), version = owner["version"];
    if (typeof version !== "string" || !npmExact.test(version) ||
        !npmUrlMatches(name, `/-/${name.split("/").at(-1)}-${version}.tgz`, owner["resolved"], registries) ||
        !validSha512Integrity(owner["integrity"])) continue;
    const resolve = (from: string, dependencyName: string): string | null => {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu.test(dependencyName)) return null;
      let current = from;
      while (current === ownerPath || current.startsWith(`${ownerPath}/node_modules/`)) {
        const candidate = `${current}/node_modules/${dependencyName}`;
        if (entries.has(candidate)) return candidate;
        const at = current.lastIndexOf("/node_modules/");
        if (at < 0) break;
        current = current.slice(0, at);
      }
      return null;
    };
    const pending = owner["bundleDependencies"].filter((value): value is string => typeof value === "string")
      .map(name => resolve(ownerPath, name)).filter((value): value is string => value !== null);
    const visited = new Set<string>();
    while (pending.length) {
      const path = pending.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      const entry = entries.get(path);
      if (!objectValue(entry) || entry["inBundle"] !== true || entry["link"] === true) continue;
      covered.add(path);
      for (const field of ["dependencies", "optionalDependencies"]) {
        const dependencies = entry[field];
        if (!objectValue(dependencies)) continue;
        for (const dependencyName of Object.keys(dependencies)) {
          const dependencyPath = resolve(path, dependencyName);
          if (dependencyPath) pending.push(dependencyPath);
        }
      }
    }
  }
  return covered;
}
/** Lock defects are keyed by package content, not installation depth, so relocation does not erase debt. */
export function parsePackageLock(path: string, source: string, registries: Record<string, string> = {}) {
  let document: unknown;
  try { document = JSON.parse(source); } catch { throw new Error(`${path}: invalid package-lock.json`); }
  if (!objectValue(document)) throw new Error(`${path}: package-lock.json must contain an object`);
  const rows: Array<[string, unknown]> = [];
  if (objectValue(document["packages"])) rows.push(...Object.entries(document["packages"]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  else {
    if (!objectValue(document["dependencies"])) throw new Error(`${path}: unsupported package-lock format`);
    const collect = (entries: Record<string, unknown>, depth: number): void => {
      if (depth > 256) throw new Error(`${path}: lock dependency graph exceeds supported depth`);
      for (const [name, entry] of Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
        rows.push([`node_modules/${name}`, entry]);
        if (objectValue(entry) && Object.hasOwn(entry, "dependencies")) {
          if (!objectValue(entry["dependencies"])) throw new Error(`${path}: nested dependencies must be an object`);
          collect(entry["dependencies"], depth + 1);
        }
      }
    };
    collect(document["dependencies"], 0);
  }
  const bundled = objectValue(document["packages"]) ? bundledEntries(rows, registries) : new Set<string>();
  const values: DependencyCoordinate[] = [], defects: DependencyDefect[] = [];
  for (const [entryPath, entry] of rows) {
    if (!entryPath) continue;
    if (!objectValue(entry)) throw new Error(`${path}: lock entry must be an object`);
    if (entry["link"] === true || (!entryPath.includes("node_modules/") && !entry["resolved"])) continue;
    const name = entry["name"] ? String(entry["name"]) : entryPath.includes("node_modules/") ? entryPath.slice(entryPath.lastIndexOf("node_modules/") + 13) : "";
    if (!name) throw new Error(`${path}: lock entry lacks an exact name`);
    const rawVersion = entry["version"] ?? null, version = typeof rawVersion === "string" ? rawVersion : "";
    const entryDefects: DependencyDefect[] = [];
    if (!npmExact.test(version)) entryDefects.push(npmDefect("lock", name, "version", rawVersion, `${path}: lock package must use an exact major.minor.patch registry version`));
    const leaf = name.split("/").at(-1)!;
    if (!(bundled.has(entryPath) && entry["resolved"] === undefined) && !npmUrlMatches(name, `/-/${leaf}-${version}.tgz`, entry["resolved"], registries)) entryDefects.push(npmDefect("lock", name, "source", entry["resolved"] ?? null, `${path}: lock package must resolve from its trusted npm registry tarball`));
    if (!(bundled.has(entryPath) && entry["integrity"] === undefined) && !validSha512Integrity(entry["integrity"])) entryDefects.push(npmDefect("lock", name, "integrity", entry["integrity"] ?? null, `${path}: lock package requires valid sha512 integrity`));
    defects.push(...entryDefects);
    if (!entryDefects.length) values.push(dependency(name, "npm", version, entry["dev"] === true ? "development" : entry["optional"] === true ? "optional" : "transitive"));
  }
  return { values, defects };
}
