import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, truncateSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderPool, PROVIDER_REQUESTS_PER_MINUTE, providerDatabasePath } from "../src/decision-admission.ts";
import { SQLITE_STORE_MAX_BYTES } from "../src/sqlite-store-capacity.ts";
import { LEGACY_STORE_MAX_BYTES, growStorePastLegacyLimit } from "./fixtures/sqlite-store-capacity.ts";

test("provider coordination reopens a large valid store without forgetting dispatched rate cost", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-large-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = new ProviderPool(root);
  try {
    const entry = first.acquire("key", 150000, 100000, 2000);
    assert.equal(entry.state, "admitted"); if (entry.state !== "admitted") return;
    assert.equal(first.dispatch(entry.id, "key", 100000, 2000), true); first.release(entry.id, true);
  } finally { first.close(); }
  const path = providerDatabasePath(root);
  assert.ok(growStorePastLegacyLimit(path) > LEGACY_STORE_MAX_BYTES);
  const reopened = new ProviderPool(root);
  try {
    assert.equal(reopened.acquire("key", 60000, 100000, 2000).state, "wait");
    const entry = reopened.acquire("key", 60000, 101000, 2000);
    assert.equal(entry.state, "admitted"); if (entry.state === "admitted") reopened.release(entry.id, false);
  } finally { reopened.close(); }
  truncateSync(path, SQLITE_STORE_MAX_BYTES + 1);
  assert.throws(() => new ProviderPool(root), /provider-coordination-unavailable/u);
  assert.equal(statSync(path).size, SQLITE_STORE_MAX_BYTES + 1);
});

test("rolling rate windows retain dispatched spending and release unused admission", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-rate-")), pool = new ProviderPool(root);
  t.after(() => { pool.close(); rmSync(root, { recursive: true, force: true }); });
  const first = pool.acquire("key", 150000, 100000, 2000); assert.equal(first.state, "admitted");
  if (first.state !== "admitted") return;
  assert.equal(pool.dispatch(first.id, "key", 100000, 2000), true); pool.release(first.id, true);
  assert.deepEqual(pool.acquire("key", 60000, 100000, 2000), { state: "wait", reason: "rate", waitMs: 25 });
  const after = pool.acquire("key", 60000, 101000, 2000); assert.equal(after.state, "admitted");
  if (after.state !== "admitted") return;
  pool.release(after.id, false);
  assert.equal(pool.acquire("key", 200000, 101000, 2000).state, "admitted");
});

test("request-rate ceiling spans clients and expires after the rolling minute", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-requests-")), pool = new ProviderPool(root), sibling = new ProviderPool(root);
  t.after(() => { pool.close(); sibling.close(); rmSync(root, { recursive: true, force: true }); });
  for (let i = 0; i < PROVIDER_REQUESTS_PER_MINUTE; i++) {
    const entry = pool.acquire("key", 1, 100000, 2000); assert.equal(entry.state, "admitted");
    if (entry.state === "admitted") pool.release(entry.id, true);
  }
  const refused = sibling.acquire("other-key", 1, 100000, 2000);
  assert.equal(refused.state, "wait"); if (refused.state === "wait") assert.equal(refused.reason, "rate");
  assert.equal(sibling.acquire("key", 1, 160000, 2000).state, "admitted");
});

test("measured rate usage replaces an estimate without releasing ownership or lowering later reports", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-measured-")), pool = new ProviderPool(root), sibling = new ProviderPool(root);
  t.after(() => { pool.close(); sibling.close(); rmSync(root, { recursive: true, force: true }); });
  const first = pool.acquire("key", 150000, 100000, 2000);
  assert.equal(first.state, "admitted"); if (first.state !== "admitted") return;
  assert.equal(pool.dispatch(first.id, "key", 100000, 2000), true);
  for (const value of [null, NaN, -1, 1.5]) pool.reportUsage(first.id, value);
  assert.equal(sibling.acquire("other-key", 60000, 100000, 2000).state, "wait");
  pool.reportUsage(first.id, 10000);
  const second = sibling.acquire("other-key", 60000, 100000, 2000);
  assert.equal(second.state, "admitted"); if (second.state !== "admitted") return;
  assert.equal(second.active, 2, "settlement must retain the first execution slot");
  sibling.release(second.id, false);
  pool.reportUsage(first.id, 180000);
  pool.reportUsage(first.id, 1);
  assert.equal(sibling.acquire("other-key", 60000, 100000, 2000).state, "wait", "duplicate reports cannot lower known usage");
  pool.release(first.id, true);
  assert.equal(sibling.acquire("other-key", 60000, 100000, 2000).state, "wait", "release retains the measured rolling rate cost");
  assert.equal(sibling.acquire("other-key", 60000, 101000, 2000).state, "admitted");
});

