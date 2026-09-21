import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { reserveDecisionCall, readDecisionBudget, closeDecisionScope, decisionBudgetStoreStatus, DECISION_BUDGET_FILE } from "../src/decision-budget.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "decision-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, scope: { workspace: root, taskId: "task", taskRevision: "revision-1" }, limits: { maxCalls: 2, maxRequestBytes: 100 } };
}

test("reservations survive reopening, share canonical workspace identity and charge actual bytes", t => {
  const { root, scope, limits } = fixture(t);
  assert.equal(reserveDecisionCall(root, scope, "first", 60, limits).state, "reserved");
  const alias = join(root, "alias"); symlinkSync(root, alias);
  assert.equal(reserveDecisionCall(root, { ...scope, workspace: alias }, "first", 60, limits).state, "duplicate");
  assert.equal(reserveDecisionCall(root, scope, "second", 41, limits).state, "exhausted");
  assert.equal(reserveDecisionCall(root, scope, "second", 40, limits).state, "reserved");
  assert.deepEqual(readDecisionBudget(root, scope), { calls: 2, bytes: 100, reservations: 2 });
  assert.equal(reserveDecisionCall(root, { ...scope, taskRevision: "revision-2" }, "first", 60, limits).state, "reserved");
});

test("closed scopes preserve duplicate identities but cannot admit new events", t => {
  const { root, scope, limits } = fixture(t);
  reserveDecisionCall(root, scope, "first", 10, limits);
  assert.equal(closeDecisionScope(root, scope), true);
  assert.equal(reserveDecisionCall(root, scope, "first", 10, limits).state, "duplicate");
  assert.equal(reserveDecisionCall(root, scope, "new", 10, limits).state, "unavailable");
  const unusedScope = { ...scope, taskRevision: "unused" };
  assert.equal(closeDecisionScope(root, unusedScope), true);
  assert.equal(reserveDecisionCall(root, unusedScope, "late", 10, limits).state, "unavailable");
});

test("corrupt, incompatible and busy stores fail closed", t => {
  const { root, scope, limits } = fixture(t);
  const path = join(root, DECISION_BUDGET_FILE);
  writeFileSync(path, "broken database");
  assert.equal(reserveDecisionCall(root, scope, "first", 10, limits).state, "unavailable");
  rmSync(path);
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA user_version=999");
    assert.equal(reserveDecisionCall(root, scope, "first", 10, limits).state, "unavailable");
    db.exec("PRAGMA user_version=0; BEGIN IMMEDIATE");
    assert.equal(reserveDecisionCall(root, scope, "first", 10, limits, { busyTimeoutMs: 1 }).state, "unavailable");
    db.exec("ROLLBACK");
  } finally { db.close(); }
  assert.equal(reserveDecisionCall(root, scope, "first", 10, limits).state, "reserved");
});

test("independent processes cannot both spend the final call", async t => {
  const { root, scope } = fixture(t);
  const moduleUrl = new URL("../src/decision-budget.ts", import.meta.url).href;
  const jobs = ["one", "two"].map(event => new Promise<string>((resolve, reject) => {
    const script = `import {reserveDecisionCall} from ${JSON.stringify(moduleUrl)}; console.log(reserveDecisionCall(${JSON.stringify(root)},${JSON.stringify(scope)},${JSON.stringify(event)},10,{maxCalls:1,maxRequestBytes:100},{busyTimeoutMs:1000}).state)`;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", script], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
  }));
  assert.deepEqual((await Promise.all(jobs)).sort(), ["exhausted", "reserved"]);
  assert.deepEqual(readDecisionBudget(root, scope), { calls: 1, bytes: 10, reservations: 1 });
});

test("closing a never-used store creates a tombstone before any reservation", t => {
  const { root, scope, limits } = fixture(t);
  const cold = join(root, "cold-state");
  assert.equal(closeDecisionScope(cold, scope), true);
  assert.equal(reserveDecisionCall(cold, scope, "late", 10, limits).state, "unavailable");
  assert.deepEqual(readDecisionBudget(cold, scope), { calls: 0, bytes: 0, reservations: 0 });
});

test("closed tombstones do not consume the active-scope capacity", t => {
  const { root, scope, limits } = fixture(t);
  for (let index = 0; index < 513; index++) assert.equal(closeDecisionScope(root, { ...scope, taskId: `closed-${index}` }), true);
  assert.equal(reserveDecisionCall(root, scope, "new-active", 10, limits).state, "reserved");
  assert.equal(reserveDecisionCall(root, { ...scope, taskId: "closed-0" }, "late", 10, limits).state, "unavailable");
});


test("oversized budget stores visibly fail closed without resetting previous spending", t => {
  const { root, scope, limits } = fixture(t);
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 1);
  writeFileSync(join(root, DECISION_BUDGET_FILE), bytes);
  assert.equal(decisionBudgetStoreStatus(root).status, "capacity-exceeded");
  assert.equal(decisionBudgetStoreStatus(root).bytes, bytes.length);
  assert.equal(reserveDecisionCall(root, scope, "new-event", 10, limits).state, "unavailable");
});
