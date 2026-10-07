import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson, fileDigest } from "../src/core.ts";
import { readReleaseEvaluation, releaseEvaluationMarkdown } from "../src/release-evaluation.ts";
import { scoreContextQuality } from "../src/context-evaluation-quality.ts";
import { contextQualityDevelopment } from "./fixtures/context-quality-frozen.ts";

const hash = `sha256:${"a".repeat(64)}`, oldArchive = `sha256:${"b".repeat(64)}`, newArchive = `sha256:${"c".repeat(64)}`;
const condition = (id: string, version = "old", archiveDigest = oldArchive) => ({ id, runtime: { version, archiveDigest }, sourceDigest: hash,
  profileDigest: hash, questionDigest: hash, permissionsDigest: hash, environmentDigest: hash, budgetDigest: hash,
  model: "fixed-model", effort: "high", cacheState: "warm", arm: "code-only" });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "release-evaluation-")));
  const write = (name: string, value: unknown) => {
    const path = join(root, name); durableJson(path, value); return { path, digest: fileDigest(path) };
  };
  const scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const conditions = [condition("baseline"), condition("candidate", "new", newArchive)];
  const episode = (id: string, conditionId = "candidate", options: { lifecycle?: string; entryKind?: string; native?: any[]; labels?: any[]; evidence?: any[]; expected?: any[] } = {}) => {
    const selected = conditions.find(item => item.id === conditionId)!;
    const caller = write(`${id}-caller.json`, { version: 1, id, scope, runtimeVersion: selected.runtime.version, archiveDigest: selected.runtime.archiveDigest,
      entryKind: options.entryKind ?? "workflow-observe", native: options.entryKind === "context-delivery" ? { receiptId: id, inputDigest: hash } : options.entryKind === "prompt-delivery" ? { entryId: "d".repeat(64), provider: "codex", session: "session", turn: "turn" }
        : { runId: "run", runDigest: hash, stagesDigest: hash, eventsDigest: hash }, decisions: [], exposure: { reason: "off", delivered: false }, privatePrompt: "never-export" });
    return { id, scope, decisions: [] as string[], caller, native: options.native ?? [], labels: options.labels ?? [], observations: { elapsedMs: 10, reworkMinutes: 0, interventions: 0 },
      evaluation: { conditionId, caseId: "case", trialId: "trial", inputDigest: hash, expectedLabelDigest: hash,
        lifecycle: options.lifecycle ?? "terminal", expected: options.expected ?? [], evidence: options.evidence ?? [], providerJobs: [] as any[], usagePopulation: null as string[] | null } };
  };
  const assessment = (id: string, dimension: string, unitId: string, outcome: string | null, extras: Record<string, unknown> = {}) => ({ kind: "assessment", ...write(`${id}-assessment.json`, {
    version: 1, kind: "release-evaluation-assessment", caseId: "case", inputDigest: hash, labelDigest: hash,
    dimension, unitId, outcome, provenance: "fixture-oracle", ...extras }) });
  const task = (id: string, status = "accepted") => ({ kind: "task", ...write(`${id}-task.json`, { taskId: "task", version: 1, status, items: [], privateOutcome: "never-export" }) });
  const provider = (id: string, providerKind: string, usage: unknown, state = "failed", extras: { conversationId?: string; identity?: unknown; runtime?: { version: string; archiveDigest: string } | null } = {}) => {
    const directory = join(root, `custom-artifacts/${id}`), request = { version: 1, id, provider: { kind: providerKind, model: "fixed-model", ...(extras.conversationId ? { conversationId: extras.conversationId } : {}) }, privatePrompt: "never-export" }, requestDigest = digest(request);
    const requestRef = write(`custom-artifacts/${id}/request.json`, request);
    const providerResult = write(`custom-artifacts/${id}/provider-result.json`, { version: 1, requestDigest, usage, identity: extras.identity ?? null, completion: { answer: "never-export" } });
    const runtime = extras.runtime === undefined ? { version: "new", archiveDigest: newArchive } : extras.runtime;
    const result = write(`custom-artifacts/${id}/result.json`, { version: 1, requestDigest, state, cleanup: "confirmed", durationMs: 20,
      ...(runtime ? { runtimeVersion: runtime.version, archiveDigest: runtime.archiveDigest } : {}),
      providerResult: providerResult.path, providerResultDigest: providerResult.digest });
    return { directory, requestDigest, request: requestRef, result };
  };
  const manifest = (episodes: any[], extra: Record<string, unknown> = {}) => write("manifest.json", { version: 2, episodes, evaluation: {
    version: 1, metricContract: "release-evaluation-1", suite: { version: "suite-1", digest: hash }, view: "controlled", conditions,
    population: { eligiblePrompts: null }, discovery: { scanComplete: true, projectionEvicted: 0 },
    comparison: { baseline: "baseline", candidate: "candidate", kind: "release", minimumChange: 0 }, ...extra } }).path;
  return { root, write, scope, conditions, episode, assessment, task, provider, manifest, close: () => rmSync(root, { recursive: true, force: true }) };
}

