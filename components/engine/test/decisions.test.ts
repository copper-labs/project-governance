import { decisionProviderHealthPath } from "../src/decision-transport.ts";
import { canonical, digest } from "../src/core.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { JevDecisionAdapter as SharedAdapter, DEFAULT_DECISIONS, type LegacyDecisionOptions, type DecisionConfig, type DecisionRequest } from "../src/decisions.ts";

let fixtureTask = 0;
// These transport regressions represent distinct tasks; repeated-event reuse has its own test below.
class JevDecisionAdapter extends SharedAdapter {
  constructor(config: DecisionConfig, path: string, options: LegacyDecisionOptions = {}) {
    super(config, path, { scope: { workspace: dirname(path), taskId: `fixture-${++fixtureTask}`, taskRevision: "task@1" }, ...options });
  }
}
const request: DecisionRequest = { version: 1, kind: "rank_optional_context", taskRevision: "task@1", purpose: "find the state machine", dataClass: "synthetic",
  candidates: [{ id: "a", sourceDigest: "fixture-a", excerpt: "Styles" }, { id: "b", sourceDigest: "fixture-b", excerpt: "State transitions" }] };
const config: DecisionConfig = { ...DEFAULT_DECISIONS, mode: "auto", allowedQuestions: ["rank_optional_context"], allowedDataClasses: ["synthetic"] };
function response() { return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { suggestion: { type: "choice", choice: "b", confidence: 0.9, probabilities: { a: 0.05, b: 0.9, unknown: 0.05 } } }, usage: { input_tokens: 200, output_tokens: 20 } })); }
function temporary() { const dir = mkdtempSync(join(tmpdir(), "engine-decision-")); return { path: join(dir, "health.json"), close() { rmSync(dir, { recursive: true }); } }; }

test("off, absent token and unapproved data make zero network calls", async () => {
  const f = temporary(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; return response(); };
  try {
    for (const [settings, token, reason] of [[DEFAULT_DECISIONS, "test", "off"], [config, "", "missing-token"], [{ ...config, allowedDataClasses: [] }, "test", "data-sharing-disabled"]] as const) {
      const result = await new JevDecisionAdapter(settings as DecisionConfig, f.path, { token, fetch: transport }).decide(request);
      assert.equal(result.baselineVersion, "lexical-context-1");
      assert.equal(result.reason, reason); assert.deepEqual(result.delivered, ["b", "a"]);
    }
    assert.equal(calls, 0);
  } finally { f.close(); }
});

test("live-shaped advice ranks supplied IDs and records native usage; shadow preserves baseline", async () => {
  const f = temporary(); let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, "https://api.typesafe.ai/v1/systemone"); assert.equal(init?.redirect, "error");
    const wire = JSON.parse(String(init?.body)); assert.equal(wire.model, "jev-1.13.0");
    return new Response(JSON.stringify({ model: config.model, answers: { suggestion: {
      type: "choice", choice: "a", confidence: 0.9, probabilities: { a: 0.9, b: 0.05, unknown: 0.05 }
    } }, usage: { input_tokens: 200, output_tokens: 20 } }));
  };
  try {
    const live = await new JevDecisionAdapter(config, f.path, { token: "synthetic-test", fetch: transport }).decide(request);
    assert.deepEqual(live.delivered, ["a", "b"]); assert.equal(live.method, "jev");
    assert.deepEqual(live.usage, { inputTokens: 200, outputTokens: 20 });
    const shadow = await new JevDecisionAdapter({ ...config, mode: "shadow" }, f.path, { token: "synthetic-test", fetch: transport }).decide(request);
    assert.deepEqual(shadow.delivered, ["b", "a"]); assert.deepEqual(shadow.suggested, ["a", "b"]);
    assert.equal(shadow.reason, "shadow"); assert.equal(calls, 2);
  } finally { f.close(); }
});

