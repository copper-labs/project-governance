import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, digest } from "../src/core.ts";
import { evaluateContext } from "../src/context-evaluation.ts";
import { contextQualityLabelDigest, qualitySourceDigest, scoreContextQuality, validateContextQualityLabels } from "../src/context-evaluation-quality.ts";
import type { Candidate, DecisionProvider } from "../src/decisions.ts";
import { contextQualityDevelopment, contextQualityHoldout, contextQualityRepresentation, contextQualityRepresentation41 } from "./fixtures/context-quality-frozen.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { extractSourceFacts } from "../src/context-source-facts.ts";

const deterministic: DecisionProvider = { async decide(request) {
  assert.equal("qualityLabels" in request, false);
  return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(item => item.id), suggested: null,
    method: "baseline", reason: "fixture-deterministic", model: null, questionVersion: "fixture-1", confidence: null, latencyMs: 0,
    usage: { inputTokens: null, outputTokens: null } };
} };
const caseById = (id: string) => structuredClone([...contextQualityDevelopment, ...contextQualityHoldout].find(entry => entry.id === id)!);
const ranged = (original: Candidate, firstLine: number, lastLine: number, complete = true): Candidate => {
  const lines = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const excerpt = lines.slice(firstLine - 1, lastLine).join("");
  return { ...original, excerpt, sourceRange: { firstLine, lastLine, totalLines: lines.length, excerptDigest: qualitySourceDigest(excerpt), complete: false },
    sourceUnits: [{ kind: "function", name: "labelled-unit", firstLine, lastLine, complete }] };
};

test("frozen development and holdout cases retain independent source and label identities", async () => {
  const cases = [...contextQualityDevelopment, ...contextQualityHoldout];
  const report = await evaluateContext(cases, deterministic);
  assert.equal(report.summary.qualityLabeledCases, 9);
  assert.equal(report.summary.tokenSavings, null);
  assert.equal(report.summary.developmentBenefit, "unqualified");
  assert.deepEqual(report.summary.requiredEvidenceLosses, []);
  for (const [index, result] of report.results.entries()) {
    assert.equal(result.quality!.candidate.inputDigest, digest(cases[index]!.request));
    assert.equal(result.quality!.candidate.labelDigest, cases[index]!.qualityLabels!.labelDigest);
    assert.equal(result.quality!.candidate.labelSource.independentOfSelector, true);
  }
  const byId = new Map(report.results.map(result => [result.id, result.quality!.candidate]));
  assert.equal(byId.get("counter-evidence")!.essentialGroups.completeDelivered, 2);
  assert.equal(byId.get("weak-description")!.descriptors.weak, 1);
  assert.equal(byId.get("weak-description")!.essentialGroups.recall, 1);
  assert.equal(byId.get("short-resume")!.essentialGroups.completeDelivered, 1);
  assert.equal(byId.get("steering-multi-intent")!.essentialGroups.completeDelivered, 2);
  assert.equal(byId.get("no-match")!.noMatch.correct, true);
  assert.equal(byId.get("no-match")!.essentialGroups.recall, null);
  assert.equal(byId.get("permission-exclusion")!.essentialGroups.recall, 0);
  assert.equal(byId.get("permission-exclusion")!.conditionalAvailablePermitted.expected, 0);
  assert.deepEqual(byId.get("permission-exclusion")!.permissionExclusions, [{ candidateId: "src/excluded.ts", reason: "local-body-scope-denied" }]);
  assert.equal(byId.get("equivalent-sources")!.essentialGroups.expected, 1);
  assert.equal(byId.get("equivalent-sources")!.precision.selected, 1);
  assert.equal(byId.get("equivalent-sources")!.precision.rate, 1);
});

