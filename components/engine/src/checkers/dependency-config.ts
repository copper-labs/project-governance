import { parse } from "yaml";
import { objectValue } from "./dependency-manifests.ts";
import { npmConfigRegistryMatches } from "./dependency-registry.ts";

/** Committed package-manager configuration may select trusted registries, never carry credentials or replace TLS trust. */
export function validateNpmrc(path: string, source: string, registries: Record<string, string> = {}): void {
  for (const [index, raw] of source.split(/\r\n|[\n\r]/u).entries()) {
    const line = raw.trim(); if (!line || /^[#;]/u.test(line)) continue;
    const separator = line.indexOf("=");
    if (separator < 0) throw new Error(`${path}:${index + 1}: ambiguous npm configuration syntax`);
    const key = line.slice(0, separator).trim().toLowerCase(), value = line.slice(separator + 1).trim();
    const transport = key.split(":").at(-1)!.replace(/(?:\[\])+$/u, "");
    if (["auth", "username", "password"].some(word => key.includes(word))) throw new Error(`${path}:${index + 1}: auth-bearing npm configuration is prohibited`);
    if ((transport === "strict-ssl" && value.toLowerCase() !== "true") || (transport !== "strict-ssl" && (["ca", "key"].includes(transport) || ["proxy", "cafile", "cert"].some(word => transport.includes(word)))))
      throw new Error(`${path}:${index + 1}: npm transport trust configuration is prohibited`);
    if (key === "registry" || key.endsWith(":registry")) {
      if (!npmConfigRegistryMatches(key === "registry" ? "" : key.slice(0, -9), value, registries)) throw new Error(`${path}:${index + 1}: registry must match the trusted npm scope registry`);
    } else if (key.includes("registry")) throw new Error(`${path}:${index + 1}: ambiguous registry configuration key`);
  }
}
export function validateYarnrc(path: string, source: string): void {
  let document: unknown;
  try { document = parse(source) ?? {}; } catch { throw new Error(`${path}: invalid Yarn configuration`); }
  if (!objectValue(document)) throw new Error(`${path}: Yarn configuration must contain a mapping`);
  const visit = (node: unknown, depth: number): void => {
    if (depth > 128) throw new Error(`${path}: Yarn configuration exceeds supported depth`);
    if (Array.isArray(node)) { for (const value of node) visit(value, depth + 1); return; }
    if (!objectValue(node)) return;
    for (const [key, value] of Object.entries(node)) {
      const lowered = key.toLowerCase();
      if (["npmauthtoken", "npmauthident"].includes(lowered)) throw new Error(`${path}: auth-bearing Yarn configuration is prohibited`);
      if ((lowered === "enablestrictssl" && value !== true) || (lowered !== "enablestrictssl" && ["proxy", "unsafehttp", "cafile", "cert", "tls"].some(word => lowered.includes(word))))
        throw new Error(`${path}: Yarn transport trust configuration is prohibited`);
      if (["npmRegistryServer", "npmPublishRegistry"].includes(key) && !npmConfigRegistryMatches("", value)) throw new Error(`${path}: Yarn registry must use canonical public npm`);
      if (key === "npmRegistries") {
        if (!objectValue(value) || Object.keys(value).some(registry => !npmConfigRegistryMatches("", registry))) throw new Error(`${path}: alternate or ambiguous Yarn registry`);
        for (const settings of Object.values(value)) visit(settings, depth + 1);
        continue;
      }
      if (lowered.includes("registry") && !["npmRegistryServer", "npmPublishRegistry"].includes(key)) throw new Error(`${path}: ambiguous Yarn registry key`);
      visit(value, depth + 1);
    }
  };
  visit(document, 0);
}