test("abstention and low confidence preserve baseline and usage without suppressing the next decision", async () => {
  for (const choice of ["unknown", "a"]) {
    const f = temporary(); let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      if (calls > 1) return response();
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice, confidence: choice === "unknown" ? 0.95 : 0.1,
        probabilities: choice === "unknown" ? { a: 0.025, b: 0.025, unknown: 0.95 }
          : { a: 0.6, b: 0.3, unknown: 0.1 },
      } }, usage: { input_tokens: 77, output_tokens: 8 } }));
    };
    try {
      const adapter = new JevDecisionAdapter(config, f.path, { token: "synthetic-test", fetch: transport });
      const result = await adapter.decide(request);
      assert.equal(result.reason, "abstention");
      assert.equal(result.method, "baseline");
      assert.deepEqual(result.delivered, ["b", "a"]);
      assert.equal(result.suggested, null);
      assert.deepEqual(result.usage, { inputTokens: 77, outputTokens: 8 });
      assert.equal((await adapter.decide({ ...request, purpose: "a separate subsequent observation" })).method, "jev");
      assert.equal(calls, 2);
    } finally { f.close(); }
  }
});

test("authentication rejection suppresses subsequent invocations until explicit config revision", async () => {
  const f = temporary(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; return new Response("{}", { status: 401 }); };
  try {
    const options = { token: "synthetic-test", fetch: transport };
    assert.equal((await new JevDecisionAdapter(config, f.path, options).decide(request)).reason, "authentication-rejected");
    assert.equal((await new JevDecisionAdapter(config, f.path, options).decide(request)).reason, "authentication-disabled");
    assert.equal(calls, 1);
    await new JevDecisionAdapter({ ...config, revision: "2" }, f.path, options).decide(request);
    assert.equal(calls, 2);
  } finally { f.close(); }
});

test("transient failure has one call and a shared cooldown", async () => {
  const f = temporary(); let calls = 0, now = 1000;
  const transport: typeof fetch = async () => { calls++; return new Response("{}", { status: 429 }); };
  try {
    const options = { token: "synthetic-test", fetch: transport, now: () => now };
    assert.equal((await new JevDecisionAdapter(config, f.path, options).decide(request)).reason, "provider-error");
    assert.equal((await new JevDecisionAdapter(config, f.path, options).decide(request)).reason, "cooldown");
    assert.equal(calls, 1); now += 60_001;
    await new JevDecisionAdapter(config, f.path, options).decide(request); assert.equal(calls, 2);
  } finally { f.close(); }
});

test("invented IDs fail to baseline without losing reported billable usage", async () => {
  const f = temporary();
  const transport: typeof fetch = async () => new Response(JSON.stringify({ model: "jev-1.13.0", answers: { suggestion: { type: "choice", choice: "injected", confidence: 1, probabilities: { injected: 1 } } }, usage: { input_tokens: 77, output_tokens: 8 } }));
  try {
    const result = await new JevDecisionAdapter(config, f.path, { token: "synthetic-test", fetch: transport }).decide(request);
    assert.equal(result.reason, "invalid-or-unavailable"); assert.deepEqual(result.delivered, ["b", "a"]);
    assert.equal(result.usage.inputTokens, 77);
  } finally { f.close(); }
});

test("transport is aborted at deadline and concurrent requests immediately use baseline", async () => {
  const f = temporary(); let calls = 0, aborted = false;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true }));
  };
  try {
    const adapter = new JevDecisionAdapter({ ...config, deadlineMs: 30 }, f.path, { token: "synthetic-test", fetch: transport });
    const first = adapter.decide(request);
    const second = await adapter.decide(request);
    assert.equal(second.reason, "provider-busy-or-health-unavailable");
    assert.equal((await first).reason, "deadline"); assert.equal(aborted, true); assert.equal(calls, 1);
  } finally { f.close(); }
});

