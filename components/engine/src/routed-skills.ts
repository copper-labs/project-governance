import type { CatalogSkill } from "./skill-catalog.ts";
import { selectAttachedSkills } from "./skill-selection.ts";
import type { routeContext } from "./context-routing.ts";

/** Package-owned content is delivered from its canonical catalog, never an adopter's replaceable copy. */
export function materializeRoutedSkills(index: ReadonlyMap<string, CatalogSkill>, route: ReturnType<typeof routeContext>,
  task: string, changedPaths: string[], facts: Record<string, unknown> | null, includeEvaluation = false,
  targetSkill?: (id: string) => CatalogSkill | null) {
  const selection = route.outcome === "matched" && facts !== null
    ? selectAttachedSkills(index, route.routeSkills, task, changedPaths, facts, includeEvaluation)
    : { selected: [], exclusions: [], unresolvedFacts: [], conflicts: [] };
  const blockers = selection.unresolvedFacts.map(field => `skill-unresolved-fact:${field}`);
  const candidates: Array<{ skill: CatalogSkill; required: boolean; reasons: string[] }> = [];
  for (const id of route.skills) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) throw new Error("Unsafe skill id");
    const skill = index.get(id) ?? targetSkill?.(id);
    if (!skill) { blockers.push(`skill-unavailable:${id}`); continue; }
    if (skill.activationMode === "evaluation-only" && !includeEvaluation) { blockers.push(`skill-evaluation-only:${id}`); continue; }
    candidates.push({ skill, required: true, reasons: ["declared-by-route"] });
  }
  const ids = new Set(candidates.map(candidate => candidate.skill.id));
  for (const skill of selection.selected) if (!ids.has(skill.id)) {
    ids.add(skill.id);
    candidates.push({ skill, required: skill.defaultLevel === "required", reasons: skill.selectionReasons });
  }
  // Include explicit declarations in conflict detection, not only automatically selected leaves.
  for (const { skill } of candidates) for (const conflict of skill.conflicts) if (ids.has(conflict)) blockers.push(`skill-conflict:${skill.id}:${conflict}`);
  const limit = Math.min(16000, route.budget.total_context_tokens * 2);
  let used = 0;
  const entries: Array<{ id: string; path: string; content: string; sourceDigest: string; bytes: number; required: boolean; reasons: string[] }> = [];
  const omissions: Array<{ id: string; required: boolean; reason: string }> = [];
  // Required leaves precede recommendations so optional advice cannot consume their allocation.
  for (const { skill, required, reasons } of [...candidates].sort((a, b) => Number(b.required) - Number(a.required))) {
    const bytes = Buffer.byteLength(skill.content);
    if (used + bytes > limit) {
      omissions.push({ id: skill.id, required, reason: "outside-byte-budget" });
      if (required) blockers.push(`skill-outside-byte-budget:${skill.id}`);
      continue;
    }
    entries.push({ id: skill.id, path: skill.path, content: skill.content, sourceDigest: skill.sourceDigest, bytes, required, reasons });
    used += bytes;
  }
  return { entries, omissions, blockers: [...new Set(blockers)], ready: blockers.length === 0, limit, used,
    selection: { selected: selection.selected.map(skill => skill.id), exclusions: selection.exclusions,
      unresolvedFacts: selection.unresolvedFacts }, authority: "canonical-package-catalog-with-captured-target-skills" };
}
