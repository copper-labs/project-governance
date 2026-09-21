import { posix } from "node:path";
import { repositoryMap } from "./repository-map.ts";
import { safeSubjectPath, type ValidationSubject } from "./change-subject.ts";

/** Metadata-based optional discovery; no model call, command execution or mandatory routing decision. */
export function discoverContext(subject: ValidationSubject, seeds: string[], maximum = 16) {
  if (!seeds.length || seeds.length > 32 || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 64) throw new Error("Invalid discovery bounds");
  for (const path of seeds) {
    safeSubjectPath(path);
    if (subject.source(path)?.file_type !== "regular") throw new Error("Discovery seed must be an existing ordinary source");
  }
  const map = repositoryMap(subject);
  const contains = (root: string, path: string) => root === "." || path === root || path.startsWith(root + "/");
  const roots = new Set(seeds.map(path => map.packages.filter(pkg => contains(pkg.root, path)).sort((a, b) => b.root.length - a.root.length)[0]?.root ?? posix.dirname(path)));
  const direct = map.packages.filter(pkg => roots.has(pkg.root));
  const dependencies = new Set(direct.flatMap(pkg => pkg.dependencies));
  const related = map.packages.filter(pkg => pkg.name && dependencies.has(pkg.name));
  const scope = [...roots, ...related.map(pkg => pkg.root)];
  const terms = new Set(seeds.flatMap(path => posix.basename(path).toLowerCase().split(/[^a-z0-9]+/u)).filter(term => term.length > 2));
  const owners = new Set(map.owners);
  const candidates = [...new Set([...direct, ...related].map(pkg => pkg.manifest).concat(map.documents, map.tests))]
    .filter(path => !seeds.includes(path) && !owners.has(path) && path.length <= 128 && scope.some(root => contains(root, path)))
    .map(path => ({ path, score: [...terms].filter(term => path.toLowerCase().includes(term)).length + (direct.some(pkg => pkg.manifest === path) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { paths: candidates.slice(0, maximum).map(item => item.path), omittedCount: Math.max(0, candidates.length - maximum),
    mapDigest: map.mapDigest, issues: map.issues, authority: "optional candidates only; mandatory instructions require context routing" };
}