test("no activity and missing prompt population stay gray; repeat reporting is immutable and deterministic", () => {
  const f = fixture();
  try {
    const path = f.manifest([]), report = readReleaseEvaluation(f.root, path);
    assert.equal(report.population.selectedEpisodes, 0);
    assert.equal(report.dimensions.find(row => row.dimension === "entry")!.verifiedOverExpected, null);
    assert.equal(report.dimensions.every(row => row.color === "gray"), true);
    assert.equal(report.allArmSpending.knownSubtotalTokens, null);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
    assert.deepEqual(readReleaseEvaluation(f.root, path), report);
    assert.match(releaseEvaluationMarkdown(report), /Eligible native prompts: unknown/);
  } finally { f.close(); }
});

test("declared assignments and missing pre-provider captures remain in the denominator", () => {
  const f = fixture();
  try {
    const episode = f.episode("unstarted", "candidate", { lifecycle: "assigned", expected: [{ dimension: "consultation", unitId: "review", outcome: "refused" }] });
    episode.caller = { path: join(f.root, "not-captured.json"), digest: hash };
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.conditions[1]!.assigned, 1); assert.equal(report.conditions[1]!.unfinished, 1);
    assert.equal(report.dimensions.find(row => row.dimension === "consultation")!.unknown, 1);
    assert.equal(report.issues.some(item => item.code === "caller-capture-unavailable"), true);
  } finally { f.close(); }
});

test("expected refusal is success only with matching evidence; unknown cleanup and held live ownership are distinct", () => {
  const f = fixture();
  try {
    const expected = [{ dimension: "consultation", unitId: "review", outcome: "refused" }, { dimension: "cleanup", unitId: "metro", outcome: "confirmed" },
      { dimension: "cleanup", unitId: "live-owner", outcome: "held-live" }];
    const episode = f.episode("refusal", "candidate", { expected, evidence: [f.assessment("refusal", "consultation", "review", "refused"),
      f.assessment("metro", "cleanup", "metro", "unknown"), f.assessment("live", "cleanup", "live-owner", "held-live")] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.dimensions.find(row => row.dimension === "consultation")!.successes, 1);
    const cleanup = report.dimensions.find(row => row.dimension === "cleanup")!;
    assert.equal(cleanup.successes, 1); assert.equal(cleanup.unknown, 1); assert.equal(cleanup.violations, 0);
    assert.equal(cleanup.color, "gray");
  } finally { f.close(); }
});

test("failed provider spending survives, aggregate and per-model usage are not added twice, and custom directories are verified", () => {
  const f = fixture();
  try {
    const job = f.provider("review", "claude", { usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 10 },
      models: { "fixed-model": { inputTokens: 90, outputTokens: 18 }, "utility-model": { inputTokens: 10, outputTokens: 2 } } });
    const episode = f.episode("failed"); episode.evaluation.providerJobs = [job, job];
    const report = readReleaseEvaluation(f.root, f.manifest([episode, episode]));
    assert.equal(report.population.duplicateEpisodes, 1); assert.equal(report.allArmSpending.duplicates, 1);
    assert.equal(report.allArmSpending.knownSubtotalTokens, 160);
    assert.equal(report.conditions[1]!.accepted, 0); assert.equal(report.conditions[1]!.spending.byProvider.claude!.inputTokens, 140);
    assert.equal(report.allArmSpending.measurements, 1);
    assert.deepEqual(report.modelObservations[0]!.reportedModels, ["fixed-model", "utility-model"]);
    assert.equal(JSON.stringify(report).includes("never-export"), false);
  } finally { f.close(); }
});

