import { dirname, join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { digest, object, text } from "./core.ts";
import type { ContextQualityScore } from "./context-evaluation-quality.ts";
import { boundedOutcomeReader, decisionOutcomeReport, type OutcomeEvidenceReader } from "./decision-outcomes.ts";
import { canonicalEvidencePath, jevEvaluationCost, measuredNumber, nativeEvaluationCost, providerEvaluationCost } from "./release-evaluation-cost.ts";
import { RELEASE_DIMENSIONS, type EvaluationCondition, type EvaluationEnvelope, type EvaluationEpisode, type EvaluationIssue,
  type EvaluationContextTiming, type EvaluationMeasure, type EvaluationReference, type ReleaseEvaluationInput } from "./release-evaluation-types.ts";

const hash = (value: unknown) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const identifier = (value: unknown, label: string) => {
  const result = text(value, label, 256);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/+ -]{0,255}$/u.test(result)) throw new Error(`Invalid ${label}`);
  return result;
};
const nullableHash = (value: unknown) => value === undefined || value === null ? null : hash(value) ? String(value) : (() => { throw new Error("Invalid evaluation digest"); })();
const nullableText = (value: unknown) => value === undefined || value === null ? null : identifier(value, "identity");
const count = (value: unknown) => value === null || value === undefined ? null : Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : (() => { throw new Error("Invalid evaluation count"); })();
const observedString = (value: unknown) => typeof value === "string" && value.length ? value : null;
const list = (value: unknown, maximum: number) => {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("Invalid evaluation list");
  return value;
};
function captureFailure(error: unknown, kind: string) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (["ENOENT", "EACCES", "EPERM"].includes(String(code))) return `${kind}-unavailable`;
  if (error instanceof Error && error.message.includes("read budget")) return `${kind}-read-budget-exceeded`;
  return `${kind}-invalid`;
}

/** Validate only the optional extension. Version-two episode/receipt validation stays with its owner. */
function envelope(raw: unknown): EvaluationEnvelope {
  const value = object(raw), suite = object(value.suite), population = object(value.population ?? {}), discovery = object(value.discovery ?? {});
  if (value.version !== 1 || value.metricContract !== "release-evaluation-1" || !["controlled", "field"].includes(String(value.view)) || !hash(suite.digest))
    throw new Error("Unsupported release evaluation contract");
  const seen = new Set<string>();
  const conditions = list(value.conditions, 64).map(rawCondition => {
    const condition = object(rawCondition), runtime = object(condition.runtime), id = identifier(condition.id, "condition id");
    if (seen.has(id) || !hash(runtime.archiveDigest)) throw new Error("Duplicate condition or missing exact archive");
    seen.add(id);
    if (!["cold", "warm", "unknown"].includes(String(condition.cacheState)) || !["code-only", "jev-active", "shadow", "field"].includes(String(condition.arm)))
      throw new Error("Invalid condition cache or arm");
    return { id, runtime: { version: identifier(runtime.version, "runtime version"), archiveDigest: String(runtime.archiveDigest) },
      sourceDigest: nullableHash(condition.sourceDigest), profileDigest: nullableHash(condition.profileDigest), questionDigest: nullableHash(condition.questionDigest),
      permissionsDigest: nullableHash(condition.permissionsDigest), environmentDigest: nullableHash(condition.environmentDigest), budgetDigest: nullableHash(condition.budgetDigest),
      model: nullableText(condition.model), effort: nullableText(condition.effort), cacheState: condition.cacheState, arm: condition.arm } as EvaluationCondition;
  });
  let comparison: EvaluationEnvelope["comparison"] = null;
  if (value.comparison !== undefined && value.comparison !== null) {
    const selected = object(value.comparison);
    if (!seen.has(String(selected.baseline)) || !seen.has(String(selected.candidate)) || selected.baseline === selected.candidate ||
        !["release", "jev"].includes(String(selected.kind)) || measuredNumber(selected.minimumChange) === null) throw new Error("Invalid evaluation comparison");
    comparison = { baseline: String(selected.baseline), candidate: String(selected.candidate), kind: selected.kind as "release" | "jev", minimumChange: Number(selected.minimumChange) };
  }
  if (discovery.scanComplete !== undefined && discovery.scanComplete !== null && typeof discovery.scanComplete !== "boolean") throw new Error("Invalid scan coverage");
  return { version: 1, metricContract: "release-evaluation-1", suite: { version: identifier(suite.version, "suite version"), digest: String(suite.digest) },
    view: value.view as "controlled" | "field", conditions, population: { eligiblePrompts: count(population.eligiblePrompts) },
    discovery: { scanComplete: discovery.scanComplete as boolean ?? null, projectionEvicted: count(discovery.projectionEvicted) }, comparison };
}

