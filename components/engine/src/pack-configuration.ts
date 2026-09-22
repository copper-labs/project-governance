import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { object, text } from "./core.ts";
import type { ValidationSubject } from "./change-subject.ts";

export interface Pack extends Record<string, unknown> {
  id: string; enforcement: "advisory" | "blocking"; commands: unknown[];
  path_globs: string[]; stages: string[]; depends_on: string[]; replaces_builtin_packs: string[];
  _source: string; _origin: "builtin" | "target";
  decision_context?: { purpose: string; covers: string[]; limits: string[] };
}
export type Packs = Record<string, Pack>;

/** Read one authored mapping. Duplicate YAML keys are rejected instead of silently changing policy. */
export function loadYaml(path: string): Record<string, unknown> {
  try { return object(parse(readFileSync(path, "utf8")) ?? {}, path); }
  catch (error) { throw new Error(`${path}: invalid YAML mapping: ${error instanceof Error ? error.message : String(error)}`); }
}

/** Merge one packaged corpus with explicit project extensions; replacement never silently weakens a gate. */
export function loadPacks(root: string, builtinDirectory: string): Packs {
  const documents: Array<{ source: string; value: Record<string, unknown>; origin: "builtin" | "target" }> = [];
  for (const [directory, origin] of [[builtinDirectory, "builtin"], [join(root, "config/validation/packs"), "target"]] as const) {
    if (!existsSync(directory)) { if (origin === "builtin") throw new Error("packaged validation packs are missing"); continue; }
    for (const name of readdirSync(directory).filter(n => n.endsWith(".yaml")).sort()) {
      const path = join(directory, name);
      documents.push({ source: origin === "builtin" ? `package:${name}` : relative(root, path), value: loadYaml(path), origin });
    }
  }
  return mergePacks(documents);
}

/** Planning and execution use target packs from the same candidate graph as the source checks. */
export function loadSubjectPacks(subject: ValidationSubject, builtinDirectory: string): Packs {
  const documents: Array<{ source: string; value: Record<string, unknown>; origin: "builtin" | "target" }> = [];
  if (!existsSync(builtinDirectory)) throw new Error("packaged validation packs are missing");
  for (const name of readdirSync(builtinDirectory).filter(name => name.endsWith(".yaml")).sort()) {
    documents.push({ source: `package:${name}`, value: loadYaml(join(builtinDirectory, name)), origin: "builtin" });
  }
  for (const path of subject.paths().filter(path => /^config\/validation\/packs\/[^/]+\.yaml$/u.test(path)).sort()) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(subject.read(path, 1024 * 1024));
    documents.push({ source: path, value: object(parse(text) ?? {}, path), origin: "target" });
  }
  return mergePacks(documents);
}

export function mergePacks(documents: Array<{ source: string; value: Record<string, unknown>; origin: "builtin" | "target" }>): Packs {
  const packs: Packs = Object.create(null) as Packs;
  for (const { source, value, origin } of documents) {
    const id = String(value["id"] ?? "").trim();
    if (!id) throw new Error(`${source}: id is required`);
    if (!["advisory", "blocking"].includes(String(value["enforcement"]))) throw new Error(`${source}: enforcement must be advisory or blocking`);
    if (!Array.isArray(value["commands"]) || !value["commands"].length) throw new Error(`${source}: commands must be a non-empty list`);
    if (value.decision_context !== undefined) {
      const context = object(value.decision_context, "pack decision context");
      if (Object.keys(context).some(key => !["purpose", "covers", "limits"].includes(key))) throw new Error("Unknown pack decision context key");
      text(context.purpose, "pack decision purpose", 1000);
      for (const key of ["covers", "limits"]) {
        const list = context[key];
        if (!Array.isArray(list) || list.length > 8) throw new Error("Pack decision context requires bounded covers/limits lists");
        for (const item of list) text(item, "pack decision context item", 300);
      }
    }
    const lists: Record<string, string[]> = {};
    for (const field of ["path_globs", "stages", "depends_on", "replaces_builtin_packs"]) {
      const list = value[field] ?? [];
      if (!Array.isArray(list) || list.some(v => typeof v !== "string" || !v.trim())) throw new Error(`${source}: ${field} must be a string list`);
      lists[field] = list as string[];
    }
    const replacements = lists["replaces_builtin_packs"]!.map(v => v.trim());
    if (new Set(replacements).size !== replacements.length) throw new Error(`${source}: replaces_builtin_packs contains duplicates`);
    if (value["change_packet_contract"] !== undefined && value["change_packet_contract"] !== 1) throw new Error(`${source}: change_packet_contract must be 1`);
    if (Object.hasOwn(packs, id)) throw new Error(`${source}: duplicate pack id ${id}; target packs cannot replace built-ins`);
    packs[id] = { ...value, ...lists, id, replaces_builtin_packs: replacements, _source: source, _origin: origin } as Pack;
  }
  const claims = new Map<string, string>();
  for (const pack of Object.values(packs)) {
    if (!pack.replaces_builtin_packs.length) continue;
    if (pack._origin !== "target" || (pack["implementation_status"] ?? "active") !== "active") throw new Error(`pack ${pack.id}: only an active target pack may replace built-ins`);
    if (pack["change_packet_contract"] !== 1) throw new Error(`pack ${pack.id}: replacement requires change_packet_contract: 1`);
    for (const builtinId of pack.replaces_builtin_packs) {
      const builtin = packs[builtinId];
      if (builtinId === pack.id) throw new Error(`pack ${pack.id}: a pack cannot replace itself`);
      if (!builtin || builtin._origin !== "builtin") throw new Error(`pack ${pack.id}: replacement names unknown built-in ${builtinId}`);
      if (builtin["impact_role"] === "supplemental") throw new Error(`pack ${pack.id}: supplemental built-in ${builtinId} cannot be replaced`);
      if (pack.enforcement === "advisory" && builtin.enforcement === "blocking") throw new Error(`pack ${pack.id}: advisory enforcement cannot replace blocking built-in ${builtinId}`);
      if (claims.has(builtinId)) throw new Error(`built-in ${builtinId} has duplicate replacers ${claims.get(builtinId)} and ${pack.id}`);
      const missing = builtin.stages.filter(stage => !pack.stages.includes(stage)).sort();
      if (missing.length) throw new Error(`pack ${pack.id}: replacement of ${builtinId} misses stages ${missing.join(", ")}`);
      claims.set(builtinId, pack.id);
    }
  }
  for (const pack of Object.values(packs)) for (const dependency of pack.depends_on) {
    if (claims.has(dependency)) throw new Error(`pack ${pack.id}: dependency ${dependency} is replaced by ${claims.get(dependency)}; depend on the target owner explicitly`);
  }
  return packs;
}
