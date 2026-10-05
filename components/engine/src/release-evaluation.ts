import { digest } from "./core.ts";
import { readReleaseEvaluationInput } from "./release-evaluation-reader.ts";
import { CONTEXT_TIME_METRICS, RELEASE_DIMENSIONS, type EvaluationContextTiming, type EvaluationCondition, type EvaluationCost, type EvaluationEpisode, type EvaluationMeasure,
  type EvaluationVerdict, type ReleaseDimension, type ReleaseEvaluationInput } from "./release-evaluation-types.ts";

const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : null;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2 : null; };
const costIdentity = (cost: EvaluationCost) => { const { reference: omitted, allocation: allocation, ...identity } = cost; void omitted; void allocation; return digest(identity); };

/** Duplicate observations cannot add cost; conflicting identities make that measurement unknown. */
function costs(episodes: EvaluationEpisode[]) {
  const unique = new Map<string, EvaluationCost | null>();
  let duplicates = 0, conflicts = 0;
  for (const episode of episodes) for (const cost of episode.costs) {
    if (!unique.has(cost.id)) { unique.set(cost.id, { ...cost }); continue; }
    const prior = unique.get(cost.id);
    if (prior && costIdentity(prior) !== costIdentity(cost)) { unique.set(cost.id, null); conflicts++; }
    else { duplicates++; if (prior && cost.allocation !== "episode") unique.set(cost.id, { ...prior, allocation: cost.allocation }); }
  }
  const originals = [...unique.values()].filter((item): item is EvaluationCost => item !== null), aliases: Record<string, string> = {};
  for (const native of originals.filter(item => item.owner === "native-response")) {
    const aggregate = originals.find(item => item.owner === "provider-job" && item.scopeKey !== null && item.scopeKey === native.scopeKey && item.inputTokens !== null && item.outputTokens !== null);
    if (aggregate) { aliases[native.id] = aggregate.id; if (native.allocation !== "episode") aggregate.allocation = native.allocation; }
  }
  const selected = originals.filter(item => !aliases[item.id]);
  const overlapUnknown = selected.some(item => item.owner === "native-response") && selected.some(item => item.owner === "provider-job" && item.provider === "codex" && item.scopeKey === null);
  const byProvider: Record<string, Record<string, number | null>> = {};
  for (const provider of [...new Set(selected.map(item => item.provider))].sort()) {
    const measurements = selected.filter(item => item.provider === provider), fields = ["inputTokens", "freshInputTokens", "cachedInputTokens", "cacheCreationInputTokens", "outputTokens", "reasoningTokens", "estimatedUSD", "durationMs"] as const;
    const metrics: Record<string, number | null> = { measurements: measurements.length };
    for (const field of fields) {
      const known = measurements.flatMap(item => item[field] === null ? [] : [item[field]!]);
      metrics[field] = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
      metrics[`${field}Samples`] = known.length; metrics[`${field}Unknown`] = measurements.length - known.length;
    }
    byProvider[provider] = metrics;
  }
  const knownTotals = selected.flatMap(item => item.inputTokens !== null && item.outputTokens !== null ? [item.inputTokens + item.outputTokens] : []);
  return { measurements: unique.size, duplicates, conflicts, overlappingMeasurements: Object.keys(aliases).length, aliases, overlapUnknown, selected, byProvider,
    knownSubtotalTokens: !overlapUnknown && knownTotals.length ? knownTotals.reduce((sum, value) => sum + value, 0) : null,
    completeTokenMeasurements: knownTotals.length, unknownTokenMeasurements: selected.length - knownTotals.length + conflicts,
    unallocatedMeasurements: selected.filter(item => item.allocation !== "episode").length,
    accounting: "all observed attempts, including failures; native owner identities deduplicated; known subtotals are not complete episode spending; summed process duration is not elapsed time" };
}

