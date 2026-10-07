import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { normalizeCheck } from "../src/checker-results.ts";
import { availability, configuration, HoloClient, localEndpoint, minimalDriverEnvironment, strictPoint } from "./fixtures/optional-computer-use/holo.ts";
import { selectedCheck } from "./fixtures/optional-computer-use/command.ts";
import { FixtureRunner, immutableWrite, mappedPoint, type Driver, type ScriptStep } from "./fixtures/optional-computer-use/runner.ts";
import { BrowserFixture, type Scenario, type Fault } from "./fixtures/optional-computer-use/browser.ts";
import { pairedReport, scriptedPoints, trial, type Trial } from "./fixtures/optional-computer-use/scenarios.ts";
import { derivativeProvenance, evaluateFrozenTrial, parseAdvice, prepareDerivative, requestForTrial } from "./fixtures/optional-computer-use/evaluate.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { png } from "./fixtures/evaluation-images.ts";
import { digest } from "./fixtures/optional-computer-use/runner.ts";

const config = { endpoint: "http://127.0.0.1:8080/v1", model: "holo4-27b", revision: "fixture-revision", quantization: "Q4_K_M",
  projectorSha256: "a".repeat(64), modelSha256: "b".repeat(64), runtime: "llama.cpp", runtimeVersion: "fixture-build", deadlineMs: 1000 };
const response = (content = '{"x":250,"y":350}', model = "holo4-27b") => new Response(JSON.stringify({ model, choices: [{ message: { content } }] }));
const root = () => mkdtempSync(join(process.env["OPTIONAL_PILOT_EVIDENCE"] ?? tmpdir(), "optional-pilot-"));
const clean = (path: string) => { if (!process.env["OPTIONAL_PILOT_EVIDENCE"]) rmSync(path, { recursive: true, force: true }); };
const fakePng = (width = 800, height = 600) => { const bytes = Buffer.alloc(24); Buffer.from("89504e470d0a1a0a", "hex").copy(bytes); bytes.write("IHDR", 12); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes; };
function fakeDriver(): Driver & { mutations: number; generation: number; lost: boolean } {
  return { mutations: 0, generation: 0, lost: false,
    async frame() { return { session: "fixture-session", generation: this.generation, width: 800, height: 600, scale: 2, origin: "http://127.0.0.1:5555" }; },
    async screenshot() { return fakePng(1600, 1200); }, async dispatch() { this.mutations++; if (this.lost) throw new Error("lost ack"); },
    async readback() { return { mutations: this.mutations }; }, async close() {},
  };
}
const step: ScriptStep = { id: "submit", target: "Submit synthetic form", action: { kind: "click" }, effectObserved: value =>
  (value as { mutations?: number })?.mutations === 1 };

