import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { configuredDecisionProvider, decisionProviderAdapter } from "../src/decision-providers.ts";
import { prepareDecisionRequest } from "../src/decision-request-preparation.ts";
import { decisionPayload, type DecisionRequest2, type QuestionDefinition } from "../src/decision-schema.ts";
import { profileDecisionSettings, resolveConsumerMode } from "../src/decision-settings.ts";
import { DecisionRuntime, type DecisionAsk } from "../src/decision-runtime.ts";
import { ProviderPool } from "../src/decision-admission.ts";
import { DecisionClient } from "../src/decision-transport.ts";
import { readDecisionOutcome } from "../src/decision-outcome-reader.ts";
import { decisionEvaluationCost } from "../src/release-evaluation-cost.ts";

const definitions: Record<string, QuestionDefinition> = {
  "fixture.boolean/1": { id: "fixture.boolean/1", owner: "DL03", shape: "noul", purpose: "fixture", instructions: "Is the supplied evidence relevant?", baseline: "none", effectCeiling: "advise", metric: "fixture" },
  "fixture.choice/1": { id: "fixture.choice/1", owner: "DL03", shape: "choice", purpose: "fixture", instructions: "Which supplied category applies?", baseline: "none", effectCeiling: "advise", metric: "fixture" },
  "fixture.score/1": { id: "fixture.score/1", owner: "DL03", shape: "score", purpose: "fixture", instructions: "How severe is the supplied issue?", levels: ["Cosmetic", "Workaround", "Blocked"], baseline: "none", effectCeiling: "advise", metric: "fixture" },
};
const request: DecisionRequest2 = {
  schemaVersion: 2, requestId: "fixture", consumerId: "DL03", consumers: ["DL03"], consumerVersion: "1", evidenceLayout: "shared-v1",
  scope: { workspace: "/fixture", taskId: "task", taskRevision: "1" }, subject: { digest: "d", revision: "1", environment: "fixture" },
  evidence: [{ id: "evidence", text: "Export fails in Safari, works in Chrome.", sourceDigest: "digest", provenance: "supplied", trust: "untrusted" }],
  coverage: { captured: 1, omitted: [], unavailable: [], truncated: false, limits: [] },
  questions: [ { name: "predicate", definitionId: "fixture.boolean/1", consumerId: "DL03", evidenceIds: ["evidence"] },
    { name: "choice", definitionId: "fixture.choice/1", consumerId: "DL03", evidenceIds: ["evidence"], candidates: [{ id: "web", description: "Browser defect" }] },
    { name: "score", definitionId: "fixture.score/1", consumerId: "DL03", evidenceIds: ["evidence"] } ],
  eligibilityDigest: null, policyDigest: "policy", configDigest: "config", budget: { deadlineMs: 1000, maxQuestions: 64, maxRequestBytes: 65536, maxCandidates: 65, tokenEstimate: 0, tokenMethod: "fixture" },
};
const response = () => ({ model: "gpt-6-luna", answers: [ { type: "predicate", name: "predicate", probability: 0.9 },
  { type: "choice", name: "choice", choice: "web", confidence: 0.8, probabilities: [{ value: "web", probability: 0.9 }, { value: "unknown", probability: 0.1 }] },
  { type: "score", name: "score", score: 1.1, confidence: 0.55, probabilities: [{ value: 0, label: "Cosmetic", probability: 0.1 }, { value: 1, label: "Workaround", probability: 0.7 }, { value: 2, label: "Blocked", probability: 0.2 }] } ],
  usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 }, output_tokens: 8, output_tokens_details: { reasoning_tokens: 3 }, total_tokens: 108 } });
const decode = (raw: unknown) => decisionProviderAdapter("openai").decode(raw, request, definitions, "gpt-6-luna", "payload");