test("source class approval also requires explicit matching source paths before network", async () => {
  const f = temporary(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; return response(); };
  const sourceRequest = { ...request, dataClass: "source" as const };
  try {
    for (const allowedSourcePaths of [undefined, []]) {
      const settings = { ...config, allowedDataClasses: ["source" as const], ...(allowedSourcePaths ? { allowedSourcePaths } : {}) };
      const result = await new JevDecisionAdapter(settings, f.path, { token: "fixture", fetch: transport }).decide(sourceRequest);
      assert.equal(result.reason, "source-scope-disabled");
    }
    assert.equal(calls, 0);
    const partial = await new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"], allowedSourcePaths: ["a"] }, f.path,
      { token: "fixture", fetch: async (_url, init) => {
        calls++;
        const wire = JSON.parse(String(init?.body));
        assert.ok(!String(init?.body).includes("State transitions"), "Unapproved source text cannot reach the provider");
        assert.deepEqual(wire.state.coverage, { captured: 1, omitted: 1, unavailable: 0, truncated: true });
        return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
          type: "choice", choice: "a", confidence: 0.9, probabilities: { a: 0.9, unknown: 0.1 },
        } }, usage: { input_tokens: 20, output_tokens: 2 } });
      } }).decide(sourceRequest);
    assert.equal(partial.method, "jev");
    assert.deepEqual(partial.delivered, ["b", "a"], "Unapproved source keeps its baseline slot");
    const partialReceipt = JSON.parse(readFileSync(join(dirname(f.path), "decisions", `${partial.receiptId}.json`), "utf8"));
    assert.deepEqual(partialReceipt.outcome.coverage.omitted, ["b"]);
    assert.match(partialReceipt.outcome.coverage.limits[0], /outside approved classifier scope/);
    assert.equal(calls, 1);
    const result = await new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"], allowedSourcePaths: ["a", "b"] }, f.path,
      { token: "fixture", fetch: transport }).decide(sourceRequest);
    assert.equal(result.method, "jev"); assert.equal(calls, 2);
  } finally { f.close(); }
});

test("broader source approval at one task revision gets a new decision event", async () => {
  const f = temporary(); let calls = 0;
  const sourceRequest: DecisionRequest = { ...request, dataClass: "source", candidates: [
    { id: "src/a.ts", sourceDigest: "source-a", excerpt: "useful source" },
    { id: "Makefile", sourceDigest: "build-file", excerpt: "build target" },
  ] };
  const scope = { workspace: dirname(f.path), taskId: "same-task", taskRevision: sourceRequest.taskRevision };
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    const keys = Object.keys(JSON.parse(String(init?.body)).questions.suggestion.criteria);
    assert.equal(keys.includes("Makefile"), calls === 2);
    return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
      type: "choice", choice: "src/a.ts", confidence: 0.9,
      probabilities: Object.fromEntries(keys.map(key => [key, key === "src/a.ts" ? 0.9 : 0.1 / (keys.length - 1)])),
    } }, usage: { input_tokens: 20, output_tokens: 2 } });
  };
  try {
    const first = await new SharedAdapter({ ...config, allowedDataClasses: ["source"], allowedSourcePaths: ["src/*.ts"] }, f.path,
      { token: "fixture", fetch: transport, scope }).decide(sourceRequest);
    const second = await new SharedAdapter({ ...config, allowedDataClasses: ["source"], allowedSourcePaths: ["src/*.ts", "Makefile"] }, f.path,
      { token: "fixture", fetch: transport, scope }).decide(sourceRequest);
    assert.equal(first.method, "jev"); assert.equal(second.method, "jev");
    assert.equal(calls, 2);
    assert.notEqual(first.receiptId, second.receiptId);
  } finally { f.close(); }
});

test("a candidate above the model count cap keeps bounded JEV advice active", async () => {
  const f = temporary(); let calls = 0;
  const sourceRequest: DecisionRequest = { ...request, dataClass: "source", purpose: "find explicit guidance",
    candidates: [{ id: "docs/explicit.md", sourceDigest: "explicit", excerpt: "Explicit guidance\n" },
      ...Array.from({ length: 16 }, (_, index) => ({ id: `docs/auto-${index}.md`, sourceDigest: `auto-${index}`,
        excerpt: `Automatic reference ${index}\n` }))] };
  try {
    const result = await new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"],
      allowedSourcePaths: ["docs/**"], maxCandidates: 16 }, f.path,
    { token: "fixture", fetch: async (_url, init) => {
      calls++;
      const wire = JSON.parse(String(init?.body));
      const keys = Object.keys(wire.questions.suggestion.criteria);
      assert.equal(keys.length, 17);
      assert.ok(keys.includes("docs/explicit.md"));
      assert.ok(!keys.includes("docs/auto-15.md"));
      assert.deepEqual(wire.state.coverage, { captured: 16, omitted: 1, unavailable: 0, truncated: true });
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: "docs/explicit.md", confidence: 0.9,
        probabilities: Object.fromEntries(keys.map(key => [key, key === "docs/explicit.md" ? 1 : 0])),
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    } }).decide(sourceRequest);
    assert.equal(result.method, "jev"); assert.equal(calls, 1);
    assert.equal(result.delivered.length, 17);
    assert.equal(result.excerptCoverage?.length, 16);
    const receipt = JSON.parse(readFileSync(join(dirname(f.path), "decisions", `${result.receiptId}.json`), "utf8"));
    assert.deepEqual(receipt.outcome.coverage.omitted, ["docs/auto-15.md"]);
    assert.match(receipt.outcome.coverage.limits[0], /beyond classifier count limit 16/);
  } finally { f.close(); }
});