test("selected absence remains warning/advisory versus required blocking, never empty passing proof", async () => {
  for (const required of [false, true]) for (const reason of ["disabled", "unconfigured", "stopped", "model-incompatible"]) {
    const result = availability("run", required, reason);
    const normalized = normalizeCheck({ stdout: JSON.stringify(result.envelope), stderr: "", exit_code: result.exitCode, termination_reason: "completed" }, ["fixture"]);
    assert.equal(normalized.status, required ? "failed" : "warning"); assert.equal(result.envelope.findings[0]!.coverage, "not-run");
  }
  let calls = 0;
  const disabled = await selectedCheck({ runId: "run", required: false, enabled: false, config: { broken: true }, operation: "readiness", transport: async () => { calls++; return response(); } });
  assert.equal(disabled.envelope.status, "warning"); assert.equal(calls, 0);
  const invalid = await selectedCheck({ runId: "run", required: false, enabled: true, config: { broken: true }, operation: "readiness" });
  assert.equal(invalid.exitCode, 1); assert.equal(invalid.envelope.status, "failed");
});
test("literal loopback admission rejects DNS, redirects, remote hosts, URL shorthand and unknown binding fields", () => {
  assert.equal(localEndpoint("http://[::1]:8080/v1"), "http://[::1]:8080/v1");
  for (const endpoint of ["http://localhost:8080/v1", "http://127.1:8080/v1", "http://2130706433/v1", "http://192.168.0.1/v1", "https://127.0.0.1/v1", "http://user@127.0.0.1/v1", "http://127.0.0.1/v1?q=x"])
    assert.throws(() => localEndpoint(endpoint));
  assert.throws(() => configuration({ ...config, execute: "shell" }));
});
test("passive inspection makes zero calls and readiness proves only served alias, not image/loaded-weight compatibility", async () => {
  let calls = 0; const client = new HoloClient(config, async (_url, init) => { calls++; assert.equal(init.method, "GET"); return new Response(JSON.stringify({ data: [{ id: "holo4-27b" }] })); });
  assert.equal(client.inspect().loadedWeightsVerified, false); assert.equal(calls, 0);
  assert.equal((await client.readiness()).imageSupportVerified, false); assert.equal(calls, 1);
  await assert.rejects(() => new HoloClient(config, async () => new Response('{"data":[]}')).readiness(), /model-incompatible/u);
});
test("grounding payload contains exact inline capture and target only, strict llama wire profile and no oracle or credentials", async () => {
  let request = "";
  const client = new HoloClient(config, async (_url, init) => { request = String(init.body); assert.equal(init.redirect, "error"); return response(); });
  assert.deepEqual(await client.ground(fakePng(), "Submit contact"), { x: 250, y: 350 });
  const body = JSON.parse(request); assert.equal(body.response_format.type, "json_schema"); assert.equal(body.response_format.schema.additionalProperties, false);
  assert.equal(body.chat_template_kwargs.enable_thinking, false); assert.equal(body.temperature, 0);
  assert.equal(body.messages.length, 1); assert.equal(body.messages[0].content[0].image_url.url, "data:image/png;base64," + fakePng().toString("base64"));
  assert.ok(!/oracle|nativeState|OPENAI_API_KEY|fixture-revision|modelSha256/u.test(request));
});
test("strict grounding rejects free text, extra fields, tool calls, wrong alias, fractional/nonfinite and out-of-range points", async () => {
  for (const value of [{ x: -1, y: 5 }, { x: 1001, y: 5 }, { x: .5, y: 5 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1, y: 1, click: true }, [1, 2]]) assert.throws(() => strictPoint(value));
  for (const content of ["Click Submit", '{"x":1,"y":2,"execute":"shell"}', '{"x":1.5,"y":2}']) await assert.rejects(() => new HoloClient(config, async () => response(content)).ground(fakePng(), "Submit"));
  await assert.rejects(() => new HoloClient(config, async () => response(undefined, "other-model")).ground(fakePng(), "Submit"), /model-incompatible/u);
  await assert.rejects(() => new HoloClient(config, async () => new Response('{"model":"holo4-27b","choices":[{"message":{"content":"{\\"x\\":1,\\"y\\":2}","tool_calls":[]}}]}')).ground(fakePng(), "Submit"), /response-invalid/u);
});
test("service failure, redirect, oversized response, timeout and cancellation stay explicit and never retry", async () => {
  for (const fetcher of [async () => new Response("", { status: 302, headers: { Location: "https://example.invalid" } }), async () => new Response("x".repeat(65537)), async () => { throw new Error("service stopped"); }])
    await assert.rejects(() => new HoloClient(config, fetcher).ground(fakePng(), "Submit"));
  let calls = 0;
  const client = new HoloClient({ ...config, deadlineMs: 15 }, async () => { calls++; return new Promise<Response>(() => {}); });
  const fixtureHandle = setTimeout(() => {}, 1000);
  try { await assert.rejects(() => client.ground(fakePng(), "Submit"), /cancelled-or-timeout/u); assert.equal(calls, 1); } finally { clearTimeout(fixtureHandle); }
  const abort = new AbortController(); abort.abort(); await assert.rejects(() => client.ground(fakePng(), "Submit", abort.signal)); assert.equal(calls, 1);
});
test("runner maps exact Retina capture to CSS units and rejects the 1000 boundary without clamping", async () => {
  const path = root(), driver = fakeDriver(), runner = new FixtureRunner("geometry", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 500 }));
  try { const capture = await runner.capture(); assert.deepEqual(mappedPoint(capture, { x: 250, y: 500 }), { x: 200, y: 300 });
    assert.throws(() => mappedPoint(capture, { x: 1000, y: 500 }), /outside-viewport/u);
    assert.deepEqual(mappedPoint(capture, { x: 0, y: 0 }), { x: 0, y: 0 });
  } finally { clean(path); }
});
test("known visible generation changes discard grounding before action and consume the call budget", async () => {
  const path = root(), driver = fakeDriver(); const runner = new FixtureRunner("stale", path, driver, "http://127.0.0.1:5555", { steps: 1, calls: 1, elapsedMs: 2000 }, async () => { driver.generation++; return { x: 250, y: 350 }; });
  try { await assert.rejects(() => runner.step(step), /capture-stale/u); assert.equal(driver.mutations, 0); assert.equal(runner.counts().calls, 1);
    await assert.rejects(() => runner.step(step), /budget-exhausted/u); assert.equal(driver.mutations, 0);
  } finally { clean(path); }
});
test("action intent is flushed first, retention failure dispatches zero times, and an existing intent cannot replay", async () => {
  const path = root(), driver = fakeDriver();
  const runner = new FixtureRunner("retention", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }), (file, bytes) => {
    if (file.includes("intent-")) throw new Error("disk full"); immutableWrite(file, bytes);
  });
  try { await assert.rejects(() => runner.step(step), /disk full/u); assert.equal(driver.mutations, 0);
    const good = new FixtureRunner("durable", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }));
    driver.dispatch = async () => { assert.ok(existsSync(join(good.directory, "intent-submit.json"))); driver.mutations++; };
    await good.step(step); await assert.rejects(() => good.step(step)); assert.equal(driver.mutations, 1);
    assert.throws(() => new FixtureRunner("durable", path, driver, "http://127.0.0.1:5555", { steps: 1, calls: 1, elapsedMs: 2000 }, async () => ({ x: 0, y: 0 })));
  } finally { clean(path); }
});
test("lost acknowledgment after mutation settles by readback without repeated action; unresolved readback prevents further mutation", async () => {
  const path = root(), driver = fakeDriver(); driver.lost = true;
  const runner = new FixtureRunner("lost", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }));
  try { const receipt = await runner.step(step); assert.equal(receipt.status, "observed"); assert.equal(receipt.acknowledgment, "lost"); assert.equal(driver.mutations, 1);
    const other = fakeDriver(); other.readback = async () => { throw new Error("readback unavailable"); };
    const unresolved = new FixtureRunner("unresolved", path, other, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }));
    assert.equal((await unresolved.step(step)).status, "unresolved"); await assert.rejects(() => unresolved.step({ ...step, id: "next" }), /run-unresolved/u); assert.equal(other.mutations, 1);
  } finally { clean(path); }
});
test("never-settling dispatch/readback observes the run deadline and retains unresolved terminal proof without replay", async () => {
  const path = root(), driver = fakeDriver();
  driver.dispatch = async () => { driver.mutations++; return new Promise<void>(() => {}); };
  driver.readback = async () => new Promise<unknown>(() => {});
  const runner = new FixtureRunner("never-settles", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 100 }, async () => ({ x: 250, y: 350 }));
  try { const result = await runner.step(step); assert.equal(result.status, "unresolved"); assert.equal(result.acknowledgment, "lost");
    assert.ok(existsSync(join(runner.directory, "result-submit.json"))); assert.equal(driver.mutations, 1);
    await assert.rejects(() => runner.step({ ...step, id: "repeat" }), /run-unresolved/u); assert.equal(driver.mutations, 1);
  } finally { clean(path); }
});
test("cancellation after dispatch settles readback once; cancellation during final frame validation never dispatches", async () => {
  const path = root(), driver = fakeDriver(), abort = new AbortController();
  driver.dispatch = async () => { driver.mutations++; abort.abort(); };
  const runner = new FixtureRunner("cancel-after", path, driver, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }));
  try { const result = await runner.step(step, abort.signal); assert.equal(result.status, "observed"); assert.equal(driver.mutations, 1);
    const before = fakeDriver(), stop = new AbortController(); let frames = 0; const original = before.frame.bind(before);
    before.frame = async () => { const result = await original(); if (++frames === 3) stop.abort(); return result; };
    const next = new FixtureRunner("cancel-before", path, before, "http://127.0.0.1:5555", { steps: 3, calls: 3, elapsedMs: 2000 }, async () => ({ x: 250, y: 350 }));
    await assert.rejects(() => next.step(step, stop.signal)); assert.equal(before.mutations, 0);
  } finally { clean(path); }
});
test("caller command runs with no optional dependencies or credential forwarding and preserves checker mapping", () => {
  const entry = join(import.meta.dirname, "fixtures/optional-computer-use/command.ts");
  const canary = "SECRET_CANARY_NOT_FOR_DRIVER";
  const env = minimalDriverEnvironment({ PATH: process.env["PATH"], OPENAI_API_KEY: canary, AWS_SECRET_ACCESS_KEY: canary });
  assert.equal(env["OPENAI_API_KEY"], undefined); assert.equal(env["AWS_SECRET_ACCESS_KEY"], undefined);
  for (const required of [false, true]) {
    const result = spawnSync(process.execPath, [entry, "--run-id", "selected", ...(required ? ["--required"] : [])], { env, encoding: "utf8" });
    assert.equal(result.status, required ? 1 : 0); assert.ok(!result.stdout.includes(canary));
    const normalized = normalizeCheck({ stdout: result.stdout, stderr: result.stderr, exit_code: result.status!, termination_reason: "completed" }, [entry]);
    assert.equal(normalized.status, required ? "failed" : "warning");
  }
});
async function suppliedTrial(path: string): Promise<Trial> {
  const driver = fakeDriver(), runner = new FixtureRunner("frozen", path, driver, "http://127.0.0.1:5555", { steps: 2, calls: 2, elapsedMs: 2000 }, async () => ({ x: 1, y: 1 }));
  const { bytes: _bytes, ...capture } = await runner.capture();
  return { version: 1, runId: "frozen", scenario: "form", fault: "false-toast", nativeStatus: "failed", nativeState: { secretOracle: "never-disclose", saved: false },
    wrongTarget: false, duplicateActions: false, receipts: [], checkpoints: [{ id: "after", image: capture, independentLabel: "unlabeled" }], counters: runner.counts(), modelProof: "injected-fixture-only" };
}
test("visual coverage counts every declared checkpoint even when advice/labels are missing and preserves unknown/refusal separately", async () => {
  const path = root();
  try {
    const value = await suppliedTrial(path), original = value.checkpoints[0]!;
    value.checkpoints = ["missing", "unknown", "refused", "answered-unlabeled", "answered-labelled"].map(id => ({ ...original, id }));
    const advice = new Map([[value.runId, [
      { checkpoint: "unknown", status: "unknown" as const, answer: null, receipt: null },
      { checkpoint: "refused", status: "refused" as const, answer: null, receipt: "original" },
      { checkpoint: "answered-unlabeled", status: "answered" as const, answer: true, receipt: "original" },
      { checkpoint: "answered-labelled", status: "answered" as const, answer: true, receipt: "original" },
      { checkpoint: "undeclared", status: "answered" as const, answer: true, receipt: "ignore" },
    ]]]);
    const report = pairedReport([value], advice, new Map([[value.runId + ":answered-labelled", false]]));
    assert.deepEqual(report.visual, { requested: 5, answered: 2, unknown: 1, refused: 1, unavailable: 1, missingAdvice: 1,
      labelled: 1, labelledAnswered: 1, unlabeled: 4, falsePasses: 1, falseAlarms: 0, accuracyQualified: false });
    assert.equal(report.trials[0]!.nativeStatus, "failed");
    const entirelyMissing = pairedReport([value], new Map(), new Map());
    assert.equal(entirelyMissing.visual.requested, 5); assert.equal(entirelyMissing.visual.unavailable, 5); assert.equal(entirelyMissing.visual.unlabeled, 5);
  } finally { clean(path); }
});
for (const phase of ["readback", "reload"] as const) for (const failure of ["stalled", "cancelled"] as const)
  test(`final ${phase} ${failure} is bounded by the existing run owner and retains unresolved trial without replay`, async () => {
    const path = root(), driver = fakeDriver(), abort = new AbortController(); let reads = 0, reloads = 0;
    const scenario: Scenario = phase === "readback" ? "canvas" : "settings";
    const finalRead = phase === "readback" ? 2 : 4;
    driver.readback = async () => {
      reads++;
      if (phase === "readback" && reads === finalRead) { if (failure === "cancelled") abort.abort(); return new Promise<unknown>(() => {}); }
      return { target: "right", focused: "menu", selected: true, toast: "Preferences saved" };
    };
    const fixture = { scenario, fault: "good" as const, readback: driver.readback.bind(driver), reload: async () => {
      reloads++; if (failure === "cancelled") abort.abort(); return new Promise<void>(() => {});
    } };
    const runner = new FixtureRunner(`final-${phase}-${failure}`, path, driver, "http://127.0.0.1:5555", { steps: 4, calls: 4, elapsedMs: 1000 }, async () => ({ x: 250, y: 350 }));
    try {
      const result = await trial(runner, fixture, abort.signal);
      assert.equal(result.nativeStatus, "unresolved"); assert.ok(result.finalObservationReason);
      assert.ok(result.counters.elapsedMs < 2000); assert.equal(result.receipts.length, phase === "readback" ? 1 : 3);
      assert.equal(driver.mutations, phase === "readback" ? 1 : 3); assert.equal(reloads, phase === "reload" ? 1 : 0);
      assert.ok(!result.checkpoints.some(checkpoint => checkpoint.id === "after"));
      assert.ok(existsSync(join(runner.directory, "trial.json")));
    } finally { clean(path); }
  });
