import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextMetadataCatalog, packMetadataBatch, selectContextMetadata } from "../src/context-metadata.ts";
import type { EvidenceItem } from "../src/decision-schema.ts";
import type { ValidationSubject } from "../src/change-subject.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";
import { readDecisionBudget, decisionBudgetStoreStatus } from "../src/decision-budget.ts";
import { sourceDescription } from "../src/context-source-index.ts";

const syntheticSubject = (methods: Record<string, unknown> = {}) => ({
  root: tmpdir(), source: () => ({ file_type: "regular" }),
  projectionSources: (paths: string[]) => ({ view: "worktree", subject: null, sources: new Map(paths.map(path => [path, { key: "fixture", freshness: "fixture" }])) }),
  readBatch: (paths: string[]) => new Map(paths.map(path => [path, "fixture-path-only"])), ...methods,
} as unknown as ValidationSubject);
const subject = syntheticSubject();
const settings = (overrides: Record<string, unknown> = {}) => profileDecisionSettings({ continuity: { decisions: {
  mode: "auto", allowed_data_classes: ["metadata"], allowed_metadata_paths: ["src/**"],
  consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } }, ...overrides,
} } });

test("metadata batch packing keeps general coverage and skips items that cannot fit", () => {
  const items = new Map<string, EvidenceItem>();
  for (const id of ["p1", "p2", "g1", "g2", "g3", "huge"])
    items.set(id, { id, text: id === "huge" ? "x".repeat(50) : id, sourceDigest: digest(id), provenance: "derived", trust: "untrusted" });
  const priorities = ["p1", "p2"], general = ["huge", "g1", "g2", "g3"];
  const limits = { purposeBytes: 0, evidenceBytes: 8, baseWire: 0, wireBytes: 8, itemWire: (item: EvidenceItem) => item.text.length };
  const first = packMetadataBatch(priorities, general, items, limits);
  assert.deepEqual(first.unfittable, ["huge"]);
  assert.deepEqual(first.batch, ["g1", "p1", "g2", "p2"]);
  assert.deepEqual(packMetadataBatch(priorities, general, items, limits).batch, ["g3"]);
  const tooSmall = packMetadataBatch([], ["g1"], items, { ...limits, wireBytes: 1 });
  assert.deepEqual(tooSmall, { batch: [], unfittable: ["g1"] });
});

test("unbound context has a serializable identity and preserves local fallback", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-unbound-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = contextMetadataCatalog(["src/a.ts"], "repair", [], [], new Set());
  const runtime = new DecisionRuntime(settings(), root, { token: "", fetch: async () => { throw new Error("must remain local"); } });
  const result = await selectContextMetadata(subject, catalog, "repair", runtime, null, digest("source"), "unbound");
  assert.deepEqual(result.order, ["src/a.ts"]); assert.ok(result.decisions.every(item => !item.providerCalled));
});

test("shared metadata reaches a late file, preserves pinned paths and reuses paid batches without source bodies", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-metadata-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 100 }, (_, i) => `src/${String(i).padStart(3, "0")}.ts`);
  const catalog = contextMetadataCatalog([...paths, ".env", "secret.key", "node_modules/foo.js"], "where is the mechanism", [paths[0]!], [], new Set());
  assert.equal(catalog.candidates.length, 100); assert.equal(catalog.excludedCount, 3);
  let calls = 0;
  const runtime = new DecisionRuntime(settings(), root, { token: "fixture", fetch: async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body));
    assert.equal(wire.state.layout, "shared-v1");
    assert.equal(wire.state.evidence.filter((item: any) => item.id === "purpose").length, 1);
    assert.ok(Object.keys(wire.questions).length <= 63);
    assert.equal(JSON.stringify(wire).split("where is the mechanism").length - 1, 1);
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) =>
      [name, { type: "noul", noul: (raw as any).instructions.evidenceIds.includes("src/099.ts") ? 0.95 : 0.5 }])) });
  } });
  const run = () => selectContextMetadata(subject, catalog, "where is the mechanism", runtime,
    { workspace: root, taskId: "task", taskRevision: "1" }, digest("subject"), "turn1");
  const result = await run();
  assert.equal(calls, 2); assert.equal(result.assessed.length, 100);
  assert.deepEqual(result.order.slice(0, 2), ["src/000.ts", "src/099.ts"]);
  assert.equal(result.sourceBodiesTransmitted, false);
  assert.deepEqual((await run()).order, result.order); assert.equal(calls, 2);
});

