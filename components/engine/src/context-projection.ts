/** Maintain literal source facts while keeping every eligible path visible during bounded refresh. */
import { posix } from "node:path";
import { createHash } from "node:crypto";
import type { ValidationSubject } from "./change-subject.ts";
import { digest } from "./core.ts";
import { localContextPath } from "./context-path-policy.ts";
import { extractSourceFacts, resolveSourceLink, SOURCE_EXTRACTOR, type SourceFacts, type ResolvedSourceLink } from "./context-source-facts.ts";
import { ProjectionStore, projectionIdentity, sourceFactId, type ProjectionFile } from "./context-projection-store.ts";
import { documentationConfig, documentationCatalog } from "./checkers/document-catalog.ts";

export interface ProjectionOptions { deadlineAt?: number; byteLimit?: number; factByteLimit?: number; rebuild?: boolean; extractor?: string; purpose?: string; exact?: string[] }

/** Catalog membership is declared by the documentation owner, not inferred from filenames. */
function declaredCatalogLinks(subject: ValidationSubject, byPath: Map<string, SourceFacts>, safe: Set<string>) {
  const links: Array<{ source: string; resolved: string; origin: string; pointer: string; declarationDigest: string; sourceDigest: string | null; targetDigest: string | null; reason: string }> = [];
  let coverage = "not-declared";
  try {
    const config = documentationConfig(subject), path = config && `${config.root}/catalog.yaml`, fact = path && byPath.get(path);
    if (config?.enabled && !fact) coverage = "pending";
    if (config?.enabled && path && fact) {
      const records = documentationCatalog(subject, config, false); coverage = records.length > 256 ? "partial" : "complete-declared";
      for (const [index, record] of records.slice(0, 256).entries()) {
        const all = [...new Set([record.reference, ...record.guides, ...record.sources])], members = all.filter(item => safe.has(item)).slice(0, 32);
        if (members.length !== all.length) coverage = "partial";
        for (const source of members) for (const resolved of members) if (source !== resolved) {
          if (links.length >= 4096) { coverage = "partial"; break; }
          links.push({ source, resolved, origin: path, pointer: `/capabilities/${index}`, declarationDigest: fact.digest,
            sourceDigest: byPath.get(source)?.digest ?? null, targetDigest: byPath.get(resolved)?.digest ?? null, reason: `declared-capability:${record.id}` });
        }
        if (links.length >= 4096) break;
      }
    }
  } catch { coverage = "unavailable"; /* Its existing checker retains authority. */ }
  return { links, coverage };
}

function documentationObservation(byPath: Map<string, SourceFacts>) {
  const result = { inspectedCount: 0, overviewCount: 0, gaps: [] as Array<{ path: string; sourceDigest: string; reason: "overview-not-observed" }> };
  for (const [path, fact] of byPath) if (fact.documentationApplicable) {
    result.inspectedCount++; if (fact.overviewObserved) result.overviewCount++;
    else result.gaps.push({ path, sourceDigest: fact.digest, reason: "overview-not-observed" });
  }
  return result;
}

