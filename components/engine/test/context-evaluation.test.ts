import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateContext, type ContextEvaluationCase } from "../src/context-evaluation.ts";
import { digest } from "../src/core.ts";
import type { DecisionProvider } from "../src/decisions.ts";
const cases: ContextEvaluationCase[] = [{ id: "missing-and-misranked", request: {
  taskRevision: "1", purpose: "find state bug", required: [], maximumBytes: 75,
  optional: [{ id: "a", sourceDigest: "a1", excerpt: "styles" }, { id: "b", sourceDigest: "b1", excerpt: "state" }],
}, usefulOptionalIds: ["b", "missing"] }];
const provider: DecisionProvider = { async decide(request) { return { version: 1, kind: request.kind, inputDigest: digest(request),
  delivered: ["b", "a"], suggested: ["b", "a"], method: "jev", reason: "suggested", model: "fixture", questionVersion: "1",
  confidence: 1, latencyMs: 5, usage: { inputTokens: 20, outputTokens: 5 } }; } };
test("paired evaluation separates missing retrieval from ranking and preserves native usage", async () => {
  const result = await evaluateContext(cases, provider);
  assert.deepEqual(result.results[0]!.omittedCandidates, ["missing"]);
  assert.deepEqual(result.results[0]!.baseline.usefulMissedBySelection, ["b"]);
  assert.deepEqual(result.results[0]!.candidate.usefulMissedBySelection, []);
  assert.equal(result.summary.baselineUsefulSelected, 0);
  assert.equal(result.summary.candidateUsefulSelected, 1);
  assert.equal(result.summary.providerInputTokens, 20);
  assert.deepEqual(result.summary.pairedSelection.candidateVsLexical.wins, []);
  assert.deepEqual(result.summary.pairedSelection.candidateVsLexical.ties, ["missing-and-misranked"]);
  assert.equal(result.summary.tokenSavings, null);
  assert.equal(result.summary.developmentBenefit, "unqualified");
});
test("invalid datasets fail before provider calls", async () => {
  let calls = 0;
  await assert.rejects(evaluateContext([...cases, ...cases], { async decide(request) { calls++; return provider.decide(request); } }), /duplicate/);
  assert.equal(calls, 0);
});
test("shadow evaluates captured suggestion separately without another provider call", async () => {
  let calls = 0;
  const result = await evaluateContext(cases, { async decide(request) {
    calls++;
    const advice = await provider.decide(request);
    return { ...advice, delivered: ["a", "b"], method: "baseline", reason: "shadow" };
  } });
  assert.equal(calls, 1);
  assert.equal(result.results[0]!.candidate.usefulSelected, 0);
  assert.equal(result.results[0]!.shadow?.usefulSelected, 1);
  assert.equal(result.summary.shadowCases, 1);
  assert.equal(result.summary.providerInputTokens, 20);
});

test("selection comparison exposes losses to the lexical baseline independently of fixed ordering", async () => {
  const result = await evaluateContext(cases, { async decide(request) {
    return { ...await provider.decide(request), delivered: ["a", "b"] };
  } });
  assert.deepEqual(result.summary.pairedSelection.candidateVsBaseline.ties, ["missing-and-misranked"]);
  assert.deepEqual(result.summary.pairedSelection.candidateVsLexical.losses, ["missing-and-misranked"]);
  assert.equal(result.summary.pairedSelection.shadowVsLexical.cases, 0);
});

test("evaluation distinguishes useful files that no ordering can fit from retrieval omissions", async () => {
  const oversized = structuredClone(cases);
  oversized[0]!.request.optional[1]!.excerpt = "state ".repeat(100);
  const result = await evaluateContext(oversized, provider);
  assert.deepEqual(result.results[0]!.oversizedUsefulCandidates, ["b"]);
  assert.deepEqual(result.results[0]!.omittedCandidates, ["missing"]);
  assert.equal(result.summary.oversizedUsefulCandidates, 1);
  assert.equal(result.results[0]!.candidate.usefulSelected, 0);
});

test("a selected owner file does not imply its decisive lines were delivered", async () => {
  const request = { taskRevision: "span-1", purpose: "state", required: [], maximumBytes: 1000, optionalExcerptBytes: 128,
    optional: [{ id: "owner", sourceDigest: "source-1", excerpt: ["state ".repeat(15), ...Array(15).fill("unrelated implementation"), "decisive condition"].join("\n") }] };
  const spanCases: ContextEvaluationCase[] = [{ id: "excerpt-misses-evidence", request, usefulOptionalIds: ["owner"],
    usefulSpans: [{ candidateId: "owner", sourceDigest: "source-1", firstLine: 17, lastLine: 17 }] }];
  const deterministic: DecisionProvider = { async decide(input) { return { ...await provider.decide(input), delivered: ["owner"], suggested: ["owner"] }; } };
  const truncated = await evaluateContext(spanCases, deterministic);
  assert.equal(truncated.results[0]!.candidate.usefulSelected, 1);
  assert.equal(truncated.results[0]!.candidate.usefulEvidenceSelected, 0);
  assert.equal(truncated.summary.candidateEvidenceMisses, 1);
  delete spanCases[0]!.request.optionalExcerptBytes;
  const whole = await evaluateContext(spanCases, deterministic);
  assert.equal(whole.results[0]!.candidate.usefulEvidenceSelected, 1);
  assert.equal(whole.summary.candidateEvidenceMisses, 0);
  assert.equal(whole.summary.developmentBenefit, "unqualified");
});

test("invalid evidence gold fails before provider calls and absent labels stay unknown", async () => {
  let calls = 0;
  const counted: DecisionProvider = { async decide(input) { calls++; return provider.decide(input); } };
  const invalid = structuredClone(cases);
  invalid[0]!.usefulSpans = [{ candidateId: "b", sourceDigest: "changed", firstLine: 1, lastLine: 1 }];
  await assert.rejects(evaluateContext(invalid, counted), /source identity/);
  assert.equal(calls, 0);
  const unlabeled = await evaluateContext(cases, counted);
  assert.equal(unlabeled.summary.candidateEvidenceMisses, null);
  assert.equal(unlabeled.results[0]!.candidate.usefulEvidenceSelected, null);
});

test("evaluation cancellation skips new advice and refuses late ranking without losing reported usage", async () => {
  const cancelled = new AbortController(); cancelled.abort(); let calls = 0;
  const stopped = await evaluateContext(cases, { async decide(input) { calls++; return provider.decide(input); } }, { signal: cancelled.signal });
  assert.equal(calls, 0); assert.equal(stopped.results[0]!.fallbackReason, "cancelled");
  const active = new AbortController();
  const late = await evaluateContext(cases, { async decide(input, options) {
    assert.equal(options?.signal, active.signal); active.abort();
    return { ...await provider.decide(input), delivered: ["a", "b"] };
  } }, { signal: active.signal });
  assert.equal(late.results[0]!.fallbackReason, "cancelled");
  assert.equal(late.results[0]!.candidate.usefulSelected, late.results[0]!.lexical.usefulSelected);
  assert.equal(late.results[0]!.decision?.method, "baseline");
  assert.equal(late.results[0]!.decision?.suggested, null);
  assert.equal(late.summary.providerInputTokens, 20);
});