test("prompt budgets cannot consume check-time allowance and historical hints cannot outrank current terms", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-partition-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = contextMetadataCatalog(["src/old.ts", "src/parser.ts"], "Fix the parser", [], [], new Set(), ["src/old.ts"]);
  assert.equal(catalog.candidates[0]?.path, "src/parser.ts");
  let calls = 0;
  const runtime = new DecisionRuntime(settings({ budget: { max_calls: 1, max_request_bytes: 16384 } }), root, { token: "fixture", fetch: async () => {
    calls++; return Response.json({ model: "jev-1.13.0", answers: { "file-0": { type: "noul", noul: 0.9 }, "file-1": { type: "noul", noul: 0.1 } } });
  } });
  const scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const first = await selectContextMetadata(subject, catalog, "parser", runtime, scope, digest("subject"), "prompt-1", undefined);
  assert.equal(first.decisions[0]?.budget.partition, "context-selection");
  assert.equal(readDecisionBudget(root, scope), null);
  const second = await selectContextMetadata(subject, catalog, "parser", runtime, scope, digest("subject"), "prompt-2", undefined);
  assert.equal(second.reason, "answered");
  assert.equal(decisionBudgetStoreStatus(root).activeScopes?.contextSelection, 0);
  const ordinary = await selectContextMetadata(subject, catalog, "parser", runtime, scope, digest("subject"), "ordinary");
  assert.equal(ordinary.reason, "answered"); assert.equal(calls, 3);
  assert.equal(readDecisionBudget(root, scope), null);
});

test("metadata permission, uncertainty, deadline and budgets all retain the local order", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-metadata-fallback-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = contextMetadataCatalog(["src/a.ts", "src/b.ts"], "fix", [], [], new Set());
  const run = (runtime: DecisionRuntime, id: string) => selectContextMetadata(subject, catalog, "fix", runtime,
    { workspace: root, taskId: "task", taskRevision: "1" }, digest("subject"), id);
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ model: "jev-1.13.0", answers: { "file-0": { type: "noul", noul: 0.5 }, "file-1": { type: "noul", noul: 5 } } }); };
  const denied = await run(new DecisionRuntime(settings({ allowed_data_classes: ["source"], allowed_source_paths: ["**"] }), root, { token: "fixture", fetch: fetcher }), "denied");
  assert.equal(denied.reason, "data-sharing-disabled"); assert.equal(calls, 0);
  const noToken = await run(new DecisionRuntime(settings(), root, { token: "", fetch: fetcher }), "no-token");
  assert.equal(noToken.reason, "missing-token"); assert.equal(calls, 0);
  const unclear = await run(new DecisionRuntime(settings(), root, { token: "fixture", fetch: fetcher }), "unclear");
  assert.deepEqual(unclear.order, ["src/a.ts", "src/b.ts"]); assert.equal(unclear.delivered, false);
  const small = await run(new DecisionRuntime(settings({ budget: { max_calls: 1, max_request_bytes: 1024 } }), root, { token: "fixture", fetch: fetcher }), "budget");
  assert.ok(["input-budget", "budget-exhausted"].includes(small.reason));
  const timed = await run(new DecisionRuntime(settings({ deadline_ms: 500 }), join(root, "timeout"), { token: "fixture", fetch: async () => new Promise(() => {}) }), "timeout");
  assert.deepEqual(timed.order, ["src/a.ts", "src/b.ts"]); assert.equal(timed.delivered, false);
  assert.ok(timed.decisions[0]?.providerCalled);
});

