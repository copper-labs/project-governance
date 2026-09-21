import type { DependencyCoordinate } from "./dependency-manifests.ts";
import { npmUrlMatches } from "./dependency-registry.ts";

/** Validate the complete release identity without fetching or trusting URL prefixes alone. */
export function authoritativeDependencySource(coordinate: DependencyCoordinate, value: unknown, registries: Record<string, string> = {}): boolean {
  const { ecosystem, name, version } = coordinate;
  if (ecosystem === "npm") return npmUrlMatches(name, `/${version}`, value, registries, true);
  if (typeof value !== "string" || /[\s\\?#;]/u.test(value)) return false;
  const match = /^https:\/\/([^/]+)(\/.*)?$/u.exec(value);
  if (!match || match[1]!.includes("@")) return false;
  const host = match[1]!.toLowerCase();
  const hosts: Record<string, string[]> = { pypi: ["pypi.org"], "github-actions": ["github.com", "api.github.com"], maven: ["repo1.maven.org", "central.sonatype.com"] };
  if (!hosts[ecosystem]?.includes(host)) return false;
  let path: string;
  try { path = decodeURIComponent(match[2] ?? "").replace(/\/+$/u, ""); } catch { return false; }
  if (path.split("/").some(part => part === "." || part === "..")) return false;
  if (ecosystem === "pypi") {
    const parts = path.replace(/^\/+|\/+$/gu, "").split("/");
    const normalize = (text: string) => text.replace(/[-_.]+/gu, "-").toLowerCase();
    return ((parts.length === 3 && parts[0] === "project") || (parts.length === 4 && parts[0] === "pypi" && parts[3] === "json")) && normalize(parts[1]!) === normalize(name) && parts[2] === version;
  }
  if (ecosystem === "github-actions") {
    const repository = name.split("/").slice(0, 2).join("/");
    const expected = host === "github.com" ? `/${repository}/commit/${version}` : `/repos/${repository}/commits/${version}`;
    return path.toLowerCase() === expected.toLowerCase();
  }
  if (ecosystem === "maven") {
    const [group, artifact] = name.split(":"); if (!group || !artifact) return false;
    if (host === "central.sonatype.com") return path === `/artifact/${group}/${artifact}/${version}`;
    const expected = `/maven2/${group.replaceAll(".", "/")}/${artifact}/${version}`;
    return path === expected || path.startsWith(`${expected}/`);
  }
  return false;
}
