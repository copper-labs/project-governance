import { createHash } from "node:crypto";
import type { ValidationSubject } from "./change-subject.ts";
import { routeContext } from "./context-routing.ts";
import { materializeRoutedSkills } from "./routed-skills.ts";
import type { CatalogSkill } from "./skill-catalog.ts";

type Group = "primary" | "active-plan" | "expansion";

/** Read the selected subject, not later checkout bytes. Required omissions are blockers, never ranking inputs. */
export function materializeRoutedContext(subject: ValidationSubject, route: ReturnType<typeof routeContext>, includeExpansion = false,
  skillInputs?: { index: ReadonlyMap<string, CatalogSkill>; task: string; changedPaths: string[]; facts: Record<string, unknown> | null; includeEvaluation?: boolean;
    targetSkill?: (id: string) => CatalogSkill | null }) {
  const limits = { primary: route.budget.primary_context_tokens * 4, "active-plan": route.budget.active_plan_context_tokens * 4,
    expansion: route.budget.expansion_context_tokens * 4, total: route.budget.total_context_tokens * 4 };
  const used = { primary: 0, "active-plan": 0, expansion: 0, total: 0 };
  const groups: Array<[Group, string[]]> = [["primary", route.primary], ["active-plan", route.active], ["expansion", includeExpansion ? route.expansion : []]];
  const entries: Array<{ path: string; group: Group; content: string; sourceDigest: string; bytes: number }> = [];
  const omissions: Array<{ path: string; group: Group; required: boolean; reason: string }> = [];
  for (const [group, paths] of groups) {
    for (const path of paths) {
      const remaining = Math.min(limits[group] - used[group], limits.total - used.total);
      let reason = "source-unavailable";
      try {
        const source = subject.source(path);
        if (!source || source.file_type !== "regular") throw new Error("Required ordinary source unavailable");
        // Read under the global ceiling so oversized files cannot consume unbounded memory.
        reason = "outside-byte-budget";
        const bytes = subject.read(path, limits.total);
        if (bytes.length > remaining) throw new Error("Context budget exceeded");
        reason = "invalid-text";
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        entries.push({ path, group, content, sourceDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, bytes: bytes.length });
        used[group] += bytes.length; used.total += bytes.length;
        continue;
      } catch { omissions.push({ path, group, required: group !== "expansion", reason }); }
    }
  }
  const blockers = [...(route.outcome === "matched" ? [] : [`route-${route.outcome}`]),
    ...omissions.filter(item => item.required).map(item => `required-context:${item.path}:${item.reason}`)];
  const skills = skillInputs ? materializeRoutedSkills(skillInputs.index, route, skillInputs.task, skillInputs.changedPaths,
    skillInputs.facts, skillInputs.includeEvaluation, skillInputs.targetSkill) : null;
  const filesReady = blockers.length === 0;
  const allBlockers = [...blockers, ...(skills?.blockers ?? ["skill-catalog-not-supplied"])];
  return { entries, omissions, limits, used, blockers: allBlockers, filesReady,
    skills, skillsReady: skills?.ready ?? false, ready: allBlockers.length === 0 };
}