test("every eligible item beyond the old cutoff reaches JEV, including a misleading name with approved source clues", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-full-index-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = [...Array.from({ length: 240 }, (_, i) => `src/item-${String(i).padStart(3, "0")}.ts`), "src/zzz/utility.ts"];
  const purpose = "Find where expired credentials are renewed";
  const catalog = contextMetadataCatalog(paths, purpose, [], [], new Set());
  assert.equal(catalog.candidates.length, paths.length); assert.equal(catalog.omittedCount, 0);
  const indexedSubject = syntheticSubject({ source: () => ({ file_type: "regular" }), readBatch: (items: string[]) => new Map(items.map(path => [path,
    Buffer.from(path.endsWith("utility.ts") ? "/** Renew expired credentials before sending the request. */\nexport function refreshExpiredCredentials() {}\n" : "export const counter = 1;\n")])) });
  const seen = new Set<string>(); let descriptions = 0;
  const configured = settings({ allowed_data_classes: ["metadata", "source"], allowed_source_paths: ["src/zzz/**"],
    budget: { max_calls: 32, max_request_bytes: 1024 * 1024 } });
  const runtime = new DecisionRuntime(configured, root, { token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    const answers = Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const path = (raw as any).instructions.evidenceIds[1]; seen.add(path);
      const item = wire.state.evidence.find((entry: any) => entry.id === path);
      if (path.endsWith("utility.ts")) { descriptions++; assert.match(item.text, /refreshExpiredCredentials/); }
      else assert.equal(item.text, path, "metadata consent alone must not disclose source-derived text");
      return [name, { type: "noul", noul: item.text.includes("refreshExpiredCredentials") ? 0.95 : 0.1 }];
    }));
    return Response.json({ model: "jev-1.13.0", answers });
  } });
  const result = await selectContextMetadata(indexedSubject, catalog, purpose, runtime,
    { workspace: root, taskId: "task", taskRevision: "1" }, digest("subject"), "turn");
  assert.equal(seen.size, paths.length); assert.equal(descriptions, 1);
  assert.equal(result.coverage.complete, true); assert.equal(result.coverage.unassessedCount, 0);
  assert.equal(result.order[0], "src/zzz/utility.ts"); assert.equal(result.sourceIndex.transmittedCount, 1);
});

test("budget and deadline limits expose incomplete coverage without deleting unassessed candidates", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-index-partial-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 200 }, (_, i) => `src/${i}.ts`), catalog = contextMetadataCatalog(paths, "find mechanism", [], [], new Set());
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => { calls++; const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.8 }])) }); };
  const scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const partial = await selectContextMetadata(subject, catalog, "find mechanism", new DecisionRuntime(settings({ budget: { max_calls: 1, max_request_bytes: 131072 } }), root, { token: "fixture", fetch: fetcher }), scope, digest("subject"), "partial");
  assert.equal(calls, 1); assert.equal(partial.reason, "budget-exhausted");
  assert.equal(partial.coverage.complete, false); assert.ok(partial.coverage.unassessedCount > 126);
  assert.equal(partial.order.length, paths.length);
  const signal = AbortSignal.abort();
  const stopped = await selectContextMetadata(subject, catalog, "find mechanism", new DecisionRuntime(settings(), root, { token: "fixture", fetch: fetcher, signal }), scope, digest("subject"), "stopped", signal);
  assert.equal(calls, 1); assert.equal(stopped.coverage.unassessedCount, paths.length); assert.equal(stopped.reason, "cancelled");
  const restricted = await selectContextMetadata(subject, catalog, "find mechanism", new DecisionRuntime(settings({ allowed_metadata_paths: ["src/0.ts"] }), root, { token: "fixture", fetch: fetcher }), scope, digest("subject"), "restricted");
  assert.equal(restricted.coverage.notPermittedCount, 199); assert.equal(restricted.coverage.complete, false);
});