test("paired evaluation sends only frozen source-bound captures/questions, never native oracle or truth labels", async () => {
  const path = root();
  try { const value = await suppliedTrial(path), request = requestForTrial(value, path, "evaluate-frozen");
    assert.equal(request.evidence[0]!.path, "frozen/capture-1.png"); assert.ok(!JSON.stringify(request).includes("never-disclose"));
    assert.ok(!JSON.stringify(request).includes("false-toast")); assert.ok(!JSON.stringify(request).includes("independentLabel"));
    assert.equal(value.nativeStatus, "failed"); assert.throws(() => requestForTrial(value, import.meta.dirname, "other"), /capture-provenance/u);
  } finally { clean(path); }
});
test("actual evaluator capture and cached replay of replaced bytes remain unavailable to the original retained checkpoint", async () => {
  const path = root(); let calls = 0;
  try {
    const value = await suppliedTrial(path), checkpoint = value.checkpoints[0]!;
    const original = png(), replacement = png(98);
    writeFileSync(checkpoint.image.path, original); checkpoint.image.digest = digest(original);
    checkpoint.image.pixelWidth = checkpoint.image.width = 2; checkpoint.image.pixelHeight = checkpoint.image.height = 3; checkpoint.image.scale = 1;
    const request = requestForTrial(value, path, "capture-race"), settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["supplied-evidence"],
      evaluation: { enabled: true, provider: "openai", allowed_artifact_roots: [path], daily_budget: { max_calls: 10, max_request_bytes: 1024 * 1024 } } } } });
    const runtime = new DecisionRuntime(settings, join(path, "state"), { coordinationRoot: path, token: "SYNTHETIC_CALLER_PROOF", fetch: async (_url, init) => {
      calls++; const body = JSON.parse(String(init?.body)) as { questions: Array<{ name: string; choices: Array<{ value: string }> }> };
      return Response.json({ model: "gpt-6-luna", answers: body.questions.map(question => ({ name: question.name, type: "choice", choice: "criterion-met", confidence: 1,
        probabilities: question.choices.map(choice => ({ value: choice.value, probability: choice.value === "criterion-met" ? 1 : 0 })) })) });
    } });
    writeFileSync(checkpoint.image.path, replacement);
    const captured = await runtime.evaluate(request, path);
    assert.equal(captured.status, "complete"); assert.equal(captured.evidence[0]!.digest, "sha256:" + digest(replacement));
    assert.equal(captured.answers["checkpoint-after"]?.status, "answered");
    assert.equal(parseAdvice(request, JSON.stringify(captured), value.checkpoints)[0]!.status, "unavailable");
    assert.equal(value.nativeStatus, "failed");
    const replay = await runtime.evaluate(request, path);
    assert.equal(replay.reason, "repeated-evaluation"); assert.equal(replay.receiptId, captured.receiptId); assert.equal(calls, 1);
    assert.equal(parseAdvice(request, JSON.stringify(replay), value.checkpoints)[0]!.status, "unavailable");
    writeFileSync(checkpoint.image.path, original);
    const restored = await runtime.evaluate(request, path);
    assert.equal(restored.reason, "evaluation-identity-conflict"); assert.equal(calls, 1);
    assert.equal(parseAdvice(request, JSON.stringify(restored), value.checkpoints)[0]!.status, "unavailable");
    const matchingRequest = requestForTrial(value, path, "matching-original"), matching = await runtime.evaluate(matchingRequest, path);
    assert.equal(parseAdvice(matchingRequest, JSON.stringify(matching), value.checkpoints)[0]!.answer, true); assert.equal(calls, 2);
    assert.equal(value.nativeStatus, "failed");
  } finally { clean(path); }
});
test("caller evidence descriptors require one matching image ID/digest while valid answer siblings remain usable", async () => {
  const path = root();
  try {
    const value = await suppliedTrial(path), original = value.checkpoints[0]!;
    value.checkpoints.push({ ...original, id: "before" });
    const request = requestForTrial(value, path, "descriptor-links"), matching = { id: "after", type: "image", digest: "sha256:" + original.image.digest };
    for (const evidence of [undefined, [], [{ ...matching, id: "wrong" }], [{ ...matching, type: "text" }], [{ ...matching, digest: "sha256:" + "f".repeat(64) }],
      [matching, matching], [matching, { ...matching, digest: "sha256:" + "f".repeat(64) }]]) {
      const stdout = JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: request.evaluationId, status: "complete", receiptId: "original-receipt", evidence,
        answers: { "checkpoint-after": { status: "answered", shape: "choice", choice: "criterion-met" } } });
      const advice = parseAdvice(request, stdout, value.checkpoints);
      assert.equal(advice[0]!.status, "unavailable"); assert.equal(advice[0]!.answer, null); assert.equal(value.nativeStatus, "failed");
    }
    const sibling = parseAdvice(request, JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: request.evaluationId, status: "partial", receiptId: "original-receipt",
      evidence: [{ ...matching, digest: "sha256:" + "f".repeat(64) }, { ...matching, id: "before" }],
      answers: { "checkpoint-after": { status: "answered", shape: "choice", choice: "criterion-met" }, "checkpoint-before": { status: "answered", shape: "choice", choice: "criterion-met" } } }), value.checkpoints);
    assert.equal(sibling[0]!.status, "unavailable"); assert.equal(sibling[1]!.status, "answered"); assert.equal(sibling[1]!.receipt, "original-receipt");
    assert.equal(value.nativeStatus, "failed");
  } finally { clean(path); }
});
test("valid answers survive nonzero evaluator exit and refusal/unknown/missing envelopes stay separate from native outcome", async () => {
  const path = root();
  try { const value = await suppliedTrial(path), request = requestForTrial(value, path, "evaluate-frozen");
    for (const status of ["complete", "partial", "unavailable"]) {
      const parsed = parseAdvice(request, JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: request.evaluationId, status,
        receiptId: "original-receipt", evidence: [{ id: "after", type: "image", digest: "sha256:" + value.checkpoints[0]!.image.digest }],
        answers: { "checkpoint-after": { status: "answered", shape: "choice", choice: "criterion-met" } } }), value.checkpoints);
      assert.equal(parsed[0]!.answer, true); assert.equal(value.nativeStatus, "failed");
    }
    for (const status of ["refused", "unknown"]) assert.equal(parseAdvice(request, JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: request.evaluationId,
      status: "partial", evidence: [{ id: "after", type: "image", digest: "sha256:" + value.checkpoints[0]!.image.digest }],
      answers: { "checkpoint-after": { status } } }), value.checkpoints)[0]!.status, status);
    for (const bad of ["", "not JSON", '{"version":3}', JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: "wrong", status: "complete", answers: {} })])
      assert.equal(parseAdvice(request, bad, value.checkpoints)[0]!.status, "unavailable");
  } finally { clean(path); }
});
test("separate evaluator alone receives explicit credential; local-only/missing declaration do not forward it or rewrite native result", async () => {
  const path = root(); let invocation = 0;
  try { const value = await suppliedTrial(path);
    for (const localOnly of [false, true]) for (const declared of [false, true]) {
      const result = evaluateFrozenTrial(value, { workspace: path, evaluationId: `evaluation-${invocation}`, requestFile: join(path, `request-${invocation++}.json`),
        node: process.execPath, cli: "/caller/installed/cli.js", declaredCredentialEnv: declared ? ["OPENAI_API_KEY"] : [],
        env: { OPENAI_API_KEY: "SECRET_CANARY_NOT_FOR_DRIVER", AWS_SECRET_ACCESS_KEY: "never-forward", NODE_OPTIONS: "never-forward" }, deadlineMs: 45000, localOnly,
        invoke: (argv, env) => { assert.ok(!argv.join(" ").includes("SECRET_CANARY"));
          assert.equal(env["OPENAI_API_KEY"], !localOnly && declared ? "SECRET_CANARY_NOT_FOR_DRIVER" : undefined);
          assert.equal(env["AWS_SECRET_ACCESS_KEY"], undefined); assert.equal(env["NODE_OPTIONS"], undefined);
          return { exitCode: 1, stdout: JSON.stringify({ version: 3, kind: "supplied-evaluation", evaluationId: `evaluation-${invocation - 1}`, status: "partial", receiptId: "retained-native-receipt",
            evidence: [{ id: "after", type: "image", digest: "sha256:" + value.checkpoints[0]!.image.digest }],
            answers: { "checkpoint-after": { status: "answered", shape: "choice", choice: "criterion-met" } } }) }; } });
      assert.equal(result.exitCode, 1); assert.equal(result.advice[0]!.answer, true); assert.equal(value.nativeStatus, "failed");
      assert.ok(!readFileSync(join(path, `request-${invocation - 1}.json`), "utf8").includes("SECRET_CANARY"));
    }
    const unavailable = evaluateFrozenTrial(value, { workspace: path, evaluationId: "lost-envelope", requestFile: join(path, "request-lost.json"), node: process.execPath,
      cli: "/caller/installed/cli.js", declaredCredentialEnv: [], env: {}, deadlineMs: 45000, invoke: () => { throw new Error("cancelled"); } });
    assert.equal(unavailable.advice[0]!.status, "unavailable");
  } finally { clean(path); }
});
test("preparation forbids upscaling/distortion and crop claims outside the declared region; bytes alone never imply token savings", () => {
  const original = { digest: "a".repeat(64), width: 800, height: 600 }, whole = { x: 0, y: 0, width: 800, height: 600 };
  const metadata = derivativeProvenance(original, fakePng(400, 300), { kind: "resize", width: 400, height: 300 }, whole);
  assert.equal(metadata.controlCaptureChanged, false); assert.equal(metadata.tokenSavings, null);
  assert.throws(() => derivativeProvenance(original, fakePng(), { kind: "resize", width: 900, height: 600 }, whole));
  assert.throws(() => derivativeProvenance(original, fakePng(), { kind: "resize", width: 400, height: 100 }, whole), /aspect/u);
  assert.throws(() => derivativeProvenance(original, fakePng(), { kind: "crop", x: 0, y: 0, width: 400, height: 300 }, whole), /outside-crop/u);
});

