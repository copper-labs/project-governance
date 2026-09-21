import type { Pack, Packs } from "./pack-configuration.ts";

type Blocker = Record<string, unknown>;
export interface ValidationPlan {
  status: "ready" | "blocked"; stage: string | null; mode: string; changed_paths: string[];
  selected_packs: string[]; execution_order: string[]; selection_reasons: Record<string, string[]>;
  omitted_packs: Record<string, string>; path_matches: Record<string, string[]>; blockers: Blocker[];
  replaced_packs: Array<{ built_in_pack_id: string; replacement_pack_id: string; reason: string }>;
}
const unique = (values: string[]) => [...new Set(values)].sort();

/** Match the established fnmatch contract: stars include separators; a leading recursive directory segment is optional. */
export function matchesPackPath(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => glob(path, pattern) || (pattern.startsWith("**/") && glob(path, pattern.slice(3))));
}
export function glob(path: string, pattern: string): boolean {
  let expression = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") expression += "[\\s\\S]*";
    else if (c === "?") expression += "[\\s\\S]";
    else if (c === "[") {
      let end = i + 1;
      if (pattern[end] === "!") end++;
      if (pattern[end] === "]") end++;
      while (end < pattern.length && pattern[end] !== "]") end++;
      if (end >= pattern.length) expression += "\\[";
      else {
        let contents = pattern.slice(i + 1, end).replaceAll("\\", "\\\\");
        if (contents.startsWith("!")) contents = "^" + contents.slice(1);
        else if (contents.startsWith("^")) contents = "\\" + contents;
        expression += "[" + contents + "]"; i = end;
      }
    } else expression += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  try { return new RegExp(expression + "$", "u").test(path); }
  catch { throw new Error(`invalid pack path pattern ${pattern}`); }
}

export function commandApplies(entry: unknown, stage: string): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
  const stages = (entry as Record<string, unknown>)["stages"] ?? [];
  if (!Array.isArray(stages)) throw new Error("command stages must be a list");
  return !stages.length || stages.map(String).includes(stage);
}
function commandGap(pack: Pack, stage: string): boolean {
  return pack.stages.includes(stage) && !pack.commands.some(entry => commandApplies(entry, stage));
}

