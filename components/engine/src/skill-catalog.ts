import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { createHash } from "node:crypto";
import { narrativeFile } from "./narrative-inputs.ts";
import { object, text } from "./core.ts";
import { safeSubjectPath } from "./change-subject.ts";
const PREFIX = ".governance/runtime/skills/";
export interface CatalogSkill {
  id: string; path: string; sourceDigest: string; content: string; packId: string | null;
  activationMode: string; defaultLevel: string; capabilityOwner: string | null;
  applicability: Record<string, unknown>; conflicts: string[]; references: string[]; routerFor: string[];
}
function list(raw: unknown): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error("Skill catalog list invalid");
  return raw;
}

/** Read only catalog-declared assets; target files cannot replace package-owned skill content. */
export function loadSkillCatalog(assetRoot: string): Map<string, CatalogSkill> {
  const root = realpathSync(assetRoot), index = new Map<string, CatalogSkill>(), paths = new Map<string, string>(), capabilities = new Set<string>();
  const relative = (raw: unknown) => {
    const path = text(raw, "skill path");
    if (!path.startsWith(PREFIX)) throw new Error("Skill path is outside runtime skill root");
    return safeSubjectPath(path.slice(PREFIX.length));
  };
  const read = (path: string) => {
    const full = resolve(root, path);
    if (realpathSync(full) !== full) throw new Error("Skill asset uses a symlink");
    return narrativeFile(root, path);
  };
  const declared = (value: unknown) => { const path = relative(value); read(path); return path; };
  const catalog = object(parse(read("catalog.yaml")), "skill catalog");
  const packs = [ ...list(catalog.stack_packs), ...list(catalog.pattern_packs) ].map(raw => {
    const pack = object(raw), id = text(pack.id, "pack id"), manifest = object(parse(read(declared(pack.manifest))));
    if (manifest.id !== id) throw new Error("Skill pack identity mismatch");
    return { id, manifest };
  });
  if (new Set(packs.map(pack => pack.id)).size !== packs.length) throw new Error("Duplicate skill pack");
  const records = [ ...list(catalog.standard_skills).map(raw => ({ raw, packId: null as string | null })),
    ...packs.flatMap(pack => list(pack.manifest.skills).filter(raw => (object(raw).status ?? "included") === "included").map(raw => ({ raw, packId: pack.id }))) ];
  for (const { raw, packId } of records) {
    const entry = object(raw), id = text(entry.id, "skill id"), path = declared(entry.path), content = read(path);
    const activation = typeof entry.activation === "string" || entry.activation == null ? {} : object(entry.activation);
    const activationMode = String(activation.mode ?? "governed"), defaultLevel = String(activation.default_level ?? "available");
    if (!["governed", "evaluation-only"].includes(activationMode) || !["required", "recommended", "available", "excluded"].includes(defaultLevel)) throw new Error("Invalid skill activation");
    const capabilityOwner = entry.capability_owner == null ? null : text(entry.capability_owner, "capability owner");
    if (index.has(id) || paths.has(path) || (capabilityOwner && capabilities.has(capabilityOwner))) throw new Error("Duplicate skill, path or capability owner");
    const references = list(entry.references).map(value => declared(typeof value === "string" ? value : object(value).path));
    if (new Set(references).size !== references.length) throw new Error("Duplicate skill reference");
    if (entry.portable === true) {
      const end = content.indexOf("\n---\n", 4);
      if (!content.startsWith("---\n") || end < 0) throw new Error("Portable skill frontmatter missing");
      const front = object(parse(content.slice(4, end)));
      if (front.name !== id) throw new Error("Portable skill name mismatch");
      text(front.description, "portable skill description");
    }
    index.set(id, { id, path, content, packId, activationMode, defaultLevel, capabilityOwner,
      sourceDigest: `sha256:${createHash("sha256").update(content).digest("hex")}`, applicability: object(entry.applicability ?? {}),
      conflicts: list(entry.conflicts).map(value => text(value, "skill conflict")), references, routerFor: [] });
    paths.set(path, id); if (capabilityOwner) capabilities.add(capabilityOwner);
  }
  for (const pack of packs) {
    if (pack.manifest.router_skill === undefined) continue;
    const owner = paths.get(relative(pack.manifest.router_skill));
    if (!owner) throw new Error("Pack router lacks a canonical skill owner");
    index.get(owner)!.routerFor.push(pack.id);
  }
  return index;
}
