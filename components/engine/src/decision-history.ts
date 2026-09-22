import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { digest, object, text } from "./core.ts";
import { boundedOutcomeReader } from "./decision-outcomes.ts";
import { decisionTelemetry } from "./decision-telemetry.ts";
import { contextStateRoot } from "./context-command.ts";
import { loadProfileDecisionSettings, type DecisionSettings } from "./decision-settings.ts";
import { DecisionRuntime, interpretChoice, type DecisionRuntimeOptions } from "./decision-runtime.ts";
import { DECISION_QUESTIONS } from "./decision-catalog.ts";
import { closeDecisionScope, readDecisionBudget } from "./decision-budget.ts";
import { matchesPackPath } from "./planning.ts";
import type { QuestionInstance } from "./decision-schema.ts";

/** The CLI and generation admission must agree on every accepted flag spelling. */
export function parseDecisionTelemetryArgs(args: string[]) {
  return parseArgs({ args, strict: true, allowPositionals: false, options: {
    since: { type: "string" }, limit: { type: "string" }, "outcomes-manifest": { type: "string" }, "classify-history": { type: "boolean", default: false },
  } }).values;
}

/** Identity excludes report formatting, output locations and experimental arm labels. */
export function historyAnalysisIdentity(inputDigest: string, settings: DecisionSettings, procedures: boolean) {
  const questionIds = ["episode.work-class/1", ...(procedures ? ["episode.procedure-match/1"] : [])];
  return { taskId: "decision-history", taskRevision: digest({ inputDigest, preparation: "history-1",
    questions: questionIds.map(id => DECISION_QUESTIONS[id]), model: settings.legacy.model, modelRevision: settings.legacy.revision }) };
}

/** Rank observed work, keeping absent costs and unclassified episodes visible rather than estimating savings. */
function summarizeHistory(samples: Array<Record<string, unknown>>, nativeSamples: Array<Record<string, unknown>>) {
  const joined = new Map(nativeSamples.map(sample => [String(sample.episode), sample]));
  const unclassified: Record<string, number> = {};
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const sample of samples) {
    if (typeof sample.workClass !== "string") {
      const reason = String(sample.reason); unclassified[reason] = (unclassified[reason] ?? 0) + 1;
    } else groups.set(sample.workClass, [...(groups.get(sample.workClass) ?? []), sample]);
  }
  const rankedClasses = [...groups].map(([workClass, episodes]) => {
    const records = episodes.map(episode => joined.get(String(episode.episodeId))!);
    const native = records.flatMap(record => record.native as Array<Record<string, unknown>>).filter(record => !record.duplicateCost);
    const durations = native.map(record => record.durationMs).filter((value): value is number => typeof value === "number");
    const observed = records.map(record => record.observations as Record<string, unknown>);
    const sumKnown = (key: string) => {
      const values = observed.map(record => record[key]).filter((value): value is number => typeof value === "number");
      return { total: values.length ? values.reduce((a, b) => a + b, 0) : null, knownEpisodes: values.length, unknownEpisodes: records.length - values.length };
    };
    return { workClass, count: episodes.length, representativeEpisodeIds: episodes.slice(0, 5).map(episode => episode.episodeId),
      knownNativeDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
      unknownNativeRecords: native.length - durations.length, missingNativeEpisodes: records.filter(record => !(record.native as unknown[]).length).length,
      llmInputTokens: sumKnown("llmInputTokens"), llmOutputTokens: sumKnown("llmOutputTokens") };
  }).sort((a, b) => b.count - a.count || (b.knownNativeDurationMs ?? -1) - (a.knownNativeDurationMs ?? -1));
  return { counts: { selected: samples.length, classified: samples.length - Object.values(unclassified).reduce((a, b) => a + b, 0) },
    unclassified, rankedClasses, rankedByKnownNativeCost: [...rankedClasses].sort((a, b) =>
      (b.knownNativeDurationMs ?? -1) - (a.knownNativeDurationMs ?? -1) || b.count - a.count).map(item => item.workClass),
    costMeaning: "known deduplicated native durations and manifest-supplied LLM usage; unknown coverage retained; no avoided-cost estimate" };
}