/** Pure selection preserves explicit ownership, supplemental checks, dependency order and fail-closed gaps. */
export function buildPlan(packs: Packs, options: { stage: string | null; mode: "all" | "impacted"; changedPaths: string[]; explicitPackIds?: string[] }): ValidationPlan {
  const { stage, mode } = options, explicit = unique(options.explicitPackIds ?? []), changed = unique(options.changedPaths);
  const candidates = Object.keys(packs).filter(id => (packs[id]!["implementation_status"] ?? "active") === "active" &&
    ((stage === null && explicit.length > 0) || (stage !== null && packs[id]!.stages.includes(stage)))).sort();
  const replacements = new Map<string, string>();
  for (const [id, pack] of Object.entries(packs)) for (const builtin of pack.replaces_builtin_packs) replacements.set(builtin, id);
  const selected = new Set<string>(), reasons: Record<string, string[]> = Object.create(null), pathMatches: Record<string, string[]> = Object.create(null);
  const blockers: Blocker[] = [];
  // Stage names are extensible through packs, but an unconfigured name cannot establish passing proof.
  if (stage !== null && !Object.values(packs).some(pack => pack.stages.includes(stage))) {
    blockers.push({ code: "unknown-stage", message: `No validation pack declares stage ${stage}.` });
  }
  const select = (id: string, reason: string) => { selected.add(id); (reasons[id] ??= []).push(reason); };
  if (explicit.length) {
    const missing = explicit.filter(id => !Object.hasOwn(packs, id)), unavailable = explicit.filter(id => Object.hasOwn(packs, id) && !candidates.includes(id));
    if (missing.length) blockers.push({ code: "unknown-explicit-pack", message: `Unknown pack(s): ${missing.join(", ")}` });
    if (unavailable.length) blockers.push({ code: "explicit-pack-unavailable", pack_ids: unavailable, message: `Pack(s) unavailable${stage ? ` at stage ${stage}` : ""}: ${unavailable.join(", ")}` });
    for (const id of explicit.filter(id => candidates.includes(id))) select(id, "explicit");
  } else if (mode === "all") {
    if (stage === null) blockers.push({ code: "stage-required", message: "All mode requires a stage." });
    for (const id of candidates.filter(id => !replacements.has(id))) select(id, "mode:all");
  } else {
    for (const id of candidates.filter(id => !replacements.has(id) && packs[id]!["run_when"] === "always")) select(id, "run_when:always");
    const unknown: string[] = [], gaps = new Map<string, { builtin: string; target: string; paths: string[] }>();
    for (const path of changed) {
      const raw = candidates.filter(id => matchesPackPath(path, packs[id]!.path_globs));
      const matched = raw.filter(id => !replacements.has(id)); pathMatches[path] = matched;
      let hasGap = false;
      for (const [builtin, target] of replacements) if (raw.includes(builtin) && !raw.includes(target)) {
        const key = JSON.stringify([builtin, target]), gap = gaps.get(key) ?? { builtin, target, paths: [] };
        gap.paths.push(path); gaps.set(key, gap); hasGap = true;
      }
      if (!hasGap && !matched.some(id => (packs[id]!["impact_role"] ?? "owner") === "owner")) unknown.push(path);
      for (const id of matched) select(id, `path:${path}`);
    }
    for (const [, gap] of [...gaps].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) blockers.push({ code: "replacement-coverage-gap", built_in_pack_id: gap.builtin, replacement_pack_id: gap.target, paths: unique(gap.paths) });
    if (unknown.length) blockers.push({ code: "unknown-impact", message: "Changed paths have no validation owner.", paths: unknown });
  }
  if (!explicit.length) for (const [builtin, target] of replacements) if (selected.has(target)) (reasons[target] ??= []).push(`replaces:${builtin}`);
  const order: string[] = [];
  if (!blockers.length) {
    try {
      const pending = [...selected].sort(), prerequisites = new Map<string, Set<string>>();
      while (pending.length) {
        const id = pending.shift()!, dependencies = [...packs[id]!.depends_on].sort();
        prerequisites.set(id, new Set(dependencies));
        for (const dependency of dependencies) {
          if (!Object.hasOwn(packs, dependency)) throw new Error(`pack ${id} depends on unknown pack ${dependency}`);
          if (!candidates.includes(dependency)) throw new Error(`pack ${id} depends on unavailable pack ${dependency}`);
          if (!selected.has(dependency)) { selected.add(dependency); pending.push(dependency); }
        }
      }
      if (stage) for (const id of [...selected].sort()) if (commandGap(packs[id]!, stage)) blockers.push({ code: "pack-stage-without-command", pack_id: id, uncovered_stages: [stage] });
      if (!blockers.length) while (prerequisites.size) {
        const ready = [...prerequisites].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort();
        if (!ready.length) throw new Error(`validation pack dependency cycle: ${[...prerequisites.keys()].sort().join(", ")}`);
        order.push(...ready); for (const id of ready) prerequisites.delete(id);
        for (const dependencies of prerequisites.values()) for (const id of ready) dependencies.delete(id);
      }
    } catch (error) { order.length = 0; blockers.push({ code: "invalid-dependency-graph", message: error instanceof Error ? error.message : String(error) }); }
  }
  return { status: blockers.length ? "blocked" : "ready", stage, mode, changed_paths: changed, selected_packs: [...selected].sort(), execution_order: order,
    selection_reasons: Object.fromEntries(Object.keys(reasons).sort().map(id => [id, unique(reasons[id]!)])),
    omitted_packs: Object.fromEntries(candidates.filter(id => !selected.has(id)).map(id => [id, !explicit.length && replacements.has(id) ? `replaced by target pack ${replacements.get(id)}` : "not selected by the requested scope"])),
    path_matches: pathMatches, blockers, replaced_packs: [...replacements].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([builtin, target]) => ({ built_in_pack_id: builtin, replacement_pack_id: target, reason: "explicit repository-wide target ownership" })) };
}