test("literal source index handles headings and symbols without fabricating meaning for unknown text", () => {
  assert.match(sourceDescription("docs/plan.md", Buffer.from("---\nsummary: Renewal decision\n---\n# Session Lifetime\n"))!, /Session Lifetime/);
  assert.match(sourceDescription("file.py", Buffer.from("def refresh_session():\n    return True\n"))!, /refresh_session/);
  assert.equal(sourceDescription("image.ts", Buffer.from([0, 1])), null);
  assert.equal(sourceDescription("file.txt", Buffer.from("unlabelled text")), null);
  assert.match(sourceDescription("file.py", Buffer.from('"""Refresh credentials before a request."""\ndef send():\n    pass\n'))!, /Refresh credentials/);
  assert.ok(!sourceDescription("file.ts", Buffer.from('summary: not frontmatter\nexport const value=1;'))!.includes("not frontmatter"));
});

test("retrieval closes its scope after each invocation and remains available after 512 sessions", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-scope-lifecycle-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = contextMetadataCatalog(["src/a.ts"], "find", [], [], new Set());
  let calls = 0;
  const runtime = new DecisionRuntime(settings({ budget: { max_calls: 1, max_request_bytes: 8192 } }), root, { token: "fixture", fetch: async () => {
    calls++; return Response.json({ model: "jev-1.13.0", answers: { "file-0": { type: "noul", noul: 0.9 } } });
  } });
  for (let i = 0; i < 513; i++) {
    const result = await selectContextMetadata(subject, catalog, "find", runtime, { workspace: root, taskId: `session-${i}`, taskRevision: "1" }, digest("subject"), `turn-${i}`);
    assert.equal(result.reason, "answered"); assert.equal(result.budgetFinalized, true);
  }
  assert.equal(calls, 513); assert.equal(decisionBudgetStoreStatus(root).activeScopes?.contextSelection, 0);
});

test("a bounded index supplies visited metadata windows, rotates across turns and protects ordinary budgets", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-large-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 1500 }, (_, i) => `src/${String(i).padStart(4, "0")}.ts`);
  const catalog = contextMetadataCatalog(paths, "find behaviour", [], [], new Set());
  let inspected = 0; const seen = new Set<string>();
  const indexed = syntheticSubject({ source: () => ({ file_type: "regular" }), readBatch: (items: string[]) => {
    inspected += items.length; return new Map(items.map(path => [path, Buffer.from('/** ' + 'An existing description of the module and its constraints. '.repeat(10) + ' */\n' +
      Array.from({ length: 12 }, (_, i) => `export function meaningfulDeclarationNameForThisModule${i}() {}`).join('\n'))]));
  } });
  const runtime = new DecisionRuntime(settings({ allowed_data_classes: ["metadata", "source"], allowed_source_paths: ["src/**"],
    evidence_bytes: 16384, budget: { max_calls: 1, max_request_bytes: 131072 } }), root, { token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.entries(wire.questions).map(([name, q]) => {
      seen.add((q as any).instructions.evidenceIds[1]); return [name, { type: "noul", noul: 0.8 }];
    })) });
  } });
  const starts = new Set<number>(), scope = { workspace: root, taskId: "same-session", taskRevision: "1" };
  for (let turn = 0; turn < 10; turn++) {
    const result = await selectContextMetadata(indexed, catalog, "find behaviour", runtime, scope, digest("source"), `turn-${turn}`);
    starts.add(result.coverage.traversalStart);
    assert.equal(result.reason, "budget-exhausted"); assert.equal(result.coverage.complete, false);
    assert.ok(result.sourceIndex.inspectedCount <= 63); assert.ok(result.coverage.answeredCount > 0);
  }
  assert.ok(starts.size > 1); assert.ok(seen.size > 63); assert.ok(inspected <= 15000);
  assert.equal(readDecisionBudget(root, scope), null);
  assert.equal(decisionBudgetStoreStatus(root).activeScopes?.contextSelection, 0);
});