test("right path with the wrong or incomplete passage is a complete-evidence miss", () => {
  const entry = caseById("right-path-wrong-passage"), original = entry.request.optional[0]!;
  const wrong = scoreContextQuality(entry.request, entry.qualityLabels!, [ranged(original, 1, 3)]);
  assert.equal(wrong.essentialGroups.fileDelivered, 1);
  assert.equal(wrong.essentialGroups.completeDelivered, 0);
  assert.equal(wrong.precision.rate, 0);
  const partial = scoreContextQuality(entry.request, entry.qualityLabels!, [ranged(original, 4, 6)]);
  assert.equal(partial.essentialGroups.completeDelivered, 0);
  const deniedCompleteness = scoreContextQuality(entry.request, entry.qualityLabels!, [ranged(original, 4, 7, false)]);
  assert.equal(deniedCompleteness.essentialGroups.completeDelivered, 0);
  const complete = scoreContextQuality(entry.request, entry.qualityLabels!, [ranged(original, 4, 7)]);
  assert.equal(complete.essentialGroups.completeDelivered, 1);
  assert.equal(complete.precision.rate, 1);
});

test("table evidence needs column headers and the matching row, not just the right file", async () => {
  const entry = structuredClone(contextQualityRepresentation[0]!), original = entry.request.optional[0]!;
  validateContextQualityLabels(entry.request, entry.qualityLabels!);
  const fragment = (firstLine: number, lastLine: number): Candidate => {
    const lines = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const excerpt = lines.slice(firstLine - 1, lastLine).join("");
    return { ...original, excerpt, sourceRange: { firstLine, lastLine, totalLines: lines.length,
      excerptDigest: qualitySourceDigest(excerpt), complete: false } };
  };
  for (const body of [fragment(4, 4), fragment(2, 3), fragment(5, 5)]) {
    const score = scoreContextQuality(entry.request, entry.qualityLabels!, [body]);
    assert.equal(score.invalidSources.length, 0);
    assert.equal(score.essentialGroups.fileDelivered, 1);
    assert.equal(score.essentialGroups.completeDelivered, 0);
    assert.deepEqual(score.essentialGroups.missed, ["radio-storage-columns"]);
  }
  const complete = scoreContextQuality(entry.request, entry.qualityLabels!, [fragment(2, 4)]);
  assert.equal(complete.essentialGroups.completeDelivered, 1);
  const report = await evaluateContext([entry], deterministic);
  assert.equal(report.results[0]!.quality!.candidate.essentialGroups.completeDelivered, 1);
  assert.equal(report.summary.tokenSavings, null);
});

test("deep table columns and row are separately required and exact disjoint delivery scores both", () => {
  const fixture = contextQualityRepresentation41[0]!, original = fixture.request.optional[0]!;
  const facts = extractSourceFacts(original.id, Buffer.from(original.excerpt));
  const row = facts.spans.find(span => span.kind === "table-row" && span.name.startsWith("Radio stream"))!;
  const excerpt = contextExcerpt(original, fixture.request.purpose, fixture.request.optionalExcerptBytes!, facts.spans, [row]);
  const score = scoreContextQuality(fixture.request, fixture.qualityLabels!, [excerpt]);
  assert.deepEqual(score.invalidSources, []);
  assert.equal(score.essentialGroups.expected, 2); assert.equal(score.essentialGroups.completeDelivered, 2);
  assert.equal(score.precision.rate, 1);
  for (const fragment of [ranged(original, 2, 3), ranged(original, 40, 40)]) {
    const partial = scoreContextQuality(fixture.request, fixture.qualityLabels!, [fragment]);
    assert.equal(partial.essentialGroups.completeDelivered, 1);
    assert.equal(partial.essentialGroups.missed.length, 1);
  }
});

