import test from "node:test";
import assert from "node:assert/strict";
import { digest } from "../src/core.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { qualitySourceDigest, scoreContextQuality, validateContextQualityLabels } from "../src/context-evaluation-quality.ts";
import type { Candidate, DecisionProvider } from "../src/decisions.ts";
import type { PassageJudgment } from "../src/context-passage-advice.ts";
import { largeSectionedContextCase, sectionedEvidenceSpans } from "./fixtures/context-quality-large-sectioned.ts";

const offlineBaseline: DecisionProvider = { async decide(request) {
  assert.equal(JSON.stringify(request).includes("authored-labels"), false);
  return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(candidate => candidate.id),
    suggested: null, method: "baseline", reason: "synthetic-offline-ranking", model: null, questionVersion: "fixture-1",
    confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } };
} };

async function packetForCase() {
  const { request } = largeSectionedContextCase;
  const original = request.optional[0]!;
  const sectionedExcerpt = contextExcerpt(original, request.purpose, request.optionalExcerptBytes!, sectionedEvidenceSpans, sectionedEvidenceSpans);
  // Deliberately overconfident false positives test the scorecard, not a provider's accuracy.
  const probabilities = [0.86, 0.74, 0.99, 0.97];
  const passageJudgments: Record<string, PassageJudgment> = Object.fromEntries(request.optional.map((candidate, index) => [candidate.id, {
    sourceDigest: candidate.sourceDigest, excerptDigest: digest(index === 0 ? sectionedExcerpt.excerpt : candidate.excerpt),
    probability: probabilities[index]!, interpretation: "positive", role: "implementation", roleSource: "path",
    preferredSpans: index === 0 ? sectionedEvidenceSpans : [],
  }]));
  return buildContextPacket({ ...request, sourceSpans: { [original.id]: sectionedEvidenceSpans }, passageJudgments }, offlineBaseline);
}

function firstSectionOnly(original: Candidate): Candidate {
  const span = sectionedEvidenceSpans[0]!;
  const lines = original.excerpt.split(/(?<=\n)/u), excerpt = lines.slice(span.start - 1, span.end).join("");
  return { ...original, excerpt, sourceRange: { firstLine: span.start, lastLine: span.end, totalLines: lines.length,
    excerptDigest: qualitySourceDigest(excerpt), complete: false },
    sourceUnits: [{ kind: "function", name: span.name, firstLine: span.start, lastLine: span.end, complete: true }] };
}

test("large sectioned source delivers both distant rules and indirect support while high confidence earns no quality credit", async () => {
  const fixture = largeSectionedContextCase, labels = fixture.qualityLabels!;
  validateContextQualityLabels(fixture.request, labels);
  const original = fixture.request.optional[0]!;
  assert.ok(Buffer.byteLength(original.excerpt) > 256 * 1024);
  assert.ok(sectionedEvidenceSpans[1]!.start - sectionedEvidenceSpans[0]!.end > 2000);
  const packet = await packetForCase();
  assert.deepEqual(packet.judgmentLimitations, {});
  const excerpt = packet.entries.find(candidate => candidate.id === original.id)!;
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= fixture.request.optionalExcerptBytes!);
  assert.deepEqual(excerpt.sourceRanges?.map(range => [range.firstLine, range.lastLine]), sectionedEvidenceSpans.map(span => [span.start, span.end]));
  assert.equal(excerpt.excerpt.includes("Archived palette setting"), false);

  const score = scoreContextQuality(fixture.request, labels, packet.entries);
  assert.deepEqual(score.invalidSources, []);
  assert.deepEqual(score.requiredMissing, []);
  assert.equal(score.essentialGroups.expected, 4);
  assert.equal(score.essentialGroups.fileDelivered, 4);
  assert.equal(score.essentialGroups.completeDelivered, 4);
  assert.equal(score.conditionalAvailablePermitted.recall, 1);
  assert.deepEqual(score.precision, { usefulSelected: 3, selected: 5, unknown: 0, unlabelled: 0, rate: 3 / 5 });
  assert.equal(score.descriptors.weak, 1);
  assert.equal(packet.measurement.tokenSavings, null);
  assert.equal(packet.measurement.benefit, "not-evaluated");
});

test("the same selected files cannot hide a lost distant rule or the missing indirect helper", async () => {
  const fixture = largeSectionedContextCase, labels = fixture.qualityLabels!, packet = await packetForCase();
  const original = fixture.request.optional[0]!, helper = fixture.request.optional[1]!;
  const lostSection = packet.entries.map(candidate => candidate.id === original.id ? firstSectionOnly(original) : candidate);
  const sectionScore = scoreContextQuality(fixture.request, labels, lostSection);
  assert.deepEqual(sectionScore.invalidSources, []);
  assert.equal(sectionScore.essentialGroups.fileDelivered, 4);
  assert.equal(sectionScore.essentialGroups.completeDelivered, 3);
  assert.deepEqual(sectionScore.essentialGroups.missed, ["settlement-owner-rule"]);
  assert.equal(sectionScore.conditionalAvailablePermitted.recall, 3 / 4);
  assert.equal(sectionScore.precision.rate, 1 / 2);
  assert.deepEqual(sectionScore.requiredMissing, []);

  const missingHelper = scoreContextQuality(fixture.request, labels, packet.entries.filter(candidate => candidate.id !== helper.id));
  assert.equal(missingHelper.essentialGroups.completeDelivered, 3);
  assert.deepEqual(missingHelper.essentialGroups.missed, ["generation-identity"]);
  assert.deepEqual(missingHelper.requiredMissing, []);
  assert.equal(missingHelper.boundaries.find(boundary => boundary.stage === "captured")!.observed, 5);
  assert.deepEqual(missingHelper.boundaries.find(boundary => boundary.stage === "delivered")!.omissions,
    [{ candidateId: helper.id, reason: "not-delivered" }]);
});
