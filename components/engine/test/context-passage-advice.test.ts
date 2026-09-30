import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { extractSourceFacts } from "../src/context-source-facts.ts";
import { contextExcerpt, contextSourceClusters } from "../src/context-excerpts.ts";
import { selectContextPassages } from "../src/context-passage-advice.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";
import { wirePassageEvidence } from "./fixtures/context-wire.ts";
import { contextBudgetScope, reserveDecisionCall } from "../src/decision-budget.ts";

test("source excerpts carry the assertion and launch outcome, not only the matching label", () => {
  const body = ["test('selected simulator launches the app', async () => {\n", "  const result = await launch('SIM-1');\n",
    "  assert.equal(result.status, 'running');\n", "});\n"].join("");
  const source = "// unrelated setup\n".repeat(240) + body + "// unrelated tail\n".repeat(240);
  const path = "tests/launch.test.js", facts = extractSourceFacts(path, Buffer.from(source));
  const excerpt = contextExcerpt({ id: path, sourceDigest: facts.digest, excerpt: source }, "Does the selected simulator launch the app?", 1024, facts.spans);
  assert.match(excerpt.excerpt, /assert\.equal\(result\.status, 'running'\)/);
  assert.equal(excerpt.sourceUnits?.[0]?.complete, true);
  assert.equal(excerpt.sourceUnits?.[0]?.kind, "literal-test-label");
});