function pendingSourceOrder(pending: string[], previous: ReturnType<ProjectionStore["snapshot"]> | undefined) {
  pending.sort((a, b) => {
    const rank = (path: string) => !previous?.files.get(path)?.factId ? 0 : previous.files.get(path)?.freshness === "unverified-pending" ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

export function maintainContextProjection(subject: ValidationSubject, paths: string[], stateRoot: string, options: ProjectionOptions = {}) {
  const started = performance.now(), deadlineAt = options.deadlineAt ?? started + 1500, byteLimit = Math.min(options.byteLimit ?? 32 * 1024 * 1024, 32 * 1024 * 1024);
  const inventory = [...new Set(paths.filter(localContextPath))].sort(), locator = projectionIdentity(subject.root), extractor = options.extractor ?? SOURCE_EXTRACTOR;
  const observation = subject.projectionSources(inventory);
  const entries = new Map<string, { text: string; sourceDigest: string }>(), facts = new Map<string, SourceFacts>(), byPath = new Map<string, SourceFacts>();
  const files: ProjectionFile[] = [], unavailable: Array<{ path: string; reason: string }> = [];
  let store: ProjectionStore | undefined, cache = "unverified-identity", previous: ReturnType<ProjectionStore["snapshot"]> | undefined;
  let capturedBytes = 0, reused = 0, extracted = 0;
  try {
    if (locator) { store = new ProjectionStore(stateRoot, subject.root, locator, options.rebuild); previous = store.snapshot(observation.view); cache = "available"; }
  } catch (error) { cache = error instanceof Error && /index-/.test(error.message) ? error.message : "index-unavailable"; store?.close(); store = undefined; }
  try {
  const pending: string[] = [];
  const priorKeys = new Map<string, SourceFacts>();
  if (previous?.extractor === extractor) for (const file of previous.files.values()) {
    const fact = file.factId && previous.facts.get(file.factId);
    if (file.key && fact) {
      priorKeys.set(`${file.key}:${posix.extname(file.path)}`, fact);
      priorKeys.set(`bytes:${fact.digest}:${posix.extname(file.path)}`, fact);
    }
  }
  for (const path of inventory) {
    const observed = observation.sources.get(path), fact = observed && observed.freshness !== "unverified" && priorKeys.get(`${observed.key}:${posix.extname(path)}`);
    if (fact) { byPath.set(path, fact); facts.set(sourceFactId(fact, extractor), fact); reused++; }
    else if (!options.rebuild && previous?.extractor === extractor && observed?.freshness !== "unverified" &&
      previous?.files.get(path)?.key === observed?.key && previous?.files.get(path)?.disposition === "index-capacity") unavailable.push({ path, reason: "index-capacity" });
    else if (observed) pending.push(path);
    else unavailable.push({ path, reason: "source-unverified" });
  }
  pendingSourceOrder(pending, previous);
  // Warm Git-verified requests avoid body reads; uncertain bytes are revalidated within these limits.
  for (let offset = 0; offset < pending.length; offset += 63) {
    if (performance.now() >= deadlineAt || capturedBytes >= byteLimit) break;
    const batch = pending.slice(offset, offset + 63), limit = Math.min(4 * 1024 * 1024, byteLimit - capturedBytes);
    for (const [path, bytes] of subject.readBatch(batch, Math.min(256 * 1024, limit), limit, deadlineAt)) {
      if (typeof bytes === "string") { unavailable.push({ path, reason: bytes }); continue; }
      capturedBytes += bytes.length;
      let fact: SourceFacts;
      const byteKey = `bytes:sha256:${createHash("sha256").update(bytes).digest("hex")}:${posix.extname(path)}`;
      const retained = priorKeys.get(byteKey);
      try { fact = retained ?? extractSourceFacts(path, bytes); }
      catch { unavailable.push({ path, reason: "extraction-failed" }); continue; }
      // Paths belong to the current view, not content facts reused after a rename.
      if (fact.descriptor) { const { path: _path, ...descriptor } = JSON.parse(fact.descriptor); fact.descriptor = JSON.stringify(descriptor); }
      byPath.set(path, fact); facts.set(sourceFactId(fact, extractor), fact); if (retained) reused++; else extracted++;
      if (observation.sources.get(path)?.freshness === "unverified") observation.sources.set(path, { key: `bytes:${fact.digest}`, freshness: "captured-bytes" });
    }
  }
  let factBytes = 0;
  const retainedFacts = new Set<string>(), factLimit = Math.min(options.factByteLimit ?? 16 * 1024 * 1024, 16 * 1024 * 1024);
  for (const [path, fact] of byPath) {
    const id = sourceFactId(fact, extractor), bytes = retainedFacts.has(id) ? 0 : Buffer.byteLength(JSON.stringify(fact));
    if (factBytes + bytes > factLimit) { byPath.delete(path); unavailable.push({ path, reason: "index-capacity" }); }
    else { factBytes += bytes; retainedFacts.add(id); }
  }
  const missing = new Map(unavailable.map(item => [item.path, item.reason]));
  for (const path of inventory) {
    const observed = observation.sources.get(path), fact = byPath.get(path);
    const disposition = fact ? fact.coverage : missing.get(path) ?? (capturedBytes >= byteLimit ? "index-byte-limit" : "index-deadline");
    if (!fact && !missing.has(path)) unavailable.push({ path, reason: disposition });
    let retainedId: string | null = null;
    const prior = previous?.files.get(path), priorFact = prior?.factId && previous?.facts.get(prior.factId);
    // Pin unverified prior facts for hash reuse, never expose them as current descriptors or links.
    if (!fact && observed?.freshness === "unverified" && previous?.extractor === extractor && priorFact) {
      const id = sourceFactId(priorFact, extractor), bytes = retainedFacts.has(id) ? 0 : Buffer.byteLength(JSON.stringify(priorFact));
      if (factBytes + bytes <= factLimit) { factBytes += bytes; retainedFacts.add(id); retainedId = id; facts.set(id, priorFact); }
    }
    files.push({ path, key: observed?.key ?? null, freshness: retainedId ? "unverified-pending" : observed?.freshness ?? "unverified", factId: fact ? sourceFactId(fact, extractor) : retainedId, disposition });
    if (fact?.descriptor) entries.set(path, { text: JSON.stringify({ path, ...JSON.parse(fact.descriptor) }), sourceDigest: fact.digest });
  }
  const generation = digest({ locator, view: observation.view, extractor, files }), complete = byPath.size === inventory.length;
  let search: string[] = [], published = false;
  if (store && locator) try {
    published = store.publish({ id: generation, view: observation.view, subject: observation.subject, locator, extractor, complete, files }, facts, previous?.id);
    cache = published ? "published" : "index-publication-raced";
    if (published) search = store.search(generation, options.purpose ?? "");
  } catch (error) { cache = /full/i.test(String(error)) ? "index-capacity" : "index-publication-unavailable"; }
  const safe = new Set(inventory), links: ResolvedSourceLink[] = [];
  for (const [path, fact] of byPath) for (const link of fact.links) {
    const resolution = resolveSourceLink(path, link, safe), target = resolution.resolved && byPath.get(resolution.resolved);
    links.push({ source: path, ...link, ...resolution, sourceDigest: fact.digest, targetDigest: target ? target.digest : null });
  }
  const { links: catalogLinks, coverage: catalogCoverage } = declaredCatalogLinks(subject, byPath, safe);
  const exact = new Set((options.exact ?? []).filter(path => safe.has(path)));
  const terms = new Set((options.purpose ?? "").toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
  const symbols = [...byPath].filter(([, fact]) => fact.spans.some(span => terms.has(span.name.toLowerCase()))).map(([path]) => path).slice(0, 32);
  const seeds = new Set([...exact, ...symbols, ...search.slice(0, 16)]), related = new Set<string>();
  for (const link of links) if (link.resolved) { if (seeds.has(link.source)) related.add(link.resolved); if (seeds.has(link.resolved)) related.add(link.source); }
  for (const link of catalogLinks) if (seeds.has(link.source)) related.add(link.resolved);
  const documentation = documentationObservation(byPath);
  return { entries, unavailable, capturedBytes, documentation, facts: byPath, links, catalogLinks,
    priority: [...new Set([...exact, ...symbols, ...search, ...related])], generation,
    status: { cache, published, locatorVerified: locator !== null, view: observation.view, extractor, inventoryCount: inventory.length,
      extractedCount: extracted, reusedCount: reused, describedCount: entries.size, pendingCount: inventory.length - byPath.size,
      complete, reverseCoverage: complete && [...byPath.values()].every(f => ["syntax", "markdown"].includes(f.coverage)) && links.every(link => link.resolved !== null) ? "complete-supported-syntax" : "partial",
      catalogCoverage, capturedBytes, elapsedMs: performance.now() - started, fts: store?.fts ?? false } };
  } finally { store?.close(); }
}
