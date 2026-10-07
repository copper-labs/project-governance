import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, statSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { digest } from "../src/core.ts";
import { DECISION_BUDGET_FILE, readEvaluationClaim, reserveEvaluationCall, reserveDecisionCall, readDecisionBudget } from "../src/decision-budget.ts";
import { SQLITE_STORE_MAX_BYTES } from "../src/sqlite-store-capacity.ts";
const limits = { maxCalls: 2, maxRequestBytes: 5000 }, before = Date.parse("2026-10-07T23:59:59Z"), after = before + 2000;

test("evaluation ID claims survive midnight and interrupted receipt creation independently of charged day", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-claim-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = reserveEvaluationCall(root, root, "stable", digest("request"), 200, limits, { now: () => before }); assert.equal(first.state, "reserved");
  assert.equal(first.window, "2026-10-07");
  const replay = reserveEvaluationCall(root, root, "stable", digest("request"), 200, limits, { now: () => after });
  assert.equal(replay.state, "duplicate"); assert.equal(replay.window, first.window); assert.equal(replay.reservationId, first.reservationId);
  assert.equal(reserveEvaluationCall(root, root, "stable", digest("different"), 200, limits, { now: () => after }).state, "conflict");
  assert.equal(readEvaluationClaim(root, root, "stable", limits)?.requestIdentity, digest("request"));
  assert.equal(reserveEvaluationCall(root, root, "fresh", digest("request"), 200, limits, { now: () => after }).calls, 1);
  const db = new DatabaseSync(join(root, DECISION_BUDGET_FILE)); t.after(() => db.close());
  assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
  assert.equal(db.prepare("SELECT closed FROM scope WHERE revision='2026-10-07'").get()!.closed, 1);
  assert.equal(reserveEvaluationCall(root, root, "clock-went-backwards", digest("request"), 200, limits, { now: () => before }).state, "unavailable");
});
test("new IDs and configuration allowance changes retain original daily counters, with distinct call/byte exhaustion", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-allowance-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(reserveEvaluationCall(root, root, "first", digest("a"), 2000, limits, { now: () => before }).state, "reserved");
  const second = reserveEvaluationCall(root, root, "second", digest("b"), 2000, { ...limits, maxCalls: 50000 }, { now: () => before }); assert.equal(second.calls, 2); assert.equal(second.bytes, 4000);
  assert.equal(reserveEvaluationCall(root, root, "third", digest("c"), 1001, { ...limits, maxCalls: 50000 }, { now: () => before }).state, "exhausted");
  assert.equal(reserveEvaluationCall(root, root, "third", digest("c"), 1, limits, { now: () => before }).state, "exhausted");
});
test("existing ordinary task identities and schema keep their own accounting", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-task-budget-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const task = { workspace: root, taskId: "original", taskRevision: "1" };
  const first = reserveDecisionCall(root, task, "original-event", 700, limits);
  assert.equal(reserveEvaluationCall(root, root, "standalone", digest("evaluation"), 800, limits).state, "reserved");
  assert.deepEqual(readDecisionBudget(root, task), { calls: 1, bytes: 700, reservations: 1 });
  assert.equal(reserveDecisionCall(root, task, "original-event", 700, limits).reservationId, first.reservationId);
});
test("malformed, busy, oversized or future budget stores cannot authorize evaluation dispatch", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-store-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(readEvaluationClaim(root, root, "absent", limits), null);
  reserveEvaluationCall(root, root, "one", digest("a"), 200, limits);
  const db = new DatabaseSync(join(root, DECISION_BUDGET_FILE));
  db.exec("BEGIN IMMEDIATE"); assert.equal(reserveEvaluationCall(root, root, "busy", digest("b"), 200, limits, { busyTimeoutMs: 0 }).state, "unavailable"); db.exec("ROLLBACK");
  db.exec("PRAGMA user_version=999"); assert.equal(readEvaluationClaim(root, root, "one", limits)?.state, "unavailable");
  assert.equal(reserveEvaluationCall(root, root, "future", digest("b"), 200, limits).state, "unavailable"); db.exec("PRAGMA user_version=2"); db.close();
  const path = join(root, DECISION_BUDGET_FILE), size = statSync(path).size; truncateSync(path, SQLITE_STORE_MAX_BYTES + 1);
  const capacity = reserveEvaluationCall(root, root, "capacity", digest("b"), 200, limits); assert.equal(capacity.state, "unavailable"); assert.equal(capacity.unavailableReason, "store-capacity");
  truncateSync(path, size); assert.equal(readEvaluationClaim(root, root, "one", limits)?.state, "duplicate");
});
test("unsafe finite allowance, request identity and clock values fail closed", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-invalid-budget-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [identity, bytes, bound, now] of [["bad", 100, limits, before], [digest("a"), -1, limits, before], [digest("a"), 100, { ...limits, maxCalls: Infinity }, before], [digest("a"), 100, limits, NaN]] as const)
    assert.equal(reserveEvaluationCall(root, root, "event", identity, bytes, bound, { now: () => now }).state, "unavailable");
});

