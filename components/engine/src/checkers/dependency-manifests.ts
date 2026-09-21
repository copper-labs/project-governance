import { canonical } from "../core.ts";
export interface DependencyCoordinate { ecosystem: string; name: string; version: string; artifact_type: string }
export interface DependencyDefect { identity: string[]; repair_key: string[]; message: string }
export const npmExact = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
export const npmName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
export const objectValue = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function dependency(name: string, ecosystem: string, version: string, artifact_type: string): DependencyCoordinate {
  ecosystem = ecosystem.trim().toLowerCase(); name = name.trim();
  if (ecosystem === "pypi") name = name.replace(/[-_.]+/gu, "-").toLowerCase();
  if (ecosystem === "github-actions") name = name.toLowerCase();
  return { ecosystem, name, version: version.trim(), artifact_type: artifact_type.trim().toLowerCase() };
}
export function npmDefect(kind: string, name: string, field: string, value: unknown, message: string): DependencyDefect {
  const literal = canonical(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return { identity: kind === "manifest" ? [kind, field, name, literal] : [kind, name, field, literal], repair_key: kind === "manifest" ? [kind, field, name] : [kind, name], message };
}
export function parseRequirements(path: string, source: string): DependencyCoordinate[] {
  const values: DependencyCoordinate[] = []; let logical = "";
  for (const [index, raw] of source.split(/\r\n|[\n\r]/u).entries()) {
    const stripped = raw.trim(); if (!stripped || stripped.startsWith("#")) continue;
    logical = `${logical} ${stripped}`.trim();
    if (logical.endsWith("\\")) { logical = logical.slice(0, -1).trimEnd(); continue; }
    logical = logical.replace(/(?:\s+--hash=sha256:[0-9a-fA-F]{64})+$/u, "");
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9._,-]+\])?)==([^\s;]+)(?:\s*;.*)?$/u.exec(logical);
    if (!match || match[2]!.includes("*")) throw new Error(`${path}:${index + 1}: requirement must use an exact name==version pin`);
    values.push(dependency(match[1]!.split("[")[0]!, "pypi", match[2]!, "direct")); logical = "";
  }
  if (logical) throw new Error(`${path}: incomplete continued requirement`);
  return values;
}
export function parsePackageManifest(path: string, source: string): { values: DependencyCoordinate[]; defects: DependencyDefect[] } {
  let document: unknown;
  try { document = JSON.parse(source); } catch { throw new Error(`${path}: invalid package.json`); }
  if (!objectValue(document)) throw new Error(`${path}: package.json must contain an object`);
  const values: DependencyCoordinate[] = [], defects: DependencyDefect[] = [];
  const append = (raw: unknown, field: string, artifact: string) => {
    if (raw === undefined || raw === null) return;
    if (!objectValue(raw)) throw new Error(`${path}: ${field} must be an object`);
    for (const [name, version] of Object.entries(raw).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (!npmName.test(name)) defects.push(npmDefect("manifest", name, field, version, `${path}: ${field} key must be an exact npm package name without selectors or globs`));
      else if (typeof version !== "string" || !npmExact.test(version)) defects.push(npmDefect("manifest", name, field, version, `${path}: npm dependency must use an exact major.minor.patch registry version`));
      else values.push(dependency(name, "npm", version, artifact));
    }
  };
  for (const [field, artifact] of Object.entries({ dependencies: "direct", devDependencies: "development", optionalDependencies: "optional", peerDependencies: "peer", overrides: "override", resolutions: "override" })) append(document[field], field, artifact);
  const pnpm = document["pnpm"];
  if (pnpm !== undefined && pnpm !== null) {
    if (!objectValue(pnpm)) throw new Error(`${path}: pnpm must be an object`);
    append(pnpm["overrides"], "pnpm.overrides", "override");
    if (["packageExtensions", "patchedDependencies"].some(field => Object.hasOwn(pnpm, field))) throw new Error(`${path}: unsupported dependency-bearing pnpm fields`);
  }
  const manager = document["packageManager"];
  if (manager !== undefined && manager !== null) {
    const match = typeof manager === "string" ? /^([A-Za-z0-9._-]+)@(.+)$/u.exec(manager) : null;
    if (!match || !npmExact.test(match[2]!)) defects.push(npmDefect("manifest", match?.[1] ?? "<packageManager>", "packageManager", manager, `${path}: packageManager must use an exact manager@version pin`));
    else values.push(dependency(match[1]!, "npm", match[2]!, "toolchain"));
  }
  return { values, defects };
}
