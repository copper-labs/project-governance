import { digest } from "./core.ts";
import { matchesPackPath } from "./planning.ts";
import { localContextPath } from "./context-path-policy.ts";
import type { ValidationSubject } from "./change-subject.ts";
import { interpretNoul, type DecisionAsk, type DecisionOutcome, type DecisionRuntime } from "./decision-runtime.ts";
import type { BudgetScope } from "./decision-budget.ts";
import { contextBudgetScope, contextFamilyScope, readDecisionBudget } from "./decision-budget.ts";
import { compactMetadataItem, METADATA_MAX_QUESTIONS, type EvidenceItem } from "./decision-schema.ts";
import { CONTEXT_SELECTION_MS } from "./context-timing.ts";
import { prepareDecisionRequest } from "./decision-request-preparation.ts";
import { PROVIDER_CONCURRENCY } from "./decision-admission.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import { maintainContextProjection } from "./context-projection.ts";

const BATCH_SIZE = METADATA_MAX_QUESTIONS;
import { contextTerms } from "./context-terms.ts";

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
  eventId: string, signal?: AbortSignal, deadlineAt = performance.now() + CONTEXT_SELECTION_MS, projection?: ReturnType<typeof maintainContextProjection>, family?: MetadataFamily, evaluation: { concurrency?: number; layout?: "compact-v1" | "shared-v1" | "per-question-v1"; deferBudgetClose?: boolean; reservePassageBudget?: boolean } = {}) {
  const started = performance.now(), baseline = catalog.candidates.map(item => item.path), decisions: DecisionOutcome[] = [];
  const layout = evaluation.layout ?? "compact-v1", concurrency = evaluation.concurrency ?? PROVIDER_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > PROVIDER_CONCURRENCY) throw new Error("invalid metadata concurrency");
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
  const descriptorPermitted = assessable.filter(path => runtime.settings.legacy.allowedDataClasses.includes("source") && runtime.settings.legacy.allowedDataClasses.includes("metadata") && matchesPackPath(path, runtime.settings.legacy.allowedSourcePaths ?? []));
  const descriptorAvailable = new Set(descriptorPermitted.filter(path => projection!.entries.has(path)));
  const positive = new Map<string, number>(), uncertain = new Map<string, number>(), negative = new Set<string>();
  const assessed = new Set<string>(), answered = new Set<string>(), described = new Set<string>(), answeredDescribed = new Set<string>(), visited = new Set<string>();
  const permitted = new Set(assessable), itemByPath = new Map<string, EvidenceItem>();
  const purposeItem: EvidenceItem = { id: "purpose", text: purpose, sourceDigest: digest(purpose), provenance: "supplied", trust: "untrusted" };
  const purposeBytes = Buffer.byteLength(purpose), limit = runtime.settings.legacy.evidenceBytes;
  const definition = DECISION_QUESTIONS["context.metadata-relevance/1"]!;
  const wireLimit = Math.min(65536, runtime.settings.budget.maxRequestBytes), baseWire = 1000 + Buffer.byteLength(JSON.stringify(purposeItem)) + (layout === "compact-v1" ? Buffer.byteLength(definition.instructions) : 0);
  const itemWire = (item: EvidenceItem) => layout === "compact-v1"
    ? Buffer.byteLength(JSON.stringify(compactMetadataItem(item))) + 150
    : Buffer.byteLength(JSON.stringify(item)) + Buffer.byteLength(JSON.stringify({ instructions: { question: definition.instructions, evidenceIds: ["purpose", item.id] }, type: "noul" })) + 32;
  for (const path of assessable) {
    const detail = detailAllowed && matchesPackPath(path, runtime.settings.legacy.allowedSourcePaths ?? []) ? projection.entries.get(path) : null;
    let item: EvidenceItem = { id: path, text: detail?.text ?? path, sourceDigest: detail?.sourceDigest ?? digest(path), provenance: "derived", trust: "untrusted" };
    if (detail && (purposeBytes + Buffer.byteLength(item.text) > limit || baseWire + itemWire(item) > wireLimit)) {
      item = { ...item, text: path, sourceDigest: digest(path) }; descriptionOmissions.push(path);
    }
    itemByPath.set(path, item);
  }
  const coverageFor = (paths: string[]) => ({ captured: paths.length, omitted: [], unavailable: excluded.slice(0, 64).map(item => item.path), truncated: assessable.length !== paths.length,
    limits: ["complete-inventory-batched", `maximum-${METADATA_MAX_QUESTIONS}-questions-per-batch`, paths.some(path => itemByPath.get(path)?.text !== path) ? "approved-source-descriptions" : "paths-only"] });
  const signature = (paths: string[]) => digest({ paths, evidence: [purposeItem, ...paths.map(path => itemByPath.get(path))],
    layout, coverage: coverageFor(paths), configuration: runtime.settings.configDigest, revision: family?.revision ?? scope?.taskRevision ?? "unbound", question: definition });
  const cursor: MetadataCursor = { version: 1, generation: projection.generation, batches: [] };
  const apply = (paths: string[], outcome: DecisionOutcome) => {
    decisions.push(outcome);
    if (outcome.providerCalled) for (const path of paths) { assessed.add(path); visited.add(path); if (itemByPath.get(path)?.text !== path) described.add(path); }
    paths.forEach((path, i) => {
      if (outcome.answers[`file-${i}`]?.status === "answered") {
        answered.add(path); if (itemByPath.get(path)?.text !== path) answeredDescribed.add(path);
      }
      const answer = outcome.answers[`file-${i}`];
      if (outcome.delivered && answer?.status === "answered" && answer.shape === "noul") {
        const interpretation = interpretNoul(answer).value;
        if (interpretation === "positive") positive.set(path, answer.probability);
        else if (interpretation === "uncertain") uncertain.set(path, answer.probability);
        else negative.add(path);
      }
    });
  };
  let replayedBatches = 0, invalidatedBatches = 0, providerCallMs = 0, httpTotalMs = 0, admissionTotalMs = 0, packingMs = 0, peakConcurrency = 0, firstBatchMs: number | null = null, budgetFinalized: boolean | null = null;
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
  const reserveCalls = evaluation.reservePassageBudget && runtime.eligibility("DL03", "context.metadata-relevance/1").providerUse === "eligible"
    ? Math.min(2, runtime.settings.budget.maxCalls - 1) : 0;
  const reserveBytes = reserveCalls ? Math.min(65_536, Math.floor(runtime.settings.budget.maxRequestBytes / 4)) : 0;
  const metadataByteCeiling = Math.max(0, runtime.settings.budget.maxRequestBytes - reserveBytes);
  const metadataCallCeiling = runtime.settings.budget.maxCalls - reserveCalls;
  const spent = scope ? readDecisionBudget(runtime.stateRoot, family
    ? contextFamilyScope(scope.workspace, invocationId) : contextBudgetScope(scope, invocationId)) : null;
  // Receipt counters are cumulative. The store also includes earlier passage calls in a family.
  let claimedBytes = Math.max(spent?.bytes ?? 0, ...(family?.previous?.batches ?? []).map(batch => batch.outcome.budget.bytes ?? 0));
  let claimedCalls = Math.max(spent?.calls ?? 0, ...(family?.previous?.batches ?? []).map(batch => batch.outcome.budget.calls ?? 0));
  let reason = enabled ? assessable.length ? "not-attempted" : "metadata-scope-disabled" : "metadata-question-disabled";
  const controller = new AbortController(), cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel(); else signal?.addEventListener("abort", cancel, { once: true });
  const completed: Array<{ paths: string[]; signature: string; outcome: DecisionOutcome }> = [];
  let nextBatch = 0, active = 0, stop = false;
  const askFor = (batch: string[]): DecisionAsk => {
    const batchSignature = signature(batch), sourcePaths = batch.filter(path => itemByPath.get(path)!.text !== path);
    return { consumerId: "DL03", eventId: digest({ invocationId, batchSignature }), scope,
      subject: { digest: family ? batchSignature : subjectDigest, revision: family?.revision ?? scope?.taskRevision ?? "unbound", environment: "context-metadata" },
      evidenceLayout: layout, metadataPaths: batch, ...(sourcePaths.length ? { sourcePaths } : {}),
      evidence: [purposeItem, ...batch.map(path => itemByPath.get(path)!)],
      budgetPartition: "context-selection", budgetInvocationId: invocationId, ...(family ? { budgetFamily: true } : {}), deadlineAt, signal: controller.signal,
      coverage: coverageFor(batch), questions: batch.map((path, i) => ({ name: `file-${i}`, definitionId: "context.metadata-relevance/1", consumerId: "DL03", evidenceIds: ["purpose", path] })),
      policyDigest: runtime.settings.configDigest };
  };
  const fits = (batch: string[]) => prepareDecisionRequest({ ...askFor(batch),
    scope: scope ?? { workspace: subject.root, taskId: "unbound", taskRevision: "unbound" } }, runtime.settings, ["DL03"], "packing").ok;
  const forecastPriorities = [...priorities], forecastGeneral = [...general];
  let forecastBytes = 0, forecastCalls = 0, forecastUnrepresentable = 0;
  while (forecastPriorities.length || forecastGeneral.length) {
    const packed = packMetadataBatch(forecastPriorities, forecastGeneral, itemByPath,
      { purposeBytes, evidenceBytes: limit, baseWire, wireBytes: wireLimit, itemWire });
    forecastUnrepresentable += packed.unfittable.length;
    let offset = 0;
    while (offset < packed.batch.length) {
      let size = packed.batch.length - offset, request = prepareDecisionRequest({ ...askFor(packed.batch.slice(offset)), scope: scope ?? { workspace: subject.root, taskId: "unbound", taskRevision: "unbound" } }, runtime.settings, ["DL03"], "forecast");
      while (!request.ok && size > 1) request = prepareDecisionRequest({ ...askFor(packed.batch.slice(offset, offset + --size)), scope: scope ?? { workspace: subject.root, taskId: "unbound", taskRevision: "unbound" } }, runtime.settings, ["DL03"], "forecast");
      if (request.ok) { forecastBytes += request.requestBytes; forecastCalls++; } else forecastUnrepresentable++;
      offset += size;
    }
  }
  const preflight = { remainingInventoryCount: priorities.length + general.length, requestBytes: forecastBytes, requestCalls: forecastCalls,
    alreadySpentBytes: claimedBytes, alreadySpentCalls: claimedCalls, familyByteLimit: runtime.settings.budget.maxRequestBytes,
    metadataByteCeiling, metadataCallCeiling, fitsBytes: claimedBytes + forecastBytes <= metadataByteCeiling,
    fitsCalls: claimedCalls + forecastCalls <= metadataCallCeiling, unrepresentableCount: forecastUnrepresentable,
    operationRemainingMs: Math.max(0, deadlineAt - performance.now()), latencyQualification: "not-established",
    recommendation: claimedBytes + forecastBytes > metadataByteCeiling ? "explicit-byte-allowance-required-within-8388608-ceiling" : null };
  const requeue = (paths: string[]) => {
    priorities.unshift(...paths.filter(path => prioritySet.has(path)));
    general.unshift(...paths.filter(path => !prioritySet.has(path)));
  };
  const worker = async () => {
    while (enabled && !family?.replayOnly && !stop && (priorities.length || general.length)) {
      if (controller.signal.aborted || performance.now() >= deadlineAt) { stop = true; break; }
      if (purposeBytes >= limit || baseWire >= wireLimit) { reason = "input-budget"; stop = true; break; }
      const packingStart = performance.now();
      const packed = packMetadataBatch(priorities, general, itemByPath,
        { purposeBytes, evidenceBytes: limit, baseWire, wireBytes: wireLimit, itemWire });
      let batch = packed.batch;
      unfittable.push(...packed.unfittable);
      // The fast estimate only proposes a batch. Actual serialization owns every bound.
      if (batch.length && !fits(batch)) {
        let low = 0, high = batch.length - 1;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (fits(batch.slice(0, middle))) low = middle; else high = middle - 1;
        }
        if (low) { requeue(batch.slice(low)); batch = batch.slice(0, low); }
        else {
          const path = batch[0]!, item = itemByPath.get(path)!;
          // Downgrade only an individually unrepresentable description, never to hit a count target.
          if (item.text !== path) {
            itemByPath.set(path, { ...item, text: path, sourceDigest: digest(path) }); descriptionOmissions.push(path);
          }
          if (fits([path])) { requeue(batch.slice(1)); batch = [path]; }
          else { unfittable.push(path); requeue(batch.slice(1)); batch = []; }
        }
      }
      packingMs += performance.now() - packingStart;
      if (!batch.length) { reason = "input-budget"; continue; }
      if (controller.signal.aborted || performance.now() >= deadlineAt) { requeue(batch); stop = true; break; }
      if (reserveBytes) {
        const prepared = prepareDecisionRequest(askFor(batch), runtime.settings, ["DL03"], "budget-planning");
        if (!prepared.ok || claimedBytes + prepared.requestBytes > metadataByteCeiling || claimedCalls + 1 > metadataCallCeiling) {
          requeue(batch); reason = "passage-reserved-budget"; stop = true; break;
        }
        claimedBytes += prepared.requestBytes; claimedCalls++;
      }
      firstBatchMs ??= performance.now() - started;
      const index = nextBatch++;
      active++; peakConcurrency = Math.max(peakConcurrency, active);
      let outcome: DecisionOutcome;
      try { outcome = await runtime.ask(askFor(batch)); } catch (error) { stop = true; throw error; } finally { active--; }
      completed[index] = { paths: batch, signature: signature(batch), outcome };
      if (outcome.providerCalled && !outcome.reason.startsWith("repeated-")) {
        providerCallMs += outcome.latencyMs;
        httpTotalMs += outcome.transport?.httpMs ?? 0; admissionTotalMs += outcome.transport?.admissionMs ?? 0;
      }
      if (!outcome.delivered && !["shadow", "repeated-observation", "no-usable-answers"].includes(outcome.reason) && outcome.failureStage !== "answer-validation") stop = true;
    }
  };
  const cutoff = setTimeout(() => controller.abort("context-selection-deadline"), Math.max(0, deadlineAt - performance.now()));
  try {
    // Promise.allSettled owns all local handlers even when one sibling unexpectedly rejects.
    const settled = await Promise.allSettled(Array.from({ length: concurrency }, worker));
    for (const batch of completed) {
      if (!batch) continue;
      apply(batch.paths, batch.outcome);
      if (batch.outcome.providerCalled) {
        cursor.batches.push(batch);
        priorityAssessed += batch.paths.filter(path => prioritySet.has(path)).length;
        generalAssessed += batch.paths.filter(path => !prioritySet.has(path)).length;
      }
    }
    const failure = completed.find(batch => batch && !batch.outcome.delivered && !["shadow", "repeated-observation"].includes(batch.outcome.reason));
    reason = signal?.aborted ? "cancelled" : performance.now() >= deadlineAt ? "deadline"
      : reason === "passage-reserved-budget" ? reason
      : settled.some(item => item.status === "rejected") ? "selection-unavailable"
      : failure?.outcome.reason ?? completed.at(-1)?.outcome.reason ?? reason;
  } finally {
    clearTimeout(cutoff); signal?.removeEventListener("abort", cancel);
    if (!family && scope && !evaluation.deferBudgetClose && decisions.some(item => ["reserved", "duplicate"].includes(item.budget.state)))
      budgetFinalized = runtime.closeContextInvocation(scope, invocationId);
  }
  if (!priorities.length && !general.length && reason === "not-attempted" && replayedBatches) reason = "exact-batch-replay";
  if (unfittable.length && answered.size < assessable.length && ["answered", "shadow", "repeated-observation"].includes(reason)) reason = "input-budget";
  const pinned = new Set(catalog.candidates.filter(item => item.pinned).map(item => item.path));
  const relevant = baseline.filter(path => !pinned.has(path) && positive.has(path))
    .sort((a, b) => positive.get(b)! - positive.get(a)! || a.localeCompare(b));
  // File scores choose what to inspect next. Uncertainty is not evidence of irrelevance.
  // Keep confidence labels and passage confirmation separate from this advisory rank.
  const tentative = baseline.filter(path => !pinned.has(path) && uncertain.has(path))
    .sort((a, b) => uncertain.get(b)! - uncertain.get(a)! || a.localeCompare(b));
  const applied = positive.size > 0 || uncertain.size > 0;
  const order = [...baseline.filter(path => pinned.has(path)), ...relevant, ...tentative,
    ...baseline.filter(path => !pinned.has(path) && !positive.has(path) && !uncertain.has(path))];
  const coverage = { eligibleCount: baseline.length, permittedCount: assessable.length, submittedCount: assessed.size, answeredCount: answered.size,
    unassessedCount: assessable.length - answered.size, notPermittedCount: notPermitted, unavailableCount: excluded.length,
    unfittableCount: unfittable.length, complete: answered.size === assessable.length && assessable.length > 0, inventoryComplete: answered.size === baseline.length, reason, attempted: assessed.size > 0,
    applied, mode: decisions[0]?.mode ?? "off", traversalStart: parseInt(digest({ eventId }).slice(7, 15), 16),
    priorityAssessed, generalAssessed, replayedBatches, invalidatedBatches,
    passageReservedBytes: reserveBytes, metadataByteCeiling, passageReservedCalls: reserveCalls, metadataCallCeiling };
  return { version: 3, catalog, order, reason, assessed: [...assessed], metadataPermittedCount: assessable.length, coverage, preflight, cursor,
    invocationId, budgetFinalized, excluded, decisions, delivered: applied,
    ordering: { rule: "positive-then-uncertain-before-baseline", positiveCount: positive.size,
      uncertainCount: uncertain.size, supportedNegativeCount: negative.size,
      uncertainPreview: tentative.slice(0, 16).map(path => ({ path, probability: uncertain.get(path)! })),
      previewTruncated: tentative.length > 16, confirmsSourceEvidence: false },
    sourceBodiesTransmitted: described.size > 0, rawSourceFilesTransmitted: false,
    sourceIndex: { ...sourceIndexObservation(projection, described.size, baseline.length, descriptionOmissions),
      descriptorCoverage: { cachedCount: projection.entries.size, metadataPermittedCount: assessable.length,
        descriptorPermittedCount: descriptorPermitted.length, descriptorAvailableCount: descriptorAvailable.size,
        descriptorSubmittedCount: described.size, descriptorAnsweredCount: answeredDescribed.size,
        pathOnlySubmittedCount: assessed.size - described.size, pathOnlyAnsweredCount: answered.size - answeredDescribed.size,
        pathOnlyReasons: { disclosureNotApproved: assessable.length - descriptorPermitted.length,
          factsUnavailable: descriptorPermitted.length - descriptorAvailable.size, inferenceUnavailable: detailAllowed ? 0 : descriptorAvailable.size, individuallyUnrepresentable: descriptionOmissions.length },
        sourcePermissionAlsoPermitsBodies: true, passageConsumerRequired: true } },
    firstBatchMs, providerCallMs, httpTotalMs, admissionTotalMs, packingMs, peakConcurrency, evidenceLayout: layout, elapsedMs: performance.now() - started };
}