function completeUsage(episodes: EvaluationEpisode[]) {
  const summary = costs(episodes), expected = new Set<string>();
  for (const episode of episodes) {
    if (!episode.joined || episode.costCaptureUnknown || episode.usagePopulation === null || new Set(episode.usagePopulation).size !== episode.usagePopulation.length) return null;
    episode.usagePopulation.forEach(id => expected.add(summary.aliases[id] ?? id));
  }
  if (summary.conflicts || summary.overlapUnknown || summary.unallocatedMeasurements || summary.unknownTokenMeasurements || expected.size !== summary.selected.length || summary.selected.some(item => !expected.has(item.id))) return null;
  return summary.knownSubtotalTokens ?? (expected.size === 0 ? 0 : null);
}

function executionCosts(episodes: EvaluationEpisode[]) {
  const units = new Map<string, EvaluationEpisode["executionCosts"][number] | null>(); let duplicates = 0, conflicts = 0;
  for (const episode of episodes) for (const record of episode.executionCosts) {
    const prior = units.get(record.id);
    if (!units.has(record.id)) units.set(record.id, record);
    else if (prior && (prior.durationMs !== record.durationMs || prior.state !== record.state || prior.cleanup !== record.cleanup)) { units.set(record.id, null); conflicts++; }
    else duplicates++;
  }
  const known = [...units.values()].flatMap(item => item?.durationMs === null || !item ? [] : [item.durationMs]);
  return { measurements: units.size, duplicates, conflicts, knownDurationSamples: known.length, unknownDurationSamples: units.size - known.length,
    knownSummedProcessMs: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
    meaning: "deduplicated command/check durations; not episode wall time; do not add overlapping provider duration observations" };
}

function contextTimings(episodes: EvaluationEpisode[]) {
  const units = new Map<string, { capture: EvaluationContextTiming; generation: EvaluationEpisode["generation"] } | null>();
  let duplicates = 0, conflicts = 0;
  for (const episode of episodes) for (const capture of episode.contextTimings) {
    const prior = units.get(capture.id), identity = (value: EvaluationContextTiming) => digest({ phases: value.phases, index: value.index });
    if (!units.has(capture.id)) units.set(capture.id, { capture, generation: episode.generation });
    else if (prior && identity(prior.capture) !== identity(capture)) { units.set(capture.id, null); conflicts++; }
    else { duplicates++; if (prior && episode.generation !== "matched") prior.generation = episode.generation; }
  }
  const rows = [...units.values()].filter((value): value is NonNullable<typeof value> => value !== null);
  return { measurements: units.size, episodesWithoutCapturedRoute: episodes.filter(episode => !episode.contextTimings.length).length,
    duplicates, conflicts, generationMatched: rows.filter(row => row.generation === "matched").length,
    generationUnqualified: units.size - rows.filter(row => row.generation === "matched").length,
    indexWorkloads: Object.fromEntries(["extraction-only", "reuse-only", "mixed", "empty-or-unobserved", "unknown"].map(workload =>
      [workload, rows.filter(row => row.capture.index.workload === workload).length])),
    phases: Object.fromEntries(CONTEXT_TIME_METRICS.map(metric => {
      const observed = rows.flatMap(row => row.capture.phases[metric] === null ? [] : [row.capture.phases[metric]!]);
      return [metric, { samples: observed.length, unknown: units.size - observed.length, medianMs: median(observed) }];
    })), sourceReferences: rows.map(row => row.capture.reference),
    meaning: "original linked route phases; index is within preparation; metadata/passage work can overlap; never add phases or provider durations to wall time",
    cacheQualification: "conditions declare cold/warm; original extracted/reused counts show index work, not first-ever cold or fully warm proof",
    deliveryQualification: "post-selection packet assembly/validation before receipt capture; native hook delivery and main-model consumption latency remain unknown" };
}

