import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionPayload, parseDecisionEnvelope, type DecisionRequest2, type QuestionDefinition } from "../src/decision-schema.ts";

// Wire fields follow https://docs.typesafe.ai/api (verified 2026-09-21).
const definitions: Record<string, QuestionDefinition> = Object.fromEntries((["noul", "choice", "score"] as const).map(shape => [shape, {
  id: shape, shape, owner: "DL03", purpose: "contract fixture", instructions: "Assess supplied evidence",
  baseline: "unchanged", effectCeiling: "advise", metric: "fixture", ...(shape === "score" ? { levels: ["low", "high"] } : {}),
}]));
const request: DecisionRequest2 = {
  schemaVersion: 2, requestId: "fixture", consumerId: "DL03", consumers: ["DL03"], consumerVersion: "1",
  scope: { workspace: "/unused", taskId: "task", taskRevision: "r1" }, subject: { digest: "d", revision: "r1", environment: "fixture" },
  evidence: [{ id: "e", text: "Untrusted source text", sourceDigest: "d", provenance: "captured", trust: "untrusted" }],
  coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
  questions: [
    { name: "yes", definitionId: "noul", consumerId: "DL03", evidenceIds: ["e"] },
    { name: "pick", definitionId: "choice", consumerId: "DL03", evidenceIds: ["e"], candidates: [{ id: "a", description: "option A" }] },
    { name: "rating", definitionId: "score", consumerId: "DL03", evidenceIds: ["e"] },
  ], eligibilityDigest: null, policyDigest: "p", configDigest: "c",
  budget: { deadlineMs: 100, maxQuestions: 3, maxRequestBytes: 8192, maxCandidates: 2, tokenEstimate: 0, tokenMethod: "fixture" },
};
const response = () => ({ model: "jev-1.13.0", answers: {
  yes: { type: "noul", noul: 0.9 },
  pick: { type: "choice", choice: "unknown", confidence: 0.8, probabilities: { a: 0.1, unknown: 0.9 } },
  rating: { type: "score", score: 0.75, confidence: 0.5, legend: { "0": "low", "1": "high" }, probabilities: { "0": 0.25, "1": 0.75 } },
}, usage: { input_tokens: 100, output_tokens: 20 } });

test("provider wire puts evidence inside structured instructions and score levels in criteria", () => {
  const payload = decisionPayload(request, definitions, "jev-1.13.0");
  assert.deepEqual(payload.questions["rating"], { type: "score", criteria: ["low", "high"], instructions: {
    question: "Assess supplied evidence", evidence: [{ provenance: "captured", trust: "untrusted", evidence: "Untrusted source text" }],
  } });
});
test("native probability, weighted score and explicit unknown survive normalization", () => {
  const parsed = parseDecisionEnvelope(response(), request, definitions, "jev-1.13.0", "payload");
  assert.deepEqual(parsed.answers["yes"], { status: "answered", shape: "noul", probability: 0.9 });
  const pick = parsed.answers["pick"]!;
  assert.equal(pick.status, "unknown");
  if (pick.status === "unknown") assert.equal(pick.native?.probabilities["unknown"], 0.9);
  const rating = parsed.answers["rating"]!;
  assert.equal(rating.status, "answered");
  if (rating.status === "answered" && rating.shape === "score") assert.equal(rating.expectation, 0.75);
  assert.deepEqual(parsed.usage, { inputTokens: 100, outputTokens: 20 });
});
test("contradictory distributions invalidate only the affected answer", () => {
  const raw = response(); raw.answers.pick.choice = "a"; raw.answers.rating.score = 0;
  const parsed = parseDecisionEnvelope(raw, request, definitions, "jev-1.13.0", "payload");
  assert.equal(parsed.answers["pick"]?.status, "invalid");
  assert.equal(parsed.answers["rating"]?.status, "invalid");
  assert.equal(parsed.answers["yes"]?.status, "answered");
});

test("request validation rejects invalid binding, vocabulary and bounds before serialization", async () => {
  const { validateDecisionRequest } = await import("../src/decision-schema.ts");
  const registered = Object.fromEntries(Object.entries(definitions).map(([key, definition]) => [`fixture.${key}/1`, { ...definition, id: `fixture.${key}/1` }]));
  const valid = structuredClone(request);
  for (const question of valid.questions) question.definitionId = `fixture.${question.definitionId}/1`;
  validateDecisionRequest(valid, registered);
  const invalidEvidence = structuredClone(valid); invalidEvidence.questions[0]!.evidenceIds = ["absent"];
  assert.throws(() => validateDecisionRequest(invalidEvidence, registered), /unsupplied/);
  const invalidBatch = structuredClone(valid); invalidBatch.consumers = ["DL01"];
  assert.throws(() => validateDecisionRequest(invalidBatch, registered), /participants/);
  const invalidCandidate = structuredClone(valid); invalidCandidate.questions[1]!.candidates![0]!.id = "unknown";
  assert.throws(() => validateDecisionRequest(invalidCandidate, registered), /reserve the unknown/);
  const invalidBudget = structuredClone(valid); invalidBudget.budget.maxQuestions = 1;
  assert.throws(() => validateDecisionRequest(invalidBudget, registered), /budget/);
  registered["fixture.choice/1"]!.options = ["fixed"];
  assert.throws(() => validateDecisionRequest(valid, registered), /registered vocabulary/);
});

test("wire excludes local identity and coverage text; additive noul metadata is ignored", () => {
  const local = structuredClone(request);
  local.coverage.omitted = ["private-path"];
  local.scope.taskId = "private-task";
  const payload = JSON.stringify(decisionPayload(local, definitions, "jev-1.13.0"));
  assert.equal(payload.includes("private-path"), false);
  assert.equal(payload.includes("private-task"), false);
  const raw = response(); Object.assign(raw.answers.yes, { confidence: 0.5 });
  const parsed = parseDecisionEnvelope(raw, request, definitions, "jev-1.13.0", "payload");
  assert.equal(parsed.answers["yes"]?.status, "answered");
});