test("provider codecs retain the exact JEV payload and use the actual OpenAI array contract", () => {
  assert.deepEqual(decisionProviderAdapter("jev").payload(request, definitions, "jev-1.13.0"), decisionPayload(request, definitions, "jev-1.13.0"));
  const payload = decisionProviderAdapter("openai").payload(request, definitions, "gpt-6-luna") as any;
  assert.deepEqual(Object.keys(payload).sort(), ["input", "model", "questions"]);
  assert.equal(payload.questions[0].type, "predicate"); assert.equal(payload.questions[0].name, "predicate");
  assert.deepEqual(payload.questions[1].choices, [{ value: "web", description: "Browser defect" }, { value: "unknown", description: "No supplied candidate is supported by this evidence, or the evidence is insufficient." }]);
  assert.deepEqual(payload.questions[2].levels, [{ label: "Cosmetic", description: "Cosmetic" }, { label: "Workaround", description: "Workaround" }, { label: "Blocked", description: "Blocked" }]);
  const answer = decode(response());
  assert.equal(answer.answers.predicate?.status, "answered"); assert.equal(answer.answers.choice?.status, "answered");
  const score = answer.answers.score; assert.ok(score?.status === "answered" && score.shape === "score");
  assert.equal(score.score, 1.1); assert.equal(Object.hasOwn(score, "expectation"), false); assert.equal(score.native?.score, 1.1);
  assert.deepEqual(answer.usage, { inputTokens: 100, outputTokens: 8, cachedInputTokens: 20, cacheWriteInputTokens: 5, reasoningTokens: 3, totalTokens: 108 });
  const marked = response(); (marked.answers[1]!.probabilities![0] as any).arbitrary = "private-response-marker";
  assert.equal(JSON.stringify(decode(marked)).includes("private-response-marker"), false);
  const jevScore = decisionProviderAdapter("jev").decode({ model: "jev-1.13.0", answers: { score: { type: "score", score: 1.101, confidence: 0.55,
    legend: { "0": "Cosmetic", "1": "Workaround", "2": "Blocked" }, probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 } } } }, request, definitions, "jev-1.13.0", "payload").answers.score;
  assert.ok(jevScore?.status === "answered" && jevScore.shape === "score");
  assert.equal(jevScore.score, 1.1); assert.equal(jevScore.native?.score, 1.101); assert.equal(Object.hasOwn(jevScore, "expectation"), false);
});

test("refusal and malformed question answers preserve valid independent answers", () => {
  const raw = response(); raw.answers[1] = { type: "refusal", name: "choice" } as any;
  raw.answers[2]!.probabilities = [{ value: 0, label: "wrong", probability: 1 }] as any;
  const result = decode(raw); assert.equal(result.answers.predicate?.status, "answered"); assert.equal(result.answers.choice?.status, "refused"); assert.equal(result.answers.score?.status, "invalid");
  for (const bad of [NaN, Infinity, -0.1, 1.1, "0.9"]) {
    const raw = response(); raw.answers[0]!.probability = bad as any; const result = decode(raw);
    assert.equal(result.answers.predicate?.status, "invalid"); assert.equal(result.answers.choice?.status, "answered");
  }
});

test("choice values, complete distributions and weighted score agreement are enforced", () => {
  for (const change of [
    (raw: any) => { raw.answers[1].choice = true; },
    (raw: any) => { raw.answers[1].probabilities[0].value = true; },
    (raw: any) => { raw.answers[1].probabilities[1].value = "web"; },
    (raw: any) => { raw.answers[1].probabilities[0].probability = 0.3; },
  ]) { const raw = response(); change(raw); assert.equal(decode(raw).answers.choice?.status, "invalid"); }
  for (const change of [
    (raw: any) => { raw.answers[2].score = 2; },
    (raw: any) => { raw.answers[2].probabilities[0].value = "0"; },
    (raw: any) => { raw.answers[2].probabilities[1].label = "Other"; },
  ]) { const raw = response(); change(raw); assert.equal(decode(raw).answers.score?.status, "invalid"); }
  const unknown = response(); unknown.answers[1]!.choice = "unknown"; unknown.answers[1]!.probabilities = [{ value: "web", probability: 0.1 }, { value: "unknown", probability: 0.9 }];
  assert.equal(decode(unknown).answers.choice?.status, "unknown");
});

test("wrong model, invented or repeated names invalidate the complete envelope", () => {
  for (const change of [ (raw: any) => { raw.model = "gpt-6-luna-2026-10"; },
    (raw: any) => { raw.answers[0].name = "invented"; }, (raw: any) => { raw.answers.push(raw.answers[0]); } ]) {
    const raw = response(); change(raw); assert.throws(() => decode(raw));
  }
  const missing = response(); missing.answers.shift(); assert.equal(decode(missing).answers.predicate?.status, "invalid");
  assert.deepEqual(decisionProviderAdapter("openai").usage({}), { inputTokens: null, outputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningTokens: null, totalTokens: null });
});

function runtimeFixture(t: any, provider: "jev" | "openai" = "openai", overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "decision-provider-b1-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { provider, model: provider === "jev" ? "jev-1.13.0" : "gpt-6-luna", mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } }, ...overrides } } });
  const ask: DecisionAsk = { consumerId: "DL03", eventId: "event", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subject: { digest: digest("subject"), revision: "1", environment: "fixture" }, evidenceLayout: "shared-v1",
    evidence: [{ id: "source", text: "Relevant code", sourceDigest: digest("code"), trust: "untrusted", provenance: "supplied" }],
    questions: [{ name: "q", consumerId: "DL03", definitionId: "context.relevance/1", evidenceIds: ["source"] }], sourcePaths: ["src/file.ts"],
    coverage: { captured: 1, omitted: [], unavailable: [], truncated: false, limits: [] }, policyDigest: settings.configDigest };
  return { root, settings, ask };
}