test("provider cumulative and last-response increments remain separate; partial native fields stay unknown", () => {
  const f = fixture();
  try {
    const episode = f.episode("codex"); episode.evaluation.providerJobs = [f.provider("coding", "codex", {
      last: { inputTokens: 30, outputTokens: 5, cachedInputTokens: 10 }, total: { inputTokens: 300, outputTokens: 50, cachedInputTokens: 100 } })];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.allArmSpending.knownSubtotalTokens, 350);
    assert.equal(report.allArmSpending.byProvider.codex!.freshInputTokens, 200);
    const partial = f.episode("partial"); partial.evaluation.providerJobs = [f.provider("partial", "codex", { last: { inputTokens: 30, outputTokens: 5 } })];
    const missing = readReleaseEvaluation(f.root, f.manifest([partial]));
    assert.equal(missing.allArmSpending.knownSubtotalTokens, null); assert.equal(missing.allArmSpending.unknownTokenMeasurements, 1);
  } finally { f.close(); }
});

test("inaccessible and changed provider artifacts are different evidence failures, not zero-cost successes", () => {
  const f = fixture();
  try {
    const job = f.provider("changed", "claude", { usage: { input_tokens: 100, output_tokens: 20 } });
    appendFileSync(job.result.path, "\n");
    const episode = f.episode("invalid"); episode.evaluation.providerJobs = [job];
    const invalid = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(invalid.issues.some(item => item.code === "provider-artifact-invalid"), true);
    const missing = f.episode("missing"); missing.evaluation.providerJobs = [{ ...job, result: { path: join(f.root, "missing.json"), digest: hash } }];
    missing.evaluation.usagePopulation = [];
    const absent = readReleaseEvaluation(f.root, f.manifest([missing]));
    assert.equal(absent.issues.some(item => item.code === "provider-artifact-unavailable"), true);
    assert.equal(absent.allArmSpending.knownSubtotalTokens, null);
    assert.equal(absent.conditions[1]!.usageCompleteEpisodes, 0);
  } finally { f.close(); }
});

test("passed commands and advisory accepted labels do not become task-owner acceptance", () => {
  const f = fixture();
  try {
    const native = { kind: "command", ...f.write("command.json", { version: 1, requestDigest: hash, state: "succeeded", cleanup: "confirmed", durationMs: 20, scope: f.scope }) };
    const episode = f.episode("command", "candidate", { native: [native], labels: [{ reviewer: "operator", disposition: "accepted", at: "2026-10-05T00:00:00Z" }] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.episodes[0]!.acceptance, "unknown"); assert.equal(report.conditions[1]!.accepted, 0);
    assert.equal(report.execution.knownSummedProcessMs, 20); assert.equal(report.conditions[1]!.elapsed.medianMs, 10);
  } finally { f.close(); }
});

test("mixed-generation episodes preserve their costs but cannot qualify comparison savings", () => {
  const f = fixture();
  try {
    const changed = { kind: "command", ...f.write("changed-command.json", { version: 1, requestDigest: hash, state: "failed", cleanup: "confirmed", durationMs: 20,
      scope: f.scope, runtimeVersion: "old", archiveDigest: oldArchive }) };
    const episode = f.episode("mixed", "candidate", { native: [changed], evidence: [f.task("mixed")] });
    episode.evaluation.providerJobs = [f.provider("mixed", "codex", { total: { inputTokens: 100, outputTokens: 20 } })];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.episodes[0]!.generation, "mixed"); assert.equal(report.allArmSpending.knownSubtotalTokens, 120);
    assert.equal(report.conditions[1]!.mixedGeneration, 1); assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  } finally { f.close(); }
});

test("incremental native usage deduplicates response IDs, keeps reasoning as a subset and leaves switched turns unallocated", () => {
  const f = fixture();
  try {
    const promptRecord = { version: 1, entryId: "d".repeat(64), workspace: f.root, session: "session", turn: "turn", scopeKind: "bound-task", binding: { taskId: "other-task" } };
    const prompt = { kind: "prompt-entry", ...f.write("prompt.json", promptRecord) };
    const usage = { kind: "usage", ...f.write("usage.json", { version: 1, kind: "usage", entryId: promptRecord.entryId, usage: {
      source: "codex-token-usage-v1", session: "session", turn: "turn", responseId: "response", inputTokens: 100, cachedInputTokens: 40,
      outputTokens: 20, reasoningTokens: 15, cacheWriteInputTokens: null } }) };
    const episode = f.episode("switch", "candidate", { entryKind: "prompt-delivery", evidence: [usage, prompt, usage, f.task("switch")] });
    episode.evaluation.usagePopulation = [`native-response:codex:${digest(["session", "response"])}`];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.allArmSpending.measurements, 1); assert.equal(report.allArmSpending.duplicates, 1);
    assert.equal(report.allArmSpending.knownSubtotalTokens, 120); assert.equal(report.allArmSpending.byProvider.codex!.freshInputTokens, 60);
    assert.equal(report.allArmSpending.unallocatedMeasurements, 1); assert.equal(report.episodes[0]!.usageComplete, false);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  } finally { f.close(); }
});