test("settled calls retain the request-rate count", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-measured-requests-")), pool = new ProviderPool(root);
  t.after(() => { pool.close(); rmSync(root, { recursive: true, force: true }); });
  for (let i = 0; i < PROVIDER_REQUESTS_PER_MINUTE; i++) {
    const entry = pool.acquire("key", 1, 100000, 2000);
    assert.equal(entry.state, "admitted"); if (entry.state !== "admitted") return;
    pool.reportUsage(entry.id, 0); pool.release(entry.id, true);
  }
  assert.equal(pool.acquire("key", 1, 100000, 2000).state, "wait");
});

test("crashed leases expire; a late owner cannot release or dispatch its replacement", t => {
  const root = mkdtempSync(join(tmpdir(), "provider-fencing-")), pool = new ProviderPool(root);
  t.after(() => { pool.close(); rmSync(root, { recursive: true, force: true }); });
  const old = Array.from({ length: 4 }, () => pool.acquire("key", 1, 1000, 100));
  assert.equal(pool.acquire("key", 1, 1099, 100).state, "wait");
  const next = Array.from({ length: 4 }, () => pool.acquire("key", 1, 1100, 100));
  assert.ok(next.every(item => item.state === "admitted"));
  for (const item of old) if (item.state === "admitted") {
    assert.equal(pool.dispatch(item.id, "key", 1100, 100), false); pool.release(item.id, true);
  }
  assert.equal(pool.acquire("key", 1, 1100, 100).state, "wait");
});

test("two processes share capacity while retaining independent workspace budgets", async t => {
  const { spawn } = await import("node:child_process"), { mkdirSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "provider-processes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtimeUrl = new URL("../src/decision-runtime.ts", import.meta.url).href;
  const settingsUrl = new URL("../src/decision-settings.ts", import.meta.url).href;
  const budgetUrl = new URL("../src/decision-budget.ts", import.meta.url).href;
  const script = `
    import { DecisionRuntime } from ${JSON.stringify(runtimeUrl)};
    import { profileDecisionSettings } from ${JSON.stringify(settingsUrl)};
    import { readDecisionBudget } from ${JSON.stringify(budgetUrl)};
    const workspace = process.argv[1], scope = {workspace, taskId:'local-task', taskRevision:'1'};
    const settings = profileDecisionSettings({continuity:{decisions:{mode:'auto',allowed_data_classes:['metadata'],allowed_metadata_paths:['src/**'],
      budget:{max_calls:3,max_request_bytes:65536},consumers:{DL03:{mode:'auto',questions:['context.metadata-relevance/1']}}}}});
    let calls=0;
    const runtime=new DecisionRuntime(settings,workspace,{coordinationRoot:process.argv[2],token:'fixture',fetch:async()=>{
      calls++;await new Promise(resolve=>setTimeout(resolve,75));return Response.json({model:'jev-1.13.0',answers:{q:{type:'noul',noul:0.9}}});}});
    process.send({ready:true}); await new Promise(resolve=>process.once('message',resolve));
    const outcomes=await Promise.all([0,1,2].map(i=>runtime.ask({consumerId:'DL03',eventId:'event-'+i,scope,evidenceLayout:'shared-v1',metadataPaths:['src/a.ts'],
      subject:{digest:'source',revision:'1',environment:'fixture'},evidence:[{id:'src/a.ts',text:'src/a.ts',sourceDigest:'digest',provenance:'derived',trust:'untrusted'}],
      coverage:{captured:1,omitted:[],truncated:false,unavailable:[],limits:[]},questions:[{name:'q',definitionId:'context.metadata-relevance/1',consumerId:'DL03',evidenceIds:['src/a.ts']}],
      policyDigest:settings.configDigest,deadlineAt:performance.now()+3000})));
    process.send({calls,budget:readDecisionBudget(workspace,scope),outcomes:outcomes.map(o=>({reason:o.reason,transport:o.transport}))});process.disconnect();
  `;
  const children: ReturnType<typeof spawn>[] = [], readiness: Promise<void>[] = [], completions: Promise<any>[] = [];
  for (let i = 0; i < 2; i++) {
    const workspace = join(root, `worktree-${i}`); mkdirSync(workspace);
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, workspace, join(root, "shared")], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    children.push(child); t.after(() => { if (child.exitCode === null) child.kill(); });
    let ready!: () => void; readiness.push(new Promise(resolve => { ready = resolve; }));
    completions.push(new Promise((resolve, reject) => {
      let result: unknown, error = "";
      child.stderr!.on("data", data => { error += data; });
      child.on("message", (message: any) => { if (message.ready) ready(); else result = message; });
      child.on("error", reject); child.on("exit", code => { ready(); code === 0 ? resolve(result) : reject(new Error(error)); });
    }));
  }
  await Promise.all(readiness); for (const child of children) child.send("start");
  const results = await Promise.all(completions);
  const outcomes = results.flatMap(result => result.outcomes);
  assert.ok(outcomes.every(outcome => outcome.reason === "answered"), JSON.stringify(results));
  assert.equal(Math.max(...outcomes.map(outcome => outcome.transport.activeConcurrency)), 4);
  for (const result of results) { assert.equal(result.calls, 3); assert.equal(result.budget.calls, 3); }
});
