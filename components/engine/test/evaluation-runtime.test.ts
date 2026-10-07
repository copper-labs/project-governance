import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { parseEvaluationRequest, evaluationExitCode, type EvaluationRequest } from "../src/evaluation-schema.ts";
import { ProviderPool } from "../src/decision-admission.ts";
import { decisionProviderAdapter } from "../src/decision-providers.ts";
import { png, pngChunk } from "./fixtures/evaluation-images.ts";

const request = (evaluationId = "one"): EvaluationRequest => ({ version: 1, evaluationId,
  evidence: [{ id: "source", type: "text", text: "The button says Save. Private canary TEXT_MUST_NOT_BE_RETAINED." }],
  questions: [{ name: "matches", type: "predicate", instructions: "Does supplied evidence show a Save button? Private QUESTION_MUST_NOT_BE_RETAINED." }] });
function fixture(t: TestContext, extra: Record<string, unknown> = {}, answer?: (body: Record<string, any>) => unknown) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-runtime-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const declarations = { mode: "auto", allowed_data_classes: ["supplied-evidence"],
    evaluation: { enabled: true, provider: "openai", allowed_artifact_roots: [root], daily_budget: { max_calls: 100, max_request_bytes: 100 * 1024 * 1024 } }, ...extra };
  const settings = profileDecisionSettings({ continuity: { decisions: declarations } });
  let calls = 0, now = Date.parse("2026-10-07T23:59:59Z"); const bodies: any[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    calls++; const body = JSON.parse(String(init!.body)); bodies.push(body);
    return Response.json(answer ? answer(body) : { model: "gpt-6-luna", answers: body.questions.map((item: any) => ({ name: item.name, type: "predicate", probability: 0.9 })),
      usage: { input_tokens: 55, output_tokens: 8, total_tokens: 63, input_tokens_details: { cached_tokens: 11, cache_write_tokens: 4 }, output_tokens_details: { reasoning_tokens: 3 } } });
  };
  const runtime = (configured = settings, receipts = true) => new DecisionRuntime(configured, root, { coordinationRoot: root, token: "SYNTHETIC_CREDENTIAL_CANARY", fetch: fetcher, now: () => now, receipts });
  return { root, settings, declarations, runtime, bodies, calls: () => calls, day: () => { now += 2000; }, fetcher };
}

