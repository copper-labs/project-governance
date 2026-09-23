import { glob } from "./planning.ts";
import { discoverContext } from "./context-discovery.ts";
import type { ValidationSubject } from "./change-subject.ts";

const within = (path: string, scope: string) => path === scope || path.startsWith(scope + "/");

/** Inventory paths only. Sharing policy is applied before optional source bytes are loaded. */
export function contextCandidateInventory(subject: ValidationSubject, scopes: string[], changed: string[]) {
  let inventory: string[];
  try {
    // Query only the captured scopes. Live filesystem types must not alter staged directory coverage.
    inventory = subject.paths(scopes);
    if (inventory.length > 100_000) throw new Error("Context inventory exceeds its bound");
  } catch { return { relevant: [], routingPaths: scopes, unavailable: true }; }
  const changedSet = new Set(changed), explicit = new Set(scopes);
  const relevant = inventory.filter(path => scopes.some(scope => within(path, scope)))
    .sort((a, b) => Number(changedSet.has(b)) - Number(changedSet.has(a)) || Number(explicit.has(b)) - Number(explicit.has(a)) || a.localeCompare(b));
  const paths = [...new Set([...scopes.filter(path => !inventory.some(other => other.startsWith(path + "/"))), ...relevant])];
  // Candidate limits must never truncate the paths used for required skill/route applicability.
  return { relevant, routingPaths: paths, unavailable: false };
}

export function automaticContextCandidates(subject: ValidationSubject, relevant: string[],
  mandatory: Set<string>, allowed: string[], maximum: number,
  priority?: { purpose: string; exact: string[]; changed: string[] }) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64) throw new Error("Invalid candidate limit");
  const excluded: Array<{ path: string; reason: string }> = [];
  const dispositions = new Map<string, string>();
  let excludedCount = 0;
  const exclude = (path: string, reason: string) => {
    dispositions.set(path, reason); excludedCount++;
    if (excluded.length < 64) excluded.push({ path, reason });
  };
  const permitted = (path: string) => {
    if (mandatory.has(path)) { dispositions.set(path, "required-context"); return false; }
    if (path.length > 128) { exclude(path, "candidate-path-too-long"); return false; }
    if (!allowed.some(pattern => glob(path, pattern))) { exclude(path, "sharing-not-enabled"); return false; }
    try { if (subject.source(path)?.file_type !== "regular") { exclude(path, "source-unavailable"); return false; } }
    catch { exclude(path, "source-unavailable"); return false; }
    return true;
  };
  const seeds: string[] = [];
  const terms = new Set(priority?.purpose.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const exact = new Set(priority?.exact ?? []), changed = new Set(priority?.changed ?? []);
  const pathTermMatches = (path: string) => [...new Set(path.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
    .reduce((score, term) => score + Number(terms.has(term)), 0);
  // Rank path metadata before the source-inspection cap; otherwise an alphabetically late,
  // task-named file can be invisible to JEV even though it is in the captured inventory.
  const rankedMetadata = priority ? relevant.map((path, index) => ({
    path, index, exact: exact.has(path), changed: changed.has(path),
    match: pathTermMatches(path),
  })).sort((left, right) => Number(right.exact) - Number(left.exact) ||
    Number(right.changed) - Number(left.changed) || right.match - left.match ||
    left.index - right.index) : null;
  const ranked = rankedMetadata?.map(item => item.path) ?? relevant;
  // Bound source inspection as well as the resulting packet. Metadata inventory is not source reading.
  let inspectedCount = 0;
  for (const path of ranked.slice(0, 256)) {
    inspectedCount++;
    if (permitted(path)) {
      seeds.push(path); dispositions.set(path, "seeded");
      if (seeds.length === Math.min(32, maximum)) break;
    }
  }
  let discovery: ReturnType<typeof discoverContext> | null = null;
  let discoveryUnavailable = false;
  try { discovery = seeds.length ? discoverContext(subject, seeds, maximum) : null; }
  catch { discoveryUnavailable = true; }
  const candidates = [...seeds];
  for (const path of discovery?.paths ?? []) if (!candidates.includes(path) && permitted(path)) {
    dispositions.set(path, candidates.length < maximum ? "discovered" : "discovery-over-cap");
    candidates.push(path);
  }
  // Reserve preview room for admitted paths. A long run of exclusions must not hide every seed,
  // and discovery may return related files outside the task's original path inventory.
  // At most 16 leading paths, 32 seeds and 64 discoveries precede the backfill.
  const previewPaths = priority ? [...new Set([
    ...ranked.slice(0, 16), ...seeds, ...(discovery?.paths ?? []).filter(path => !seeds.includes(path)), ...ranked.slice(0, 128),
  ])].slice(0, 128) : [];
  return { paths: candidates.slice(0, maximum), seeds, discovery, discoveryUnavailable, excluded, excludedCount,
    priorityPreview: previewPaths.map(path => ({ path, exact: exact.has(path), changed: changed.has(path),
      taskTermMatches: pathTermMatches(path), disposition: dispositions.get(path) ??
        (ranked.slice(0, inspectedCount).includes(path) ? "not-admitted" :
          ranked.slice(0, 256).includes(path) ? "not-inspected-seed-cap" : "not-inspected-source-cap") })),
    inventoryCount: relevant.length, omittedCount: Math.max(0, relevant.length - seeds.length) + Math.max(0, candidates.length - maximum) };
}