test("the maximum configured candidate count reserves the purpose evidence slot", async () => {
  const f = temporary(); let calls = 0;
  const candidates = Array.from({ length: 64 }, (_, index) => ({ id: `docs/${String(index).padStart(2, "0")}.md`,
    sourceDigest: `source-${index}`, excerpt: `Reference ${index}\n` }));
  try {
    const result = await new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"],
      allowedSourcePaths: ["docs/**"], maxCandidates: 64, evidenceBytes: 32768 }, f.path,
    { token: "fixture", fetch: async (_url, init) => {
      calls++;
      const wire = JSON.parse(String(init?.body));
      const keys = Object.keys(wire.questions.suggestion.criteria);
      assert.equal(keys.length, 64, "63 candidates and unknown fit the question");
      assert.deepEqual(wire.state.coverage, { captured: 63, omitted: 1, unavailable: 0, truncated: true });
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: keys[0], confidence: 0.9,
        probabilities: Object.fromEntries(keys.map(key => [key, key === keys[0] ? 1 : 0])),
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    } }).decide({ ...request, dataClass: "source", candidates });
    assert.equal(result.method, "jev"); assert.equal(calls, 1);
    assert.equal(result.delivered.length, 64);
    const receipt = JSON.parse(readFileSync(join(dirname(f.path), "decisions", `${result.receiptId}.json`), "utf8"));
    assert.deepEqual(receipt.outcome.coverage.omitted, ["docs/63.md"]);
    assert.match(receipt.outcome.coverage.limits[0], /classifier count limit 63/);
  } finally { f.close(); }
});

test("an oversized direct request preserves baseline without incomplete omission accounting", async () => {
  const f = temporary(); let calls = 0;
  try {
    const candidates = Array.from({ length: 257 }, (_, index) => ({ id: `source-${index}`,
      sourceDigest: `digest-${index}`, excerpt: "Reference\n" }));
    const result = await new JevDecisionAdapter(config, f.path, { token: "fixture", fetch: async () => {
      calls++; throw new Error("Unexpected provider call");
    } }).decide({ ...request, candidates });
    assert.equal(result.reason, "input-budget");
    assert.equal(result.delivered.length, 257);
    assert.equal(calls, 0);
  } finally { f.close(); }
});

test("indivisible approved evidence does not disable JEV for its peer", async () => {
  const f = temporary(); let calls = 0;
  const sourceRequest: DecisionRequest = { ...request, dataClass: "source", candidates: [
    { id: "src/long.ts", sourceDigest: "long", excerpt: "x".repeat(1500) },
    { id: "src/good.ts", sourceDigest: "good", excerpt: "Metro owner and recovery\n" },
  ] };
  try {
    const result = await new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"],
      allowedSourcePaths: ["src/*.ts"], evidenceBytes: 600 }, f.path,
    { token: "fixture", fetch: async (_url, init) => {
      calls++;
      const wire = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(wire.questions.suggestion.criteria), ["src/good.ts", "unknown"]);
      assert.deepEqual(wire.state.coverage, { captured: 1, omitted: 1, unavailable: 0, truncated: true });
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: "src/good.ts", confidence: 0.9,
        probabilities: { "src/good.ts": 0.9, unknown: 0.1 },
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    } }).decide(sourceRequest);
    assert.equal(result.method, "jev"); assert.equal(calls, 1);
    assert.deepEqual(result.delivered, ["src/long.ts", "src/good.ts"]);
    assert.equal(result.excerptCoverage?.find(item => item.id === "src/long.ts")?.excerptBytes, 0);
    const receipt = JSON.parse(readFileSync(join(dirname(f.path), "decisions", `${result.receiptId}.json`), "utf8"));
    assert.deepEqual(receipt.outcome.coverage.omitted, ["src/long.ts"]);
    assert.match(receipt.outcome.coverage.limits[0], /without a representable whole-line excerpt/);
  } finally { f.close(); }
});