const modulePath = process.env["OPTIONAL_PILOT_PLAYWRIGHT"], executablePath = process.env["OPTIONAL_PILOT_CHROMIUM"];
const browserOptions = { skip: !modulePath || !executablePath };
async function browserTrial(scenario: Scenario, fault: Fault, options: { wrongPoint?: boolean; lostAck?: boolean; scale?: number } = {}): Promise<{ result: Trial; path: string }> {
  const path = root(), fixture = await BrowserFixture.open({ modulePath: modulePath!, executablePath: executablePath!, scenario, fault,
    scale: options.scale ?? 1, env: { ...process.env, OPENAI_API_KEY: "SECRET_CANARY_NOT_FOR_DRIVER" } });
  let index = 0; const points = scriptedPoints[scenario];
  const runner = new FixtureRunner("trial", path, fixture, fixture.origin, { steps: 8, calls: 10, elapsedMs: 15000 }, async () => {
    if (options.lostAck && index === points.length - 1) fixture.loseNextAck = true;
    return options.wrongPoint ? { x: 250, y: 275 } : points[index++]!;
  });
  try { const result = await trial(runner, fixture); return { result, path }; }
  catch (error) { clean(path); throw error; } finally { await runner.close(); }
}
for (const scenario of ["form", "settings", "canvas"] as const) test(`real browser ${scenario} good path, frozen screenshots and native state remain independent`, browserOptions, async () => {
  const { result, path } = await browserTrial(scenario, "good", { scale: 2 });
  try { assert.equal(result.nativeStatus, "passed"); assert.equal(result.duplicateActions, false); assert.ok(result.checkpoints.length >= 2);
    for (const checkpoint of result.checkpoints) { assert.equal(checkpoint.independentLabel, "unlabeled"); assert.ok(readFileSync(checkpoint.image.path).length > 24); }
    for (const name of readdirSync(join(path, "trial"))) assert.ok(!readFileSync(join(path, "trial", name)).includes(Buffer.from("SECRET_CANARY_NOT_FOR_DRIVER")));
  } finally { clean(path); }
});
for (const [scenario, fault, expected] of [["form", "false-toast", "failed"], ["form", "wrong-value", "failed"], ["form", "missing-error", "passed"],
  ["settings", "reverts", "failed"], ["settings", "overlay", "unresolved"], ["settings", "clipped-label", "passed"], ["canvas", "missing-feedback", "passed"]] as const)
  test(`real browser ${scenario}/${fault} retains ${expected} native outcome independently of visual advice`, browserOptions, async () => {
    const { result, path } = await browserTrial(scenario, fault);
    try { assert.equal(result.nativeStatus, expected);
      const advice = new Map([[result.runId, [{ checkpoint: "after", status: "answered" as const, answer: true, receipt: "fixture-advice" }]]]);
      const report = pairedReport([result], advice, new Map([[result.runId + ":after", false]]));
      assert.equal(report.trials[0]!.nativeStatus, expected); assert.equal(report.visual.falsePasses, result.checkpoints.some(checkpoint => checkpoint.id === "after") ? 1 : 0);
      assert.equal(report.visual.requested, result.checkpoints.length); assert.equal(report.cost.totalCost, null);
    } finally { clean(path); }
  });