test("populated version-one budget store remains readable and migrates without resetting task counters", async t => {
  const { budgetScopeId } = await import("../src/decision-budget.ts"), { DecisionRuntime } = await import("../src/decision-runtime.ts"),
    { profileDecisionSettings } = await import("../src/decision-settings.ts");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-v1-budget-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, DECISION_BUDGET_FILE), task = { workspace: root, taskId: "original", taskRevision: "1" }, id = budgetScopeId(task),
    originalReservation = digest({ scope: id, eventId: "original-event" }).slice(7, 39);
  const seed = new DatabaseSync(path);
  seed.exec(`CREATE TABLE scope(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,task TEXT NOT NULL,revision TEXT NOT NULL,
    calls INTEGER NOT NULL,bytes INTEGER NOT NULL,closed INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT;
    CREATE TABLE reservation(id TEXT PRIMARY KEY,scope TEXT NOT NULL REFERENCES scope(id) ON DELETE CASCADE,event TEXT NOT NULL,
    bytes INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(scope,event)) STRICT; PRAGMA user_version=1;`);
  seed.prepare("INSERT INTO scope VALUES(?,?,?,?,1,700,0,?)").run(id, root, task.taskId, task.taskRevision, before);
  seed.prepare("INSERT INTO reservation VALUES(?,?,?,?,?)").run(originalReservation, id, "original-event", 700, before); seed.close();
  assert.equal(readEvaluationClaim(root, root, "new-evaluation", limits), null);
  const untouched = new DatabaseSync(path, { readOnly: true });
  assert.equal(untouched.prepare("PRAGMA user_version").get()!.user_version, 1); untouched.close();
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["supplied-evidence"],
    evaluation: { enabled: true, daily_budget: { max_calls: 10, max_request_bytes: 1000000 } } } } });
  let calls = 0;
  const result = await new DecisionRuntime(settings, root, { coordinationRoot: root, token: "synthetic-v1-fixture", fetch: async () => {
    calls++; return Response.json({ model: "gpt-6-luna", answers: [{ name: "present", type: "predicate", probability: 0.9 }] });
  } }).evaluate({ version: 1, evaluationId: "new-evaluation", evidence: [{ id: "text", type: "text", text: "Synthetic supplied evidence" }],
    questions: [{ name: "present", type: "predicate", instructions: "Is it present?" }] }, root);
  assert.equal(result.status, "complete"); assert.equal(calls, 1);
  assert.deepEqual(readDecisionBudget(root, task), { calls: 1, bytes: 700, reservations: 1 });
  assert.equal(reserveDecisionCall(root, task, "original-event", 700, limits).reservationId, originalReservation);
  const migrated = new DatabaseSync(path, { readOnly: true }); assert.equal(migrated.prepare("PRAGMA user_version").get()!.user_version, 2); migrated.close();
});