/** One memoized, bounded capture shared by the existing outcome owner and the thin scorecard reader. */
export function readReleaseEvaluationInput(stateRoot: string, manifestPath: string): ReleaseEvaluationInput {
  manifestPath = resolve(manifestPath);
  const bounded = boundedOutcomeReader(), cache = new Map<string, Record<string, unknown>>();
  const reader: OutcomeEvidenceReader = { bytesRead: bounded.bytesRead, read: (path, expected) => {
    path = resolve(path);
    const retained = cache.get(path);
    if (retained) {
      if (expected !== undefined && bounded.digestFor(path) !== expected) throw new Error("Outcome evidence digest mismatch");
      return retained;
    }
    const value = bounded.read(path, expected); cache.set(path, value); return value;
  } };
  const manifest = reader.read(manifestPath);
  if (manifest.version !== 2) throw new Error("Release evaluation extends outcome manifest version two");
  const settings = envelope(manifest.evaluation);
  const outcome = decisionOutcomeReport(stateRoot, manifestPath, reader);
  const joined = new Map(outcome.samples.map(sample => [String(sample.episode), sample]));
  const manifestReference = { path: manifestPath, digest: bounded.digestFor(manifestPath)! };
  const issues: EvaluationIssue[] = [], episodes: EvaluationEpisode[] = [], seen = new Set<string>();
  const reference = (raw: unknown) => {
    const value = object(raw), path = canonicalEvidencePath(text(value.path, "evidence path", 4096), dirname(manifestPath));
    if (!hash(value.digest)) throw new Error("canonical-evidence-digest-required");
    return { reference: { path, digest: String(value.digest) }, record: reader.read(path, String(value.digest)) };
  };
  for (const raw of manifest.episodes as unknown[]) {
    const entry = object(raw), id = identifier(entry.id, "episode id");
    if (seen.has(id)) continue; seen.add(id);
    let episode: EvaluationEpisode = { id, conditionId: null, caseId: null, trialId: null, inputDigest: null, expectedLabelDigest: null,
      lifecycle: "assigned", joined: joined.has(id), scope: null, observedGenerations: [], observedArchiveDigests: [], generationIncomplete: 0,
      generation: "unknown", measures: [], costs: [], executionCosts: [], contextTimings: [],
      acceptance: "unknown", acceptanceProvenance: null, usagePopulation: null, costCaptureUnknown: false, elapsedMs: null, reworkMinutes: null, interventions: null,
      additionalReads: null, readCoverage: "unknown", selectionQuality: null, sources: [manifestReference], exposure: null };
    const problem = (code: string, source: EvaluationReference | null = null) => issues.push({ episode: id, code, reference: source });
    try {
      const extra = object(entry.evaluation), condition = settings.conditions.find(item => item.id === extra.conditionId);
      if (!condition) throw new Error("evaluation-condition-unavailable");
      episode.conditionId = condition.id; episode.caseId = identifier(extra.caseId, "case id"); episode.trialId = identifier(extra.trialId, "trial id");
      episode.inputDigest = nullableHash(extra.inputDigest); episode.expectedLabelDigest = nullableHash(extra.expectedLabelDigest);
      if (!["assigned", "started", "terminal"].includes(String(extra.lifecycle))) throw new Error("evaluation-lifecycle-invalid");
      episode.lifecycle = extra.lifecycle as EvaluationEpisode["lifecycle"];
      const expected = list(extra.expected ?? [], 256), expectedIds = new Set<string>();
      for (const item of expected) {
        const value = object(item), dimension = String(value.dimension), unitId = identifier(value.unitId, "expected unit");
        if (!(RELEASE_DIMENSIONS as readonly string[]).includes(dimension) || expectedIds.has(`${dimension}:${unitId}`)) throw new Error("expected-unit-invalid-or-duplicate");
        expectedIds.add(`${dimension}:${unitId}`);
        episode.measures.push({ dimension: dimension as EvaluationMeasure["dimension"], unitId, expected: identifier(value.outcome, "expected outcome"), observed: null,
          reason: null, critical: value.critical === true, provenance: "operator-source", reference: manifestReference });
      }
      if (!episode.joined) {
        try { reference(entry.caller); problem("outcome-link-invalid"); }
        catch (error) { problem(captureFailure(error, "caller-capture")); }
        episodes.push(episode); continue;
      }
      const sample = joined.get(id)!, caller = reference(entry.caller);
      const capturedDecisionIds = new Set((sample.decisions as Array<Record<string, unknown>>).map(item => String(item.id)));
      if ((entry.decisions as string[]).some(item => !capturedDecisionIds.has(item))) {
        episode.costCaptureUnknown = true; problem("decision-cost-capture-unavailable");
      }
      episode.sources.push(caller.reference);
      if (caller.record.exposure && typeof caller.record.exposure === "object") {
        const exposure = object(caller.record.exposure), safeCode = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9-]{0,127}$/u.test(value) ? value : null;
        episode.exposure = { configuredMode: safeCode(exposure.configuredMode), mode: safeCode(exposure.mode), reason: safeCode(exposure.reason),
          delivered: typeof exposure.delivered === "boolean" ? exposure.delivered : null };
      }
      if (sample.scope) {
        const scope = object(sample.scope);
        episode.scope = { workspace: realpathSync(String(scope.workspace)), taskId: String(scope.taskId), taskRevision: String(scope.taskRevision) };
      }
      const generations = new Set<string>(), archiveDigests = new Set<string>();
      const identity = (record: Record<string, unknown>, required = true) => {
        const version = record.runtimeVersion ?? record.runtime_version, archive = record.archiveDigest ?? record.archive_digest;
        if (typeof version === "string") generations.add(identifier(version, "observed runtime"));
        if (hash(archive)) archiveDigests.add(String(archive));
        if (required && (typeof version !== "string" || !hash(archive))) episode.generationIncomplete++;
      };
      identity(caller.record);
      const observe = (dimension: EvaluationMeasure["dimension"], unitId: string, observed: string | null, source: EvaluationReference, provenance: EvaluationMeasure["provenance"] = "native-receipt", reason: string | null = null) => {
        const measure = episode.measures.find(item => item.dimension === dimension && item.unitId === unitId);
        if (!measure) return;
        if (measure.reason === "conflicting-observations") return;
        if (measure.observed !== null && measure.observed !== observed) { measure.observed = null; measure.reason = "conflicting-observations"; problem("conflicting-measure", source); return; }
        Object.assign(measure, { observed, reference: source, provenance, reason });
      };
      for (const rawRef of entry.native === undefined ? [] : list(entry.native, 16)) {
        const capture = reference(rawRef), kind = object(rawRef).kind; episode.sources.push(capture.reference); identity(capture.record);
        const unit = kind === "command" ? String(capture.record.requestDigest) : String(capture.record.run_id);
        const state = observedString(kind === "command" ? capture.record.state : capture.record.status);
        const cleanup = kind === "command" ? observedString(capture.record.cleanup) : null;
        observe("checks", unit, state, capture.reference);
        if (kind === "command") observe("cleanup", unit, cleanup, capture.reference);
        episode.executionCosts.push({ id: `${String(kind)}:${String(kind === "command" ? capture.record.requestDigest : capture.record.result_digest)}`,
          state, cleanup, durationMs: measuredNumber(kind === "command" ? capture.record.durationMs : capture.record.duration_ms), reference: capture.reference });
      }
      for (const decision of sample.decisions as Array<Record<string, unknown>>) {
        const captured = decision.source ? reference(decision.source) : null;
        const path = join(stateRoot, "decisions", `${String(decision.id)}.json`), record = captured?.record ?? reader.read(path);
        const source = captured?.reference ?? { path: resolve(path), digest: bounded.digestFor(path)! };
        if (![true, false].includes(object(record.outcome).providerCalled as boolean)) episode.costCaptureUnknown = true;
        const cost = jevEvaluationCost(record, source); if (cost) episode.costs.push(cost);
        identity(record); episode.sources.push(source);
      }
      const artifacts: Array<{kind: string; variant: unknown; reference: EvaluationReference; record: Record<string, unknown>}> = [];
      for (const rawRef of list(extra.evidence ?? [], 256)) {
        try { artifacts.push({ kind: String(object(rawRef).kind), variant: object(rawRef).variant, ...reference(rawRef) }); }
        catch (error) { if (object(rawRef).kind === "usage") episode.costCaptureUnknown = true; problem(captureFailure(error, "evidence")); }
      }
      const prompt = artifacts.find(item => item.kind === "prompt-entry");
      if (prompt && (prompt.record.entryId !== object(caller.record.native).entryId || prompt.record.workspace !== episode.scope?.workspace && episode.scope !== null)) throw new Error("prompt-entry-link-mismatch");
      const originalBinding = prompt?.record.binding ? object(prompt.record.binding) : null;
      const switched = artifacts.some(item => item.kind === "task-switch" && item.record.kind === "task-switch" && item.record.entryId === prompt?.record.entryId && item.record.entryDigest === digest(prompt?.record)) ||
        !!(originalBinding && episode.scope && originalBinding.taskId !== episode.scope.taskId);
      let reopened = false;
      for (const artifact of artifacts) {
        const { kind, record, reference: source } = artifact; episode.sources.push(source); identity(record, kind === "route");
        if (kind === "usage") {
          if (!prompt) throw new Error("usage-prompt-entry-required");
          episode.costs.push(nativeEvaluationCost(record, source, prompt.record, switched));
        } else if (kind === "route") {
          const native = object(caller.record.native), linked = caller.record.entryKind === "context-delivery"
            ? native.receiptId === record.receiptId && native.inputDigest === record.inputDigest
            : prompt?.record.routeReceiptId === record.receiptId && prompt?.record.routeInputDigest === record.inputDigest;
          if (record.version !== 1 || typeof record.receiptId !== "string" || !hash(record.inputDigest) || !linked || record.workspace !== episode.scope?.workspace && episode.scope !== null) {
            problem("context-timing-route-unlinked", source); continue;
          }
          episode.contextTimings.push(contextTiming(record, source));
        } else if (kind === "task") {
          // Status changes create new task versions. Join the captured owner chain after all reads.
        } else if (kind === "outcome") {
          // The existing context outcome command is host-reported; it cannot establish acceptance.
          if (record.kind === "outcome" && record.disposition === "reopened" && record.entryId === prompt?.record.entryId) reopened = true;
        } else if (kind === "read") {
          if (record.kind !== "expansion" || record.entryId !== prompt?.record.entryId) throw new Error("read-entry-link-mismatch");
          episode.additionalReads = (episode.additionalReads ?? 0) + 1; episode.readCoverage = "observed-only";
        } else if (kind === "assessment") {
          if (record.version !== 1 || record.kind !== "release-evaluation-assessment" || record.caseId !== episode.caseId ||
              record.inputDigest !== episode.inputDigest || record.labelDigest !== episode.expectedLabelDigest || !["fixture-oracle", "host-observer", "operator-source"].includes(String(record.provenance)))
            throw new Error("assessment-label-or-input-mismatch");
          if (record.outcome !== null && typeof record.outcome !== "string") throw new Error("assessment-outcome-invalid");
          observe(String(record.dimension) as EvaluationMeasure["dimension"], identifier(record.unitId, "assessment unit"),
            record.outcome === null ? null : identifier(record.outcome, "assessment outcome"), source, record.provenance as EvaluationMeasure["provenance"], nullableText(record.reason));
        } else if (kind === "context-evaluation") {
          const results = list(record.results, 1000), result = results.map(value => object(value)).find(item => item.id === episode.caseId);
          if (!["baseline", "candidate", "lexical", "shadow"].includes(String(artifact.variant))) { problem("selection-variant-unavailable", source); continue; }
          const selected = result?.quality ? object(result.quality)[String(artifact.variant)] : null;
          const quality = selected ? object(selected) : null;
          const labelSource = quality?.labelSource ? object(quality.labelSource) : null;
          if (!quality || quality.inputDigest !== episode.inputDigest || quality.labelDigest !== episode.expectedLabelDigest || !labelSource ||
              !["operator", "source-backed-fixture"].includes(String(labelSource.kind)) || labelSource.independentOfSelector !== true) {
            problem("selection-labels-unavailable-or-mismatched", source); continue;
          }
          // The owning evaluator supplies numeric scores; never copy source excerpts or label prose.
          episode.selectionQuality = qualitySummary(quality);
        } else if (!["prompt-entry", "task-switch"].includes(kind)) throw new Error("unsupported-evaluation-evidence-kind");
      }
      const accepted = taskAcceptance(artifacts.filter(item => item.kind === "task"), episode.scope);
      episode.acceptance = accepted.status; episode.acceptanceProvenance = accepted.provenance;
      if (accepted.reason) problem(accepted.reason);
      if (reopened) { episode.acceptance = "reopened"; episode.acceptanceProvenance = "hash-verified-host-reopen-observation"; }
      for (const job of list(extra.providerJobs ?? [], 64)) {
        try { const provider = providerEvaluationCost(job, reference); episode.costs.push(provider.cost);
          episode.sources.push(provider.cost.reference); identity({ runtimeVersion: provider.runtimeVersion, archiveDigest: provider.archiveDigest }); }
        catch (error) { episode.costCaptureUnknown = true; episode.generationIncomplete++; problem(captureFailure(error, "provider-artifact")); }
      }
      episode.observedGenerations = [...generations].sort();
      episode.observedArchiveDigests = [...archiveDigests].sort();
      episode.generation = generations.size > 1 || archiveDigests.size > 1 ? "mixed" : episode.generationIncomplete || generations.size === 0 || archiveDigests.size === 0 ? "unknown"
        : generations.has(condition.runtime.version) && archiveDigests.has(condition.runtime.archiveDigest) ? "matched" : "different";
      if (episode.generation !== "matched") problem(`runtime-generation-${episode.generation}`);
      const observations = object(sample.observations);
      episode.elapsedMs = measuredNumber(observations.elapsedMs); episode.reworkMinutes = measuredNumber(observations.reworkMinutes); episode.interventions = measuredNumber(observations.interventions);
      if (extra.usagePopulation !== undefined && extra.usagePopulation !== null) episode.usagePopulation = list(extra.usagePopulation, 1000).map(value => identifier(value, "usage identity"));
      if (episode.acceptance !== "unknown") observe("whole-task", episode.scope?.taskId ?? id, episode.acceptance, accepted.reference ?? manifestReference);
    } catch { problem("evaluation-episode-invalid"); episode.joined = false; episode.acceptance = "unknown"; episode.acceptanceProvenance = null; episode.costCaptureUnknown = true;
      episode.costs.forEach(item => { item.allocation = "unallocated"; }); episode.measures.forEach(item => { item.observed = null; }); }
    episodes.push(episode);
  }
  return { envelope: settings, manifest: manifestReference, episodes, issues, readBytes: reader.bytesRead(),
    duplicateEpisodes: outcome.counts.duplicate_episodes, provenance: "hash-verified-explicit-outcome-manifest" };
}

