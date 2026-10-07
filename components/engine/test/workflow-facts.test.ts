import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { authorizeAction, proposeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore, readWorkflowFacts } from "../src/workflow-store.ts";
import { parseRecipe, recipeDigest, type RunBinding, type StageResult } from "../src/workflow-types.ts";
import { digest, fileDigest } from "../src/core.ts";

function fixture(engine = true) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "workflow-facts-"))), path = join(workspace, "ledger.sqlite");
  writeFileSync(join(workspace, "input.txt"), "unchanged");
  const continuity = new Store(path), task = continuity.createTask("Qualify a coherent workflow slice", [
    { kind: "scope", provenance: "operator", body: workspace },
  ], { worktree: workspace });
  const policy = defaultPolicy(), recipe = parseRecipe({ version: 1, id: "narrow-check", workspace,
    inputs: [{ path: "input.txt", digest: fileDigest(join(workspace, "input.txt")) }], resources: [],
    operations: { check: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: ".", effect: "read" } },
    stages: [{ id: "focused", operation: "check", deadlineMs: 1000 }], deadlineMs: 2000, policyRevision: policy.revision, claims: [] });
  const store = engine ? new WorkflowStore(path) : null;
  const submit = (id: string) => {
    const request = { operation: "check" as const, scope: [workspace], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, workspace);
    const binding: RunBinding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "operator:fixture-check",
      recipe, recipeDigest: recipeDigest(recipe), operationId: id };
    store!.authorizeWorkflow(binding); return { action, binding, run: store!.submit(binding) };
  };
  const selected = (actionId: string, taskVersion = 1) => ({ workspace, taskId: task.taskId, actions: [{ actionId, taskVersion }] });
  return { workspace, path, task, continuity, store, submit, selected,
    close: () => { store?.close(); continuity.close(); rmSync(workspace, { recursive: true, force: true }); } };
}
const passed: StageResult = { state: "succeeded", exitCode: 0, cleanup: "confirmed", startedAt: "2026-10-05T00:00:00Z", endedAt: "2026-10-05T00:00:01Z",
  log: "/original/workflow/stage.log", inputValidity: "valid", detail: "Private result prose must not be copied into the facts block" };
const fingerprint = (path: string) => {
  const database = new DatabaseSync(path, { readOnly: true });
  try { return { schema: database.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),
    meta: database.prepare("SELECT * FROM meta ORDER BY key").all(), tasks: database.prepare("SELECT * FROM task ORDER BY task_id,version").all(),
    runs: database.prepare("SELECT * FROM engine_run ORDER BY rowid").all(), stages: database.prepare("SELECT * FROM engine_stage ORDER BY rowid").all() }; }
  finally { database.close(); }
};

test("workflow facts preserve exact native run and stage outcomes without writes or result prose", () => {
  const f = fixture();
  try {
    const { action, run } = f.submit("coherent-slice");
    const claimed = f.store!.claim(run.id, run.revision, "fixture-worker");
    f.store!.stage(run.id, "fixture-worker", "focused", "running");
    f.store!.stage(run.id, "fixture-worker", "focused", "succeeded", passed);
    f.store!.transition(run.id, "fixture-worker", claimed.revision, "succeeded");
    const before = fingerprint(f.path), bytes = readFileSync(f.path);
    const facts = readWorkflowFacts(f.path, f.selected(action.actionId));
    assert.equal(facts.status, "observed"); assert.deepEqual(facts.unavailable, []);
    assert.deepEqual(facts.byAction.get(action.actionId), { runId: run.id, state: "succeeded", stages: [{ id: "focused", state: "succeeded",
      resultDigest: digest(passed), exitCode: 0, cleanup: "confirmed", log: passed.log }] });
    assert.equal(JSON.stringify([...facts.byAction.values()]).includes(passed.detail), false);
    assert.deepEqual(fingerprint(f.path), before); assert.deepEqual(readFileSync(f.path), bytes);
    assert.match(facts.omitted[0]!, /latest 64/);
  } finally { f.close(); }
});

test("pending and unresolved cleanup remain original unknowns without collection or recovery", () => {
  const f = fixture();
  try {
    const { action, run } = f.submit("unsettled");
    let facts = readWorkflowFacts(f.path, f.selected(action.actionId));
    assert.deepEqual(facts.byAction.get(action.actionId), { runId: run.id, state: "queued", stages: [{ id: "focused", state: "pending",
      resultDigest: null, exitCode: null, cleanup: null, log: null }] });
    const claimed = f.store!.claim(run.id, run.revision, "fixture-worker");
    f.store!.stage(run.id, "fixture-worker", "focused", "running");
    const unknown: StageResult = { ...passed, state: "unknown", exitCode: null, cleanup: "unknown" };
    f.store!.stage(run.id, "fixture-worker", "focused", "unknown", unknown);
    f.store!.transition(run.id, "fixture-worker", claimed.revision, "unknown");
    facts = readWorkflowFacts(f.path, f.selected(action.actionId));
    assert.equal(facts.byAction.get(action.actionId)!.state, "unknown");
    assert.equal(facts.byAction.get(action.actionId)!.stages[0]!.cleanup, "unknown");
    assert.equal(f.store!.events(run.id).length, 5, "The observer created no collection/recovery events");
  } finally { f.close(); }
});

