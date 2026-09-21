import { posix } from "node:path";
import { ValidationSubject } from "../change-subject.ts";
import { objectValue } from "./dependency-manifests.ts";

/** Only supported root-relative glob syntax may establish a local-package exemption. */
export function workspaceMatches(directory: string, raw: string): boolean {
  const pattern = raw.replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (!pattern || pattern.startsWith("/") || pattern.split("/").includes("..") || /[!{}[\]()\\]/u.test(pattern)) return false;
  const parts = pattern.split("/"); let expression = "";
  for (const [index, part] of parts.entries()) {
    if (part === "**") expression += index < parts.length - 1 ? "(?:[^/.][^/]*/)*" : "(?:[^/.][^/]*(?:/[^/.][^/]*)*)?";
    else {
      if (!part.startsWith(".")) expression += "(?!\\.)";
      expression += [...part].map(char => char === "*" ? "[^/]*" : char === "?" ? "[^/]" : char.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("");
      if (index < parts.length - 1) expression += "/";
    }
  }
  return new RegExp(`^(?:${expression})$`, "u").test(directory);
}
/** Ambiguous names or unreadable candidate manifests retain external-evidence requirements. */
export function localWorkspaceCoordinates(subject: ValidationSubject): { consumers: Set<string>; versions: Map<string, string> } {
  const empty = () => ({ consumers: new Set<string>(), versions: new Map<string, string>() });
  const manifest = (path: string): Record<string, unknown> => {
    if (subject.source(path)?.file_type !== "regular") return {};
    const value: unknown = JSON.parse(subject.read(path, 4 * 1024 * 1024).toString("utf8"));
    return objectValue(value) ? value : {};
  };
  try {
    const root = manifest("package.json");
    const raw = root["workspaces"], patterns = objectValue(raw) ? raw["packages"] : raw;
    if (!Array.isArray(patterns) || !patterns.length || patterns.some(pattern => typeof pattern !== "string" || /[!{}[\]()\\]/u.test(pattern))) return empty();
    const consumers = new Set(["package.json"]), candidates = new Map<string, unknown[]>();
    for (const path of subject.paths()) {
      if (!path.endsWith("/package.json") || path.split("/").includes("node_modules") || !patterns.some(pattern => workspaceMatches(posix.dirname(path), pattern))) continue;
      const value = manifest(path); if (!Object.keys(value).length) continue;
      consumers.add(path);
      if (typeof value["name"] === "string") candidates.set(value["name"], [...(candidates.get(value["name"]) ?? []), value["version"]]);
    }
    const versions = new Map<string, string>();
    for (const [name, values] of candidates) if (values.length === 1 && typeof values[0] === "string") versions.set(name, values[0]);
    return { consumers, versions };
  } catch { return empty(); }
}
