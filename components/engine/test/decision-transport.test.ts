import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JevDecisionClient, decisionProviderHealthPath } from "../src/decision-transport.ts";

function fixture(t: TestContext, fetcher: typeof fetch) {
  const root = mkdtempSync(join(tmpdir(), "decision-transport-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "health.json");
  return { client: new JevDecisionClient("config", path, { token: "test-only", fetch: fetcher }), path: decisionProviderHealthPath(path, "config"), base: path };
}

test("pre-cancelled calls do not touch transport or health state", async t => {
  let calls = 0;
  const { client, path } = fixture(t, async () => { calls++; return new Response("{}"); });
  assert.deepEqual(await client.ask("{}", 100, AbortSignal.abort()), { ok: false, reason: "cancelled", failureStage: "transport" });
  assert.equal(calls, 0); assert.equal(existsSync(path), false);
});

test("deadline bounds a transport that ignores cancellation", { timeout: 2000 }, async t => {
  const { client, path } = fixture(t, () => new Promise(() => {}));
  const result = await client.ask("{}", 20);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "deadline");
  assert.equal(existsSync(`${path}.lock`), false);
  const suppressed = await client.ask("{}", 100);
  assert.equal(suppressed.ok, false);
  if (!suppressed.ok) assert.equal(suppressed.reason, "cooldown", "A provider's own timeout still suppresses immediate retry");
});

test("deadline covers response streaming and stalled cancellation cleanup", { timeout: 2000 }, async t => {
  const { client, path } = fixture(t, async () => new Response(new ReadableStream({
    pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}),
  })));
  // Parallel suites can consume the first few milliseconds before fetch reaches the body.
  const result = await client.ask("{}", 500);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.reason, "deadline"); assert.equal(result.failureStage, "response-body"); }
  assert.equal(existsSync(`${path}.lock`), false);
});

test("authentication rejection suppresses subsequent attempts", async t => {
  let calls = 0;
  const { client } = fixture(t, async () => { calls++; return new Response("denied", { status: 401 }); });
  assert.equal((await client.ask("{}", 100)).ok, false);
  const result = await client.ask("{}", 100);
  if (!result.ok) assert.equal(result.reason, "authentication-disabled");
  assert.equal(calls, 1);
});

test("a deliberate configuration revision recovers from an orphan without deleting its lock", async t => {
  let calls = 0, reservations = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
  const { client, path, base } = fixture(t, fetcher);
  mkdirSync(`${path}.lock`);
  const blocked = await client.ask("{}", 100, undefined, () => { reservations++; return true; });
  assert.equal(blocked.ok, false); assert.equal(calls, 0); assert.equal(reservations, 0);
  const reset = new JevDecisionClient("new-config", base, { token: "test-only", fetch: fetcher });
  assert.equal((await reset.ask("{}", 100, undefined, () => { reservations++; return true; })).ok, true);
  assert.equal(calls, 1); assert.equal(reservations, 1);
  assert.equal(existsSync(`${path}.lock`), true);
});
