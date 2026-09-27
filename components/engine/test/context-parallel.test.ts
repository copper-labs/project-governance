import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { contextMetadataCatalog, selectContextMetadata } from "../src/context-metadata.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { decisionBudgetStoreStatus } from "../src/decision-budget.ts";
import type { ValidationSubject } from "../src/change-subject.ts";
import { ProviderPool } from "../src/decision-admission.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "context-parallel-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 80 }, (_, i) => `src/${String(i).padStart(3, "0")}.ts`);
  const subject = { root, source: () => ({ file_type: "regular" }),
    projectionSources: (paths: string[]) => ({ view: "worktree", subject: null, sources: new Map(paths.map(path => [path, { key: path, freshness: "fixture" }])) }),
    readBatch: (paths: string[]) => new Map(paths.map(path => [path, "fixture-path-only"])),
  } as unknown as ValidationSubject;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata"],
    allowed_metadata_paths: ["src/**"], evidence_bytes: 150, budget: { max_calls: 100, max_request_bytes: 1048576 },
    consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } });
  const catalog = contextMetadataCatalog(paths, "repair", [], [], new Set()), scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const response = (wire: any) => Response.json({ model: settings.legacy.model,
    answers: Object.fromEntries(Object.entries(wire.questions).map(([name, value]) => [name,
      { type: "noul", noul: (value as any).instructions.evidenceIds[1] === "src/079.ts" ? 0.99 : 0.8 }])) });
  return { root, subject, settings, paths, catalog, scope, response };
}

test("parallel batches cover the permitted inventory with stable score order independent of completion", async t => {
  const f = fixture(t); let active = 0, peak = 0, count = 0; const seen = new Set<string>();
  const fetcher: typeof fetch = async (_url, init) => {
    active++; peak = Math.max(peak, active); const serial = ++count, wire = JSON.parse(String(init?.body));
    for (const value of Object.values(wire.questions) as any[]) {
      const path = value.instructions.evidenceIds[1]; assert.equal(seen.has(path), false); seen.add(path);
    }
    await new Promise(resolve => setTimeout(resolve, serial % 4 * 10 + 10)); active--; return f.response(wire);
  };
  const parallel = await selectContextMetadata(f.subject, f.catalog, "repair", new DecisionRuntime(f.settings, f.root,
    { coordinationRoot: f.root, token: "fixture", fetch: fetcher }), f.scope, digest("source"), "parallel");
  assert.equal(peak, 4); assert.equal(active, 0); assert.equal(seen.size, f.paths.length); assert.equal(parallel.coverage.complete, true);
  assert.equal(parallel.order[0], "src/079.ts"); assert.equal(parallel.peakConcurrency, 4);
  seen.clear(); count = 0;
  const serial = await selectContextMetadata(f.subject, f.catalog, "repair", new DecisionRuntime(f.settings, f.root,
    { coordinationRoot: f.root, token: "fixture", fetch: fetcher }), f.scope, digest("source"), "serial", undefined, undefined, undefined, undefined, { concurrency: 1 });
  assert.deepEqual(serial.order, parallel.order); assert.equal(serial.coverage.complete, true);
  assert.equal(decisionBudgetStoreStatus(f.root).activeScopes?.contextSelection, 0);
});

test("one rejected sibling stops new work but preserves other completed answers", async t => {
  const f = fixture(t); let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async (_url, init) => {
    const first = ++calls === 1, wire = JSON.parse(String(init?.body));
    await new Promise(resolve => setTimeout(resolve, first ? 5 : 25));
    return first ? new Response("denied", { status: 401 }) : f.response(wire);
  } });
  const result = await selectContextMetadata(f.subject, f.catalog, "repair", runtime, f.scope, digest("source"), "mixed");
  assert.equal(calls, 4); assert.equal(result.reason, "authentication-rejected");
  assert.ok(result.coverage.answeredCount > 0); assert.equal(result.coverage.complete, false);
  assert.equal(result.decisions.filter(item => item.delivered).length, 3); assert.equal(result.order.length, f.paths.length);
});

test("concurrent siblings respect a smaller paid allowance without discarding admitted answers", async t => {
  const f = fixture(t); f.settings.budget.maxCalls = 2;
  let calls = 0;
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body));
    await new Promise(resolve => setTimeout(resolve, 30)); return f.response(wire);
  } });
  const result = await selectContextMetadata(f.subject, f.catalog, "repair", runtime, f.scope, digest("source"), "limited");
  assert.equal(calls, 2); assert.equal(result.decisions.filter(item => item.providerCalled).length, 2);
  assert.equal(result.decisions.filter(item => item.delivered).length, 2);
  assert.ok(result.coverage.answeredCount > 0); assert.equal(result.coverage.complete, false);
  assert.equal(result.order.length, f.paths.length);
  assert.equal(decisionBudgetStoreStatus(f.root).activeScopes?.contextSelection, 0);
});

test("operation cutoff settles all owned handlers and late responses cannot alter a packet", async t => {
  const f = fixture(t), finish: Array<() => void> = [];
  const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return new Promise(resolve => { finish.push(() => resolve(f.response(wire))); });
  } });
  const result = await selectContextMetadata(f.subject, f.catalog, "repair", runtime, f.scope, digest("source"), "cutoff", undefined, performance.now() + 100);
  assert.equal(result.reason, "deadline"); assert.equal(result.coverage.answeredCount, 0);
  assert.ok(finish.length > 0 && finish.length <= 4, "only calls admitted before the cutoff need settlement");
  assert.ok(result.decisions.every(decision => ["operation-deadline", "deadline"].includes(decision.reason)));
  const snapshot = JSON.stringify(result); finish.forEach(resolve => resolve());
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(JSON.stringify(result), snapshot);
  const pool = new ProviderPool(f.root);
  for (let i = 0; i < 4; i++) assert.equal(pool.acquire("fixture", 1, Date.now(), 1000).state, "admitted");
  pool.close(); assert.equal(decisionBudgetStoreStatus(f.root).activeScopes?.contextSelection, 0);
});

test("shared and question-local layouts preserve every fact within actual provider bounds", async t => {
  const f = fixture(t);
  for (const layout of ["shared-v1", "per-question-v1"] as const) {
    const seen = new Set<string>();
    const runtime = new DecisionRuntime(f.settings, f.root, { coordinationRoot: f.root, token: "fixture", fetch: async (_url, init) => {
      const body = String(init?.body), wire = JSON.parse(body);
      assert.equal(wire.state.layout, layout); assert.ok(Buffer.byteLength(body) <= 64000);
      for (const raw of Object.values(wire.questions) as any[]) {
        assert.ok(Buffer.byteLength(JSON.stringify(wire.state)) + Buffer.byteLength(JSON.stringify(raw)) <= 32000);
        const path = raw.instructions.evidenceIds[1]; seen.add(path);
        const evidence = layout === "shared-v1" ? wire.state.evidence : raw.instructions.evidence;
        assert.ok(evidence.some((item: any) => item.id === path && item.text === path));
      }
      return f.response(wire);
    } });
    const result = await selectContextMetadata(f.subject, f.catalog, "repair", runtime, f.scope, digest("source"), layout,
      undefined, undefined, undefined, undefined, { layout });
    assert.equal(result.coverage.complete, true); assert.equal(seen.size, f.paths.length);
  }
});