test("taskless supplied text returns advice, native usage and a descriptor-only original receipt", async t => {
  const f = fixture(t), result = await f.runtime().evaluate(request(), f.root);
  assert.equal(result.status, "complete"); assert.equal(result.effect, "advise"); assert.equal(result.providerCalled, true); assert.equal(evaluationExitCode(result), 0);
  assert.equal(result.provider?.requestedModel, "gpt-6-luna"); assert.equal(result.provider?.returnedModel, "gpt-6-luna"); assert.equal(result.tokenEstimate, null);
  assert.equal(result.association, null); assert.equal("scope" in result, false); assert.equal("consumerId" in result, false); assert.equal("method" in result, false);
  assert.deepEqual(result.usage, { inputTokens: 55, outputTokens: 8, cachedInputTokens: 11, cacheWriteInputTokens: 4, reasoningTokens: 3, totalTokens: 63 });
  assert.equal(result.budget?.calls, 1); assert.ok(result.timing.preparationMs >= 0); assert.ok(result.timing.providerMs >= 0);
  const original = readFileSync(join(f.root, "supplied-evaluations", `${result.receiptId}.json`), "utf8");
  for (const privateText of ["TEXT_MUST_NOT_BE_RETAINED", "QUESTION_MUST_NOT_BE_RETAINED", "SYNTHETIC_CREDENTIAL_CANARY", "input_text"]) assert.equal(original.includes(privateText), false);
  assert.equal(original.includes('"kind":"supplied-evaluation"'), true);
  assert.equal(readFileSync(join(f.root, "decision-budgets.sqlite")).includes(Buffer.from("SYNTHETIC_CREDENTIAL_CANARY")), false);
});
test("disabled/global off, missing disclosure, local-only and missing token send zero requests", async t => {
  for (const [extra, wanted] of [[{ mode: "off" }, "global-off"], [{ evaluation: { enabled: false } }, "evaluation-disabled"],
    [{ allowed_data_classes: ["source", "diagnostic", "metadata", "synthetic"] }, "supplied-evidence-disclosure-disabled"]] as const) {
    const f = fixture(t, extra); assert.equal((await f.runtime().evaluate(request(), f.root)).reason, wanted); assert.equal(f.calls(), 0);
  }
  const f = fixture(t); assert.equal((await f.runtime().evaluate({ ...request(), localOnly: true }, f.root)).reason, "hosted-provider-local-only");
  const missing = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "", fetch: f.fetcher });
  assert.equal((await missing.evaluate(request(), f.root)).reason, "missing-token"); assert.equal(f.calls(), 0);
});
test("JSON schemas reject transport authority, malformed bounds, duplicate IDs and unknown fields", async t => {
  const f = fixture(t);
  for (const raw of [{ ...request(), endpoint: "https://evil" }, { ...request(), provider: "jev" }, { ...request(), credential: "secret" },
    { ...request(), version: 2 }, { ...request(), questions: [request().questions[0], request().questions[0]] },
    { ...request(), evidence: [request().evidence[0], request().evidence[0]] }, { ...request(), questions: [{ name: "score", type: "score", instructions: "Rate", levels: [{ label: "same", description: "a" }, { label: "same", description: "b" }] }] },
    { ...request(), questions: [{ name: "choice", type: "choice", instructions: "Pick", choices: [{ value: "unknown", description: "Reserved" }] }] },
    { ...request(), association: { taskId: "ambient-run-id" } }, { ...request(), localOnly: "yes" }]) {
    const result = await f.runtime().evaluate(raw, f.root); assert.equal(result.status, "invalid"); assert.equal(result.evaluationId, null); assert.equal(result.provider, null);
  }
  assert.equal(f.calls(), 0);
});
test("explicit evaluation allowance may exceed legacy ceilings without enabling registered consumers", () => {
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["supplied-evidence"], evaluation: {
    enabled: true, daily_budget: { max_calls: 10000, max_request_bytes: 1024 * 1024 * 1024 } } } } });
  assert.equal(settings.evaluation.dailyBudget?.maxCalls, 10000); assert.equal(settings.evaluation.dailyBudget?.maxRequestBytes, 1024 ** 3);
  assert.ok(Object.values(settings.consumers).every(item => item.mode === "off"));
  for (const daily of [{ max_calls: 0, max_request_bytes: 10 }, { max_calls: 2, max_request_bytes: Infinity }, { max_calls: 1.5, max_request_bytes: 10 }]) assert.throws(() => profileDecisionSettings({ continuity: { decisions: { evaluation: { enabled: true, daily_budget: daily } } } }));
  assert.throws(() => profileDecisionSettings({ continuity: { decisions: { evaluation: { enabled: true } } } }));
});
test("same evaluation replays across midnight, byte-identical rename retains new local provenance", async t => {
  const f = fixture(t); writeFileSync(join(f.root, "actual.png"), png());
  const input = { ...request(), evidence: [{ id: "actual", type: "image" as const, path: "actual.png", role: "actual" }] };
  const first = await f.runtime().evaluate(input, f.root); assert.equal(first.status, "complete");
  f.day(); renameSync(join(f.root, "actual.png"), join(f.root, "renamed.png"));
  const replay = await f.runtime().evaluate({ ...input, evidence: [{ ...input.evidence[0]!, path: "renamed.png" }] }, f.root);
  assert.equal(replay.reason, "repeated-evaluation"); assert.equal(replay.receiptId, first.receiptId); assert.equal(replay.requestIdentity, first.requestIdentity);
  assert.equal(replay.evidence[0]?.reference, "renamed.png"); assert.equal(replay.budget?.window, "2026-10-07"); assert.equal(f.calls(), 1);
  const next = await f.runtime().evaluate({ ...request("next-day") }, f.root); assert.equal(next.budget?.window, "2026-10-08"); assert.equal(next.budget?.calls, 1);
});
test("same ID rejects changed bytes, roles, questions and provider; new IDs cannot reset daily spending", async t => {
  const f = fixture(t, { evaluation: { enabled: true, provider: "openai", allowed_artifact_roots: [], daily_budget: { max_calls: 1, max_request_bytes: 100 * 1024 * 1024 } } });
  assert.equal((await f.runtime().evaluate(request(), f.root)).status, "complete");
  for (const input of [{ ...request(), evidence: [{ id: "source", type: "text", text: "Changed" }] },
    { ...request(), evidence: [{ ...request().evidence[0]!, role: "reference" }] },
    { ...request(), questions: [{ ...request().questions[0]!, instructions: "Different" }] }]) assert.equal((await f.runtime().evaluate(input, f.root)).reason, "evaluation-identity-conflict");
  const changed = profileDecisionSettings({ continuity: { decisions: { ...f.declarations, evaluation: { ...f.declarations.evaluation as object, provider: "jev", model: "jev-1.13.0" } } } });
  assert.equal((await f.runtime(changed).evaluate(request(), f.root)).reason, "evaluation-identity-conflict");
  assert.equal((await f.runtime(changed).evaluate(request("new-id"), f.root)).reason, "evaluation-daily-budget-exhausted"); assert.equal(f.calls(), 1);
});
test("interrupted receipt storage cannot dispatch again even after midnight or process recreation", async t => {
  const f = fixture(t); const first = await f.runtime(f.settings, false).evaluate(request(), f.root);
  assert.equal(first.receiptId, null); assert.equal(first.providerCalled, true); f.day();
  const replay = await f.runtime().evaluate(request(), f.root);
  assert.equal(replay.reason, "repeated-evaluation-outcome-unavailable"); assert.equal(replay.providerCalled, false); assert.equal(replay.budget?.window, "2026-10-07"); assert.equal(f.calls(), 1);
});
test("current disclosure and roots are rechecked before cached answer delivery", async t => {
  const f = fixture(t); writeFileSync(join(f.root, "actual.png"), png()); const input = { ...request(), evidence: [{ id: "actual", type: "image" as const, path: "actual.png" }] };
  await f.runtime().evaluate(input, f.root);
  const denied = { ...f.settings, legacy: { ...f.settings.legacy, allowedDataClasses: [] } };
  assert.equal((await f.runtime(denied).evaluate(input, f.root)).reason, "supplied-evidence-disclosure-disabled");
  const revokedRoot = profileDecisionSettings({ continuity: { decisions: { ...f.declarations,
    evaluation: { ...f.declarations.evaluation as object, allowed_artifact_roots: [] },
  } } });
  assert.equal((await f.runtime(revokedRoot).evaluate(input, f.root)).reason, "image-root-unapproved");
  const otherRoot = join(f.root, "other"); mkdirSync(otherRoot);
  const changedRoot = profileDecisionSettings({ continuity: { decisions: { ...f.declarations,
    evaluation: { ...f.declarations.evaluation as object, allowed_artifact_roots: [otherRoot] },
  } } });
  assert.equal((await f.runtime(changedRoot).evaluate(input, f.root)).reason, "image-root-unapproved");
  unlinkSync(join(f.root, "actual.png")); assert.equal((await f.runtime().evaluate(input, f.root)).status, "invalid"); assert.equal(f.calls(), 1);
});
test("concurrent duplicate observations reserve only one paid attempt", async t => {
  const f = fixture(t); const values = await Promise.all([f.runtime().evaluate(request(), f.root), f.runtime().evaluate(request(), f.root)]);
  assert.equal(f.calls(), 1); assert.equal(values.filter(value => value.providerCalled).length, 1);
  assert.ok(values.some(value => value.status === "complete")); assert.equal((await f.runtime().evaluate(request(), f.root)).reason, "repeated-evaluation");
});
test("predicate, unknown choice, ordinal score and per-question refusals retain independent answers", async t => {
  const f = fixture(t, {}, body => ({ model: "gpt-6-luna", answers: [
    { name: "matches", type: "predicate", probability: 0.1 },
    { name: "choice", type: "choice", choice: "unknown", probabilities: [{ value: "yes", probability: 0.1 }, { value: "unknown", probability: 0.9 }], confidence: 0.8 },
    { name: "score", type: "score", score: 0.7, probabilities: [{ value: 0, label: "No", probability: 0.3 }, { value: 1, label: "Yes", probability: 0.7 }], confidence: 0.6 },
    { name: "refused", type: "refusal" } ] }));
  const input = { ...request(), questions: [...request().questions,
    { name: "choice", type: "choice" as const, instructions: "Pick supported outcome", choices: [{ value: "yes", description: "Yes" }] },
    { name: "score", type: "score" as const, instructions: "Rate", levels: [{ label: "No", description: "Absent" }, { label: "Yes", description: "Present" }] },
    { name: "refused", type: "predicate" as const, instructions: "Refuse" }] };
  const value = await f.runtime().evaluate(input, f.root); assert.equal(value.status, "complete"); assert.equal(evaluationExitCode(value), 0);
  assert.equal(value.answers.matches?.status, "answered"); assert.equal(value.answers.choice?.status, "unknown"); assert.equal(value.answers.refused?.status, "refused");
  const score = value.answers.score; assert.equal(score?.status, "answered"); if (score?.status === "answered" && score.shape === "score") { assert.equal(score.score, 0.7); assert.equal("expectation" in score, false); }
  assert.equal((await f.runtime().evaluate(input, f.root)).reason, "repeated-evaluation");
});
test("partial malformed answers survive; wrong model/duplicate names invalidate envelope with measured usage", async t => {
  for (const mode of ["partial", "model", "duplicate"] as const) {
    const f = fixture(t, {}, () => ({ model: mode === "model" ? "wrong-model" : "gpt-6-luna", usage: { input_tokens: 12, output_tokens: 4 }, answers: [
      { name: "matches", type: "predicate", probability: 0.8 }, { name: mode === "duplicate" ? "matches" : "second", type: "predicate", probability: 99 }] }));
    const input = { ...request(), questions: [...request().questions, { name: "second", type: "predicate" as const, instructions: "Second" }] };
    const result = await f.runtime().evaluate(input, f.root); assert.equal(result.providerCalled, true); assert.equal(result.usage.inputTokens, 12);
    assert.equal(evaluationExitCode(result), 1); assert.equal(result.status, mode === "partial" ? "partial" : "invalid");
    if (mode === "partial") { assert.equal(result.answers.matches?.status, "answered"); assert.equal(result.answers.second?.status, "invalid"); }
  }
});
test("malformed retained answer cannot be delivered or bypass the durable claim", async t => {
  const f = fixture(t), result = await f.runtime().evaluate(request(), f.root), path = join(f.root, "supplied-evaluations", `${result.receiptId}.json`);
  const receipt = JSON.parse(readFileSync(path, "utf8")); receipt.outcome.answers.matches.probability = 2; writeFileSync(path, JSON.stringify(receipt));
  assert.equal((await f.runtime().evaluate(request(), f.root)).reason, "repeated-evaluation-outcome-unavailable"); assert.equal(f.calls(), 1);
});
test("JEV supplied text has native answers; image admission is unsupported before any file read or call", async t => {
  const f = fixture(t, { evaluation: { enabled: true, provider: "jev", model: "jev-1.13.0", daily_budget: { max_calls: 100, max_request_bytes: 1000000 } } },
    () => ({ model: "jev-1.13.0", answers: { matches: { type: "noul", noul: 0.7 } } }));
  const text = await f.runtime().evaluate(request(), f.root); assert.equal(text.status, "complete"); assert.equal(text.tokenEstimate! > 0, true);
  assert.equal((await f.runtime().evaluate(request(), f.root)).reason, "repeated-evaluation");
  const image = await f.runtime().evaluate({ ...request("image"), evidence: [{ id: "actual", type: "image", path: "missing.png" }] }, f.root);
  assert.equal(image.status, "unsupported"); assert.equal(image.reason, "unsupported-modality"); assert.equal(f.calls(), 1);
});
test("multi-megabyte image is captured fully; serialized expansion/daily byte allowance remain distinct", async t => {
  const f = fixture(t); const original = png(); const large = Buffer.concat([original.subarray(0, 33), pngChunk("tEXt", Buffer.alloc(5 * 1024 * 1024, 65)), original.subarray(33)]);
  writeFileSync(join(f.root, "large.png"), large);
  const result = await f.runtime().evaluate({ ...request(), evidence: [{ id: "actual", type: "image", path: "large.png" }] }, f.root);
  assert.equal(result.status, "complete"); assert.equal(result.evidence[0]?.bytes, large.length); assert.ok(result.timing.transport!.requestBytes > large.length);
  assert.equal(result.tokenEstimate, null); assert.equal(f.calls(), 1);
  const smaller = profileDecisionSettings({ continuity: { decisions: { ...f.declarations, evaluation: { ...f.declarations.evaluation as object, daily_budget: { max_calls: 100, max_request_bytes: 100 } } } } });
  const rejected = await f.runtime(smaller).evaluate(request("byte-exhausted"), f.root); assert.equal(rejected.reason, "evaluation-daily-budget-exhausted"); assert.equal(f.calls(), 1);
});
test("verified existing task association is provenance only and cannot reset evaluation budget", async t => {
  const f = fixture(t), store = new Store(defaultDbPath(f.root)); t.after(() => store.close());
  const task = store.createTask("Existing work", [], { worktree: f.root }), workspace = store.workspace(workContext(f.root).locator, f.root);
  const attempt = store.bind(task.taskId, "fixture-session", workspace, f.root);
  const input = { ...request(), association: { session: "fixture-session", taskId: task.taskId, taskRevision: String(task.version), attemptId: attempt.attemptId } };
  const before = store.exportJson(), result = await f.runtime().evaluate(input, f.root), after = store.exportJson();
  assert.equal(result.status, "complete"); assert.deepEqual(result.association, input.association);
  assert.deepEqual({ ...before, exportedAt: null }, { ...after, exportedAt: null });
  assert.equal((await f.runtime().evaluate({ ...input, evaluationId: "bad", association: { ...input.association, attemptId: "unverified" } }, f.root)).reason, "evaluation-association-unverified");
  assert.equal(f.calls(), 1);
});
test("OpenAI serialized byte pacing remains finite after native token settlement", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-byte-pool-"))), policy = decisionProviderAdapter("openai").policy;
  const pool = new ProviderPool(root, { policy }); t.after(() => { pool.close(); rmSync(root, { recursive: true, force: true }); });
  for (let i = 0; i < 2; i++) { const entry = pool.acquire("fixture", 16 * 1024 * 1024, 100000, 2000); assert.equal(entry.state, "admitted"); if (entry.state === "admitted") { assert.equal(pool.dispatch(entry.id, "fixture", 100000, 2000), true); pool.reportUsage(entry.id, 1); pool.release(entry.id, true); } }
  assert.deepEqual(pool.acquire("fixture", 1, 100000, 2000), { state: "wait", reason: "rate", waitMs: 25 });
  const next = pool.acquire("fixture", 1, 101000, 2000); assert.equal(next.state, "admitted"); if (next.state === "admitted") pool.release(next.id, false);
});