function dimensionRow(episodes: EvaluationEpisode[], dimension: ReleaseDimension) {
  const units = new Map<string, EvaluationMeasure>(); let duplicates = 0, conflicts = 0;
  for (const episode of episodes) for (const measure of episode.measures.filter(item => item.dimension === dimension)) {
    const id = digest([episode.conditionId, episode.caseId, episode.trialId, dimension, measure.unitId]);
    const existing = units.get(id);
    if (!existing) { units.set(id, { ...measure }); continue; }
    duplicates++;
    if (existing.expected !== measure.expected || existing.observed !== measure.observed || existing.critical !== measure.critical) {
      conflicts++; units.set(id, { ...existing, observed: null, reason: "conflicting-unit-observations" });
    }
  }
  const measures = [...units.values()], applicable = measures.filter(item => item.expected !== "not-applicable");
  const known = applicable.filter(item => item.observed !== null && item.observed !== "unknown" && item.observed !== "unavailable");
  const successes = known.filter(item => item.expected === item.observed).length;
  const violations = known.length - successes;
  const critical = known.filter(item => item.critical && item.expected !== item.observed).length;
  return { dimension, expected: measures.length, applicable: applicable.length, assessed: known.length, successes, violations,
    unknown: applicable.length - known.length, notApplicable: measures.length - applicable.length, duplicates, conflicts,
    verifiedOverExpected: ratio(successes, applicable.length), assessedRate: ratio(successes, known.length), observationCoverage: ratio(known.length, applicable.length),
    criticalViolations: critical, color: critical ? "red" : violations ? "amber" : applicable.length && known.length === applicable.length ? "green" : "gray",
    verdict: "insufficient evidence" as EvaluationVerdict,
    sourceReferences: measures.map(item => item.reference),
    qualifications: measures.filter(item => item.reason || item.expected === "not-applicable").map(item => ({ unitId: item.unitId, reason: item.reason, expected: item.expected })) };
}

function compatible(baseline: EvaluationCondition, candidate: EvaluationCondition, kind: "release" | "jev") {
  const reasons: string[] = [];
  for (const field of ["sourceDigest", "profileDigest", "questionDigest", "permissionsDigest", "environmentDigest", "budgetDigest", "model", "effort", "cacheState"] as const)
    if (baseline[field] === null || candidate[field] === null || baseline[field] === "unknown" || candidate[field] === "unknown") reasons.push(`missing-${field}`);
    else if (baseline[field] !== candidate[field]) reasons.push(`changed-${field}`);
  if (kind === "jev" && (baseline.runtime.version !== candidate.runtime.version || baseline.runtime.archiveDigest !== candidate.runtime.archiveDigest)) reasons.push("jev-comparison-runtime-changed");
  if (kind === "jev" && (baseline.arm !== "code-only" || candidate.arm !== "jev-active")) reasons.push("jev-comparison-requires-code-only-and-active");
  if (kind === "release" && baseline.arm !== candidate.arm) reasons.push("release-comparison-arm-changed");
  return reasons;
}