/** Plain telemetry is provider-free; only the explicit flag enters this optional analysis path. */
export async function decisionTelemetryCommand(args: string[], workspace: string, options: DecisionRuntimeOptions = {}) {
  const values = parseDecisionTelemetryArgs(args), stateRoot = contextStateRoot(workspace), reader = boundedOutcomeReader();
  const report = decisionTelemetry(stateRoot, { ...(values.since ? { since: values.since } : {}),
    ...(values.limit ? { limit: Number(values.limit) } : {}), ...(values["outcomes-manifest"] ? { outcomesManifest: values["outcomes-manifest"] } : {}) }, reader);
  if (!values["classify-history"]) return report;
  if (!values["outcomes-manifest"]) throw new Error("History classification requires an outcomes manifest");
  workspace = realpathSync(workspace);
  const path = resolve(values["outcomes-manifest"]), manifest = reader.read(path);
  if (manifest.version !== 2) throw new Error("History classification requires manifest version 2");
  const analysis = object(manifest.analysis, "history analysis");
  if (!Array.isArray(analysis.excerpts) || analysis.excerpts.length > 1000) throw new Error("Bounded history excerpts required");
  const rawProcedures = analysis.procedures ?? [];
  if (!Array.isArray(rawProcedures) || rawProcedures.length > 8) throw new Error("At most eight reviewed procedures allowed");
  const procedures = rawProcedures.map(raw => {
    const item = object(raw);
    return { id: text(item.id, "procedure id", 64), description: text(item.description, "procedure description", 2000),
      reviewRef: text(item.reviewRef, "reviewed procedure reference", 1024) };
  });
  if (new Set(procedures.map(item => item.id)).size !== procedures.length) throw new Error("Duplicate procedure identifier");
  const joined = new Set(report.outcome_report!.samples.map(item => String(item.episode)));
  const excerpts = analysis.excerpts.map(raw => {
    const ref = object(raw), episodeId = text(ref.episodeId, "history episode", 256);
    const hash = text(ref.digest, "excerpt digest", 80);
    if (!/^sha256:[a-f0-9]{64}$/u.test(hash)) throw new Error("Excerpt digest required");
    const sourcePaths = ref.sourcePaths ?? [];
    if (!Array.isArray(sourcePaths) || sourcePaths.length > 64 || sourcePaths.some(item => typeof item !== "string")) throw new Error("Invalid excerpt source paths");
    return { episodeId, hash, path: resolve(dirname(path), text(ref.path, "excerpt path", 4096)), sourcePaths: sourcePaths as string[] };
  });
  if (new Set(excerpts.map(item => item.episodeId)).size !== excerpts.length) throw new Error("One selected excerpt per episode required");
  // Paths and assignment labels cannot mint fresh allowances for identical selected evidence.
  const inputDigest = digest({ excerpts: [...new Set(excerpts.map(item => item.hash))].sort(), procedures: procedures.map(({ id, description }) => ({ id, description })).sort((a, b) => a.id.localeCompare(b.id)) });
  const settings = loadProfileDecisionSettings(workspace), identity = historyAnalysisIdentity(inputDigest, settings, procedures.length > 0);
  if (analysis.inputDigest !== inputDigest || (analysis.taskId !== undefined && analysis.taskId !== identity.taskId) ||
      (analysis.taskRevision !== undefined && analysis.taskRevision !== identity.taskRevision)) throw new Error("History analysis identity differs from canonical selected inputs");
  const scope = { workspace, ...identity }, runtime = new DecisionRuntime(settings, stateRoot, options);
  const samples: Array<Record<string, unknown>> = [], classes: Record<string, number> = {};
  let closed: boolean | null = null;
  try {
    for (const excerpt of excerpts) {
      if (options.signal?.aborted) { samples.push({ episodeId: excerpt.episodeId, reason: "cancelled", workClass: null }); continue; }
      if (!joined.has(excerpt.episodeId)) { samples.push({ episodeId: excerpt.episodeId, reason: "episode-unjoined", workClass: null }); continue; }
      if (runtime.eligibility("DL12").providerUse !== "eligible") { samples.push({ episodeId: excerpt.episodeId, reason: runtime.eligibility("DL12").reasons[0], workClass: null }); continue; }
      if (excerpt.sourcePaths.length && (!settings.legacy.allowedDataClasses.includes("source") || excerpt.sourcePaths.some(item =>
        item.startsWith("/") || item.includes("\\") || item.split("/").some(part => part === ".." || part === ".") || !matchesPackPath(item, settings.legacy.allowedSourcePaths ?? [])))) {
        samples.push({ episodeId: excerpt.episodeId, reason: "source-scope-disabled", workClass: null }); continue;
      }
      let content: string;
      try { content = text(reader.read(excerpt.path, excerpt.hash).text, "selected excerpt", 32000); }
      catch { samples.push({ episodeId: excerpt.episodeId, reason: "excerpt-unavailable", workClass: null }); continue; }
      const questions: QuestionInstance[] = [{ name: "work-class", definitionId: "episode.work-class/1", consumerId: "DL12", evidenceIds: ["episode"],
        candidates: DECISION_QUESTIONS["episode.work-class/1"]!.options!.map(id => ({ id, description: id })) }];
      if (procedures.length) questions.push({ name: "procedure", definitionId: "episode.procedure-match/1", consumerId: "DL12", evidenceIds: ["episode"], candidates: procedures.map(({ id, description }) => ({ id, description })) });
      const outcome = await runtime.ask({ consumerId: "DL12", eventId: `history:${excerpt.hash}`, scope,
        subject: { digest: excerpt.hash, revision: identity.taskRevision, environment: "selected-history" }, policyDigest: settings.configDigest,
        evidence: [{ id: "episode", text: content, sourceDigest: excerpt.hash, provenance: "supplied", trust: "untrusted" }],
        coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: ["explicit selected excerpt; not complete task history"] },
        questions: questions.filter(question => settings.questionIds.DL12.includes(question.definitionId)) });
      const workClass = interpretChoice(outcome.answers["work-class"]).value;
      if (workClass) classes[workClass] = (classes[workClass] ?? 0) + 1;
      samples.push({ episodeId: excerpt.episodeId, workClass, procedure: interpretChoice(outcome.answers.procedure).value,
        reason: outcome.answers["work-class"]?.status === "unknown" ? "unknown" : outcome.reason,
        mode: outcome.mode, receiptId: outcome.receiptId, provenance: "model-proposed", usage: outcome.usage });
    }
  } finally {
    if ((readDecisionBudget(stateRoot, scope)?.calls ?? 0) > 0) closed = closeDecisionScope(stateRoot, scope);
  }
  return { ...report, history: { scope, inputDigest, samples, classes, ...summarizeHistory(samples, report.outcome_report!.samples),
    budget: readDecisionBudget(stateRoot, scope), scopeClosed: closed, avoidedTokens: null, authority: "research proposals only; no policy or execution changes" } };
}
