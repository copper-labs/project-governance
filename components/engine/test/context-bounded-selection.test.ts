import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ValidationSubject } from "../src/change-subject.ts";
import { digest } from "../src/core.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { contextMetadataCatalog, selectContextMetadata } from "../src/context-metadata.ts";
import { maintainContextProjection } from "../src/context-projection.ts";
import { openContextFamily, contextFamilyScope, readDecisionBudget } from "../src/decision-budget.ts";

function fixture(t: { after(fn: () => void): void }, count = 12000, decisions: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "bounded-selection-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: count }, (_, i) => `src/item-${String(i).padStart(5, "0")}.ts`);
  const subject = { root, source: () => ({ file_type: "regular" }),
    projectionSources: () => ({ view: "worktree", subject: null, sources: new Map() }),
    readBatch: () => new Map() } as unknown as ValidationSubject;
  // Supply local index results separately from the provider. No real source or network is used.
  const projection = maintainContextProjection(subject, [], root);
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto",
    allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["src/**"], allowed_source_paths: ["src/**"],
    budget: { max_calls: 512, max_request_bytes: 10485760 },
    consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } }, ...decisions } } });
  const requests: any[] = [];
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body)); requests.push(wire);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(wire.questions)
      .map(name => [name, { type: "noul", noul: 0.9 }])) });
  } });
  const scope = { workspace: root, taskId: "repair", taskRevision: "1" };
  return { root, paths, subject, projection, settings, requests, runtime, scope };
}

test("a large repository cannot turn one refresh into an exhaustive paid scan", async t => {
  const f = fixture(t), late = f.paths.at(-1)!;
  f.projection.priority = [late];
  const result = await selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    f.runtime, f.scope, digest("subject"), "first", undefined, undefined, f.projection);
  assert.ok(result.coverage.submittedCount <= 64, `submitted ${result.coverage.submittedCount} candidates`);
  assert.ok(result.assessed.includes(late), "an injected local index result survives the paid window cap");
  assert.equal(result.order.length, 12000, "the full local inventory remains available for expansion");
  assert.equal(result.coverage.inventoryComplete, false);
  assert.equal(result.coverage.unassessedCount, 12000 - result.coverage.answeredCount);
  assert.ok(f.requests.length <= 8);
});

test("exact standalone repeats reuse paid answers even with a new invocation label", async t => {
  const f = fixture(t, 3), catalog = contextMetadataCatalog(f.paths, "repair", [], [], new Set());
  const run = (event: string, purpose = "repair") => selectContextMetadata(f.subject, catalog, purpose, f.runtime,
    f.scope, digest("subject"), event, undefined, undefined, f.projection);
  const first = await run("first"), calls = f.requests.length;
  const second = await run("second");
  assert.equal(f.requests.length, calls);
  assert.deepEqual(second.order, first.order);
  await run("clarified", "repair expired credentials");
  assert.ok(f.requests.length > calls, "a changed question cannot borrow the earlier answers");
});

test("explicit expansion adds a new bounded window and reuses valid prior batches", async t => {
  const f = fixture(t, 200), catalog = contextMetadataCatalog(f.paths, "repair", [], [], new Set());
  const id = digest("family").slice(7);
  openContextFamily(f.root, { id, workspace: f.root, locator: "fixture", session: "one", turn: "one", started: Date.now() });
  const first = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1" });
  const second = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1", previous: first.cursor, expand: true });
  assert.equal(first.coverage.answeredCount, 64);
  assert.equal(second.coverage.answeredCount, 128);
  assert.equal(second.coverage.replayedBatches, first.cursor.batches.length);
  assert.equal(new Set(second.assessed).size, 128);
  const replay = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1", previous: second.cursor, expand: true, replayOnly: true });
  assert.equal(replay.coverage.windowComplete, true, "replay describes the retained window, not a new unassessed one");
  assert.equal(replay.coverage.answeredCount, 128);
  const spent = readDecisionBudget(f.root, contextFamilyScope(f.root, id))!;
  assert.equal(spent.calls, f.requests.length);
  assert.ok(spent.calls <= 8 && spent.bytes <= 128 * 1024);
});