function pairs(input: ReleaseEvaluationInput) {
  const comparison = input.envelope.comparison;
  if (!comparison) return { eligible: false, reasons: ["comparison-not-declared"], pairs: [] as Array<{ id: string; baseline: EvaluationEpisode[]; candidate: EvaluationEpisode[] }> };
  const baseline = input.envelope.conditions.find(item => item.id === comparison.baseline)!, candidate = input.envelope.conditions.find(item => item.id === comparison.candidate)!;
  const reasons = compatible(baseline, candidate, comparison.kind);
  if (input.envelope.view !== "controlled") reasons.push("unmatched-field-tasks-are-not-causal");
  const grouped = new Map<string, { baseline: EvaluationEpisode[]; candidate: EvaluationEpisode[] }>();
  for (const episode of input.episodes) {
    if (![comparison.baseline, comparison.candidate].includes(String(episode.conditionId))) continue;
    if (!episode.caseId || !episode.trialId) continue;
    const id = digest([episode.caseId, episode.trialId]), group = grouped.get(id) ?? { baseline: [], candidate: [] };
    group[episode.conditionId === comparison.baseline ? "baseline" : "candidate"].push(episode); grouped.set(id, group);
  }
  const eligiblePairs: Array<{ id: string; baseline: EvaluationEpisode[]; candidate: EvaluationEpisode[] }> = [];
  const excluded: Array<{ id: string; reasons: string[] }> = [];
  for (const [id, group] of grouped) {
    const pairReasons: string[] = [];
    if (!group.baseline.length || !group.candidate.length) pairReasons.push("missing-comparison-arm");
    const all = [...group.baseline, ...group.candidate];
    if (all.some(item => !item.joined || item.generation !== "matched")) pairReasons.push("unverified-or-mixed-generation");
    for (const field of ["inputDigest", "expectedLabelDigest"] as const)
      if (all.some(item => item[field] === null) || new Set(all.map(item => item[field])).size !== 1) pairReasons.push(`missing-or-changed-${field}`);
    const expectedUnits = (episodes: EvaluationEpisode[]) => digest([...new Map(episodes.flatMap(episode => episode.measures.map(measure =>
      [`${measure.dimension}:${measure.unitId}`, [measure.dimension, measure.unitId, measure.expected, measure.critical]] as const))).values()].sort((a, b) => String(a[1]).localeCompare(String(b[1]))));
    if (group.baseline.length && group.candidate.length && expectedUnits(group.baseline) !== expectedUnits(group.candidate)) pairReasons.push("changed-expected-units");
    if (pairReasons.length) excluded.push({ id, reasons: pairReasons }); else eligiblePairs.push({ id, ...group });
  }
  return { eligible: !reasons.length, reasons, pairs: eligiblePairs, excluded };
}

function comparedRow(input: ReleaseEvaluationInput, dimension: ReleaseDimension) {
  const comparison = pairs(input), threshold = input.envelope.comparison?.minimumChange ?? 0;
  let wins = 0, losses = 0, ties = 0, unknown = 0;
  for (const pair of comparison.pairs) {
    const before = dimensionRow(pair.baseline, dimension), after = dimensionRow(pair.candidate, dimension);
    if (!before.applicable || before.unknown || after.unknown || before.applicable !== after.applicable) { unknown++; continue; }
    const delta = after.verifiedOverExpected! - before.verifiedOverExpected!;
    if (after.criticalViolations > before.criticalViolations || delta < -threshold) losses++;
    else if (delta > threshold) wins++; else ties++;
  }
  const verdict: EvaluationVerdict = !comparison.eligible || !wins && !losses && !ties ? "insufficient evidence" : wins && losses ? "mixed" : losses ? "regressed" : wins ? "improved" : "unchanged";
  return { verdict, eligible: comparison.eligible, reasons: comparison.reasons, pairedTrials: wins + losses + ties, unknownTrials: unknown,
    wins, losses, ties, independentCases: new Set(comparison.pairs.flatMap(item => item.baseline.map(episode => episode.caseId))).size,
    qualification: "observed paired-case differences; repeated trials are nested within cases, not independent production tasks" };
}

