export type NpmRegistries = Record<string, string | string[]>;
export const publicNpmRegistry = "https://registry.npmjs.org";
const scopePattern = /^@[a-z0-9][a-z0-9._-]*$/u;
/** Compare raw URL components so URL normalization cannot conceal traversal, ports or credentials. */
export function safeRegistryBase(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\\%?#;]/u.test(value)) return false;
  const match = /^https:\/\/([a-z0-9]+(?:[.-][a-z0-9]+)*)(\/.*)?$/u.exec(value);
  if (!match) return false;
  const path = (match[2] ?? "").replace(/\/$/u, "");
  return !path || path.slice(1).split("/").every(segment => !["", ".", ".."].includes(segment));
}
const withoutTrailingSlash = (value: string) => value.replace(/\/+$/u, "");
function explicitBases(value: unknown): string[] {
  const bases = Array.isArray(value) ? value : [value];
  if (!bases.length || bases.length > 16 || !bases.every(safeRegistryBase)) throw new Error("Invalid trusted registry base");
  const normalized = bases.map(withoutTrailingSlash);
  if (new Set(normalized).size !== normalized.length) throw new Error("Duplicate trusted registry base");
  return normalized;
}
export function registryPolicyErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["npm_registries must map exact npm scopes to HTTPS registry bases"];
  const errors: string[] = [];
  for (const [scope, base] of Object.entries(value)) {
    if (!scopePattern.test(scope)) errors.push("npm_registries keys must be exact lowercase npm scopes");
    try { explicitBases(base); }
    catch { errors.push(`npm_registries[${JSON.stringify(scope)}] must name distinct unambiguous HTTPS registry bases`); }
  }
  return errors;
}
export function npmRegistryBases(name: string, registries: NpmRegistries = {}): string[] {
  const scope = name.startsWith("@") ? name.split("/")[0]! : "";
  return explicitBases(Object.hasOwn(registries, scope) ? registries[scope] : publicNpmRegistry);
}
export function npmUrlRegistry(name: string, suffix: string, value: unknown, registries: NpmRegistries = {}, allowTrailingSlash = false): string | undefined {
  if (typeof value !== "string" || /[\s\\?#;]/u.test(value)) return undefined;
  const match = /^https:\/\/([^/]+)(\/.*)?$/u.exec(value);
  if (!match || match[1]!.includes("@")) return undefined;
  let path: string;
  try { path = decodeURIComponent(match[2] ?? ""); } catch { return undefined; }
  if (allowTrailingSlash) path = withoutTrailingSlash(path);
  return npmRegistryBases(name, registries).find(url => `https://${match[1]}${path}` === `${url}/${name}${suffix}`);
}
export function npmUrlMatches(name: string, suffix: string, value: unknown, registries: NpmRegistries = {}, allowTrailingSlash = false): boolean {
  return npmUrlRegistry(name, suffix, value, registries, allowTrailingSlash) !== undefined;
}
export function npmConfigRegistryMatches(scope: string, value: unknown, registries: NpmRegistries = {}): boolean {
  return safeRegistryBase(value) && npmRegistryBases(scope, registries).includes(withoutTrailingSlash(value));
}
