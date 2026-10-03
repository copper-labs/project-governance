import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JevDecisionClient } from "../src/decision-transport.ts";
import { ProviderPool, providerDatabasePath } from "../src/decision-admission.ts";
import { spawn } from "node:child_process";

function fixture(t: TestContext, fetcher: typeof fetch) {
  const root = mkdtempSync(join(tmpdir(), "decision-transport-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, client: new JevDecisionClient({ coordinationRoot: root, token: "test-only", fetch: fetcher }) };
}

test("pre-cancelled calls do not touch transport or coordination state", async t => {
  let calls = 0;
  const { client, root } = fixture(t, async () => { calls++; return new Response("{}"); });
  const result = await client.ask("{}", 100, AbortSignal.abort());
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.reason, "cancelled");
  assert.equal(calls, 0); assert.equal(existsSync(providerDatabasePath(root)), false);
});

test("the forty-five-second operation is admitted without renewing an expired caller deadline", async t => {
  let calls = 0;
  const { client } = fixture(t, async () => { calls++; return Response.json({}); });
  const admitted = await client.ask("{}", 45000, undefined, undefined, undefined, "caller", performance.now() + 45000);
  assert.equal(admitted.ok, true);
  assert.equal(calls, 1);
  const expired = await client.ask("{}", 45000, undefined, undefined, undefined, "caller", performance.now() - 1);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "admission-deadline");
  assert.equal(calls, 1, "An exhausted umbrella cannot dispatch another request");
});

test("provider timeout bounds ignored cancellation and retains scoped cooldown", { timeout: 2000 }, async t => {
  let calls = 0;
  const { client } = fixture(t, () => { calls++; return new Promise(() => {}); });
  const result = await client.ask("{}", 150, undefined, undefined, undefined, "provider", performance.now() + 1000);
  assert.equal(calls, 1); assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "deadline");
  const suppressed = await client.ask("{}", 100);
  if (!suppressed.ok) assert.equal(suppressed.reason, "cooldown"); else assert.fail("must suppress");
});

test("deadline covers response streaming and stalled cancellation cleanup", { timeout: 2000 }, async t => {
  const { client } = fixture(t, async () => new Response(new ReadableStream({
    pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}),
  })));
  const result = await client.ask("{}", 150);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.reason, "deadline"); assert.equal(result.failureStage, "response-body"); }
});

test("authentication suppression follows the credential across clients; a new key remains usable", async t => {
  let calls = 0;
  const { client, root } = fixture(t, async () => { calls++; return new Response("denied", { status: 401 }); });
  assert.equal((await client.ask("{}", 500)).ok, false);
  const sibling = new JevDecisionClient({ coordinationRoot: root, token: "test-only", fetch: async () => { calls++; return Response.json({}); } });
  const result = await sibling.ask("{}", 500);
  if (!result.ok) assert.equal(result.reason, "authentication-disabled"); else assert.fail("must suppress");
  assert.equal(calls, 1);
  const replacement = new JevDecisionClient({ coordinationRoot: root, token: "replacement", fetch: async () => Response.json({}) });
  assert.equal((await replacement.ask("{}", 500)).ok, true);
});

test("four calls overlap, a fifth waits, and its HTTP allowance starts at dispatch", async t => {
  let active = 0, peak = 0, calls = 0, reservations = 0;
  const { client } = fixture(t, async () => {
    active++; peak = Math.max(peak, active); calls++;
    await new Promise(resolve => setTimeout(resolve, 75)); active--; return Response.json({});
  });
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => client.ask("{}", 140, undefined,
    () => { reservations++; return true; }, undefined, "provider", performance.now() + 1000)));
  assert.equal(peak, 4); assert.equal(calls, 5); assert.equal(reservations, 5);
  assert.ok(outcomes.every(outcome => outcome.ok));
  assert.ok(outcomes.some(outcome => outcome.timing.slotWaitMs > 30));
  assert.ok(outcomes.every(outcome => outcome.timing.httpMs < 140));
});