function efficiencyComparison(input: ReleaseEvaluationInput) {
  const comparison = pairs(input), samples: Array<{ pairId: string; baselineTokens: number; candidateTokens: number; savingsFraction: number; baselineElapsedMs: number | null; candidateElapsedMs: number | null }> = [];
  let notAccepted = 0, unknownUsage = 0, nonpositiveBaseline = 0;
  for (const pair of comparison.pairs) {
    const accepted = (episodes: EvaluationEpisode[]) => episodes.some(item => item.acceptance === "accepted") && !episodes.some(item => item.acceptance === "reopened");
    if (!accepted(pair.baseline) || !accepted(pair.candidate)) { notAccepted++; continue; }
    const before = completeUsage(pair.baseline), after = completeUsage(pair.candidate);
    if (before === null || after === null) { unknownUsage++; continue; }
    if (before <= 0) { nonpositiveBaseline++; continue; }
    const elapsed = (episodes: EvaluationEpisode[]) => episodes.length === 1 ? episodes[0]!.elapsedMs : null;
    samples.push({ pairId: pair.id, baselineTokens: before, candidateTokens: after, savingsFraction: (before - after) / before,
      baselineElapsedMs: elapsed(pair.baseline), candidateElapsedMs: elapsed(pair.candidate) });
  }
  const savings = samples.map(item => item.savingsFraction), baselineTime = samples.flatMap(item => item.baselineElapsedMs === null ? [] : [item.baselineElapsedMs]), candidateTime = samples.flatMap(item => item.candidateElapsedMs === null ? [] : [item.candidateElapsedMs]);
  return { eligible: comparison.eligible, reasons: comparison.reasons, matchedAcceptedTrials: samples.length, notAccepted, unknownUsage, nonpositiveBaseline,
    medianSavingsFraction: comparison.eligible ? median(savings) : null,
    elapsed: { baselineSamples: baselineTime.length, candidateSamples: candidateTime.length, baselineMedianMs: median(baselineTime), candidateMedianMs: median(candidateTime), meaning: "reported episode elapsed time; concurrent process durations are never substituted" },
    samples: comparison.eligible ? samples : [], excludedPairs: comparison.excluded ?? [],
    qualification: "complete declared usage populations and hash-verified task acceptance required; failed attempts remain in all-arm costs; small paired sets are directional, not general savings proof" };
}

/** Pure reduction: no collection, acceptance transition, provider call or operational write. */
export function reduceReleaseEvaluation(input: ReleaseEvaluationInput) {
  const totalCosts = costs(input.episodes);
  const dimensions = RELEASE_DIMENSIONS.map(dimension => {
    const comparison = comparedRow(input, dimension);
    return { ...dimensionRow(input.episodes, dimension), verdict: comparison.verdict, comparison };
  });
  const entry = dimensions.find(item => item.dimension === "entry")!;
  const promptPopulation = input.envelope.population.eligiblePrompts;
  entry.verifiedOverExpected = promptPopulation === null || entry.expected > promptPopulation ? null : ratio(entry.successes, promptPopulation);
  if (promptPopulation === null || entry.expected > promptPopulation) { if (entry.color === "green") entry.color = "gray"; }
  const conditions = input.envelope.conditions.map(condition => {
    const episodes = input.episodes.filter(item => item.conditionId === condition.id), spending = costs(episodes.filter(item => item.generation === "matched")),
      unattributed = costs(episodes.filter(item => item.generation !== "matched")), durations = episodes.flatMap(item => item.elapsedMs === null ? [] : [item.elapsedMs]);
    const { selected: omitted, ...summary } = spending; void omitted;
    const { selected: unqualified, ...unattributedSummary } = unattributed; void unqualified;
    return { condition, assigned: episodes.length, started: episodes.filter(item => item.lifecycle !== "assigned").length,
      terminal: episodes.filter(item => item.lifecycle === "terminal").length, unfinished: episodes.filter(item => item.lifecycle !== "terminal").length,
      accepted: episodes.filter(item => item.acceptance === "accepted").length, reopened: episodes.filter(item => item.acceptance === "reopened").length,
      acceptanceUnknown: episodes.filter(item => item.acceptance === "unknown").length,
      usageCompleteEpisodes: episodes.filter(item => completeUsage([item]) !== null).length, spending: summary, unattributedSpending: unattributedSummary, execution: executionCosts(episodes), contextTiming: contextTimings(episodes),
      elapsed: { samples: durations.length, medianMs: median(durations), unknown: episodes.length - durations.length, upperTail: "not-estimated" },
      mixedGeneration: episodes.filter(item => item.generation === "mixed").length, generationUnknown: episodes.filter(item => item.generation === "unknown").length };
  });
  const { selected: costRecords, ...allCosts } = totalCosts;
  return { version: 1, kind: "project-governance-release-evaluation", metricContract: input.envelope.metricContract,
    suite: input.envelope.suite, view: input.envelope.view, provenance: input.provenance, manifest: input.manifest,
    population: { ...input.envelope.population, selectedEpisodes: input.episodes.length, duplicateEpisodes: input.duplicateEpisodes,
      outsideEntryActivity: "unknown", deliveredPacketUse: "unknown" }, discovery: { ...input.envelope.discovery, readBytes: input.readBytes },
    dimensions, conditions, allArmSpending: allCosts, execution: executionCosts(input.episodes), contextTiming: contextTimings(input.episodes), efficiencyComparison: efficiencyComparison(input),
    selectionQuality: input.episodes.map(item => ({ episode: item.id, conditionId: item.conditionId, quality: item.selectionQuality,
      scored: item.selectionQuality !== null, qualification: item.selectionQuality ? "independent source-backed frozen labels; see owning evaluator" : "unlabelled or unavailable; no inferred accuracy" })),
    episodes: input.episodes.map(({ costs: omitted, ...episode }) => { void omitted; return { ...episode, usageComplete: completeUsage([input.episodes.find(item => item.id === episode.id)!]) !== null }; }),
    modelObservations: costRecords.filter(item => item.owner === "provider-job").map(item => ({ measurementId: item.id, requestedModel: item.requestedModel,
      reportedModels: item.reportedModels, qualification: "extra native model entries may be utility calls; delegation is not inferred" })),
    issues: input.issues, limitations: ["Explicit manifest population, not a representative field sample", "Unknown acceptance and uninstrumented additional reads remain unknown",
      "Bytes are not tokens; subscription price is not billed API spend", "No combined grade or automatic task acceptance", "Host-observed use and causal benefit require qualified comparison evidence"] };
}

