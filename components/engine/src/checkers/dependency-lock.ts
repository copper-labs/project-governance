import { dependency, npmExact, npmDefect, objectValue, type DependencyCoordinate, type DependencyDefect } from "./dependency-manifests.ts";
import { npmUrlMatches } from "./dependency-registry.ts";
export function validSha512Integrity(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("sha512-")) return false;
  const encoded = value.slice(7);
  return /^[A-Za-z0-9+/]{86}==$/u.test(encoded) && Buffer.from(encoded, "base64").length === 64;
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
    if (!npmUrlMatches(name, `/-/${leaf}-${version}.tgz`, entry["resolved"], registries)) entryDefects.push(npmDefect("lock", name, "source", entry["resolved"] ?? null, `${path}: lock package must resolve from its trusted npm registry tarball`));
    if (!validSha512Integrity(entry["integrity"])) entryDefects.push(npmDefect("lock", name, "integrity", entry["integrity"] ?? null, `${path}: lock package requires valid sha512 integrity`));
    defects.push(...entryDefects);
    if (!entryDefects.length) values.push(dependency(name, "npm", version, entry["dev"] === true ? "development" : entry["optional"] === true ? "optional" : "transitive"));
  }
  return { values, defects };
}