test("matched accepted tasks require complete declared usage; costs of failed retry attempts are included", () => {
  const f = fixture();
  try {
    const before = f.episode("before", "baseline", { evidence: [f.task("before")] });
    const after = f.episode("after", "candidate", { evidence: [f.task("after")] });
    const failed = f.episode("retry", "candidate");
    const oldJob = f.provider("baseline", "codex", { total: { inputTokens: 100, outputTokens: 20 } }, "succeeded", { runtime: { version: "old", archiveDigest: oldArchive } });
    const newJob = f.provider("candidate", "codex", { total: { inputTokens: 60, outputTokens: 10 } }, "succeeded");
    const retryJob = f.provider("retry", "codex", { total: { inputTokens: 20, outputTokens: 10 } });
    for (const [episode, job] of [[before, oldJob], [after, newJob], [failed, retryJob]] as const) {
      episode.evaluation.providerJobs = [job]; episode.evaluation.usagePopulation = [`provider-job:codex:${job.requestDigest}`];
    }
    const report = readReleaseEvaluation(f.root, f.manifest([before, failed, after]));
    assert.equal(report.allArmSpending.knownSubtotalTokens, 220);
    assert.equal(report.efficiencyComparison.matchedAcceptedTrials, 1);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, 1 / 6);
    assert.equal(report.efficiencyComparison.samples[0]!.candidateElapsedMs, null);
    after.evaluation.usagePopulation = null;
    assert.equal(readReleaseEvaluation(f.root, f.manifest([before, failed, after])).efficiencyComparison.medianSavingsFraction, null);
  } finally { f.close(); }
});

test("changed model, changed expected outcomes, field tasks and shadow cannot masquerade as causal JEV benefit", () => {
  const f = fixture();
  try {
    const before = f.episode("before", "baseline"), after = f.episode("after", "candidate");
    const changedModel = f.manifest([before, after], { conditions: [f.conditions[0], { ...f.conditions[1], model: "different-model" }] });
    assert.equal(readReleaseEvaluation(f.root, changedModel).efficiencyComparison.reasons.includes("changed-model"), true);
    const field = f.manifest([before, after], { view: "field" });
    assert.equal(readReleaseEvaluation(f.root, field).efficiencyComparison.reasons.includes("unmatched-field-tasks-are-not-causal"), true);
    const changedExpected = f.episode("different-expected", "candidate", { expected: [{ dimension: "checks", unitId: "case", outcome: "failed" }] });
    assert.equal(readReleaseEvaluation(f.root, f.manifest([before, changedExpected])).efficiencyComparison.excludedPairs.some(pair => pair.reasons.includes("changed-expected-units")), true);
    const shadow = f.manifest([before, after], { comparison: { baseline: "baseline", candidate: "candidate", kind: "jev", minimumChange: 0 },
      conditions: [f.conditions[0], { ...f.conditions[0], id: "candidate", arm: "shadow" }] });
    assert.equal(readReleaseEvaluation(f.root, shadow).efficiencyComparison.reasons.includes("jev-comparison-requires-code-only-and-active"), true);
  } finally { f.close(); }
});

test("projection eviction and partial discovery remain visible, without inventing adoption or read coverage", () => {
  const f = fixture();
  try {
    const episode = f.episode("entry", "candidate", { expected: [{ dimension: "entry", unitId: "entry", outcome: "delivered" }], evidence: [f.assessment("entry", "entry", "entry", "delivered")] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode], { population: { eligiblePrompts: null }, discovery: { scanComplete: false, projectionEvicted: 99 } }));
    assert.equal(report.discovery.projectionEvicted, 99); assert.equal(report.discovery.scanComplete, false);
    assert.equal(report.dimensions.find(row => row.dimension === "entry")!.verifiedOverExpected, null);
    assert.equal(report.dimensions.find(row => row.dimension === "entry")!.color, "gray");
    assert.equal(report.episodes[0]!.additionalReads, null); assert.equal(report.episodes[0]!.readCoverage, "unknown");
    assert.equal(report.selectionQuality[0]!.scored, false);
  } finally { f.close(); }
});