export function readReleaseEvaluation(stateRoot: string, manifestPath: string) {
  return reduceReleaseEvaluation(readReleaseEvaluationInput(stateRoot, manifestPath));
}

export function releaseEvaluationMarkdown(report: ReturnType<typeof reduceReleaseEvaluation>) {
  const number = (value: number | null) => value === null ? "unknown" : String(value);
  const lines = [`# Release evaluation`, "", `Contract: ${report.metricContract}. Suite: ${report.suite.version}. View: ${report.view}.`, "",
    "| Area | Verified / expected applicable | Unknown | Coverage | Comparison |", "| --- | --- | --- | --- | --- |"];
  for (const row of report.dimensions) lines.push(`| ${row.dimension} | ${row.successes} / ${row.applicable} | ${row.unknown} | ${row.observationCoverage === null ? "unknown" : `${Math.round(row.observationCoverage * 100)}%`} | ${row.comparison.verdict} |`);
  lines.push("", `Eligible native prompts: ${number(report.population.eligiblePrompts)}. Missing prompt coverage prevents an adoption percentage.`,
    `Context timing: ${report.contextTiming.measurements} captured routes; preparation ${number(report.contextTiming.phases.preparationMs?.medianMs ?? null)} ms, index ${number(report.contextTiming.phases.indexMs?.medianMs ?? null)} ms, selection ${number(report.contextTiming.phases.selectionMs?.medianMs ?? null)} ms, final packet assembly ${number(report.contextTiming.phases.deliveryMs?.medianMs ?? null)} ms (medians; overlapping phases are not added).`,
    `Observed spending: ${number(report.allArmSpending.knownSubtotalTokens)} known tokens across ${report.allArmSpending.measurements} measurements; ${report.allArmSpending.unknownTokenMeasurements} unknown.`,
    `Matched accepted trials with complete usage: ${report.efficiencyComparison.matchedAcceptedTrials}. Savings: ${report.efficiencyComparison.medianSavingsFraction === null ? "unqualified" : `${(report.efficiencyComparison.medianSavingsFraction * 100).toFixed(1)}% median on these trials`}.`,
    "", "Known subtotals include failed work. Summed concurrent process time is not wall time. This report neither accepts work nor establishes general savings.",
    "", `Manifest: ${report.manifest.path} (${report.manifest.digest}).`);
  if (report.issues.length) lines.push("", "Evidence gaps:", ...report.issues.map(item => `- ${item.episode ?? "report"}: ${item.code}`));
  return lines.join("\n") + "\n";
}