/** Preserve the route owner's phase meanings; overlapping work is never summed into elapsed time. */
function contextTiming(record: Record<string, unknown>, reference: EvaluationReference): EvaluationContextTiming {
  const fields = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const originalTiming = fields(record.timing), timing = originalTiming.version === 1 ? originalTiming : {}, projection = fields(record.projection), indexTiming = fields(projection.timing),
    metadata = fields(record.metadata), passage = fields(fields(record.selection).passageAdvice);
  const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
  const extractedCount = integer(projection.extractedCount), reusedCount = integer(projection.reusedCount);
  return { id: `context-route:${String(record.receiptId)}`, reference,
    index: { cache: typeof projection.cache === "string" && /^[a-z][a-z0-9-]{0,127}$/u.test(projection.cache) ? projection.cache : null, extractedCount, reusedCount, pendingCount: integer(projection.pendingCount),
      workload: extractedCount === null || reusedCount === null ? "unknown" : extractedCount && reusedCount ? "mixed" : extractedCount ? "extraction-only" : reusedCount ? "reuse-only" : "empty-or-unobserved" },
    phases: { preparationMs: measuredNumber(timing.preparationMs), sourceCaptureMs: measuredNumber(timing.sourceCaptureMs), indexMs: measuredNumber(timing.indexMs),
      selectionMs: measuredNumber(timing.selectionMs), metadataDecisionWorkMs: measuredNumber(timing.providerCallMs), deliveryMs: measuredNumber(timing.deliveryMs), totalMs: measuredNumber(timing.totalMs),
      indexIdentityMs: measuredNumber(indexTiming.identityMs), indexFreshnessMs: measuredNumber(indexTiming.freshnessMs), indexCacheMs: measuredNumber(indexTiming.cacheMs),
      indexExtractionMs: measuredNumber(indexTiming.extractionMs), indexPublicationAndLinksMs: measuredNumber(indexTiming.publicationAndLinksMs),
      metadataElapsedMs: measuredNumber(metadata.elapsedMs), metadataHttpWorkMs: measuredNumber(metadata.httpTotalMs), metadataAdmissionWorkMs: measuredNumber(metadata.admissionTotalMs),
      metadataPackingMs: measuredNumber(metadata.packingMs), passageElapsedMs: measuredNumber(passage.elapsedMs), passagePreparationMs: measuredNumber(passage.preparationMs), passagePackingMs: measuredNumber(passage.packingMs) } };
}