test("missing or unsupported engine tables stay unavailable and are never installed by observation", () => {
  const f = fixture(false);
  try {
    const before = readFileSync(f.path);
    assert.equal(readWorkflowFacts(f.path, f.selected("absent-action")).status, "unavailable");
    assert.deepEqual(readFileSync(f.path), before);
    const database = new DatabaseSync(f.path);
    database.prepare("INSERT INTO meta VALUES('engine_schema','2')").run(); database.close();
    const after = readFileSync(f.path), facts = readWorkflowFacts(f.path, f.selected("absent-action"));
    assert.equal(facts.unavailable.includes("workflow-tables-unavailable"), true);
    assert.deepEqual(readFileSync(f.path), after);
    const inspection = new DatabaseSync(f.path, { readOnly: true });
    assert.equal(inspection.prepare("SELECT name FROM sqlite_master WHERE name='engine_run'").get(), undefined); inspection.close();
    const absent = join(f.workspace, "missing.sqlite");
    assert.equal(readWorkflowFacts(absent, f.selected("absent-action")).status, "unavailable"); assert.equal(existsSync(absent), false);
  } finally { f.close(); }
});

test("selected action, task, revision and canonical workspace must all agree", () => {
  const f = fixture();
  try {
    const { action, run } = f.submit("exact-binding");
    for (const selected of [{ ...f.selected(action.actionId), taskId: "foreign-task" }, f.selected(action.actionId, 2),
      f.selected("foreign-action"), { ...f.selected(action.actionId), workspace: realpathSync(tmpdir()) }]) {
      const facts = readWorkflowFacts(f.path, selected); assert.equal(facts.byAction.size, 0);
      assert.equal(facts.unavailable.some(reason => reason.startsWith("workflow-not-observed-in-window:")), true);
    }
    const database = new DatabaseSync(f.path);
    database.prepare("UPDATE action SET task_version=2 WHERE action_id=?").run(action.actionId); database.close();
    assert.equal(readWorkflowFacts(f.path, f.selected(action.actionId)).byAction.size, 0);
    assert.equal(f.store!.read(run.id).state, "queued");
  } finally { f.close(); }
});

test("ambiguous matching runs and invalid result JSON remain explicitly unavailable", () => {
  const f = fixture();
  try {
    const { action, run } = f.submit("ambiguous");
    const database = new DatabaseSync(f.path);
    database.prepare("INSERT INTO engine_run SELECT 'duplicate', 'other-operation', binding,state,revision,owner,cancel_requested,created_at,updated_at FROM engine_run WHERE id=?").run(run.id);
    database.prepare("INSERT INTO engine_stage SELECT 'duplicate',id,state,result FROM engine_stage WHERE run_id=?").run(run.id);
    database.close();
    const ambiguity = readWorkflowFacts(f.path, f.selected(action.actionId));
    assert.equal(ambiguity.byAction.size, 0); assert.equal(ambiguity.unavailable.includes(`workflow-action-ambiguous:${action.actionId}`), true);
    const malformed = new DatabaseSync(f.path);
    malformed.prepare("DELETE FROM engine_stage WHERE run_id='duplicate'").run(); malformed.prepare("DELETE FROM engine_run WHERE id='duplicate'").run();
    malformed.prepare("UPDATE engine_stage SET result='not-json' WHERE run_id=?").run(run.id); malformed.close();
    const invalid = readWorkflowFacts(f.path, f.selected(action.actionId));
    assert.equal(invalid.byAction.size, 0); assert.equal(invalid.unavailable.includes(`workflow-result-unavailable:${action.actionId}`), true);
  } finally { f.close(); }
});

test("indexed recent-run window omits older matches rather than scanning the entire workflow ledger", () => {
  const f = fixture();
  try {
    const old = f.submit("old-selected-run");
    for (let i = 0; i < 64; i++) f.submit(`later-${i}`);
    const facts = readWorkflowFacts(f.path, f.selected(old.action.actionId));
    assert.equal(facts.status, "observed"); assert.equal(facts.byAction.size, 0);
    assert.equal(facts.unavailable.includes(`workflow-not-observed-in-window:${old.action.actionId}`), true);
    assert.equal(facts.omitted.some(reason => reason.includes("Additional earlier")), true);
    const database = new DatabaseSync(f.path, { readOnly: true });
    const plan = database.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM engine_run WHERE rowid<? ORDER BY rowid DESC LIMIT 1").all(1000);
    assert.match(String(plan[0]!.detail), /INTEGER PRIMARY KEY/); database.close();
  } finally { f.close(); }
});
