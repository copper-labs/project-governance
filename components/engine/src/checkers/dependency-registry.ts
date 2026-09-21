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
export function registryPolicyErrors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["npm_registries must map exact npm scopes to HTTPS registry base URLs"];
  const errors: string[] = [];
  for (const [scope, base] of Object.entries(value)) {
    if (!scopePattern.test(scope)) errors.push("npm_registries keys must be exact lowercase npm scopes");
    if (!safeRegistryBase(base)) errors.push(`npm_registries[${JSON.stringify(scope)}] must be an unambiguous HTTPS registry base URL`);
  }
  return errors;
}
export function npmRegistryBase(name: string, registries: Record<string, string> = {}): string {
  const scope = name.startsWith("@") ? name.split("/")[0]! : "";
  const base = Object.hasOwn(registries, scope) ? registries[scope]! : publicNpmRegistry;
  if (!safeRegistryBase(base)) throw new Error("Invalid trusted registry base");
  return base.replace(/\/+$/u, "");
}
export function npmUrlMatches(name: string, suffix: string, value: unknown, registries: Record<string, string> = {}, allowTrailingSlash = false): boolean {
  if (typeof value !== "string" || /[\s\\?#;]/u.test(value)) return false;
  const match = /^https:\/\/([^/]+)(\/.*)?$/u.exec(value);
  if (!match || match[1]!.includes("@")) return false;
  const base = /^https:\/\/([^/]+)(\/.*)?$/u.exec(npmRegistryBase(name, registries))!;
  let path: string;
  try { path = decodeURIComponent(match[2] ?? ""); } catch { return false; }
  if (allowTrailingSlash) path = path.replace(/\/+$/u, "");
  return match[1] === base[1] && path === `${base[2] ?? ""}/${name}${suffix}`;
}
export function npmConfigRegistryMatches(scope: string, value: unknown, registries: Record<string, string> = {}): boolean {
  return safeRegistryBase(value) && value.replace(/\/+$/u, "") === npmRegistryBase(scope, registries);
}