test("OpenAI registered decisions remain shadow, retain spending and never change the baseline", async t => {
  const f = runtimeFixture(t); let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { token: "synthetic-marker", coordinationRoot: f.root, fetch: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/decisions"); const payload = JSON.parse(String(init?.body)); assert.equal(payload.questions[0].type, "predicate");
    return Response.json({ model: "gpt-6-luna", answers: [{ name: "q", type: "predicate", probability: 0.99 }], usage: { input_tokens: 30, output_tokens: 2 } }); } });
  const result = await runtime.ask(f.ask); assert.equal(result.version, 3); assert.equal(result.reason, "shadow"); assert.equal(result.mode, "shadow");
  assert.equal(result.method, "baseline"); assert.equal(result.delivered, false); assert.equal(result.providerCalled, true); assert.equal(result.tokenEstimate, null);
  assert.equal(result.usage.inputTokens, 30); assert.equal(result.provider.modelIdentity, "mutable-alias"); assert.equal(result.provider.returnedModel, "gpt-6-luna");
  const replay = await runtime.ask(f.ask); assert.equal(calls, 1); assert.equal(replay.reason, "repeated-observation"); assert.equal(replay.providerCalled, true);
  const receipt = JSON.parse(readFileSync(join(f.root, "decisions", `${result.receiptId}.json`), "utf8")); assert.equal(receipt.version, 3);
  assert.equal(JSON.stringify(receipt).includes("synthetic-marker"), false);
  const cost = decisionEvaluationCost(receipt, { path: "fixture", digest: "fixture" }); assert.equal(cost?.provider, "openai"); assert.equal(cost?.inputTokens, 30);
  const prepared = prepareDecisionRequest(f.ask, f.settings, ["DL03"], "prepare", { maxCalls: 16, maxRequestBytes: 10 * 1024 * 1024 });
  assert.ok(prepared.ok); assert.equal(prepared.request.budget.maxRequestBytes, 10 * 1024 * 1024);
  assert.equal(prepared.request.budget.tokenEstimate, null); assert.equal(prepared.request.budget.tokenMethod, "unavailable");
});

test("unsupported layouts, denied disclosure, missing credentials and global-off make zero dispatches", async t => {
  for (const caseId of ["default", "isolated", "denied", "off", "missing"] as const) {
    const f = runtimeFixture(t, "openai", caseId === "denied" ? { allowed_data_classes: [] } : caseId === "off" ? { mode: "off" } : {}); let calls = 0;
    const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    try {
      const runtime = new DecisionRuntime(f.settings, f.root, { ...(caseId !== "missing" ? { token: "fixture" } : {}), coordinationRoot: f.root, fetch: async () => { calls++; throw new Error("must not dispatch"); } });
      const ask = { ...f.ask }; if (caseId === "default") delete ask.evidenceLayout; if (caseId === "isolated") ask.evidenceLayout = "per-question-v1";
      const result = await runtime.ask(ask); assert.equal(calls, 0, caseId); assert.equal(result.providerCalled, false);
      assert.equal(result.reason, ["default", "isolated"].includes(caseId) ? "unsupported-evidence-layout" : caseId === "denied" ? "data-sharing-disabled" : caseId === "off" ? "global-off" : "missing-token");
    } finally { if (saved !== undefined) process.env.OPENAI_API_KEY = saved; }
  }
});

test("failure usage remains observable and another model cannot reuse or redispatch the event", async t => {
  const f = runtimeFixture(t); let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { token: "fixture", coordinationRoot: f.root, fetch: async () => { calls++; return Response.json({ model: "unknown-snapshot", answers: [], usage: { input_tokens: 19, output_tokens: 1 } }); } });
  const result = await runtime.ask(f.ask); assert.equal(result.reason, "invalid-or-unavailable"); assert.equal(result.providerCalled, true); assert.equal(result.usage.inputTokens, 19);
  const changed = new DecisionRuntime(profileDecisionSettings({ continuity: { decisions: { mode: "auto", provider: "jev", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } } } } }), f.root,
    { token: "fixture", coordinationRoot: f.root, fetch: async () => { calls++; throw new Error("must not redispatch"); } });
  const refused = await changed.ask(f.ask); assert.equal(calls, 1); assert.equal(refused.reason, "repeated-observation-unavailable");
});