test("unfittable items do not stop later batches and large wire descriptions fall back to paths", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-fitting-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const long = `src/${"long".repeat(20)}.ts`, paths = [...Array.from({ length: 150 }, (_, i) => `src/${i}.ts`), long];
  let seen = 0;
  const fetcher: typeof fetch = async (_url, init) => { const wire = JSON.parse(String(init?.body)); seen += Object.keys(wire.questions).length;
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) }); };
  const result = await selectContextMetadata(subject, contextMetadataCatalog(paths, "find", [], [], new Set()), "find",
    new DecisionRuntime(settings({ evidence_bytes: 32, budget: { max_calls: 100, max_request_bytes: 1048576 } }), root, { token: "fixture", fetch: fetcher }),
    { workspace: root, taskId: "small-evidence", taskRevision: "1" }, digest("source"), "turn");
  assert.equal(seen, 150); assert.equal(result.coverage.unfittableCount, 1); assert.equal(result.reason, "input-budget");
  const path = "src/description.md", text = '---\nsummary: ' + 'detail '.repeat(100) + '\n---\n' +
    Array.from({ length: 6 }, () => '# ' + 'heading '.repeat(20)).join('\n') + '\n' +
    Array.from({ length: 12 }, (_, i) => 'export function ' + 'Identifier'.repeat(7) + i + '() {}').join('\n');
  const indexed = syntheticSubject({ source: () => ({ file_type: "regular" }), readBatch: () => new Map([[path, Buffer.from(text)]]) });
  const fallback = await selectContextMetadata(indexed, contextMetadataCatalog([path], "find", [], [], new Set()), "find",
    new DecisionRuntime(settings({ allowed_data_classes: ["metadata", "source"], allowed_source_paths: ["src/**"], budget: { max_calls: 1, max_request_bytes: 3000 } }), root, { token: "fixture", fetch: async (_url, init) => {
      const wire = JSON.parse(String(init?.body)); assert.equal(wire.state.evidence[1].text, path); return Response.json({ model: "jev-1.13.0", answers: { "file-0": { type: "noul", noul: 0.9 } } });
    } }), { workspace: root, taskId: "wire-fallback", taskRevision: "1" }, digest("source"), "wire");
  assert.equal(fallback.coverage.complete, true); assert.deepEqual(fallback.sourceIndex.descriptionOmissions, [path]);
});

test("every metadata caller has one overall deadline even without a prompt hook signal", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-invocation-deadline-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 150 }, (_, i) => `src/${i}.ts`), scope = { workspace: root, taskId: "cli", taskRevision: "1" };
  const started = performance.now();
  const result = await selectContextMetadata(subject, contextMetadataCatalog(paths, "find", [], [], new Set()), "find",
    new DecisionRuntime(settings({ deadline_ms: 1000 }), root, { token: "fixture", fetch: async () => new Promise(() => {}) }),
    scope, digest("source"), "cli", undefined, started + 50);
  assert.ok(performance.now() - started < 500); assert.equal(result.reason, "deadline");
  assert.equal(readDecisionBudget(root, scope), null); assert.equal(result.budgetFinalized, true);
  const next = await selectContextMetadata(subject, contextMetadataCatalog(["src/0.ts"], "find", [], [], new Set()), "find",
    new DecisionRuntime(settings(), root, { token: "fixture", fetch: async () => Response.json({ model: "jev-1.13.0", answers: { "file-0": { type: "noul", noul: 0.9 } } }) }),
    scope, digest("source"), "next-turn");
  assert.equal(next.reason, "answered", "A normal retrieval cutoff must not put the provider into cooldown");
});

test("metadata provider timeouts remain effective with a longer configured deadline", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-provider-timeout-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const catalog = contextMetadataCatalog(["src/0.ts"], "find", [], [], new Set()), scope = { workspace: root, taskId: "task", taskRevision: "1" };
  let calls = 0;
  const runtime = new DecisionRuntime(settings({ deadline_ms: 5000 }), root, { token: "fixture", fetch: async () => { calls++; return new Promise(() => {}); } });
  const first = await selectContextMetadata(subject, catalog, "find", runtime, scope, digest("source"), "first");
  assert.equal(first.reason, "deadline"); assert.equal(first.decisions[0]?.failureStage, "transport");
  const next = await selectContextMetadata(subject, catalog, "find", runtime, scope, digest("source"), "second");
  assert.equal(next.reason, "cooldown"); assert.equal(calls, 1);
});