test("older successful response cannot erase a sibling's rate cooldown", async t => {
  let finish!: () => void, calls = 0;
  const { client, root } = fixture(t, async () => {
    calls++; if (calls === 1) { await new Promise<void>(resolve => { finish = resolve; }); return Response.json({}); }
    return new Response("busy", { status: 429, headers: { "Retry-After": "2" } });
  });
  const older = client.ask("{}", 500);
  const newer = await client.ask("{}", 500);
  assert.equal(newer.ok, false); finish(); assert.equal((await older).ok, true);
  const sibling = new JevDecisionClient({ coordinationRoot: root, token: "other-key", fetch: async () => { throw new Error("must suppress"); } });
  const after = await sibling.ask("{}", 100);
  if (!after.ok) assert.equal(after.reason, "cooldown"); else assert.fail("must suppress");
});

test("denied budget returns admission without creating a cooldown or retaining a slot", async t => {
  let calls = 0;
  const { client, root } = fixture(t, async () => { calls++; return Response.json({}); });
  const refused = await client.ask("{}", 500, undefined, () => false);
  assert.equal(refused.ok, false); assert.equal(calls, 0);
  const pool = new ProviderPool(root);
  for (let i = 0; i < 4; i++) assert.equal(pool.acquire("fixture", 50000, Date.now(), 1000).state, "admitted");
  pool.close();
});

test("corrupt coordination state falls back without a reset or paid reservation", async t => {
  let calls = 0, paid = 0;
  const { client, root } = fixture(t, async () => { calls++; return Response.json({}); });
  writeFileSync(providerDatabasePath(root), "corrupt state");
  const result = await client.ask("{}", 100, undefined, () => { paid++; return true; });
  assert.equal(result.ok, false); assert.equal(calls, 0); assert.equal(paid, 0);
});

test("coordination retries precede paid reservation; paid answers survive a busy usage store", async t => {
  let paid = 0, writes = 0, rechecks = 0;
  const original = ProviderPool.prototype.dispatch;
  t.mock.method(ProviderPool.prototype, "dispatch", function (this: ProviderPool, ...args: Parameters<ProviderPool["dispatch"]>) {
    if (++rechecks === 1) throw Object.assign(new Error("busy"), { errcode: 5 });
    return original.apply(this, args);
  });
  t.mock.method(ProviderPool.prototype, "reportUsage", () => { writes++; throw Object.assign(new Error("busy"), { errcode: 5 }); });
  const { client, root } = fixture(t, async () => Response.json({ usage: { input_tokens: 1 } }));
  const result = await client.ask("{}", 500, undefined, () => { assert.ok(rechecks >= 2); paid++; return true; });
  assert.equal(result.ok, true); assert.equal(paid, 1); assert.ok(writes > 1);
  assert.deepEqual(result.timing.coordinationIssues, ["usage-storage-unavailable"]);
  const pool = new ProviderPool(root);
  assert.equal(pool.acquire("another-key", 1, Date.now(), 1000).state, "admitted"); pool.close();
});