test("legacy defaults/config identity remain exact while generic evaluation stays disabled", () => {
  const old = profileDecisionSettings({}); assert.equal(old.provider, "jev"); assert.equal(old.legacy.model, "jev-1.13.0"); assert.equal(old.evaluation.enabled, false);
  const explicit = profileDecisionSettings({ continuity: { decisions: { provider: "jev" } } }); assert.equal(old.configDigest, explicit.configDigest);
  const alternate = profileDecisionSettings({ continuity: { decisions: { provider: "openai", mode: "auto", consumers: { DL03: { mode: "auto", effect: "advise" } } } } });
  assert.equal(alternate.legacy.model, "gpt-6-luna"); assert.equal(resolveConsumerMode(alternate, "DL03").mode, "shadow"); assert.equal(alternate.evaluation.enabled, false);
  assert.throws(() => profileDecisionSettings({ continuity: { decisions: { provider: "openai", model: "gpt-6-luna-next" } } }));
  assert.throws(() => profileDecisionSettings({ continuity: { decisions: { evaluation: { enabled: true } } } }));
});

test("historical projection preserves unknown identity/usage without changing the original", () => {
  const raw = { version: 2, configDigest: "old-config", outcome: { version: 2, method: "jev", model: "jev-1.13.0", usage: { inputTokens: null, outputTokens: 0 } } };
  const before = JSON.stringify(raw), projected = readDecisionOutcome(raw);
  assert.equal(projected.provider.id, "jev"); assert.equal(projected.method, "provider"); assert.equal(projected.provider.requestedModel, null); assert.equal(projected.provider.adapterVersion, null);
  assert.equal(projected.providerCalled, undefined); assert.equal(projected.usage.inputTokens, null); assert.equal(JSON.stringify(raw), before);
  const missingMethod = { version: 2, outcome: { version: 2, delivered: true } };
  assert.throws(() => readDecisionOutcome(missingMethod), /historical-decision-method-invalid/);
  const current = { version: 3, outcome: { version: 3, method: "baseline", provider: configuredDecisionProvider("openai", "gpt-6-luna", "configuration"),
    usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 11 } } };
  assert.throws(() => readDecisionOutcome(current), /decision-usage-subset-invalid/);
});

test("JEV wire bounds do not shrink its original aggregate pacing allowance", t => {
  const root = mkdtempSync(join(tmpdir(), "decision-jev-pacing-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const pool = new ProviderPool(root, { accountScope: "fixture-jev", policy: decisionProviderAdapter("jev").policy }); t.after(() => pool.close());
  for (let index = 0; index < 3; index++) {
    const admitted = pool.acquire("fixture", 65536, 1000, 2000); assert.equal(admitted.state, "admitted");
    if (admitted.state === "admitted") assert.equal(pool.dispatch(admitted.id, "fixture", 1000, 2000), true);
  }
  assert.deepEqual(pool.acquire("fixture", 65536, 1000, 2000), { state: "wait", reason: "rate", waitMs: 25 });
});

test("provider/account partition separates concurrency, rate and cooldown within one pool owner", t => {
  const root = mkdtempSync(join(tmpdir(), "decision-pool-partition-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const policy = { concurrency: 1, requestsPerMinute: 1, estimatedInputTokensPerSecond: null, maxRequestBytes: 16 * 1024 * 1024 };
  const first = new ProviderPool(root, { accountScope: "openai-account-a", policy }), same = new ProviderPool(root, { accountScope: "openai-account-a", policy }),
    account = new ProviderPool(root, { accountScope: "openai-account-b", policy }), other = new ProviderPool(root, { accountScope: "jev-account-a", policy });
  t.after(() => { first.close(); same.close(); account.close(); other.close(); });
  const held = first.acquire("key-a", 200001, 1000, 2000); assert.equal(held.state, "admitted"); assert.equal(same.acquire("key-a", 1, 1000, 2000).state, "wait");
  assert.equal(account.acquire("key-b", 1, 1000, 2000).state, "admitted"); assert.equal(other.acquire("key-a", 1, 1000, 2000).state, "admitted");
  if (held.state === "admitted") first.release(held.id, true); assert.equal(same.acquire("key-a", 1, 1000, 2000).state, "wait");
  first.fail("key-a", 1000, false, 60000, "pool"); assert.equal(same.acquire("key-a", 1, 1000, 2000).state, "suppressed");
  const next = account.acquire("key-b", 1, 61000, 2000); assert.equal(next.state, "admitted");
});

test("transport resolves keys only for its configured adapter and separates provider cooldown", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-transport-provider-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = new DecisionClient({ provider: "openai", token: "synthetic", coordinationRoot: root, fetch: async () => new Response(null, { status: 429 }) });
  const result = await first.ask("{}", 1000); assert.equal(result.ok, false);
  const other = new DecisionClient({ provider: "jev", token: "synthetic", coordinationRoot: root, fetch: async () => Response.json({}) });
  assert.equal((await other.ask("{}", 1000)).ok, true);
  const replacement = new DecisionClient({ provider: "openai", token: "another-account", coordinationRoot: root, fetch: async () => Response.json({}) });
  assert.equal((await replacement.ask("{}", 1000)).ok, true);
});