test("scorecard uses the owning complete-unit evaluator, binds labels and leaves unlabelled selection gray", () => {
  const f = fixture();
  try {
    const frozen = contextQualityDevelopment.find(item => item.id === "right-path-wrong-passage")!;
    const quality = scoreContextQuality(frozen.request, frozen.qualityLabels!, []);
    const evidence = { kind: "context-evaluation", variant: "candidate", ...f.write("selection.json", {
      version: 1, results: [{ id: frozen.id, quality: { candidate: quality } }], privateText: "never-export" }) };
    const episode = f.episode("quality", "candidate", { evidence: [evidence] });
    episode.evaluation.caseId = frozen.id; episode.evaluation.inputDigest = quality.inputDigest; episode.evaluation.expectedLabelDigest = quality.labelDigest;
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    const summary = report.selectionQuality[0]!.quality!;
    assert.equal(report.selectionQuality[0]!.scored, true);
    assert.equal((summary.essentialGroups as any).expected, 1); assert.equal((summary.essentialGroups as any).completeDelivered, 0);
    assert.equal((summary.conditionalAvailablePermitted as any).expected, 1);
    assert.equal((summary.precision as any).rate, null);
    assert.equal(JSON.stringify(report).includes(frozen.qualityLabels!.sources[0]!.text), false);
    episode.evaluation.expectedLabelDigest = hash;
    const mismatch = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(mismatch.selectionQuality[0]!.scored, false);
    assert.equal(mismatch.issues.some(item => item.code === "selection-labels-unavailable-or-mismatched"), true);
  } finally { f.close(); }
});

test("resumed provider cumulative totals are unknown without a pre-job baseline", () => {
  const f = fixture();
  try {
    const episode = f.episode("resumed");
    episode.evaluation.providerJobs = [f.provider("resumed", "codex", { total: { inputTokens: 10000, outputTokens: 2000 }, last: { inputTokens: 20, outputTokens: 10 } }, "succeeded", { conversationId: "existing-session" })];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.allArmSpending.knownSubtotalTokens, null);
    assert.equal(report.allArmSpending.unknownTokenMeasurements, 1);
    assert.equal(report.conditions[1]!.usageCompleteEpisodes, 0);
  } finally { f.close(); }
});

test("a fresh provider aggregate and its native responses identify one spending scope", () => {
  const f = fixture();
  try {
    const promptRecord = { version: 1, entryId: "d".repeat(64), workspace: f.root, session: "session", turn: "turn" };
    const prompt = { kind: "prompt-entry", ...f.write("prompt.json", promptRecord) };
    const usage = { kind: "usage", ...f.write("usage.json", { version: 1, kind: "usage", entryId: promptRecord.entryId, usage: {
      source: "codex-token-usage-v1", session: "session", turn: "turn", responseId: "response", inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, reasoningTokens: 10 } }) };
    const episode = f.episode("overlap", "candidate", { entryKind: "prompt-delivery", evidence: [prompt, usage] });
    const job = f.provider("overlap", "codex", { total: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 } }, "succeeded", { identity: { conversationId: "session", turnId: "turn" } });
    episode.evaluation.providerJobs = [job];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.allArmSpending.knownSubtotalTokens, 120); assert.equal(report.allArmSpending.overlappingMeasurements, 1);
    assert.equal(report.allArmSpending.overlapUnknown, false);
  } finally { f.close(); }
});

test("explicit decision evidence crosses isolated stores with the existing caller and digest checks", () => {
  const f = fixture();
  try {
    const episode = f.episode("isolated"), receiptId = "e".repeat(32), reservationId = "f".repeat(32);
    const caller = { version: 1, id: episode.id, scope: f.scope, entryKind: "workflow-observe", runtimeVersion: "new", archiveDigest: newArchive,
      native: { runId: "run", runDigest: hash, stagesDigest: hash, eventsDigest: hash }, decision: { receiptId } };
    episode.caller = f.write("isolated-caller.json", caller); episode.decisions = [receiptId];
    const evidence = f.write("isolated-state/decisions/evidence.json", { version: 2, receiptId, runtimeVersion: "new", archiveDigest: newArchive,
      outcome: { version: 2, method: "jev", delivered: true, providerCalled: true, mode: "auto", consumers: ["DL08"], reason: "answered", scope: f.scope,
        budget: { reservationId }, usage: { inputTokens: 10, outputTokens: 2 }, transport: { httpMs: 5 } } });
    const selected = { ...episode, decisionEvidence: [{ receiptId, ...evidence }] };
    const report = readReleaseEvaluation(join(f.root, "wrong-default-store"), f.manifest([selected]));
    assert.equal(report.episodes[0]!.joined, true); assert.equal(report.allArmSpending.knownSubtotalTokens, 12);
    assert.equal(report.episodes[0]!.sources.some(ref => ref.path === evidence.path), true);
    appendFileSync(evidence.path, "\n");
    assert.equal(readReleaseEvaluation(f.root, f.manifest([selected])).episodes[0]!.joined, false);
  } finally { f.close(); }
});