test("context allowances clamp old generous profiles and respect tighter limits", () => {
  const configured = (budget?: unknown) => profileDecisionSettings({ continuity: { decisions: { ...(budget ? { budget } : {}) } } });
  assert.deepEqual(configured().contextBudget, { maxCalls: 8, maxRequestBytes: 128 * 1024 });
  const old = configured({ max_calls: 512, max_request_bytes: 10485760 });
  assert.deepEqual(old.contextBudget, { maxCalls: 8, maxRequestBytes: 128 * 1024 });
  assert.equal(old.budget.maxCalls, 512, "ordinary consumer allowances retain their existing owner");
  assert.deepEqual(configured({ max_calls: 2, max_request_bytes: 8192 }).contextBudget, { maxCalls: 2, maxRequestBytes: 8192 });
});

test("continuation and a clarified question cannot reset an exhausted family allowance", async t => {
  const f = fixture(t, 200, { budget: { max_calls: 2, max_request_bytes: 131072 } }), catalog = contextMetadataCatalog(f.paths, "repair", [], [], new Set());
  const id = digest("limited-family").slice(7);
  openContextFamily(f.root, { id, workspace: f.root, locator: "fixture", session: "one", turn: "one", started: Date.now() });
  let result = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1" });
  result = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1", previous: result.cursor, expand: true });
  const partial = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1", previous: result.cursor, expand: true });
  assert.equal(f.requests.length, 2); assert.equal(partial.coverage.answeredCount, 128);
  assert.equal(partial.coverage.windowComplete, false);
  const changed = await selectContextMetadata(f.subject, catalog, "different question", f.runtime, f.scope, digest("subject"), id,
    undefined, undefined, f.projection, { id, revision: "1", previous: partial.cursor, expand: true });
  assert.equal(changed.coverage.replayedBatches, 0); assert.equal(changed.coverage.answeredCount, 0);
  assert.equal(f.requests.length, 2); assert.equal(readDecisionBudget(f.root, contextFamilyScope(f.root, id))!.calls, 2);
});

test("required context is outside optional classification and explicit paths lead incidental edits", async t => {
  const f = fixture(t, 200), required = f.paths[0]!, explicit = f.paths.at(-1)!;
  const catalog = contextMetadataCatalog(f.paths, "repair", [explicit], f.paths.slice(1, 150), new Set([required]));
  const result = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), "pins",
    undefined, undefined, f.projection);
  assert.equal(result.order[0], explicit);
  assert.ok(result.assessed.includes(explicit)); assert.ok(!result.assessed.includes(required));
  assert.equal(catalog.requiredCount, 1); assert.equal(result.coverage.submittedCount, 64);
});

test("source consent also gates using content-derived clues to select transmitted paths", async t => {
  const f = fixture(t, 200, { allowed_data_classes: ["metadata"] }), late = f.paths.at(-1)!;
  f.projection.priority = [late];
  const result = await selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    f.runtime, f.scope, digest("subject"), "private-clue", undefined, undefined, f.projection);
  assert.ok(result.order.indexOf(late) < result.order.indexOf(f.paths[64]!), "the clue can still rank the local unassessed remainder");
  assert.ok(!result.assessed.includes(late), "metadata consent cannot disclose a content-derived selection signal");
});

test("real local extraction finds a late descriptor in a large inventory before paid selection", async t => {
  const f = fixture(t), late = f.paths.at(-1)!;
  const bytes = (path: string) => Buffer.from(path === late ? '/** Renew expired credentials. */\nexport function refreshExpiredCredentials() {}\n' : 'export const counter = 1;\n');
  const subject = { ...f.subject,
    projectionSources: (paths: string[]) => ({ view: "worktree", subject: null, sources: new Map(paths.map(path => [path, { key: path, freshness: "fixture" }])) }),
    readBatch: (paths: string[]) => new Map(paths.map(path => [path, bytes(path)])) } as unknown as ValidationSubject;
  const result = await selectContextMetadata(subject, contextMetadataCatalog(f.paths, "expired credentials", [], [], new Set()), "expired credentials",
    f.runtime, f.scope, digest("subject"), "real-index", undefined, performance.now() + 30000);
  assert.ok(result.assessed.includes(late)); assert.equal(result.coverage.submittedCount, 64);
  assert.equal(result.sourceIndex.descriptorCoverage.descriptorAvailableCount, 12000);
});