/** A later task binding cannot accept earlier work without its unchanged authoritative lineage. */
function taskAcceptance(captures: Array<{ record: Record<string, unknown>; reference: EvaluationReference }>, scope: EvaluationEpisode["scope"]) {
  const result = (status: EvaluationEpisode["acceptance"] = "unknown", reason: string | null = null, reference: EvaluationReference | null = null) =>
    ({ status, reason, reference, provenance: status === "unknown" ? null : "hash-verified-task-owner-capture" });
  if (!captures.length) return result();
  if (!scope || !/^[1-9][0-9]*$/u.test(scope.taskRevision)) return result("unknown", "task-owner-capture-scope-mismatch");
  const versions = new Map<number, { task: Record<string, unknown>; reference: EvaluationReference }>();
  for (const capture of captures) {
    const task = capture.record.task ? object(capture.record.task) : capture.record;
    if (task.taskId !== scope.taskId || !Number.isSafeInteger(task.version) || Number(task.version) < 1 ||
        !["open", "needs-input", "accepted", "cancelled"].includes(String(task.status)) ||
        task.worktree !== undefined && task.worktree !== null && realpathSync(String(task.worktree)) !== scope.workspace)
      return result("unknown", "task-owner-capture-scope-mismatch");
    const version = Number(task.version), prior = versions.get(version);
    if (prior && digest(prior.task) !== digest(task)) return result("unknown", "conflicting-task-owner-captures");
    versions.set(version, { task, reference: capture.reference });
  }
  const anchor = versions.get(Number(scope.taskRevision));
  if (!anchor) return result("unknown", "task-owner-lineage-anchor-unavailable");
  const latest = versions.get(Math.max(...versions.keys()))!;
  const authority = (task: Record<string, unknown>) => digest({ outcome: task.outcome ?? null, worktree: task.worktree ?? null, mode: task.mode ?? null,
    items: list(task.items ?? [], 1000).map(raw => object(raw)).filter(item => item.revoked !== true && ["scope", "constraint", "acceptance"].includes(String(item.kind))) });
  let current = latest;
  const traversed = new Set<number>();
  while (Number(current.task.version) !== Number(anchor.task.version)) {
    const version = Number(current.task.version);
    if (traversed.has(version) || !Number.isSafeInteger(current.task.supersedes) || Number(current.task.supersedes) !== version - 1)
      return result("unknown", "task-owner-lineage-invalid");
    traversed.add(version);
    if (authority(current.task) !== authority(anchor.task)) return result("unknown", "task-owner-lineage-authority-changed");
    const prior = versions.get(Number(current.task.supersedes));
    if (!prior) return result("unknown", "task-owner-lineage-incomplete");
    current = prior;
  }
  const status = latest.task.status === "accepted" ? "accepted" : latest.task.status === "cancelled" ? "rejected" :
    [...versions.values()].some(item => Number(item.task.version) >= Number(anchor.task.version) && item.task.status === "accepted") ? "reopened" : "unknown";
  return result(status, null, latest.reference);
}