test("passage judgments keep complementary evidence ahead of a second similar source", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "passage-advice-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["src/**", "tests/**"], consumers: { DL03: { mode: "auto",
      questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    calls++;
    const wire = JSON.parse(String(init?.body));
    assert.ok(Object.keys(wire.questions).every(name => name.startsWith("evidence-")), "literal source roles need no paid role question");
    const answers = Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw);
      const isTest = item.path.startsWith("tests/");
      if (name.startsWith("evidence-")) return [name, { type: "noul", noul: isTest ? 0.9 : item.path.endsWith("a.js") ? 0.99 : 0.98 }];
      const role = isTest ? "test" : "implementation";
      return [name, { type: "choice", choice: role, confidence: 0.9,
        probabilities: { implementation: role === "implementation" ? 0.9 : 0, test: role === "test" ? 0.9 : 0,
          documentation: 0, operations: 0, other: 0, unknown: 0.1 } }];
    }));
    return Response.json({ model: settings.legacy.model, answers });
  } });
  const candidates = ["src/a.js", "src/b.js", "tests/check.test.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: launch and verify selected simulator\n` }));
  const advice = await selectContextPassages(runtime, candidates, { purpose: "How does the selected simulator launch and how is it tested?",
    scope: { workspace: root, taskId: "task", taskRevision: "1" }, subjectDigest: digest("subject"), revision: "1",
    environment: "explicit", invocationId: "a".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 3072 });
  assert.equal(advice.reason, "answered"); assert.equal(advice.assessed.length, 3); assert.equal(calls, 1);
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "selected simulator launch test", required: [], optional: candidates,
    maximumBytes: 450, optionalExcerptBytes: 3072, passageJudgments: advice.judgments }, { async decide(request) {
    return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: candidates.map(item => item.id), suggested: null,
      method: "baseline", reason: "fixture", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
      usage: { inputTokens: null, outputTokens: null } };
  } });
  assert.deepEqual(packet.entries.map(item => item.id), ["src/a.js", "tests/check.test.js"]);
  assert.equal(packet.omissionReasons["src/b.js"], "packet-budget");
});

test("confirmed body evidence ranks quotes above metadata while explicit pins and equal-score ties stay stable", async () => {
  const candidates = ["src/entry.js", "src/detail.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: implementation\n` }));
  const input = { taskRevision: "1", purpose: "implementation", required: [], optional: candidates,
    maximumBytes: 240, optionalExcerptBytes: 1024, passageJudgments: Object.fromEntries(candidates.map((item, index) => [item.id,
      { sourceDigest: item.sourceDigest, excerptDigest: digest(item.excerpt), probability: index ? 0.87 : 0.75,
        interpretation: "positive" as const, role: "implementation", roleSource: "path" as const, preferredSpans: [] }])) };
  const provider = { async decide(request: any) { return { version: 1 as const, kind: request.kind, inputDigest: digest(request),
      delivered: candidates.map(item => item.id), suggested: null, method: "baseline" as const, reason: "metadata",
      model: null, questionVersion: "fixture", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } }; } };
  const packet = await buildContextPacket(input, provider);
  assert.deepEqual(packet.entries.map(item => item.id), ["src/detail.js"]);
  assert.equal(packet.omissionReasons["src/entry.js"], "packet-budget");
  assert.deepEqual(packet.judgmentLimitations, {});
  const pinned = await buildContextPacket({ ...input, priorityIds: ["src/entry.js"] }, provider);
  assert.deepEqual(pinned.entries.map(item => item.id), ["src/entry.js"]);
  input.passageJudgments["src/detail.js"]!.probability = 0.75;
  assert.deepEqual((await buildContextPacket(input, provider)).entries.map(item => item.id), ["src/entry.js"]);
});

test("confirmed optional evidence precedes unassessed background unless the operator pins that background", async () => {
  const candidates = ["src/entry.js", "src/detail.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: implementation\n` }));
  const second = candidates[1]!;
  const input = { taskRevision: "1", purpose: "implementation", required: [], optional: candidates,
    maximumBytes: 240, optionalExcerptBytes: 1024, passageJudgments: { [second.id]: {
      sourceDigest: second.sourceDigest, excerptDigest: digest(second.excerpt), probability: 0.94,
      interpretation: "positive" as const, role: "implementation", roleSource: "path" as const, preferredSpans: [] } } };
  const provider = { async decide(request: any) { return { version: 1 as const, kind: request.kind, inputDigest: digest(request),
      delivered: candidates.map(item => item.id), suggested: null, method: "baseline" as const, reason: "metadata",
      model: null, questionVersion: "fixture", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } }; } };
  const packet = await buildContextPacket(input, provider);
  assert.deepEqual(packet.entries.map(item => item.id), ["src/detail.js"]);
  assert.equal(packet.omissionReasons["src/entry.js"], "packet-budget");
  assert.deepEqual(packet.judgmentLimitations, {});
  const pinned = await buildContextPacket({ ...input, priorityIds: [candidates[0]!.id] }, provider);
  assert.deepEqual(pinned.entries.map(item => item.id), ["src/entry.js"]);
});

test("uncertain role balancing cannot displace confirmed implementation and assertion evidence", async () => {
  const candidates = ["tests/background.test.js", "src/owner.js", "tests/owner.test.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: evidence\n` }));
  const positive = Object.fromEntries(candidates.slice(1).map(item => [item.id, { sourceDigest: item.sourceDigest,
    excerptDigest: digest(item.excerpt), probability: 0.8, interpretation: "positive" as const,
    role: item.id.startsWith("tests/") ? "test" : "implementation", roleSource: "path" as const, preferredSpans: [] }]));
  const background = candidates[0]!;
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "Check owner and its assertion", required: [], optional: candidates,
    maximumBytes: 360, optionalExcerptBytes: 1024, passageJudgments: positive,
    passageUnitOrder: { [background.id]: { sourceDigest: background.sourceDigest, excerptDigest: digest(background.excerpt), preferredSpans: [],
      basis: "uncertain-score", kind: "source", probability: 0.74, role: "test", roleSource: "path", policy: "passage-score-3" } } },
    { async decide(request) { return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: candidates.map(item => item.id),
      suggested: null, method: "baseline", reason: "metadata", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
      usage: { inputTokens: null, outputTokens: null } }; } });
  assert.deepEqual(packet.entries.map(item => item.id), ["src/owner.js", "tests/owner.test.js"]);
  assert.equal(packet.omissionReasons[background.id], "packet-budget");
});

test("current literal relationships preserve a confirmed test and its uncertain implementation without pinning", async () => {
  const candidates = ["tests/action.test.js", "src/background.js", "src/action.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: evidence\n` }));
  const testSource = candidates[0]!, implementation = candidates[2]!;
  const input = { taskRevision: "1", purpose: "Find action and its assertion", required: [], optional: candidates, maximumBytes: 360, optionalExcerptBytes: 1024,
    passageJudgments: Object.fromEntries(candidates.slice(0, 2).map((item, index) => [item.id, { sourceDigest: item.sourceDigest,
      excerptDigest: digest(item.excerpt), probability: index ? 0.85 : 0.95, interpretation: "positive" as const,
      role: index ? "implementation" : "test", roleSource: "path" as const, preferredSpans: [] }])),
    passageUnitOrder: { [implementation.id]: { sourceDigest: implementation.sourceDigest, excerptDigest: digest(implementation.excerpt), preferredSpans: [],
      basis: "uncertain-score" as const, kind: "source" as const, probability: 0.67, role: "implementation", roleSource: "path" as const, policy: "passage-score-3" as const } },
    sourceLinks: [{ source: testSource.id, target: implementation.id, sourceDigest: testSource.sourceDigest, targetDigest: implementation.sourceDigest }] };
  const provider = { async decide(request: any) { return { version: 1 as const, kind: request.kind, inputDigest: digest(request), delivered: candidates.map(item => item.id),
    suggested: null, method: "baseline" as const, reason: "metadata", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
    usage: { inputTokens: null, outputTokens: null } }; } };
  const packet = await buildContextPacket(input, provider);
  assert.deepEqual(packet.entries.map(item => item.id), [testSource.id, implementation.id]);
  assert.equal(packet.unitOrdering[implementation.id], "uncertain-score");
  assert.equal(packet.measurement.relationships.reorderedPairs, 1);
  assert.equal(packet.measurement.relationships.preview[0]?.delivered, true);
  const stale = await buildContextPacket({ ...input, sourceLinks: [{ ...input.sourceLinks[0]!, targetDigest: digest("old") }] }, provider);
  assert.deepEqual(stale.entries.map(item => item.id), [testSource.id, candidates[1]!.id]);
  assert.equal(stale.measurement.relationships.reorderedPairs, 0);
  const staleSource = await buildContextPacket({ ...input, sourceLinks: [{ ...input.sourceLinks[0]!, sourceDigest: digest("old") }] }, provider);
  assert.equal(staleSource.measurement.relationships.reorderedPairs, 0);
  assert.deepEqual(staleSource.entries.map(item => item.id), [testSource.id, candidates[1]!.id]);
  const pinned = await buildContextPacket({ ...input, priorityIds: [candidates[1]!.id] }, provider);
  assert.equal(pinned.entries[0]?.id, candidates[1]!.id);
  const pinnedPair = await buildContextPacket({ ...input, maximumBytes: 600, priorityIds: [candidates[1]!.id] }, provider);
  assert.deepEqual(pinnedPair.entries.map(item => item.id), [candidates[1]!.id, testSource.id, implementation.id]);
  const unanswered = await buildContextPacket({ ...input, passageUnitOrder: {} }, provider);
  assert.equal(unanswered.measurement.relationships.reorderedPairs, 0);
});

test("answered passage probabilities order units within their file rather than by word overlap", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "passage-unit-order-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = "src/config.js", source =
    `function validateCount() {\n  // count validation guard ${"x".repeat(420)}\n  return false;\n}\n` +
    "const boundary = 1;\n" +
    `function startWorker() {\n  // count ${"x".repeat(600)}\n  return true;\n}\n` + "// tail\n".repeat(100);
  const facts = extractSourceFacts(path, Buffer.from(source));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: source };
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto",
      questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const passage = wirePassageEvidence(wire, raw);
      return [name, { type: "noul", noul: passage.passage.includes("validateCount") ? 0.82 : passage.passage.includes("startWorker") ? 0.86 : 0.1 }];
    })) });
  } });
  const purpose = "Locate count validation guard";
  const advice = await selectContextPassages(runtime, [candidate], { purpose,
    scope: { workspace: root, taskId: "task", taskRevision: "1" }, subjectDigest: digest("subject"), revision: "1",
    environment: "explicit", invocationId: "e".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 1000, sourceSpans: { [path]: facts.spans } });
  assert.equal(advice.judgments[path]?.preferredSpans[0]?.name, "startWorker");
  const excerpt = contextExcerpt(candidate, purpose, 1000, facts.spans, advice.judgments[path]?.preferredSpans);
  assert.match(excerpt.excerpt, /startWorker/);
  assert.ok(excerpt.sourceUnits?.some(unit => unit.name === "startWorker" && unit.complete));
  assert.ok(excerpt.sourceUnits?.some(unit => unit.name === "validateCount" && !unit.complete), "The second useful passage may use only the leftover space");
});

test("JEV can choose two complete test units inside one relevant file", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "passage-units-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = "tests/stop.test.js", source = "// setup\n".repeat(250) +
    "test('stop setup starts release', () => { assert.equal('setup', 'setup'); });\n" +
    "const unrelatedBarrier = 1;\n" +
    "test('stop waits before release', () => { assert.equal(releaseDeferred, true); });\n" +
    "test('duplicate stop is suppressed', () => { assert.equal(stopCalls, 1); });\n" + "// tail\n".repeat(250);
  const facts = extractSourceFacts(path, Buffer.from(source));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: source };
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["tests/**"], consumers: { DL03: { mode: "auto",
      questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      if (name.startsWith("role-")) return [name, { type: "choice", choice: "test", confidence: 0.9,
        probabilities: { implementation: 0, test: 0.9, documentation: 0, operations: 0, other: 0, unknown: 0.1 } }];
      const passage = wirePassageEvidence(wire, raw);
      return [name, { type: "noul", noul: passage.passage.includes("releaseDeferred, true") ? 0.95 : 0.1 }];
    })) });
  } });
  const purpose = "Find where stop waits before release and duplicate stop is suppressed";
  const advice = await selectContextPassages(runtime, [candidate], { purpose, scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "b".repeat(64),
    policyDigest: settings.configDigest, deadlineAt: performance.now() + 5000, excerptBytes: 1024, sourceSpans: { [path]: facts.spans } });
  assert.equal(advice.judgments[path]?.preferredSpans.length, 1);
  const packet = await buildContextPacket({ taskRevision: "1", purpose, required: [], optional: [candidate], maximumBytes: 2500,
    optionalExcerptBytes: 1024, sourceSpans: { [path]: facts.spans }, passageJudgments: advice.judgments }, { async decide(request) {
    return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: [path], suggested: null,
      method: "baseline", reason: "fixture", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
      usage: { inputTokens: null, outputTokens: null } };
  } });
  assert.match(packet.entries[0]!.excerpt, /releaseDeferred, true/);
  assert.match(packet.entries[0]!.excerpt, /stopCalls, 1/);
  assert.equal(packet.entries[0]!.sourceUnits?.length, 2);
});

test("adjacent declarations retain the whole proof range, member completeness and exact hash", () => {
  const source = "// unrelated setup\n".repeat(200) +
    "function desiredCount(value) { return value === 0 || value === 1; }\n\n" +
    "function imageDigest(value) { return /^sha256:/.test(value); }\n" + "// tail\n".repeat(200);
  const path = "src/config.js", facts = extractSourceFacts(path, Buffer.from(source));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: source };
  const cluster = contextSourceClusters(candidate, facts.spans).find(item => item.members?.length === 2)!;
  assert.ok(cluster);
  const excerpt = contextExcerpt(candidate, "Validate count and pinned digest", 1024, facts.spans, [cluster]);
  assert.equal(excerpt.sourceRange?.firstLine, cluster.start);
  assert.equal(excerpt.sourceRange?.lastLine, cluster.end);
  const originalDigest = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
  assert.equal(excerpt.sourceRange?.excerptDigest, originalDigest(excerpt.excerpt));
  assert.equal(excerpt.sourceUnits?.length, 2);
  assert.ok(excerpt.sourceUnits?.every(item => item.complete));
  const composed = contextExcerpt(candidate, "Validate count and pinned digest", 1024, facts.spans, facts.spans);
  assert.equal(composed.sourceRange?.excerptDigest, originalDigest(composed.excerpt));
  assert.match(composed.excerpt, /desiredCount[\s\S]*imageDigest/);
  assert.equal(composed.sourceRanges, undefined, "adjacent positive ranges include their original separating line");
});

test("a lower-priority adjacent unit cannot crowd out an already selected passage", () => {
  const declaration = (name: string, padding: number) =>
    `function ${name}() {\n  // count release behavior ${"x".repeat(padding)}\n  return true;\n}\n`;
  const source = declaration("validateCount", 180) + "const boundary = 1;\n" +
    declaration("releaseWorker", 310) + "\n" + declaration("releaseNeighbor", 310) + "// tail\n".repeat(100);
  const path = "src/config.js", facts = extractSourceFacts(path, Buffer.from(source));
  const candidate = { id: path, sourceDigest: facts.digest, excerpt: source };
  const span = (name: string) => facts.spans.find(item => item.name === name)!;
  const excerpt = contextExcerpt(candidate, "count release behavior", 1000, facts.spans,
    [span("releaseWorker"), span("validateCount"), span("releaseNeighbor")]);
  assert.match(excerpt.excerpt, /releaseWorker/);
  assert.match(excerpt.excerpt, /validateCount/);
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= 1000);
  assert.ok(["releaseWorker", "validateCount"].every(name => excerpt.sourceUnits?.some(item => item.name === name && item.complete)));
  assert.ok(excerpt.sourceUnits?.filter(item => item.name === "releaseNeighbor").every(item => !item.complete));
});

test("budget-fitted breadth preserves the next file and omits excess units before dispatch", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "passage-budget-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["src/**"], budget: { max_calls: 3, max_request_bytes: 12000 }, consumers: { DL03: { mode: "auto",
      questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const makeSource = (name: string) => `function repair${name}() {\n${"  // repair needs this bounded unit\n".repeat(20)}  return true;\n}\n`;
  const candidates = [
    { id: "src/a.js", excerpt: Array.from({ length: 8 }, (_, index) => makeSource(`A${index}`) + `const boundary${index} = 1;\n`).join("") },
    { id: "src/b.js", excerpt: makeSource("B") },
  ].map(item => ({ ...item, sourceDigest: digest(item.excerpt) }));
  const spans = Object.fromEntries(candidates.map(item => [item.id, extractSourceFacts(item.id, Buffer.from(item.excerpt)).spans]));
  const scope = { workspace: root, taskId: "task", taskRevision: "1" }, invocationId = "c".repeat(64);
  assert.equal(reserveDecisionCall(root, contextBudgetScope(scope, invocationId), "earlier-metadata", 5000, settings.budget).state, "reserved");
  const deliveredPaths = new Set<string>();
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    for (const question of Object.values(wire.questions)) deliveredPaths.add(wirePassageEvidence(wire, question).path);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(wire.questions)
      .map(name => [name, { type: "noul", noul: 0.9 }])) });
  } });
  const advice = await selectContextPassages(runtime, candidates, { purpose: "Find repair ownership", scope,
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId, policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 1024, sourceSpans: spans });
  assert.ok(deliveredPaths.has("src/b.js"), "the first file's deeper units cannot starve the second file");
  assert.ok(advice.omitted.some(item => item.reason === "passage-budget"));
  assert.ok(advice.decisions.every(item => item.reason !== "budget-exhausted"));
  assert.ok(advice.decisions.every(item => (item.budget.bytes ?? Infinity) <= 12000));
});

test("uncertain roles and unavailable passage advice preserve the metadata order", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "passage-fallback-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidates = ["src/a.js", "tests/b.test.js"].map(id => ({ id, sourceDigest: digest(id), excerpt: `${id}: source\n` }));
  const provider = { async decide(request: any) { return { version: 1 as const, kind: request.kind,
    inputDigest: digest(request), delivered: candidates.map(item => item.id), suggested: null, method: "baseline" as const,
    reason: "metadata", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
    usage: { inputTokens: null, outputTokens: null } }; } };
  const packetInput = { taskRevision: "1", purpose: "source evidence", required: [], optional: candidates, maximumBytes: 2500, optionalExcerptBytes: 1024 };
  const uncertain = await buildContextPacket({ ...packetInput, passageJudgments: Object.fromEntries(candidates.map((item, index) => [item.id,
    { sourceDigest: item.sourceDigest, excerptDigest: digest(item.excerpt), probability: index ? 0.5 : 0.8,
      interpretation: index ? "uncertain" as const : "positive" as const, role: index ? "test" : "implementation",
      roleSource: "path" as const, preferredSpans: [] }])) }, provider);
  assert.deepEqual(uncertain.entries.map(item => item.id), candidates.map(item => item.id));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["**"], consumers: { DL03: { mode: "auto",
      questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const scope = { workspace: root, taskId: "task", taskRevision: "1" }, invocationId = "d".repeat(64);
  const input = { purpose: "source evidence", scope, subjectDigest: digest("subject"), revision: "1", environment: "explicit",
    invocationId, policyDigest: settings.configDigest, deadlineAt: performance.now() + 5000, excerptBytes: 1024 };
  const noToken = await selectContextPassages(new DecisionRuntime(settings, root, { token: "", fetch: async () => { throw Error("must stay local"); } }), candidates, input);
  assert.equal(noToken.reason, "provider-unavailable");
  reserveDecisionCall(root, contextBudgetScope(scope, invocationId), "spent", settings.budget.maxRequestBytes, settings.budget);
  const exhausted = await selectContextPassages(new DecisionRuntime(settings, root, { token: "fixture", fetch: async () => { throw Error("no budget"); } }), candidates, input);
  assert.equal(exhausted.reason, "passage-budget"); assert.equal(exhausted.decisions.length, 0);
  for (const advice of [noToken, exhausted]) {
    const packet = await buildContextPacket({ ...packetInput, passageJudgments: advice.judgments }, provider);
    assert.deepEqual(packet.entries, (await buildContextPacket(packetInput, provider)).entries);
  }
  const mismatched = await buildContextPacket({ ...packetInput, passageJudgments: { "src/a.js": {
    sourceDigest: candidates[0]!.sourceDigest, excerptDigest: digest("undeliverable"), probability: 0.9,
    interpretation: "positive", role: "implementation", roleSource: "path", preferredSpans: [] } } }, provider);
  assert.equal(mismatched.judgmentLimitations["src/a.js"], "judgment-not-representable");
});
