import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { workflowWaitCommand } from "../src/workflow-wait.ts";
import { workflowCommand, workflowExitCode } from "../src/workflow-command.ts";

test("workflow status observes the ledger and cancellation requires an authority reference", async () => {
  const dir = mkdtempSync(join(tmpdir(), "workflow-command-")), database = join(dir, "ledger.sqlite");
  const continuity = new Store(database), store = new WorkflowStore(database);
  try {
    const task = continuity.createTask("check", [{ kind: "scope", provenance: "operator", body: dir }]);
    const policy = defaultPolicy(), request = { operation: "check" as const, scope: [dir], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, dir);
    const recipe = parseRecipe({ version: 1, id: "check", workspace: dir, inputs: [], resources: [],
      operations: { check: { argv: [process.execPath, "--version"], cwd: dir, effect: "read" } },
      stages: [{ id: "check", operation: "check", deadlineMs: 2000 }], deadlineMs: 4000, policyDigest: policy.revision, claims: ["check"] });
    const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:test", recipe, recipeDigest: recipeDigest(recipe), operationId: "check" };
    store.authorizeWorkflow(binding);
    const run = store.submit(binding);
    const args = ["--database", database, "--run", run.id];
    assert.equal(workflowCommand("workflow-status", args).run.state, "queued");
    const snapshot = await workflowWaitCommand([...args, "--wait-ms", "0"]);
    assert.equal(snapshot.reason, "timeout");
    assert.equal(snapshot.run.state, "queued");
    const activity = await workflowWaitCommand([...args, "--after-event", "0"]);
    assert.equal(activity.reason, "event");
    assert.equal(activity.events.length, 1);
    await assert.rejects(workflowWaitCommand([...args, "--wait-ms", "30001"]), /bounds/);
    assert.throws(() => workflowCommand("workflow-cancel", args), /authority/);
    assert.equal(store.read(run.id).cancelRequested, false);
    assert.equal(workflowCommand("workflow-cancel", [...args, "--authority", "host:test"]).run.cancelRequested, true);
    const cursor = (store.events(run.id).at(-1) as { sequence: number }).sequence;
    const timer = setTimeout(() => store.cancel(run.id, "host:test"), 20);
    try {
      const changed = await workflowWaitCommand([...args, "--wait-ms", "1000", "--after-event", String(cursor)]);
      assert.equal(changed.reason, "event");
      assert.equal(changed.events.length, 1);
      assert.equal(changed.run.id, run.id);
    } finally { clearTimeout(timer); }
    assert.throws(() => workflowCommand("workflow-status", [...args, "--recipe", "x"]), /Unknown option/);
    assert.throws(() => workflowCommand("workflow-submit", ["--database", database]), /Complete workflow binding/);
  } finally { store.close(); continuity.close(); rmSync(dir, { recursive: true }); }
});

test("workflow shell status distinguishes success, pending, and unsuccessful outcomes", () => {
  assert.equal(workflowExitCode("succeeded"), 0);
  for (const state of ["queued", "running", "reconciling"] as const) assert.equal(workflowExitCode(state), 2);
  for (const state of ["failed", "cancelled", "blocked", "unknown"] as const) assert.equal(workflowExitCode(state), 1);
});