test("real browser lost acknowledgment after submission cannot duplicate a saved record", browserOptions, async () => {
  const { result, path } = await browserTrial("form", "good", { lostAck: true });
  try { assert.equal(result.nativeStatus, "passed"); assert.equal(result.receipts.at(-1)!.acknowledgment, "lost"); assert.equal((result.nativeState as { submits: number }).submits, 1); }
  finally { clean(path); }
});
test("real browser wrong canvas target fails native truth even if visual advice approves", browserOptions, async () => {
  const { result, path } = await browserTrial("canvas", "good", { wrongPoint: true });
  try { assert.equal(result.nativeStatus, "failed"); assert.equal(result.wrongTarget, true); } finally { clean(path); }
});
test("real browser declared render mutation invalidates token and other origins are blocked", browserOptions, async () => {
  const path = root(), fixture = await BrowserFixture.open({ modulePath: modulePath!, executablePath: executablePath!, scenario: "form" });
  const runner = new FixtureRunner("stale-browser", path, fixture, fixture.origin, { steps: 2, calls: 2, elapsedMs: 5000 }, async () => { await fixture.changedVisibleFixture(); return { x: 250, y: 350 }; });
  try { await assert.rejects(() => runner.step(step), /capture-stale/u); assert.equal((await fixture.readback()).submits, 0);
    await fixture.blockedNavigation(); assert.ok(fixture.blockedRequests > 0);
  } finally { await runner.close(); clean(path); }
});
test("real frozen PNG preparation retains original geometry/hash while derived image has declared dimensions", { skip: !modulePath || !executablePath || !process.env["OPTIONAL_PILOT_SHARP"] }, async () => {
  const { result, path } = await browserTrial("canvas", "good");
  try { const capture = result.checkpoints[0]!.image, original = readFileSync(capture.path);
    const provenance = await prepareDerivative(capture, { modulePath: process.env["OPTIONAL_PILOT_SHARP"]!, outputPath: join(path, "half-size.png"),
      transform: { kind: "resize", width: 400, height: 300 }, criterionRegion: { x: 0, y: 0, width: 800, height: 600 } });
    assert.equal(provenance.originalSha256, capture.digest); assert.notEqual(provenance.derivedSha256, capture.digest);
    assert.deepEqual(readFileSync(capture.path), original); assert.equal(readFileSync(join(path, "half-size.png")).readUInt32BE(16), 400);
    const frame = capture; assert.equal(frame.width, 800); assert.equal(frame.pixelWidth, 800);
  } finally { clean(path); }
});
test("real browser scroll is fixed script-owned action at the grounded viewport point and observed without model tools", browserOptions, async () => {
  const path = root(), fixture = await BrowserFixture.open({ modulePath: modulePath!, executablePath: executablePath!, scenario: "form" });
  await fixture.makeScrollable();
  const runner = new FixtureRunner("scroll", path, fixture, fixture.origin, { steps: 1, calls: 1, elapsedMs: 5000 }, async () => ({ x: 500, y: 500 }));
  try { const result = await runner.step({ id: "scroll-down", target: "The form viewport", action: { kind: "scroll", deltaY: 250 },
    effectObserved: value => Number((value as { scrollY?: number }).scrollY) > 0 }); assert.equal(result.status, "observed"); assert.equal(runner.counts().steps, 1);
  } finally { await runner.close(); clean(path); }
});
test("same-origin navigation changes capture session identity even when viewport and document generation reset identically", browserOptions, async () => {
  const path = root(), fixture = await BrowserFixture.open({ modulePath: modulePath!, executablePath: executablePath!, scenario: "canvas" });
  const runner = new FixtureRunner("navigation", path, fixture, fixture.origin, { steps: 1, calls: 1, elapsedMs: 5000 }, async () => { await fixture.reload(); return { x: 625, y: 275 }; });
  try { await assert.rejects(() => runner.step({ id: "after-navigation", target: "Right control", action: { kind: "click" }, effectObserved: () => true }), /capture-stale/u);
    assert.equal((await fixture.readback()).target, null);
  } finally { await runner.close(); clean(path); }
});