test("taskless cached receipt cannot gain a forged task association", async t => {
  const f = fixture(t), first = await f.runtime().evaluate(request(), f.root), path = join(f.root, "supplied-evaluations", `${first.receiptId}.json`);
  const receipt = JSON.parse(readFileSync(path, "utf8")); receipt.outcome.association = { session: "forged", taskId: "forged", taskRevision: "1", attemptId: "forged" };
  writeFileSync(path, JSON.stringify(receipt));
  const replay = await f.runtime().evaluate(request(), f.root); assert.equal(replay.reason, "repeated-evaluation-outcome-unavailable"); assert.equal(replay.association, null); assert.equal(f.calls(), 1);
});

test("unrelated registered consumer and task-budget edits preserve identical generic replay", async t => {
  const f = fixture(t), first = await f.runtime().evaluate(request(), f.root);
  const unrelated = profileDecisionSettings({ continuity: { decisions: { ...f.declarations,
    config_revision: "unrelated-profile-edit", budget: { max_calls: 50, max_request_bytes: 1024 * 1024 },
    consumers: { DL03: { mode: "auto", questions: ["context.relevance/1"] } }, allowed_source_paths: ["changed-src/**"],
  } } });
  assert.notEqual(unrelated.configDigest, f.settings.configDigest);
  const replay = await f.runtime(unrelated).evaluate(request(), f.root);
  assert.equal(replay.reason, "repeated-evaluation"); assert.equal(replay.status, "complete");
  assert.equal(replay.requestIdentity, first.requestIdentity); assert.equal(replay.provider?.configurationDigest, first.provider?.configurationDigest);
  assert.equal(replay.receiptId, first.receiptId); assert.equal(f.calls(), 1);
});