function qualitySummary(value: Record<string, unknown>) {
  const score = value as unknown as ContextQualityScore;
  const metrics = (raw: unknown, fields: string[]) => {
    const input = object(raw), output: Record<string, number | null> = {};
    for (const key of fields) {
      const result = input[key] === null ? null : measuredNumber(input[key]);
      if (input[key] !== null && result === null) throw new Error("Invalid selection quality count");
      if (key === "rate" || key === "recall") { if (result !== null && result > 1) throw new Error("Invalid selection quality rate"); }
      else if (!Number.isSafeInteger(result)) throw new Error("Invalid selection quality count");
      output[key] = result;
    }
    return output;
  };
  if (typeof score.noMatch.expected !== "boolean" || score.noMatch.correct !== null && typeof score.noMatch.correct !== "boolean") throw new Error("Invalid no-match quality");
  if ((score.precision.unknown || score.precision.unlabelled) && score.precision.rate !== null) throw new Error("Unlabelled selection cannot establish precision");
  return { suiteVersion: identifier(score.suiteVersion, "quality suite"), inputDigest: score.inputDigest, labelDigest: score.labelDigest,
    labelSource: { kind: score.labelSource.kind, independentOfSelector: true, referenceDigest: digest(score.labelSource.reference) },
    essentialGroups: { ...metrics(score.essentialGroups, ["expected", "fileDelivered", "completeDelivered", "recall"]), missed: list(score.essentialGroups.missed, 1000).length },
    conditionalAvailablePermitted: metrics(score.conditionalAvailablePermitted, ["expected", "completeDelivered", "recall"]),
    requiredMissing: list(score.requiredMissing, 1000).length, invalidSources: list(score.invalidSources, 1000).length,
    permissionExclusions: list(score.permissionExclusions, 1000).length, precision: metrics(score.precision, ["usefulSelected", "selected", "unknown", "unlabelled", "rate"]),
    noMatch: { expected: score.noMatch.expected, correct: score.noMatch.correct, optionalSelected: count(score.noMatch.optionalSelected) },
    descriptors: metrics(score.descriptors, ["present", "accurate", "weak", "unknown"]), judgments: score.judgments ? metrics(score.judgments, ["positive", "uncertain", "negative", "invalid", "unavailable", "omitted"]) : null,
    boundaries: list(score.boundaries, 16).map(raw => { const boundary = object(raw); return { stage: identifier(boundary.stage, "quality stage"),
      expectedSources: count(boundary.expectedSources), observed: count(boundary.observed), omissions: list(boundary.omissions, 1000).length }; }) };
}
