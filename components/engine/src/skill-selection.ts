import { object, text } from "./core.ts";
import { glob } from "./planning.ts";
import type { CatalogSkill } from "./skill-catalog.ts";

function strings(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 1000) throw new Error("Invalid skill selector list");
  return [...new Set(raw.map(value => text(value, "skill selector")))];
}
function rules(raw: unknown): Array<[string, string[]]> {
  return Object.entries(object(raw ?? {})).map(([field, values]) => [field, strings(values)]);
}
function termMatches(task: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u").test(task.toLowerCase());
}

/** Only route-local routers attach packs. Explicit facts constrain selection; models never supply policy. */
export function selectAttachedSkills(index: ReadonlyMap<string, CatalogSkill>, routerIds: string[], task: string,
  changedPaths: string[], facts: Record<string, unknown>, includeEvaluation = false) {
  const packs = new Set(routerIds.flatMap(id => index.get(id)?.routerFor ?? []));
  const selected: Array<CatalogSkill & { selectionReasons: string[] }> = [];
  const exclusions: Array<{ id: string; reason: string }> = [], unresolved = new Set<string>();
  const values = (field: string): string[] => Array.isArray(facts[field]) ? facts[field].filter((value): value is string => typeof value === "string") : [];
  for (const skill of index.values()) {
    if (!skill.packId || !packs.has(skill.packId)) continue;
    const app = skill.applicability;
    const exclude = (reason: string) => exclusions.push({ id: skill.id, reason });
    if (!Object.keys(app).length) { exclude("no-applicability"); continue; }
    const excluded = rules(app.exclude_facts).flatMap(([field, allowed]) => values(field).filter(value => allowed.includes(value)).map(value => `excluded-fact:${field}=${value}`));
    if (excluded.length) { exclude(excluded[0]!); continue; }
    const terms = strings(app.task_terms), patterns = strings(app.path_globs), factTerms = rules(app.fact_terms);
    const reasons = terms.filter(term => termMatches(task, term)).map(term => `task:${term}`);
    for (const path of changedPaths) {
      const pattern = patterns.find(pattern => glob(path, pattern));
      if (pattern !== undefined) reasons.push(`path:${path}->${pattern}`);
    }
    for (const [field, allowed] of factTerms) for (const value of values(field)) if (allowed.includes(value)) reasons.push(`fact:${field}=${value}`);
    if ((terms.length || patterns.length || factTerms.length) && !reasons.length) { exclude("no-trigger"); continue; }
    if (skill.activationMode === "evaluation-only" && !includeEvaluation) { exclude("activation-mode:evaluation-only"); continue; }
    const missing: string[] = [], mismatched: string[] = [], required: string[] = [];
    for (const [field, allowed] of rules(app.require_facts)) {
      const actual = values(field), overlap = actual.filter(value => allowed.includes(value));
      if (!actual.length) missing.push(field);
      else if (!overlap.length) mismatched.push(field);
      else required.push(...overlap.map(value => `required-fact:${field}=${value}`));
    }
    if (missing.length) { missing.forEach(field => unresolved.add(field)); exclude("missing-required-fact"); continue; }
    if (mismatched.length) { exclude(`required-fact-mismatch:${mismatched.join(",")}`); continue; }
    if (!["required", "recommended"].includes(skill.defaultLevel)) { exclude(`activation-level:${skill.defaultLevel}`); continue; }
    selected.push({ ...skill, selectionReasons: [...required, ...reasons] });
  }
  const ids = new Set(selected.map(skill => skill.id));
  const conflicts = [...new Set(selected.flatMap(skill => skill.conflicts.filter(id => ids.has(id)).map(id => `${skill.id}:${id}`)))];
  return { selected, exclusions, unresolvedFacts: [...unresolved], conflicts };
}
