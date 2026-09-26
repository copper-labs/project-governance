/** Passive byte accounting for declared routes and bounded mixed-owner scenarios. */
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { object } from "./core.ts";
import { worktreeBytes } from "./change-subject.ts";
import { contextOwnerRequirements, routeContext } from "./context-routing.ts";
import { loadSkillCatalog, type CatalogSkill } from "./skill-catalog.ts";
import { materializeRoutedSkills } from "./routed-skills.ts";
import { promptPacketLimit, PROMPT_FRAMING_RESERVE, requiredPromptText } from "./prompt-context-budget.ts";

export function contextBudgetReadiness(workspace: string, raw: unknown,
  assetRoot = fileURLToPath(new URL("../assets/skills/", import.meta.url))) {
  const initial = routeContext(raw, "unspecified initial development request", []), router = object(raw);
  const owners = (router.routes as unknown[]).map(item => object(item)), scenarios: Record<string, unknown>[][] = [];
  const seen = new Set<string>(), findings: Array<{ id: string; message: string }> = [];
  let truncated = false, readBytes = 0;
  const add = (items: Record<string, unknown>[]) => {
    const key = items.map(item => String(item.id)).sort().join("\0");
    if (seen.has(key)) return;
    if (scenarios.length >= 256) { truncated = true; return; }
    seen.add(key); scenarios.push(items);
  };
  add(owners.filter(owner => owner.id === initial.selected?.id));
  const pathOwner = (owner: Record<string, unknown>) => Array.isArray(object(owner.match ?? {}).path_globs) && (object(owner.match ?? {}).path_globs as unknown[]).length > 0;
  const pathOwners = owners.filter(pathOwner);
  if (pathOwners.length) add(pathOwners);
  for (const owner of owners) add([owner]);
  for (const owner of owners.filter(owner => !pathOwner(owner))) if (pathOwners.length) add([owner, ...pathOwners]);
  for (let i = 0; i < owners.length && !truncated; i++) for (let j = i + 1; j < owners.length && !truncated; j++)
    if (pathOwner(owners[i]!) || pathOwner(owners[j]!)) add([owners[i]!, owners[j]!]);
  const files = new Map<string, { path: string; sourceDigest: string; content: string; bytes: number } | null>();
  const read = (path: string) => {
    if (files.has(path)) return files.get(path)!;
    let value: NonNullable<ReturnType<typeof files.get>> | null = null;
    try {
      if (files.size >= 1024 || readBytes >= 16 * 1024 * 1024) { truncated = true; throw new Error("Readiness read limit"); }
      const source = worktreeBytes(workspace, path, Math.min(1024 * 1024, 16 * 1024 * 1024 - readBytes));
      if (source.type !== "regular") throw new Error("Required source is not regular");
      readBytes += source.bytes.length;
      value = { path, bytes: source.bytes.length, content: new TextDecoder("utf-8", { fatal: true }).decode(source.bytes),
        sourceDigest: `sha256:${createHash("sha256").update(source.bytes).digest("hex")}` };
    } catch (error) { findings.push({ id: error instanceof Error && error.message === "Readiness read limit" ? "context.budget-read-limit" : "context.required-unavailable",
      message: `Required guidance is unavailable to this inspection: ${path}` }); }
    files.set(path, value); return value;
  };
  const guidance = new Map<string, number | null>();
  let catalog = new Map<string, CatalogSkill>(), catalogAvailable = true;
  try { catalog = new Map(loadSkillCatalog(assetRoot)); } catch { catalogAvailable = false; }
  let facts: Record<string, unknown> | null = null;
  try { facts = object(object(parse(worktreeBytes(workspace, "config/governance/facts.lock.yaml", 1024 * 1024).bytes.toString())).facts).skill_context as Record<string, unknown> ?? null; }
  catch { /* Missing facts remain unresolved at skill materialization. */ }
  const routes = scenarios.map(selected => {
    const requirements = contextOwnerRequirements(router, selected), route = { ...initial, ...requirements, outcome: "matched" };
    const entries: NonNullable<ReturnType<typeof read>>[] = [];
    let primary = 0, active = 0, unavailable = false;
    for (const [group, paths] of [["primary", requirements.primary], ["active", requirements.active]] as const) for (const path of paths) {
      const file = read(path); guidance.set(path, file?.bytes ?? null);
      if (!file) { unavailable = true; continue; }
      entries.push(file); if (group === "primary") primary += file.bytes; else active += file.bytes;
    }
    const targetSkill = (id: string): CatalogSkill | null => {
      const file = read(`.governance/runtime/skills/${id}/SKILL.md`);
      return file ? { id, ...file, packId: null, activationMode: "governed", defaultLevel: "required", capabilityOwner: null,
        applicability: {}, conflicts: [], references: [], routerFor: [] } : null;
    };
    const skills = materializeRoutedSkills(catalog, route, "unspecified initial development request", [], facts, false, targetSkill);
    const native = Buffer.byteLength(requiredPromptText(entries, skills.entries, "e".repeat(64), "r".repeat(36)).text) + PROMPT_FRAMING_RESERVE;
    const used = { primary, active, total: primary + active, native };
    const limits = { primary: requirements.budget.primary_context_tokens * 4, active: requirements.budget.active_plan_context_tokens * 4,
      total: requirements.budget.total_context_tokens * 4, native: promptPacketLimit(requirements.budget, requirements.budgetAuthority.nativePacketBytes) };
    const exceeded = (Object.keys(limits) as Array<keyof typeof limits>).filter(key => used[key] > limits[key]);
    const ids = selected.map(item => String(item.id));
    for (const key of exceeded) findings.push({ id: "context.required-too-large", message:
      `Required ${key} context for routes ${ids.join(" + ") || "default"} needs ${used[key]} bytes; limit ${limits[key]} (over by ${used[key] - limits[key]}). Review guidance or its owning budget; mandatory content cannot be dropped.` });
    for (const blocker of skills.blockers) findings.push({ id: "context.required-skill", message: `Routes ${ids.join(" + ") || "default"}: ${blocker}` });
    if (requirements.skills.length && !catalogAvailable) unavailable = true;
    return { owners: ids, used, limits, remaining: Object.fromEntries(Object.keys(limits).map(key => [key, limits[key as keyof typeof limits] - used[key as keyof typeof used]])),
      status: unavailable || skills.blockers.length ? "unavailable" : exceeded.length ? "over-budget" : "fits", skillSelection: "declared-and-default-applicability" };
  });
  if (truncated) findings.push({ id: "context.budget-inspection-partial", message: "Context readiness reached its scenario or read bound. Inspect remaining route combinations before claiming complete readiness." });
  // Singles, pairs and each selected owner plus all path owners cover the small cases exactly.
  const exhaustive = !truncated && (pathOwners.length <= 2 || owners.length <= 3);
  if (!truncated && !exhaustive) findings.push({ id: "context.budget-combinations-unchecked", message:
    "Declared routes and sampled mixes were inspected; some subsets of three or more owners remain unchecked. This is partial readiness, not proof that every combined task fits. The actual route is validated before delivery." });
  return { findings, requiredGuidance: [...guidance].map(([path, bytes]) => ({ path, bytes })), routes,
    coverage: { basis: "declared-routes-pairs-and-all-path-owners", scenarios: scenarios.length, truncated,
      taskDependentSkills: "runtime-revalidated", arbitraryRouteSubsets: exhaustive ? "complete-declared-owner-sets" : "not-exhaustive" } };
}