test("unapproved baseline slots can crowd out approved advice under a tight packet budget", async () => {
  const f = temporary(); let calls = 0;
  const sourceRequest: DecisionRequest = { ...request, purpose: "unmatched purpose", dataClass: "source", candidates: [
    { id: "Makefile", sourceDigest: "build", excerpt: "build target" },
    { id: "src/a.ts", sourceDigest: "a", excerpt: "source A" },
    { id: "src/b.ts", sourceDigest: "b", excerpt: "source B" },
  ] };
  try {
    const adapter = new JevDecisionAdapter({ ...config, allowedDataClasses: ["source"],
      allowedSourcePaths: ["src/*.ts"] }, f.path, { token: "fixture", fetch: async (_url, init) => {
      calls++;
      const keys = Object.keys(JSON.parse(String(init?.body)).questions.suggestion.criteria);
      assert.deepEqual(keys, ["src/a.ts", "src/b.ts", "unknown"]);
      return Response.json({ model: "jev-1.13.0", answers: { suggestion: {
        type: "choice", choice: "src/b.ts", confidence: 0.9,
        probabilities: { "src/a.ts": 0.05, "src/b.ts": 0.9, unknown: 0.05 },
      } }, usage: { input_tokens: 20, output_tokens: 2 } });
    } });
    const packet = await buildContextPacket({ taskRevision: sourceRequest.taskRevision, purpose: sourceRequest.purpose,
      required: [], optional: sourceRequest.candidates,
      maximumBytes: Buffer.byteLength(canonical([sourceRequest.candidates[0]])) + 1 }, adapter);
    assert.equal(calls, 1);
    assert.equal(packet.decision?.method, "jev");
    assert.deepEqual(packet.decision?.delivered, ["Makefile", "src/b.ts", "src/a.ts"]);
    assert.deepEqual(packet.entries.map(entry => entry.id), ["Makefile"]);
    assert.equal(packet.omissionReasons["src/b.ts"], "packet-budget");
  } finally { f.close(); }
});

test("offline lexical context fallback keeps ties stable and leaves other question ordering intact", async () => {
  const f = temporary();
  try {
    const adapter = new JevDecisionAdapter(DEFAULT_DECISIONS, f.path, { token: "", fetch: async () => { throw new Error("Unexpected network"); } });
    const tied = await adapter.decide({ ...request, purpose: "unmatched phrase" });
    assert.deepEqual(tied.delivered, ["a", "b"]);
    const diagnostic = await adapter.decide({ ...request, kind: "rank_diagnostics" });
    assert.deepEqual(diagnostic.delivered, ["a", "b"]);
    assert.equal(diagnostic.method, "baseline");
  } finally { f.close(); }
});

test("provider failures expose bounded stages without copying transport secrets", async () => {
  const transports: Array<[string, typeof fetch]> = [
    ["transport", async () => { throw new Error("private-token-and-response"); }],
    ["response-json", async () => new Response("not JSON: private-token-and-response")],
    ["model-identity", async () => new Response(JSON.stringify({ model: "unexpected" }))],
    ["choice-validation", async () => new Response(JSON.stringify({ model: config.model, answers: {} }))],
  ];
  for (const [stage, transport] of transports) {
    const f = temporary();
    try {
      const result = await new JevDecisionAdapter(config, f.path, { token: "fixture", fetch: transport }).decide(request);
      assert.equal(result.failureStage, stage);
      assert.equal(result.reason, "invalid-or-unavailable");
      assert.deepEqual(result.delivered, ["b", "a"]);
      assert.ok(!JSON.stringify(result).includes("private-token-and-response"));
    } finally { f.close(); }
  }
});