test("complete-unit regressions remain visible when the useful-file comparison is tied", async () => {
  const full = { id: "src/complete.ts", excerpt: "function rule() {}\nfunction contraryCase() {}\n", sourceDigest: qualitySourceDigest("function rule() {}\nfunction contraryCase() {}\n") };
  const alternative = { id: "docs/alternative.md", excerpt: "The rule is documented.\n", sourceDigest: qualitySourceDigest("The rule is documented.\n") };
  const request = { taskRevision: "paired-complete-1", purpose: "Review the rule and contrary case", required: [], optional: [full, alternative], maximumBytes: Buffer.byteLength(canonical([full])) };
  const body = { version: 1 as const, suiteVersion: "selection-quality-paired-1", inputDigest: digest(request),
    labelSource: { kind: "source-backed-fixture" as const, reference: "synthetic-quality:paired-complete:authored-labels", independentOfSelector: true as const },
    sources: request.optional.map(candidate => ({ candidateId: candidate.id, text: candidate.excerpt, sourceDigest: candidate.sourceDigest, bodyPermission: "permitted" as const, exclusionReason: null })),
    units: [{ id: "rule", candidateId: full.id, firstLine: 1, lastLine: 1, rangeDigest: qualitySourceDigest("function rule() {}\n"), relevance: "useful" as const },
      { id: "contrary", candidateId: full.id, firstLine: 2, lastLine: 2, rangeDigest: qualitySourceDigest("function contraryCase() {}\n"), relevance: "useful" as const },
      { id: "alternative", candidateId: alternative.id, firstLine: 1, lastLine: 1, rangeDigest: qualitySourceDigest(alternative.excerpt), relevance: "useful" as const }],
    essentialGroups: [{ id: "rule-need", unitIds: ["rule", "alternative"], required: false }, { id: "contrary-need", unitIds: ["contrary"], required: false }],
    noMatch: false, fullyLabeled: true };
  const report = await evaluateContext([{ id: "tied-files-lost-unit", request, usefulOptionalIds: [full.id, alternative.id], qualityLabels: { ...body, labelDigest: contextQualityLabelDigest(body) } }],
    { async decide(input) { return { ...await deterministic.decide(input), delivered: input.candidates.map(candidate => candidate.id).reverse() }; } });
  assert.deepEqual(report.summary.regressions, []);
  assert.deepEqual(report.summary.completeUnitRegressions, ["tied-files-lost-unit"]);
  assert.equal(report.results[0]!.quality!.baseline.essentialGroups.completeDelivered, 2);
  assert.equal(report.results[0]!.quality!.candidate.essentialGroups.completeDelivered, 1);
});

test("range digests, exact delivered bodies and stale original references cannot earn hits", () => {
  const entry = caseById("right-path-wrong-passage"), original = entry.request.optional[0]!;
  for (const candidate of [
    { ...original, sourceDigest: qualitySourceDigest("older source") },
    { ...original, excerpt: "unverified selected prose" },
    { ...ranged(original, 4, 7), excerpt: "a different function" },
    { ...ranged(original, 4, 7), sourceRange: { ...ranged(original, 4, 7).sourceRange!, excerptDigest: qualitySourceDigest("incorrect range") } },
  ]) {
    const score = scoreContextQuality(entry.request, entry.qualityLabels!, [candidate]);
    assert.equal(score.essentialGroups.completeDelivered, 0);
    assert.equal(score.invalidSources.length, 1);
    assert.equal(score.precision.rate, null);
  }
});

test("disjoint ranges in advisory order remain valid while overlapping ranges are rejected", () => {
  const entry = caseById("right-path-wrong-passage"), original = entry.request.optional[0]!;
  const later = ranged(original, 4, 7), earlier = ranged(original, 1, 3);
  const combined = { ...original, excerpt: `[source lines 4-7]\n${later.excerpt}\n[source lines 1-3]\n${earlier.excerpt}`,
    sourceRanges: [later.sourceRange!, earlier.sourceRange!], sourceUnits: [...later.sourceUnits!, ...earlier.sourceUnits!] };
  const ordered = scoreContextQuality(entry.request, entry.qualityLabels!, [combined]);
  assert.equal(ordered.invalidSources.length, 0); assert.equal(ordered.essentialGroups.completeDelivered, 1);
  const overlapping = { ...combined, sourceRanges: [later.sourceRange!, ranged(original, 1, 5).sourceRange!] };
  assert.equal(scoreContextQuality(entry.request, entry.qualityLabels!, [overlapping]).invalidSources[0]!.reason, "invalid-source-range");
});