test("metadata shrinks a paid batch to the remaining reserved byte allowance", async t => {
  const f = fixture(t, 64, { evidence_bytes: 32768, budget: { max_calls: 6, max_request_bytes: 20000 } });
  for (const path of f.paths) f.projection.entries.set(path, {
    text: JSON.stringify({ path, overview: "evidence ".repeat(240) }), sourceDigest: digest(path),
  });
  const result = await selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    f.runtime, f.scope, digest("subject"), "remaining-bytes", undefined, undefined, f.projection, undefined,
    { reservePassageBudget: true });
  assert.ok(f.requests.length > 0, "a too-large proposed batch must not waste the remaining allowance");
  assert.ok(result.coverage.answeredCount > 0 && result.coverage.answeredCount < 64);
  assert.ok(f.requests.reduce((sum, request) => sum + Buffer.byteLength(JSON.stringify(request)), 0) <= result.coverage.metadataByteCeiling);
  const calls = f.requests.length;
  const repeated = await selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    f.runtime, f.scope, digest("subject"), "new-label", undefined, undefined, f.projection, undefined,
    { reservePassageBudget: true });
  assert.equal(f.requests.length, calls); assert.equal(repeated.coverage.answeredCount, result.coverage.answeredCount);
});

test("an exact failed standalone input uses explicit retained-failure diagnostics without a new allowance", async t => {
  const f = fixture(t, 1); let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async () => {
    calls++; return new Response("unavailable", { status: 503 });
  } });
  const catalog = contextMetadataCatalog(f.paths, "repair", [], [], new Set());
  await selectContextMetadata(f.subject, catalog, "repair", runtime, f.scope, digest("subject"), "first", undefined, undefined, f.projection);
  const before = calls;
  const repeated = await selectContextMetadata(f.subject, catalog, "repair", runtime, f.scope, digest("subject"), "retry-label", undefined, undefined, f.projection);
  assert.equal(calls, before); assert.equal(repeated.reason, "exact-input-retained-failure");
  assert.match(repeated.coverage.retainedOutcomeReason!, /^repeated-/u); assert.deepEqual(repeated.order, f.paths);
  const noToken = new DecisionRuntime(f.settings, f.root, { token: "", fetch: async () => { throw Error("must stay local"); } });
  const disabled = await selectContextMetadata(f.subject, catalog, "repair", noToken, f.scope, digest("subject"), "disabled", undefined, undefined, f.projection);
  assert.equal(disabled.reason, "missing-token"); assert.equal(disabled.coverage.answeredCount, 0);
});

test("reserve-path failed prefixes replay their original failure without another paid request", async t => {
  const f = fixture(t, 64, { evidence_bytes: 32768, budget: { max_calls: 6, max_request_bytes: 20000 } });
  for (const path of f.paths) f.projection.entries.set(path, { text: JSON.stringify({ path, overview: "clue ".repeat(480) }), sourceDigest: digest(path) });
  let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async () => {
    calls++; return new Response("unavailable", { status: 503 });
  } });
  const run = (event: string) => selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    runtime, f.scope, digest("subject"), event, undefined, undefined, f.projection, undefined, { reservePassageBudget: true });
  await run("first"); const before = calls;
  const repeated = await run("second");
  assert.equal(calls, before); assert.equal(repeated.reason, "exact-input-retained-failure");
});

test("metadata-only batch ordering does not depend on an undisclosed content clue inside the window", async t => {
  const f = fixture(t, 64, { allowed_data_classes: ["metadata"], evidence_bytes: 128,
    budget: { max_calls: 1, max_request_bytes: 131072 } });
  const catalog = contextMetadataCatalog(f.paths, "repair", [], [], new Set());
  const first = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), "first",
    undefined, undefined, f.projection, undefined, { concurrency: 1 });
  f.projection.priority = [f.paths[33]!];
  const second = await selectContextMetadata(f.subject, catalog, "repair", f.runtime, f.scope, digest("subject"), "second",
    undefined, undefined, f.projection, undefined, { concurrency: 1 });
  assert.deepEqual(second.assessed, first.assessed); assert.equal(second.coverage.priorityAssessed, 0);
});

test("an uncut reserve-path failure takes the free retained shortcut and stops later work", async t => {
  const f = fixture(t, 64, { evidence_bytes: 512 }); let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async () => {
    calls++; return new Response("unavailable", { status: 503 });
  } });
  const run = (event: string) => selectContextMetadata(f.subject, contextMetadataCatalog(f.paths, "repair", [], [], new Set()), "repair",
    runtime, f.scope, digest("subject"), event, undefined, undefined, f.projection, undefined,
    { reservePassageBudget: true, concurrency: 1 });
  await run("first"); const before = calls;
  const repeated = await run("second");
  assert.equal(calls, before); assert.equal(repeated.reason, "exact-input-retained-failure");
  assert.equal(repeated.decisions.length, 1);
});
