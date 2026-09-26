import { digest } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { localContextPath } from "./context-path-policy.ts";
import type { ValidationSubject } from "./change-subject.ts";
import { interpretNoul, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { BudgetScope } from "./decision-budget.ts";
import type { EvidenceItem } from "./decision-schema.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import { maintainContextProjection } from "./context-projection.ts";

const BATCH_SIZE = 63;
const STOP = new Set("the and for with from this that these those into about have has had are was were will would should could please fix update change continue task bound intent current".split(" "));
export const contextTerms = (value: string) => new Set((value.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(term => !STOP.has(term)));

export interface MetadataCursor { version: 1; generation: string; batches: Array<{ paths: string[]; signature: string; outcome: DecisionOutcome }> }
export interface MetadataFamily { id: string; revision: string; previous?: MetadataCursor; replayOnly?: boolean }

/** Mutate the two remaining queues only after honoring the per-item and shared batch limits. */
export function packMetadataBatch(priorities: string[], general: string[], items: Map<string, EvidenceItem>,
  limits: { purposeBytes: number; evidenceBytes: number; baseWire: number; wireBytes: number; itemWire: (item: EvidenceItem) => number }) {
  const batch: string[] = [], unfittable: string[] = [];
  let bytes = limits.purposeBytes, wireBytes = limits.baseWire;
  while (batch.length < BATCH_SIZE && (priorities.length || general.length)) {
    // General first gives it at least half of each batch while both queues contain items.
    const queue = general.length && (batch.length % 2 === 0 || !priorities.length) ? general : priorities.length ? priorities : general;
    const path = queue[0]!, item = items.get(path)!, itemBytes = Buffer.byteLength(item.text), encoded = limits.itemWire(item);
    if (limits.purposeBytes + itemBytes > limits.evidenceBytes || limits.baseWire + encoded > limits.wireBytes) {
      unfittable.push(path); queue.shift(); continue;
    }
    if (batch.length && (bytes + itemBytes > limits.evidenceBytes || wireBytes + encoded > limits.wireBytes)) break;
    batch.push(path); queue.shift(); bytes += itemBytes; wireBytes += encoded;
  }
  return { batch, unfittable };
}

function sourceIndexObservation(projection: ReturnType<typeof maintainContextProjection>, describedCount: number,
  baselineCount: number, descriptionOmissions: string[]) {
  const documentation = projection.documentation;
  return { transmittedCount: describedCount, pathOnlyCount: baselineCount - describedCount,
    inspectedCount: describedCount, unavailableCount: projection.unavailable.length, descriptionOmissions,
    documentation: { inspectedCount: documentation.inspectedCount, overviewCount: documentation.overviewCount,
      gapCount: documentation.gaps.length, candidates: documentation.gaps.slice(0, 16),
      candidatesTruncated: documentation.gaps.length > 16,
      status: documentation.inspectedCount ? "observed-subset" : "not-observed" }, ...projection.status };
}

/** Keep the complete eligible inventory. This ordering is fallback advice, never JEV eligibility. */
export function contextMetadataCatalog(paths: string[], purpose: string, exact: string[], changed: string[], required: Set<string>, historyHints: string[] = []) {
  const query = contextTerms(purpose), exactSet = new Set(exact), changedSet = new Set(changed), pinned = new Set([...exact, ...changed]);
  const unique = [...new Set(paths)];
  const excluded = unique.filter(path => !required.has(path) && !localContextPath(path));
  const safe = unique.filter(path => !required.has(path) && localContextPath(path));
  const boundedHints = historyHints.filter(hint => safe.filter(path => path === hint || path.startsWith(hint + "/")).length <= 64);
  const ranked = safe.map(path => ({ path, pinned: pinned.has(path), exact: exactSet.has(path), changed: changedSet.has(path),
    matches: [...contextTerms(path)].filter(term => query.has(term)).length,
    historyHint: boundedHints.some(hint => path === hint || path.startsWith(hint + "/")) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.changed) - Number(a.changed) || b.matches - a.matches || Number(b.historyHint) - Number(a.historyHint) || a.path.localeCompare(b.path));
  return { version: "metadata-index-2", inventoryCount: paths.length, eligibleCount: safe.length,
    excludedCount: excluded.length, excluded: excluded.slice(0, 64).map(path => ({ path, reason: "automatic-path-excluded" })),
    requiredCount: unique.length - excluded.length - safe.length, omittedCount: 0,
    candidates: ranked };
}

/** Full permitted inventory stays independent of lexical hits; family replay binds the whole batch. */
export async function selectContextMetadata(subject: ValidationSubject, catalog: ReturnType<typeof contextMetadataCatalog>,
  purpose: string, runtime: DecisionRuntime, scope: BudgetScope | null, subjectDigest: string,
  eventId: string, signal?: AbortSignal, deadlineAt = performance.now() + 3500, projection?: ReturnType<typeof maintainContextProjection>, family?: MetadataFamily) {
  const started = performance.now(), baseline = catalog.candidates.map(item => item.path), decisions: DecisionOutcome[] = [];
  const enabled = runtime.settings.questionIds.DL03.includes("context.metadata-relevance/1");
  const assessable: string[] = [], excluded: Array<{ path: string; reason: string }> = [];
  let notPermitted = 0;
  for (const path of baseline) {
    if (!matchesPackPath(path, runtime.settings.allowedMetadataPaths ?? [])) { notPermitted++; continue; }
    try { if (subject.source(path)?.file_type !== "regular") throw new Error(); assessable.push(path); }
    catch { excluded.push({ path, reason: "source-unavailable" }); }
  }
  const invocationId = family?.id ?? digest({ eventId, scope, subjectDigest, catalog: digest(baseline), purpose, configuration: runtime.settings.configDigest }).slice(7);
  projection ??= maintainContextProjection(subject, baseline, runtime.stateRoot, { purpose, deadlineAt: Math.min(deadlineAt, performance.now() + 1000) });
  const detailAllowed = enabled && runtime.settings.mode !== "off" && runtime.settings.consumers.DL03.mode !== "off" &&
    !runtime.eligibility("DL03").reasons.includes("missing-token") && runtime.settings.legacy.allowedDataClasses.includes("metadata") && runtime.settings.legacy.allowedDataClasses.includes("source");
  const descriptionOmissions: string[] = [], unfittable: string[] = [];
  const positive = new Set<string>(), assessed = new Set<string>(), answered = new Set<string>(), described = new Set<string>(), visited = new Set<string>();
  const permitted = new Set(assessable), itemByPath = new Map<string, EvidenceItem>();
  const purposeItem: EvidenceItem = { id: "purpose", text: purpose, sourceDigest: digest(purpose), provenance: "supplied", trust: "untrusted" };
  const purposeBytes = Buffer.byteLength(purpose), limit = runtime.settings.legacy.evidenceBytes;
  const definition = DECISION_QUESTIONS["context.metadata-relevance/1"]!;
  const wireLimit = Math.min(65536, runtime.settings.budget.maxRequestBytes), baseWire = 1000 + Buffer.byteLength(JSON.stringify(purposeItem));
  const itemWire = (item: EvidenceItem) => Buffer.byteLength(JSON.stringify(item)) + Buffer.byteLength(JSON.stringify({ instructions: { question: definition.instructions, evidenceIds: ["purpose", item.id] }, type: "noul" })) + 32;
  for (const path of assessable) {
    const detail = detailAllowed && matchesPackPath(path, runtime.settings.legacy.allowedSourcePaths ?? []) ? projection.entries.get(path) : null;
    let item: EvidenceItem = { id: path, text: detail?.text ?? path, sourceDigest: detail?.sourceDigest ?? digest(path), provenance: "derived", trust: "untrusted" };
    if (detail && (purposeBytes + Buffer.byteLength(item.text) > limit || baseWire + itemWire(item) > wireLimit)) {
      item = { ...item, text: path, sourceDigest: digest(path) }; descriptionOmissions.push(path);
    }
    itemByPath.set(path, item);
  }
  const coverageFor = (paths: string[]) => ({ captured: paths.length, omitted: [], unavailable: excluded.slice(0, 64).map(item => item.path), truncated: assessable.length !== paths.length,
    limits: ["complete-inventory-batched", "maximum-63-questions-per-batch", paths.some(path => itemByPath.get(path)?.text !== path) ? "approved-source-descriptions" : "paths-only"] });
  const signature = (paths: string[]) => digest({ paths, evidence: [purposeItem, ...paths.map(path => itemByPath.get(path))],
    coverage: coverageFor(paths), configuration: runtime.settings.configDigest, revision: family?.revision ?? scope?.taskRevision ?? "unbound", question: definition });
  const cursor: MetadataCursor = { version: 1, generation: projection.generation, batches: [] };
  const apply = (paths: string[], outcome: DecisionOutcome) => {
    decisions.push(outcome);
    if (outcome.providerCalled) for (const path of paths) { assessed.add(path); visited.add(path); if (itemByPath.get(path)?.text !== path) described.add(path); }
    paths.forEach((path, i) => {
      if (outcome.answers[`file-${i}`]?.status === "answered") answered.add(path);
      if (outcome.delivered && interpretNoul(outcome.answers[`file-${i}`]).value === "positive") positive.add(path);
    });
  };
  let replayedBatches = 0, invalidatedBatches = 0, providerCallMs = 0, firstBatchMs: number | null = null, budgetFinalized: boolean | null = null;
  for (const batch of family?.previous?.batches ?? []) {
    if (batch.paths.every(path => permitted.has(path)) && batch.signature === signature(batch.paths) &&
        runtime.eligibility("DL03", "context.metadata-relevance/1").providerUse === "eligible") {
      apply(batch.paths, batch.outcome); cursor.batches.push(batch); replayedBatches++;
    } else invalidatedBatches++;
  }
  const prioritySet = new Set([...catalog.candidates.filter(item => item.pinned || item.matches || item.historyHint).map(item => item.path), ...projection.priority]);
  const priorities = assessable.filter(path => !visited.has(path) && prioritySet.has(path));
  const general = assessable.filter(path => !visited.has(path) && !prioritySet.has(path))
    .map(path => ({ path, hash: digest({ eventId: family?.id ?? eventId, path }) })).sort((a, b) => a.hash.localeCompare(b.hash)).map(item => item.path);
  let priorityAssessed = 0, generalAssessed = 0;
  let reason = enabled ? assessable.length ? "not-attempted" : "metadata-scope-disabled" : "metadata-question-disabled";
  try {
    while (enabled && !family?.replayOnly && (priorities.length || general.length)) {
      if (signal?.aborted || performance.now() >= deadlineAt) { reason = "cancelled"; break; }
      if (purposeBytes >= limit || baseWire >= wireLimit) { reason = "input-budget"; break; }
      const previous = decisions.at(-1)?.budget;
      if (previous?.state === "reserved" && previous.calls! >= previous.limits.maxCalls) { reason = "budget-exhausted"; break; }
      const packed = packMetadataBatch(priorities, general, itemByPath,
        { purposeBytes, evidenceBytes: limit, baseWire, wireBytes: wireLimit, itemWire });
      const batch = packed.batch;
      unfittable.push(...packed.unfittable);
      if (!batch.length) { reason = "input-budget"; break; }
      firstBatchMs ??= performance.now() - started;
      const evidence = [purposeItem, ...batch.map(path => itemByPath.get(path)!)], sourcePaths = batch.filter(path => itemByPath.get(path)!.text !== path), batchSignature = signature(batch);
      const outcome = await runtime.ask({ consumerId: "DL03", eventId: digest({ invocationId, batchSignature }), scope,
        subject: { digest: family ? batchSignature : subjectDigest, revision: family?.revision ?? scope?.taskRevision ?? "unbound", environment: "context-metadata" },
        evidenceLayout: "shared-v1", metadataPaths: batch, ...(sourcePaths.length ? { sourcePaths } : {}), evidence,
        budgetPartition: "context-selection", budgetInvocationId: invocationId, ...(family ? { budgetFamily: true } : {}), deadlineAt,
        coverage: coverageFor(batch), questions: batch.map((path, i) => ({ name: `file-${i}`, definitionId: "context.metadata-relevance/1", consumerId: "DL03", evidenceIds: ["purpose", path] })),
        policyDigest: runtime.settings.configDigest });
      if (outcome.providerCalled && !outcome.reason.startsWith("repeated-")) providerCallMs += outcome.latencyMs;
      apply(batch, outcome); reason = outcome.reason;
      if (outcome.providerCalled) { cursor.batches.push({ paths: batch, signature: batchSignature, outcome });
        priorityAssessed += batch.filter(path => prioritySet.has(path)).length; generalAssessed += batch.filter(path => !prioritySet.has(path)).length; }
      if (!outcome.delivered && outcome.reason !== "shadow" && outcome.reason !== "repeated-observation") break;
    }
  } finally {
    if (!family && scope && decisions.some(item => ["reserved", "duplicate"].includes(item.budget.state))) budgetFinalized = runtime.closeContextInvocation(scope, invocationId);
  }
  if (!priorities.length && !general.length && reason === "not-attempted" && replayedBatches) reason = "exact-batch-replay";
  if (unfittable.length && answered.size < assessable.length && ["answered", "shadow", "repeated-observation"].includes(reason)) reason = "input-budget";
  const pinned = new Set(catalog.candidates.filter(item => item.pinned).map(item => item.path));
  const order = [...baseline.filter(path => pinned.has(path)), ...baseline.filter(path => !pinned.has(path) && positive.has(path)), ...baseline.filter(path => !pinned.has(path) && !positive.has(path))];
  const coverage = { eligibleCount: baseline.length, permittedCount: assessable.length, submittedCount: assessed.size, answeredCount: answered.size,
    unassessedCount: assessable.length - answered.size, notPermittedCount: notPermitted, unavailableCount: excluded.length,
    unfittableCount: unfittable.length, complete: answered.size === baseline.length, reason, attempted: assessed.size > 0,
    applied: decisions.some(item => item.delivered), mode: decisions[0]?.mode ?? "off", traversalStart: parseInt(digest({ eventId }).slice(7, 15), 16),
    priorityAssessed, generalAssessed, replayedBatches, invalidatedBatches };
  return { version: 3, catalog, order, reason, assessed: [...assessed], metadataPermittedCount: assessable.length, coverage, cursor,
    invocationId, budgetFinalized, excluded, decisions, delivered: positive.size > 0, sourceBodiesTransmitted: described.size > 0, rawSourceFilesTransmitted: false,
    sourceIndex: sourceIndexObservation(projection, described.size, baseline.length, descriptionOmissions),
    firstBatchMs, providerCallMs, elapsedMs: performance.now() - started };
}