test("a second process holding the usage database cannot replace a valid paid response with provider failure", { timeout: 10000 }, async t => {
  const { root } = fixture(t, async () => Response.json({}));
  const seed = new ProviderPool(root); seed.close();
  const script = `import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA busy_timeout=1000; BEGIN IMMEDIATE'); process.send('locked');
    process.once('message', () => { db.exec('ROLLBACK'); db.close(); process.disconnect(); });`;
  let writer: ReturnType<typeof spawn> | undefined, paid = 0;
  t.after(() => { if (writer && writer.exitCode === null) writer.kill(); });
  const client = new JevDecisionClient({ coordinationRoot: root, token: "fixture", fetch: async () => {
    writer = spawn(process.execPath, ["--input-type=module", "-e", script, providerDatabasePath(root)],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    await new Promise<void>((resolve, reject) => {
      writer!.once("message", () => resolve()); writer!.once("error", reject);
      writer!.once("exit", code => { if (code) reject(new Error(`writer exited ${code}`)); });
    });
    return Response.json({ answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 1 } });
  } });
  const answer = await client.ask("{}", 2000, undefined, () => { paid++; return true; });
  assert.equal(answer.ok, true); assert.equal(paid, 1);
  assert.ok(answer.timing.coordinationIssues.includes("usage-storage-unavailable"));
  assert.ok(answer.timing.coordinationIssues.includes("release-storage-unavailable"));
  const exited = new Promise<void>(resolve => writer!.once("exit", () => resolve()));
  writer!.send("release"); await exited;
  const sibling = new JevDecisionClient({ coordinationRoot: root, token: "another-key", fetch: async () => Response.json({}) });
  assert.equal((await sibling.ask("{}", 500)).ok, true, "local contention created no shared provider cooldown");
});

test("ordinary failure is workspace-scoped; overload spans keys; rejected keys recover after bounded suppression", async t => {
  let now = Date.now();
  const { root } = fixture(t, async () => Response.json({}));
  const client = (scope: string, token: string, response: () => Promise<Response>) => new JevDecisionClient({ coordinationRoot: root, healthScope: scope, token, now: () => now, fetch: response });
  const failed = client("workspace-a", "same-key", async () => new Response("bad", { status: 500 }));
  assert.equal((await failed.ask("{}", 200)).ok, false);
  assert.equal((await client("workspace-b", "same-key", async () => Response.json({})).ask("{}", 200)).ok, true);
  const auth = client("workspace-c", "auth-key", async () => new Response("denied", { status: 401 }));
  assert.equal((await auth.ask("{}", 200)).ok, false);
  const repaired = client("workspace-d", "auth-key", async () => Response.json({}));
  assert.equal((await repaired.ask("{}", 200)).ok, false);
  now += 300001; assert.equal((await repaired.ask("{}", 200)).ok, true);
  assert.equal((await client("workspace-c", "rate-key", async () => new Response("busy", { status: 529 })).ask("{}", 200)).ok, false);
  const rate = await client("workspace-b", "different-key", async () => Response.json({})).ask("{}", 200);
  assert.equal(rate.ok, false); if (!rate.ok) assert.equal(rate.reason, "cooldown");
});

test("an explicitly expired caller clock never consumes paid budget", async t => {
  let paid = 0;
  const { client } = fixture(t, async () => { throw new Error("must not call"); });
  const result = await client.ask("{}", 1000, undefined, () => { paid++; return true; }, undefined, "provider", performance.now() - 1);
  assert.equal(result.ok, false); assert.equal(paid, 0);
  if (!result.ok) assert.equal(result.reason, "admission-deadline");
});

test("implicit legacy deadline includes admission while metadata retains its explicit operation clock", async t => {
  const { client } = fixture(t, async () => new Promise(() => {}));
  const result = await client.ask("{}", 250, undefined, () => {
    // Model a slow synchronous paid reservation without letting another operation race the clock.
    const until = performance.now() + 100; while (performance.now() < until) { /* bounded fixture */ }
    return true;
  });
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.reason, "deadline"); assert.equal(result.failureStage, "transport"); }
  assert.ok(result.timing.admissionMs >= 100);
  assert.ok(result.timing.httpMs < 225, "admission cannot add another full HTTP allowance to legacy callers");
});

test("returned transport timing includes lease-release retries", async t => {
  t.mock.method(ProviderPool.prototype, "release", () => { throw Object.assign(new Error("busy"), { errcode: 5 }); });
  const { client } = fixture(t, async () => Response.json({}));
  const result = await client.ask("{}", 1000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.timing.coordinationIssues, ["release-storage-unavailable"]);
  assert.ok(result.timing.coordinationWaitMs >= 80);
  assert.ok(result.timing.totalMs >= result.timing.admissionMs + result.timing.httpMs + 80);
});
