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
  mandatory: Set<string>, allowed: string[], maximum: number) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64) throw new Error("Invalid candidate limit");
  const excluded: Array<{ path: string; reason: string }> = [];
  let excludedCount = 0;
  const exclude = (path: string, reason: string) => { excludedCount++; if (excluded.length < 64) excluded.push({ path, reason }); };
  const permitted = (path: string) => {
    if (mandatory.has(path)) return false;
    if (path.length > 128) { exclude(path, "candidate-path-too-long"); return false; }
    if (!allowed.some(pattern => glob(path, pattern))) { exclude(path, "sharing-not-enabled"); return false; }
    try { if (subject.source(path)?.file_type !== "regular") { exclude(path, "source-unavailable"); return false; } }
    catch { exclude(path, "source-unavailable"); return false; }
    return true;
  };
  const seeds: string[] = [];
  // Bound source inspection as well as the resulting packet. Metadata inventory is not source reading.
  for (const path of relevant.slice(0, 256)) if (permitted(path)) {
    seeds.push(path);
    if (seeds.length === Math.min(32, maximum)) break;
  }
  let discovery: ReturnType<typeof discoverContext> | null = null;
  let discoveryUnavailable = false;
  try { discovery = seeds.length ? discoverContext(subject, seeds, maximum) : null; }
  catch { discoveryUnavailable = true; }
  const candidates = [...seeds];
  for (const path of discovery?.paths ?? []) if (!candidates.includes(path) && permitted(path)) candidates.push(path);
  return { paths: candidates.slice(0, maximum), seeds, discovery, discoveryUnavailable, excluded, excludedCount,
    inventoryCount: relevant.length, omittedCount: Math.max(0, relevant.length - seeds.length) + Math.max(0, candidates.length - maximum) };
}