test("unknown labels and uncovered selected text keep precision unscored", () => {
  const entry = caseById("right-path-wrong-passage"), labels = entry.qualityLabels!;
  labels.units[0]!.relevance = "unknown";
  labels.labelDigest = contextQualityLabelDigest(labels);
  const unknown = scoreContextQuality(entry.request, labels, entry.request.optional);
  assert.equal(unknown.precision.unknown, 1);
  assert.equal(unknown.precision.rate, null);
  labels.units.shift(); labels.labelDigest = contextQualityLabelDigest(labels);
  const uncovered = scoreContextQuality(entry.request, labels, entry.request.optional);
  assert.equal(uncovered.precision.unlabelled, 1);
  assert.equal(uncovered.precision.rate, null);
});

test("required evidence retention checks exact complete original bytes and exposes overflow before advice", async () => {
  const entry = caseById("complete-required-evidence");
  const score = scoreContextQuality(entry.request, entry.qualityLabels!, entry.request.optional);
  assert.deepEqual(score.requiredMissing, ["AGENTS.md"]);
  entry.request.maximumBytes = 1;
  entry.qualityLabels!.inputDigest = digest(entry.request); entry.qualityLabels!.labelDigest = contextQualityLabelDigest(entry.qualityLabels!);
  let calls = 0;
  await assert.rejects(evaluateContext([entry], { async decide(request) { calls++; return deterministic.decide(request); } }), /required context exceeds budget/u);
  assert.equal(calls, 0);
});

test("validate the whole case set before advice and reject changed labels or forbidden capture", async () => {
  let calls = 0;
  const changed = caseById("weak-description"); changed.qualityLabels!.units[0]!.rangeDigest = qualitySourceDigest("changed expectation");
  changed.qualityLabels!.labelDigest = contextQualityLabelDigest(changed.qualityLabels!);
  await assert.rejects(evaluateContext([contextQualityDevelopment[0]!, changed], { async decide(request) { calls++; return deterministic.decide(request); } }), /Quality unit/u);
  assert.equal(calls, 0);
  const denied = caseById("permission-exclusion"), source = denied.qualityLabels!.sources[0]!;
  denied.request.optional.push({ id: source.candidateId, sourceDigest: source.sourceDigest, excerpt: source.text });
  denied.qualityLabels!.inputDigest = digest(denied.request); denied.qualityLabels!.labelDigest = contextQualityLabelDigest(denied.qualityLabels!);
  assert.throws(() => validateContextQualityLabels(denied.request, denied.qualityLabels!), /permission-excluded/u);
  const badDigest = caseById("short-resume"); badDigest.request.purpose = "Changed objective";
  assert.throws(() => validateContextQualityLabels(badDigest.request, badDigest.qualityLabels!), /input or label digest/u);
});

test("boundary loss and judgments retain unknowns and independent permission stages", () => {
  const entry = caseById("weak-description"), candidateId = entry.request.optional[0]!.id;
  const observation = { stages: [{ stage: "inventory" as const, candidateIds: [candidateId], omissions: [] },
    { stage: "descriptor-permitted" as const, candidateIds: [], omissions: [{ candidateId, reason: "hosted-metadata-denied" }] }],
    judgments: [{ unitId: "conversion", value: "uncertain" as const }] };
  validateContextQualityLabels(entry.request, entry.qualityLabels!, observation);
  const score = scoreContextQuality(entry.request, entry.qualityLabels!, entry.request.optional, observation);
  assert.equal(score.boundaries.find(item => item.stage === "descriptor-permitted")!.observed, 0);
  assert.equal(score.boundaries.find(item => item.stage === "descriptor-answered")!.observed, null);
  assert.equal(score.essentialGroups.completeDelivered, 1);
  assert.equal(score.judgments!.uncertain, 1);
});