test("reopened and conflicting task captures stay unknown or reopened regardless of evidence order", () => {
  const f = fixture();
  try {
    const promptRecord = { version: 1, entryId: "d".repeat(64), workspace: f.root, session: "session", turn: "turn" };
    const prompt = { kind: "prompt-entry", ...f.write("reopen-prompt.json", promptRecord) };
    const reopen = { kind: "outcome", ...f.write("reopen.json", { version: 1, kind: "outcome", entryId: promptRecord.entryId, disposition: "reopened" }) };
    const accepted = f.task("accepted"), cancelled = f.task("cancelled", "cancelled");
    const episode = f.episode("reopen", "candidate", { entryKind: "prompt-delivery", evidence: [prompt, reopen, accepted] });
    assert.equal(readReleaseEvaluation(f.root, f.manifest([episode])).episodes[0]!.acceptance, "reopened");
    episode.evaluation.evidence = [prompt, accepted, reopen];
    assert.equal(readReleaseEvaluation(f.root, f.manifest([episode])).episodes[0]!.acceptance, "reopened");
    episode.evaluation.evidence = [accepted, cancelled];
    const conflict = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(conflict.episodes[0]!.acceptance, "unknown");
    assert.equal(conflict.issues.some(item => item.code === "conflicting-task-owner-captures"), true);
  } finally { f.close(); }
});

test("a current caller cannot stamp historical unstamped provider costs as newest-release spending", () => {
  const f = fixture();
  try {
    const episode = f.episode("unstamped");
    const job = f.provider("unstamped", "codex", { total: { inputTokens: 100, outputTokens: 20 } }, "failed", { runtime: null });
    episode.evaluation.providerJobs = [job]; episode.evaluation.usagePopulation = [`provider-job:codex:${job.requestDigest}`];
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.episodes[0]!.generation, "unknown"); assert.equal(report.episodes[0]!.generationIncomplete, 1);
    assert.equal(report.allArmSpending.knownSubtotalTokens, 120);
    assert.equal(report.conditions[1]!.spending.knownSubtotalTokens, null);
    assert.equal(report.conditions[1]!.unattributedSpending.knownSubtotalTokens, 120);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  } finally { f.close(); }
});

test("task-owner acceptance follows complete unchanged revision chains, not a later binding", () => {
  const f = fixture();
  try {
    const first = { taskId: "task", version: 1, supersedes: null, status: "open", outcome: "case outcome", worktree: f.root,
      mode: "implement", items: [{ seq: 1, kind: "scope", body: f.root, provenance: "operator", revoked: false }] };
    const last = { ...first, version: 2, supersedes: 1, status: "accepted" };
    const anchor = { kind: "task", ...f.write("chain-anchor.json", first) }, terminal = { kind: "task", ...f.write("chain-terminal.json", last) };
    const episode = f.episode("chain", "candidate", { evidence: [terminal, anchor] });
    assert.equal(readReleaseEvaluation(f.root, f.manifest([episode])).episodes[0]!.acceptance, "accepted");
    episode.evaluation.evidence = [terminal];
    assert.equal(readReleaseEvaluation(f.root, f.manifest([episode])).episodes[0]!.acceptance, "unknown");
    const changed = { kind: "task", ...f.write("chain-changed.json", { ...last, outcome: "different outcome" }) };
    episode.evaluation.evidence = [anchor, changed];
    const wrong = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(wrong.episodes[0]!.acceptance, "unknown"); assert.equal(wrong.issues.some(item => item.code === "task-owner-lineage-authority-changed"), true);
    const reopened = { kind: "task", ...f.write("chain-open.json", { ...first, version: 3, supersedes: 2 }) };
    episode.evaluation.evidence = [reopened, terminal, anchor];
    assert.equal(readReleaseEvaluation(f.root, f.manifest([episode])).episodes[0]!.acceptance, "reopened");
  } finally { f.close(); }
});