test("caller cancellation returns baseline, aborts transport and does not create outage cooldown", async () => {
  const f = temporary(); let calls = 0, aborted = false;
  let late: ((response: Response) => void) | undefined;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    if (calls > 1) return response();
    return new Promise((resolve, reject) => {
      late = resolve;
      init!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true });
    });
  };
  try {
    const adapter = new JevDecisionAdapter(config, f.path, { token: "fixture", fetch: transport });
    const before = new AbortController(); before.abort();
    assert.equal((await adapter.decide(request, { signal: before.signal })).reason, "cancelled");
    assert.equal(calls, 0);
    const active = new AbortController();
    const pending = adapter.decide(request, { signal: active.signal }); active.abort();
    const cancelled = await pending;
    assert.equal(aborted, true); assert.equal(cancelled.reason, "cancelled"); assert.equal(cancelled.failureStage, undefined);
    assert.equal(cancelled.method, "baseline"); assert.equal(cancelled.suggested, null);
    const snapshot = structuredClone(cancelled); late!(response()); await Promise.resolve();
    assert.deepEqual(cancelled, snapshot);
    assert.equal((await adapter.decide({ ...request, purpose: "a separate subsequent observation" })).method, "jev");
    assert.equal(calls, 2);
  } finally { f.close(); }
});


test("separate processes share rate-limit suppression without retaining credentials", () => {
  const f = temporary();
  try {
    const moduleUrl = new URL("../src/decisions.ts", import.meta.url).href;
    const script = `
      import { JevDecisionAdapter } from ${JSON.stringify(moduleUrl)};
      const config = ${JSON.stringify(config)};
      let calls = 0;
      const result = await new JevDecisionAdapter(config, process.argv[1], {
        token: "never-persist-this-test-token", now: () => 1000, scope: { workspace: ${JSON.stringify(dirname(f.path))}, taskId: String(process.pid), taskRevision: "task@1" },
        fetch: async () => { calls++; return new Response("{}", { status: 429 }); }
      }).decide(${JSON.stringify(request)});
      console.log(JSON.stringify({ reason: result.reason, calls }));
    `;
    const invoke = () => {
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", script, f.path], { encoding: "utf8", timeout: 10_000 });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };
    assert.deepEqual(invoke(), { reason: "provider-error", calls: 1 });
    assert.deepEqual(invoke(), { reason: "cooldown", calls: 0 });
    assert.ok(!readFileSync(decisionProviderHealthPath(join(dirname(f.path), "decision-provider-health.json"), digest({ provider: "jev", model: config.model, revision: config.revision })), "utf8").includes("never-persist-this-test-token"));
  } finally { f.close(); }
});

test("legacy callers need explicit scope, share the new budget and reuse the same event", async () => {
  const f = temporary(); let calls = 0;
  try {
    const fetcher: typeof fetch = async () => { calls++; return response(); };
    const absent = new SharedAdapter(config, f.path, { token: "fixture", fetch: fetcher });
    assert.equal((await absent.decide(request)).reason, "scope-unavailable"); assert.equal(calls, 0);
    const { legacyDecisionSettings } = await import("../src/decision-settings.ts");
    const { DecisionRuntime } = await import("../src/decision-runtime.ts");
    const settings = legacyDecisionSettings(config); settings.budget.maxCalls = 1;
    const scope = { workspace: dirname(f.path), taskId: "shared-task", taskRevision: request.taskRevision };
    const adapter = new SharedAdapter(config, f.path, { token: "fixture", fetch: fetcher, scope, settings });
    assert.equal((await adapter.decide(request)).method, "jev");
    assert.equal((await adapter.decide(request)).method, "jev"); assert.equal(calls, 1);
    const runtime = new DecisionRuntime(settings, dirname(f.path), { token: "fixture", fetch: fetcher });
    const next = await runtime.ask({ consumerId: "DL03", eventId: "separate-new-runtime-event", scope,
      subject: { digest: digest("evidence"), revision: scope.taskRevision, environment: "test" },
      evidence: [{ id: "a", text: "example", sourceDigest: digest("example"), provenance: "captured", trust: "untrusted" }],
      coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
      questions: [{ name: "suggestion", definitionId: "legacy.context-rank/1", consumerId: "DL03", evidenceIds: ["a"], candidates: [{ id: "a", description: "candidate" }] }],
      legacyDataClass: "synthetic", policyDigest: settings.configDigest });
    assert.equal(next.reason, "budget-exhausted"); assert.equal(calls, 1);
  } finally { f.close(); }
});