test("daily allowance increases preserve the paid evaluation and its original receipt", async t => {
  const f = fixture(t), first = await f.runtime().evaluate(request(), f.root);
  const path = join(f.root, "supplied-evaluations", `${first.receiptId}.json`), original = readFileSync(path, "utf8");
  const increased = profileDecisionSettings({ continuity: { decisions: { ...f.declarations,
    evaluation: { ...f.declarations.evaluation as object, daily_budget: { max_calls: 101, max_request_bytes: 200 * 1024 * 1024 } },
  } } });
  const replay = await f.runtime(increased).evaluate(request(), f.root);
  assert.equal(replay.reason, "repeated-evaluation"); assert.equal(replay.requestIdentity, first.requestIdentity);
  assert.equal(replay.receiptId, first.receiptId); assert.equal(replay.budget?.reservationId, first.budget?.reservationId);
  assert.equal(replay.budget?.calls, 1); assert.equal(f.calls(), 1); assert.equal(readFileSync(path, "utf8"), original);
  const next = await f.runtime(increased).evaluate(request("next"), f.root);
  assert.equal(next.status, "complete"); assert.equal(next.budget?.calls, 2); assert.equal(f.calls(), 2);
});

test("admission-only permission and root expansions preserve the exact paid answer", async t => {
  const f = fixture(t), first = await f.runtime().evaluate(request(), f.root);
  const path = join(f.root, "supplied-evaluations", `${first.receiptId}.json`), original = readFileSync(path, "utf8");
  const generic = f.declarations.evaluation as Record<string, unknown>;
  for (const declarations of [
    { ...f.declarations, allowed_data_classes: ["supplied-evidence", "source"] },
    { ...f.declarations, evaluation: { ...generic, allowed_artifact_roots: [f.root, "extra-artifacts"] } },
  ]) {
    const configured = profileDecisionSettings({ continuity: { decisions: declarations } });
    const outcome = await f.runtime(configured).evaluate(request(), f.root);
    assert.equal(outcome.requestIdentity, first.requestIdentity); assert.equal(outcome.reason, "repeated-evaluation");
    assert.equal(outcome.receiptId, first.receiptId); assert.equal(outcome.budget?.calls, 1);
    assert.equal(readFileSync(path, "utf8"), original);
  }
  assert.equal(f.calls(), 1);
});

test("a changed exact model cannot reuse the retained paid answer", async t => {
  const f = fixture(t, { evaluation: { enabled: true, provider: "jev", model: "jev-1.13.0",
    daily_budget: { max_calls: 100, max_request_bytes: 1000000 } } },
    () => ({ model: "jev-1.13.0", answers: { matches: { type: "noul", noul: 0.7 } } }));
  const first = await f.runtime().evaluate(request(), f.root); assert.equal(first.status, "complete");
  const changed = profileDecisionSettings({ continuity: { decisions: { ...f.declarations,
    evaluation: { ...f.declarations.evaluation as object, model: "jev-1.14.0" },
  } } });
  const outcome = await f.runtime(changed).evaluate(request(), f.root);
  assert.equal(outcome.reason, "evaluation-identity-conflict"); assert.notEqual(outcome.requestIdentity, first.requestIdentity);
  assert.equal(outcome.budget?.reservationId, first.budget?.reservationId); assert.equal(outcome.budget?.calls, 1); assert.equal(f.calls(), 1);
});