test("missing and non-string native status or cleanup remain unknown, never critical violations", () => {
  const f = fixture();
  try {
    for (const absent of ["state", "cleanup"] as const) {
      const raw: Record<string, unknown> = { version: 1, requestDigest: hash, state: "succeeded", cleanup: "confirmed", durationMs: 1 };
      delete raw[absent];
      const capture = { kind: "command", ...f.write(`${absent}-missing.json`, raw) };
      const episode = f.episode(`missing-${absent}`, "candidate", { native: [capture], expected: [
        { dimension: "checks", unitId: hash, outcome: "succeeded", critical: true },
        { dimension: "cleanup", unitId: hash, outcome: "confirmed", critical: true }] });
      const report = readReleaseEvaluation(f.root, f.manifest([episode]));
      for (const dimension of ["checks", "cleanup"]) {
        const row = report.dimensions.find(item => item.dimension === dimension)!;
        assert.equal(row.unknown, 1); assert.equal(row.violations, 0); assert.equal(row.color, "gray");
      }
    }
    const capture = { kind: "command", ...f.write("unknown-command.json", { version: 1, requestDigest: hash, state: "unknown", status: 7, cleanup: "unknown", durationMs: 1 }) };
    const episode = f.episode("native-unknown", "candidate", { native: [capture], expected: [
      { dimension: "checks", unitId: hash, outcome: "succeeded", critical: true }, { dimension: "cleanup", unitId: hash, outcome: "confirmed", critical: true }] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.dimensions.find(item => item.dimension === "checks")!.unknown, 1);
    assert.equal(report.dimensions.find(item => item.dimension === "cleanup")!.unknown, 1);
    assert.equal(report.execution.knownSummedProcessMs, 1);
  } finally { f.close(); }
});

test("original check metric names preserve measured duration and historical identity without fixture stamps", () => {
  const f = fixture();
  try {
    const runId = "dca13caf-cd84-4328-ae87-9c36c4395353";
    const capture = { kind: "check", ...f.write("native-metrics.json", { version: 1, run_id: runId, workspace: f.root, stage: "batch",
      runtime_version: "new", status: "passed", termination_reason: "completed", duration_ms: 7, started_at: "2026-10-05T00:00:00Z", ended_at: "2026-10-05T00:00:00.007Z",
      pack_count: 1, command_count: 1, blocked_pack_count: 0, result_digest: hash }) };
    const episode = f.episode("original-check", "candidate", { native: [capture], expected: [{ dimension: "checks", unitId: runId, outcome: "passed" }] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.episodes[0]!.generation, "unknown");
    assert.equal(report.dimensions.find(item => item.dimension === "checks")!.successes, 1);
    assert.equal(report.execution.knownSummedProcessMs, 7);
  } finally { f.close(); }
});

test("original route phases separate index extraction/reuse and parallel work from provider and task durations", () => {
  const f = fixture();
  try {
    f.conditions[1]!.cacheState = "cold";
    const route = (id: string, conditionId: string, warm: boolean) => {
      const selected = f.conditions.find(item => item.id === conditionId)!;
      return { kind: "route", ...f.write(`${id}-route.json`, { version: 1, receiptId: id, inputDigest: hash, workspace: f.root,
        runtimeVersion: selected.runtime.version, archiveDigest: selected.runtime.archiveDigest,
        projection: { cache: "published", extractedCount: warm ? 0 : 12, reusedCount: warm ? 12 : 0, pendingCount: 0,
          timing: { identityMs: 5, freshnessMs: 10, cacheMs: 5, extractionMs: warm ? 0 : 55, publicationAndLinksMs: 5 } },
        timing: { version: 1, preparationMs: warm ? 20 : 100, sourceCaptureMs: 4, indexMs: warm ? 10 : 80,
          selectionMs: 500, providerCallMs: 200, deliveryMs: 20, totalMs: warm ? 540 : 620 },
        metadata: { elapsedMs: 250, httpTotalMs: 150, admissionTotalMs: 30, packingMs: 10 },
        selection: { passageAdvice: { elapsedMs: 200, preparationMs: 20, packingMs: 5 } } }) };
    };
    const cold = f.episode("cold-route", "candidate", { entryKind: "context-delivery", evidence: [route("cold-route", "candidate", false)] });
    const warm = f.episode("warm-route", "baseline", { entryKind: "context-delivery", evidence: [route("warm-route", "baseline", true)] });
    cold.evaluation.providerJobs = [f.provider("separate-provider", "codex", { total: { inputTokens: 10, outputTokens: 2 } })];
    const report = readReleaseEvaluation(f.root, f.manifest([cold, warm]));
    assert.equal(report.contextTiming.measurements, 2); assert.equal(report.contextTiming.generationMatched, 2);
    assert.equal(report.contextTiming.indexWorkloads["extraction-only"], 1); assert.equal(report.contextTiming.indexWorkloads["reuse-only"], 1);
    assert.equal(report.contextTiming.phases.preparationMs!.medianMs, 60); assert.equal(report.contextTiming.phases.indexMs!.medianMs, 45);
    assert.equal(report.contextTiming.phases.metadataHttpWorkMs!.medianMs, 150);
    assert.equal(report.contextTiming.phases.metadataAdmissionWorkMs!.medianMs, 30);
    assert.equal(report.contextTiming.phases.totalMs!.medianMs, 580);
    assert.equal(report.conditions[1]!.condition.cacheState, "cold"); assert.equal(report.conditions[0]!.condition.cacheState, "warm");
    assert.equal(report.allArmSpending.byProvider.codex!.durationMs, 20);
    assert.equal(report.conditions[1]!.elapsed.medianMs, 10);
    assert.match(report.contextTiming.deliveryQualification, /consumption latency remain unknown/);
    assert.match(releaseEvaluationMarkdown(report), /overlapping phases are not added/);
  } finally { f.close(); }
});

test("route timing replays deduplicate and conflicting route phase captures stay unknown", () => {
  const f = fixture();
  try {
    const body = { version: 1, receiptId: "replay", inputDigest: hash, workspace: f.root, runtimeVersion: "new", archiveDigest: newArchive,
      timing: { version: 1, totalMs: 12 }, projection: { cache: "published", extractedCount: 0, reusedCount: 2 } };
    const route = { kind: "route", ...f.write("route.json", body) };
    const episode = f.episode("replay", "candidate", { entryKind: "context-delivery", evidence: [route, route] });
    let report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.contextTiming.measurements, 1); assert.equal(report.contextTiming.duplicates, 1);
    assert.equal(report.contextTiming.phases.totalMs!.samples, 1); assert.equal(report.contextTiming.phases.totalMs!.medianMs, 12);
    assert.equal(report.contextTiming.phases.metadataAdmissionWorkMs!.medianMs, null);
    const changed = { kind: "route", ...f.write("changed-route.json", { ...body, timing: { version: 1, totalMs: 20 } }) };
    episode.evaluation.evidence.push(changed);
    report = readReleaseEvaluation(f.root, f.manifest([episode]));
    assert.equal(report.contextTiming.conflicts, 1); assert.equal(report.contextTiming.phases.totalMs!.samples, 0);
    assert.equal(report.contextTiming.phases.totalMs!.unknown, 1); assert.equal(report.contextTiming.phases.totalMs!.medianMs, null);
  } finally { f.close(); }
});

test("missing malformed and unlinked route phases are not inferred from declared cache or provider duration", () => {
  const f = fixture();
  try {
    const route = { kind: "route", ...f.write("partial-route.json", { version: 1, receiptId: "partial-route", inputDigest: hash, workspace: f.root,
      runtimeVersion: "new", archiveDigest: newArchive, timing: { version: 1, preparationMs: "12", indexMs: -1, deliveryMs: null },
      projection: { cache: "private value must not escape", extractedCount: null, reusedCount: 2 } }) };
    const episode = f.episode("partial-route", "candidate", { entryKind: "context-delivery", evidence: [route] });
    const unlinked = f.episode("unlinked", "candidate", { entryKind: "context-delivery", evidence: [route] });
    const report = readReleaseEvaluation(f.root, f.manifest([episode, unlinked]));
    assert.equal(report.contextTiming.measurements, 1); assert.equal(report.contextTiming.episodesWithoutCapturedRoute, 1);
    assert.equal(report.contextTiming.phases.preparationMs!.unknown, 1); assert.equal(report.contextTiming.phases.preparationMs!.medianMs, null);
    assert.equal(report.contextTiming.phases.indexMs!.medianMs, null); assert.equal(report.contextTiming.indexWorkloads.unknown, 1);
    assert.equal(report.issues.some(item => item.code === "context-timing-route-unlinked"), true);
    assert.equal(JSON.stringify(report).includes("private value must not escape"), false);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
  } finally { f.close(); }
});
