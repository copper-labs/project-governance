import { object, text } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { safeSubjectPath } from "./change-subject.ts";
import { contextBudget } from "./checkers/context-router.ts";

function list(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) throw new Error("Invalid context route list");
  return [...new Set(value.map(item => text(item, "context route item")))];
}
function integer(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100000) throw new Error("Invalid context scoring value");
  return value as number;
}
function termMatches(task: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "u").test(task.toLowerCase());
}

/** Policy routing is deterministic; optional model ranking cannot select or weaken required context. */
export function routeContext(raw: unknown, task: string, changedPaths: string[]) {
  text(task, "context task");
  const paths = [...new Set(changedPaths.map(safeSubjectPath))];
  const router = object(raw, "context router"), scoring = object(router.scoring ?? {}), weights = object(scoring.weights ?? {});
  const pathWeight = integer(weights.changed_path, 100), productWeight = integer(weights.product_term, 80), termWeight = integer(weights.prompt_term, 20);
  const threshold = integer(scoring.tie_threshold, 20), secondaryLimit = integer(scoring.max_secondary_routes, 2);
  if (!Array.isArray(router.routes) || router.routes.length > 1000) throw new Error("Context routes must be a bounded list");
  const ids = new Set<string>();
  const scores = router.routes.map(rawRoute => {
    const route = object(rawRoute, "context route"), id = text(route.id, "route id");
    if (ids.has(id)) throw new Error("Duplicate context route id"); ids.add(id);
    const match = object(route.match ?? {}), globs = list(match.path_globs), reasons: string[] = [];
    let score = 0;
    for (const path of paths) {
      const pattern = globs.find(pattern => matchesPackPath(path, [pattern]));
      if (pattern) { reasons.push(`path:${path}->${pattern}`); score += pathWeight; }
    }
    for (const term of [...new Set([...list(match.product_terms), ...list(route.aliases)])]) {
      if (termMatches(task, term)) { reasons.push(`product:${term}`); score += productWeight; }
    }
    for (const term of [...new Set([...list(match.prompt_terms), ...list(match.workflow_terms), ...list(match.task_terms)])]) {
      if (termMatches(task, term)) { reasons.push(`term:${term}`); score += termWeight; }
    }
    return { id, score, reasons, route };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const defaultRoute = router.default_route === undefined ? null : scores.find(item => item.id === text(router.default_route, "default route"));
  if (router.default_route !== undefined && !defaultRoute) throw new Error("Context default_route must name a declared route");
  const selected = scores[0]?.score ? scores[0] : defaultRoute ?? null;
  const tied = selected && selected.score > 0 && scores[1]?.score === selected.score;
  const pathOwners = scores.filter(item => item.reasons.some(reason => reason.startsWith("path:")));
  const outcome = selected ? tied && !(selected.reasons.some(reason => reason.startsWith("path:")) &&
    scores[1]!.reasons.some(reason => reason.startsWith("path:"))) ? "ambiguous" : "matched" : "fallback";
  const route = selected?.route ?? {};
  // Every path owner remains mandatory, even outside the optional secondary display limit.
  const owners = [...new Set([route, ...pathOwners.map(item => item.route)])];
  // Mixed work gets the largest declared envelope, never a sum or a route-name-dependent cap.
  const budgets = owners.map(owner => contextBudget(owner.token_budget));
  const budget = Object.fromEntries(Object.keys(budgets[0]!).map(key => [key,
    Math.max(...budgets.map(value => value[key as keyof typeof value])),
  ])) as (typeof budgets)[number];
  const primary = [...new Set([...list(router.default_context), ...owners.flatMap(owner => list(owner.primary_context))])].map(safeSubjectPath);
  const active = [...new Set(owners.flatMap(owner => list(owner.active_plan_context)))].map(safeSubjectPath).filter(path => !primary.includes(path));
  const expansion = [...new Set(owners.flatMap(owner => list(owner.expansion_context)))].map(safeSubjectPath).filter(path => !primary.includes(path) && !active.includes(path));
  return { outcome, selected: selected ? { id: selected.id, score: selected.score, reasons: selected.reasons } : null,
    secondary: scores.slice(1).filter(item => selected && item.score > 0 && selected.score - item.score <= threshold).slice(0, secondaryLimit).map(({ id, score, reasons }) => ({ id, score, reasons })),
    matchedPathRoutes: pathOwners.map(item => item.id), primary, active, expansion, budget,
    budgetAuthority: { mode: "largest-owner-envelope", routes: owners.map(owner => owner.id ?? "default") },
    skills: [...new Set([...list(router.default_skills), ...owners.flatMap(owner => list(owner.skills))])],
    routeSkills: [...new Set(owners.flatMap(owner => list(owner.skills)))], validations: [...new Set(owners.flatMap(owner => list(owner.validations)))],
    ready: false, remaining: "Required files and skills must be materialized and verified before this route is ready." };
}
